#!/usr/bin/env python3
"""
Fast scraper for sbyuedu.com (神笔阅读) → Qiniu upload.

Strategy (optimized):
  1. Crawl /list/<category> pages to collect all book IDs (static HTTP)
  2. For each book, crawl /intro/<id> with DynamicFetcher to get chapter list
  3. For each chapter, extract the pre-signed JSONP API URL from the static
     HTML and call it directly (no browser needed — ~10x faster)
  4. Assemble into Markdown with frontmatter
  5. Upload to Qiniu bucket under novels/<category>/<title>/<NNNN>.md

Usage:
  python3 scrape_sbyuedu.py [--max-books N] [--max-chapters N] [--dry-run]
  python3 scrape_sbyuedu.py --category 2 --max-books 5   # only 总裁豪门, 5 books
  python3 scrape_sbyuedu.py --delay 5                    # 5s between chapters (default)
  python3 scrape_sbyuedu.py --no-skip                    # don't skip already-uploaded
"""

import json
import os
import re
import sys
import time
import argparse
from pathlib import Path

import requests
from scrapling.fetchers import Fetcher, DynamicFetcher
from qiniu import Auth, put_data, BucketManager

BASE_URL = "https://www.sbyuedu.com"
API_BASE = "https://api.ixshuo.com"
CONFIG_PATH = Path.home() / ".config" / "cinyuverse" / "qiniu.json"

CATEGORIES = [
    (1, "都市情感"), (2, "总裁豪门"), (3, "都市言情"), (4, "都市异能"),
    (5, "古代言情"), (6, "修真重生"), (7, "玄幻仙侠"), (8, "悬疑灵异"),
    (9, "历史军事"), (10, "青春纯爱"), (11, "游戏竞技"), (12, "科幻末世"),
    (13, "幻想时空"), (15, "出版"), (16, "其他"), (18, "国学"),
]

# Reuse a single HTTP session for speed
# NOTE: Do NOT set Referer globally — the API rejects requests with a
# Referer from sbyuedu.com. We set Referer only on the chapter page request.
HTTP = requests.Session()
HTTP.headers.update({"User-Agent": "Mozilla/5.0"})


# ---------------------------------------------------------------------------
# Qiniu
# ---------------------------------------------------------------------------

def load_qiniu_config():
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return {
        "access_key": os.environ.get("QINIU_ACCESS_KEY", ""),
        "secret_key": os.environ.get("QINIU_SECRET_KEY", ""),
        "bucket": os.environ.get("QINIU_BUCKET", ""),
        "domain": os.environ.get("QINIU_DOMAIN", ""),
    }


def upload_to_qiniu(config: dict, key: str, content: str) -> tuple[bool, str]:
    q = Auth(config["access_key"], config["secret_key"])
    token = q.upload_token(config["bucket"], key, 3600)
    ret, info = put_data(token, key, content.encode("utf-8"))
    if info.status_code == 200:
        return True, ""
    return False, f"{info.status_code} {info.text_body[:200] if info.text_body else ''}"


def list_existing_keys(config: dict, prefix: str = "novels/") -> set[str]:
    """List all existing object keys in the bucket under the given prefix.
    Used to skip already-uploaded chapters on restart."""
    q = Auth(config["access_key"], config["secret_key"])
    bucket = BucketManager(q)
    existing: set[str] = set()
    marker = None
    while True:
        ret, eof, info = bucket.list(config["bucket"], prefix, marker, limit=1000)
        if info.status_code != 200 or ret is None:
            sys.stderr.write(
                f"  ⚠ list existing keys failed: {info.status_code} "
                f"{info.text_body[:200] if info.text_body else ''}\n"
            )
            break
        for item in ret.get("items", []):
            existing.add(item["key"])
        if eof or not ret.get("marker"):
            break
        marker = ret["marker"]
    return existing


# ---------------------------------------------------------------------------
# Scraping
# ---------------------------------------------------------------------------

def collect_book_ids(cat_id: int, cat_name: str) -> list[dict]:
    """Crawl category listing pages to collect book IDs."""
    books = []
    for page_num in range(1, 60):
        url = f"{BASE_URL}/list/{cat_id}/{page_num}" if page_num > 1 else f"{BASE_URL}/list/{cat_id}"
        try:
            resp = Fetcher.get(url)
            if resp.status != 200:
                break
            found = 0
            for a in resp.css("a"):
                href = a.attrib.get("href", "")
                text = (a.text or "").strip()
                m = re.match(r"https://www\.sbyuedu\.com/intro/(\d+)", href)
                if m:
                    bid = int(m.group(1))
                    if bid not in [b["id"] for b in books]:
                        books.append({"id": bid, "title": text, "category": cat_name})
                        found += 1
            if found == 0 and page_num > 1:
                break
        except Exception as e:
            print(f"  ⚠ cat {cat_name} page {page_num}: {e}")
            break
        time.sleep(0.3)
    return books


def get_book_info(book_id: int) -> dict:
    """Get book metadata + full chapter list via DynamicFetcher."""
    url = f"{BASE_URL}/intro/{book_id}"
    page = DynamicFetcher.fetch(
        url, headless=True, network_idle=True,
        page_action=lambda p: p.wait_for_timeout(2500),
    )

    # Title from <title> tag: 《title》author_全文免费阅读
    page_title = page.css("title::text").get() or ""
    title = ""
    author = ""
    m = re.match(r"《(.+?)》(.+?)_", page_title)
    if m:
        title, author = m.group(1), m.group(2)

    # Meta
    description = ""
    for meta in page.css("meta"):
        if meta.attrib.get("name") == "description":
            description = meta.attrib.get("content", "")

    # Word count + status from page text
    raw = page.html_content if hasattr(page, "html_content") else ""
    text = re.sub(r"<[^>]+>", " ", raw)
    text = re.sub(r"\s+", " ", text)
    m = re.search(r"(\d+)万字", text)
    word_count = int(m.group(1)) * 10000 if m else 0
    status = "completed" if "完结" in text else ("ongoing" if "连载" in text else "")

    # Chapter list — site lists newest first, sort by chapter number ascending
    chapters = []
    for a in page.css("a"):
        href = a.attrib.get("href", "")
        text_c = (a.text or "").strip()
        m = re.match(r"/read/(\d+)", href)
        if m and text_c and len(text_c) > 2 and "章" in text_c:
            cid = int(m.group(1))
            if cid not in [c["id"] for c in chapters]:
                chapters.append({"id": cid, "title": text_c, "url": f"{BASE_URL}/read/{m.group(1)}"})

    # Sort by chapter number extracted from title (e.g. "第337章 ..." -> 337)
    def ch_num(ch):
        m = re.search(r"第(\d+)章", ch["title"])
        return int(m.group(1)) if m else 0
    chapters.sort(key=ch_num)

    return {
        "id": book_id, "title": title, "author": author,
        "description": description, "word_count": word_count,
        "status": status, "chapters": chapters,
    }


def get_chapter_content_fast(chapter_url: str) -> str:
    """Fetch chapter content by extracting the pre-signed JSONP API URL
    from the static HTML and calling it directly. ~10x faster than browser.

    Retry policy:
      - 429 (rate limit): exponential backoff, up to 3 retries
      - 403 (content restriction): no retry — skip immediately
      - DNS/timeout/conn errors: retry after 5s (transient)
    """
    # 1. Fast static fetch — retry on 429 + transient conn errors
    resp = None
    for attempt in range(4):
        try:
            resp = HTTP.get(chapter_url, timeout=15)
        except Exception as e:
            if attempt < 3:
                sys.stderr.write(f"  [fast] {chapter_url}: conn error ({e}), retry in 5s...\n")
                time.sleep(5)
                continue
            sys.stderr.write(f"  [fast] {chapter_url}: EXCEPTION {e}\n")
            return ""
        if resp.status_code == 429 and attempt < 3:
            wait = 5 * (attempt + 1)
            sys.stderr.write(f"  [fast] {chapter_url}: HTTP 429, waiting {wait}s...\n")
            time.sleep(wait)
            continue
        break
    if resp is None or resp.status_code != 200:
        code = resp.status_code if resp else "no response"
        sys.stderr.write(f"  [fast] {chapter_url}: HTTP {code}\n")
        return ""
    html = resp.text

    # 2. Extract signed API URL (match until whitespace/quotes/angle-brackets)
    m = re.search(r'(//api\.ixshuo\.com/api/novels/read\?[^\s"\'<>]+)', html)
    if not m:
        sys.stderr.write(f"  [fast] {chapter_url}: no API URL in HTML (len={len(html)})\n")
        return ""
    api_url = "https:" + m.group(1).replace("&amp;", "&")

    # 3. Call API — retry on 429 with exponential backoff; 403 = skip (content restriction)
    api_resp = None
    for attempt in range(4):
        try:
            api_resp = HTTP.get(api_url, timeout=15)
        except Exception as e:
            if attempt < 3:
                sys.stderr.write(f"  [fast] {chapter_url}: API conn error ({e}), retry in 5s...\n")
                time.sleep(5)
                continue
            sys.stderr.write(f"  [fast] {chapter_url}: API EXCEPTION {e}\n")
            return ""
        if api_resp.status_code == 429 and attempt < 3:
            wait = 5 * (attempt + 1)
            sys.stderr.write(f"  [fast] {chapter_url}: API 429, waiting {wait}s...\n")
            time.sleep(wait)
            continue
        break
    if api_resp is None or api_resp.status_code != 200:
        code = api_resp.status_code if api_resp else "no response"
        if code == 403:
            sys.stderr.write(f"  [fast] {chapter_url}: API 403 (content restricted), skipping\n")
        else:
            sys.stderr.write(f"  [fast] {chapter_url}: API {code}\n")
        return ""

    # 4. Parse JSONP: novel_read({...})
    text = api_resp.text.strip()
    m = re.match(r"novel_read\((.+)\)", text, re.DOTALL)
    if not m:
        sys.stderr.write(f"  [fast] {chapter_url}: JSONP parse fail (len={len(text)})\n")
        return ""
    data = json.loads(m.group(1))
    content = data.get("data", {}).get("content", "")
    return content.strip()


def book_meta_json(info: dict, total_chapters: int, uploaded: int) -> str:
    """Build the book-level metadata JSON."""
    meta = {
        "title": info["title"],
        "author": info["author"],
        "category": info.get("category", ""),
        "word_count": info["word_count"],
        "chapter_count": total_chapters,
        "uploaded_chapters": uploaded,
        "status": info["status"],
        "source": f"{BASE_URL}/intro/{info['id']}",
        "book_id": info["id"],
        "description": info.get("description", ""),
    }
    return json.dumps(meta, ensure_ascii=False, indent=2)


def chapter_to_markdown(info: dict, chapter: dict, idx: int, content: str) -> str:
    """Build a single-chapter Markdown file with frontmatter."""
    lines = [
        "---",
        f'book: "{info["title"]}"',
        f'author: "{info["author"]}"',
        f'category: "{info.get("category", "")}"',
        f'chapter_index: {idx}',
        f'chapter_title: "{chapter["title"]}"',
        f'source: "{chapter["url"]}"',
        "---",
        "",
        f"# {chapter['title']}",
        "",
        content,
        "",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scrape sbyuedu.com → Qiniu")
    parser.add_argument("--max-books", type=int, default=0)
    parser.add_argument("--max-chapters", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--category", type=int, default=0, help="Only this category ID")
    parser.add_argument("--delay", type=float, default=5.0,
                        help="Seconds to wait between chapters (default: 5)")
    parser.add_argument("--no-skip", action="store_true",
                        help="Don't skip already-uploaded chapters")
    args = parser.parse_args()

    config = load_qiniu_config()
    if not config.get("access_key"):
        print("ERROR: No Qiniu config. Set ~/.config/cinyuverse/qiniu.json")
        sys.exit(1)

    print("=" * 60)
    print("神笔阅读 → 七牛云 (fast mode)")
    print("=" * 60)
    print(f"Bucket: {config['bucket']} | Domain: {config['domain']}")
    print(f"Delay: {args.delay}s between chapters")

    # List existing keys so we can skip already-uploaded chapters
    existing_keys: set[str] = set()
    if not args.no_skip and not args.dry_run:
        print("Listing existing bucket keys for skip-duplicate...", end=" ", flush=True)
        existing_keys = list_existing_keys(config)
        print(f"{len(existing_keys)} keys found")
    else:
        print("Skip-duplicate: disabled")

    print()

    # Step 1: Collect book IDs
    all_books = []
    cats = [(args.category, "")] if args.category else CATEGORIES
    for cat_id, cat_name in cats:
        print(f"📖 分类: {cat_name or cat_id} ...", end=" ", flush=True)
        books = collect_book_ids(cat_id, cat_name)
        print(f"{len(books)} 本")
        all_books.extend(books)
        time.sleep(0.5)

    # Deduplicate
    seen = set()
    unique = []
    for b in all_books:
        if b["id"] not in seen:
            seen.add(b["id"])
            unique.append(b)
    print(f"\n总计 {len(unique)} 本不重复书籍")
    if args.max_books > 0:
        unique = unique[:args.max_books]
        print(f"限制前 {args.max_books} 本")

    # Step 2-4: Scrape + upload
    ok, fail = 0, 0
    skipped = 0
    for idx, book in enumerate(unique, 1):
        print(f"\n[{idx}/{len(unique)}] 📕 {book['title']} (ID:{book['id']})")
        try:
            info = get_book_info(book["id"])
            if not info["title"]:
                print("  ⚠ 无书名，跳过")
                fail += 1
                continue

            chapters = info["chapters"]
            if args.max_chapters > 0:
                chapters = chapters[:args.max_chapters]

            print(f"  作者:{info['author']} | 章节:{len(chapters)} | {info['word_count']/10000:.0f}万字")

            if not chapters:
                print("  ⚠ 无章节")
                fail += 1
                continue

            # Crawl chapters (fast mode) — upload each chapter separately
            info["category"] = book.get("category", "未分类")
            safe_title = re.sub(r"[^\w\u4e00-\u9fff]", "_", info["title"])
            book_prefix = f"novels/{info['category']}/{safe_title}"

            uploaded = 0
            for ci, ch in enumerate(chapters, 1):
                ch_key = f"{book_prefix}/{ci:04d}.md"

                # Skip if already uploaded
                if ch_key in existing_keys:
                    skipped += 1
                    uploaded += 1  # count as done for meta accuracy
                    if ci % 50 == 0:
                        print(f"  进度: {ci}/{len(chapters)} (跳过已上传 {skipped})", flush=True)
                    continue

                if ci % 20 == 0:
                    print(f"  进度: {ci}/{len(chapters)} (已上传 {uploaded})", flush=True)
                content = get_chapter_content_fast(ch["url"])
                if content:
                    ch_md = chapter_to_markdown(info, ch, ci, content)
                    if args.dry_run:
                        print(f"  [DRY RUN] → {ch_key} ({len(ch_md)} 字符)")
                    else:
                        success, err = upload_to_qiniu(config, ch_key, ch_md)
                        if success:
                            uploaded += 1
                            existing_keys.add(ch_key)
                        else:
                            sys.stderr.write(f"  ⚠ upload fail ch {ci}: {err}\n")
                else:
                    sys.stderr.write(f"  ⚠ ch {ci} content empty, skipping\n")
                time.sleep(args.delay)

            # Upload book metadata
            if uploaded > 0:
                meta = book_meta_json(info, len(chapters), uploaded)
                meta_key = f"{book_prefix}/_meta.json"
                if args.dry_run:
                    print(f"  [DRY RUN] → {meta_key}")
                else:
                    success, err = upload_to_qiniu(config, meta_key, meta)
                    if success:
                        print(f"  ☁ {book_prefix}/ ({uploaded}/{len(chapters)} 章) ✓")
                        ok += 1
                    else:
                        print(f"  ✗ meta upload fail: {err}")
                        fail += 1
            else:
                print("  ⚠ 所有章节为空")
                fail += 1

        except Exception as e:
            print(f"  ✗ {e}")
            fail += 1

    print(f"\n{'='*60}")
    print(f"完成! 成功:{ok} 失败:{fail} 跳过:{skipped}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
