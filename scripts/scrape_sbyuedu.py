#!/usr/bin/env python3
"""
Fast scraper for sbyuedu.com (神笔阅读) → Qiniu upload.

Strategy (optimized):
  1. Crawl /list/<category> pages to collect all book IDs (static HTTP)
  2. For each book, crawl /intro/<id> with DynamicFetcher to get chapter list
  3. For each chapter, extract the pre-signed JSONP API URL from the static
     HTML and call it directly (no browser needed — ~10x faster)
  4. Assemble into Markdown with frontmatter
  5. Upload to Qiniu bucket under novels/<category>/<title>.md

Usage:
  python3 scrape_sbyuedu.py [--max-books N] [--max-chapters N] [--dry-run]
  python3 scrape_sbyuedu.py --category 2 --max-books 5   # only 总裁豪门, 5 books
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
from qiniu import Auth, put_data

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
    from the static HTML and calling it directly. ~10x faster than browser."""
    try:
        # 1. Fast static fetch — retry on 429
        for attempt in range(3):
            resp = HTTP.get(chapter_url, timeout=10)
            if resp.status_code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            break
        if resp.status_code != 200:
            sys.stderr.write(f"  [fast] {chapter_url}: HTTP {resp.status_code}\n")
            return ""
        html = resp.text

        # 2. Extract signed API URL (match until whitespace/quotes/angle-brackets)
        m = re.search(r'(//api\.ixshuo\.com/api/novels/read\?[^\s"\'<>]+)', html)
        if not m:
            sys.stderr.write(f"  [fast] {chapter_url}: no API URL in HTML (len={len(html)})\n")
            return ""
        api_url = "https:" + m.group(1).replace("&amp;", "&")

        # 3. Call API — retry on 429 with exponential backoff
        for attempt in range(3):
            api_resp = HTTP.get(api_url, timeout=10)
            if api_resp.status_code == 429:
                wait = 5 * (attempt + 1)
                sys.stderr.write(f"  [fast] {chapter_url}: API 429, waiting {wait}s...\n")
                time.sleep(wait)
                continue
            break
        if api_resp.status_code != 200:
            sys.stderr.write(f"  [fast] {chapter_url}: API {api_resp.status_code}\n")
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

    except Exception as e:
        sys.stderr.write(f"  [fast] {chapter_url}: EXCEPTION {e}\n")
        return ""


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
    args = parser.parse_args()

    config = load_qiniu_config()
    if not config.get("access_key"):
        print("ERROR: No Qiniu config. Set ~/.config/cinyuverse/qiniu.json")
        sys.exit(1)

    print("=" * 60)
    print("神笔阅读 → 七牛云 (fast mode)")
    print("=" * 60)
    print(f"Bucket: {config['bucket']} | Domain: {config['domain']}")
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
                if ci % 20 == 0:
                    print(f"  进度: {ci}/{len(chapters)} (已上传 {uploaded})", flush=True)
                content = get_chapter_content_fast(ch["url"])
                if content:
                    ch_md = chapter_to_markdown(info, ch, ci, content)
                    ch_key = f"{book_prefix}/{ci:04d}.md"
                    if args.dry_run:
                        print(f"  [DRY RUN] → {ch_key} ({len(ch_md)} 字符)")
                    else:
                        success, err = upload_to_qiniu(config, ch_key, ch_md)
                        if success:
                            uploaded += 1
                        else:
                            sys.stderr.write(f"  ⚠ upload fail ch {ci}: {err}\n")
                else:
                    sys.stderr.write(f"  ⚠ ch {ci} content empty, skipping\n")
                time.sleep(2.0)

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
    print(f"完成! 成功:{ok} 失败:{fail}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
