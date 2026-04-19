package main

import (
	"context"
	"flag"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/LingByte/CinyuVerse/pkg/novelfetch"
)

func main() {
	bookFlag := flag.String("book", "", "book catalog base URL, e.g. https://www.22biqu.com/biqu45919/ (enables crawl + per-chapter fetch)")
	urlFlag := flag.String("url", "https://www.22biqu.com/biqu45919/22908453.html", "single chapter page URL (ignored if -book is set)")
	outFlag := flag.String("o", "chapter.txt", "single-chapter output .txt path")
	outDirFlag := flag.String("out-dir", "novel_out", "book mode: directory for one txt per chapter (chapter id as filename)")
	idsFlag := flag.String("ids", "chapter_ids.txt", "book mode: path to write sorted chapter numeric ids")
	followFlag := flag.Bool("follow", false, "single mode: follow split pages via next_url until next chapter")
	skipSecond := flag.Bool("skip-second-page", false, "book mode: do not fetch …_2.html for each chapter")
	timeout := flag.Duration("timeout", 30*time.Second, "HTTP client timeout per request")
	flag.Parse()

	client := &novelfetch.Client{Timeout: *timeout}

	if *bookFlag != "" {
		runBookMode(client, *bookFlag, *outDirFlag, *idsFlag, *skipSecond)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout+5*time.Second)
	defer cancel()

	var allLines []string
	var title string
	raw := *urlFlag
	seen := map[string]bool{}

	for {
		if seen[raw] {
			break
		}
		seen[raw] = true

		ch, err := client.FetchChapter(ctx, raw)
		if err != nil {
			fmt.Fprintf(os.Stderr, "fetch %s: %v\n", raw, err)
			os.Exit(1)
		}
		if title == "" {
			title = ch.Title
		}
		lines := stripTitleDup(ch.Lines, title)
		allLines = append(allLines, lines...)

		if !*followFlag || ch.NextPageURL == "" {
			break
		}
		if !novelfetch.ContinuationPage(raw, ch.NextPageURL) {
			break
		}
		raw = ch.NextPageURL
	}

	var b strings.Builder
	if title != "" {
		b.WriteString(title)
		b.WriteString("\n\n")
	}
	b.WriteString(strings.Join(allLines, "\n"))
	b.WriteString("\n")

	if err := os.WriteFile(*outFlag, []byte(b.String()), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write %s: %v\n", *outFlag, err)
		os.Exit(1)
	}
	fmt.Println(*outFlag)
}

func runBookMode(client *novelfetch.Client, bookBaseRaw, outDir, idsPath string, skipSecond bool) {
	bookBase, err := url.Parse(bookBaseRaw)
	if err != nil {
		fmt.Fprintf(os.Stderr, "parse -book URL: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()

	firstURL := novelfetch.CatalogIndexURL(bookBase, 1)
	body, err := client.FetchHTMLBody(ctx, firstURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "catalog %s: %v\n", firstURL, err)
		os.Exit(1)
	}
	bp := novelfetch.BookPath(bookBase)
	maxPage := novelfetch.MaxCatalogPage(body, bp)

	var allIDs []string
	seen := map[string]struct{}{}
	for page := 1; page <= maxPage; page++ {
		pageURL := novelfetch.CatalogIndexURL(bookBase, page)
		var html []byte
		if page == 1 {
			html = body
		} else {
			html, err = client.FetchHTMLBody(ctx, pageURL)
			if err != nil {
				fmt.Fprintf(os.Stderr, "catalog %s: %v\n", pageURL, err)
				os.Exit(1)
			}
		}
		for _, id := range novelfetch.ChapterIDsFromCatalogHTML(html, bp) {
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			allIDs = append(allIDs, id)
		}
	}

	sort.Slice(allIDs, func(i, j int) bool {
		ai, _ := strconv.Atoi(allIDs[i])
		bj, _ := strconv.Atoi(allIDs[j])
		return ai < bj
	})

	var idLines strings.Builder
	for _, id := range allIDs {
		idLines.WriteString(id)
		idLines.WriteByte('\n')
	}
	if err := os.WriteFile(idsPath, []byte(idLines.String()), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write ids %s: %v\n", idsPath, err)
		os.Exit(1)
	}
	fmt.Fprintf(os.Stderr, "wrote %d chapter ids -> %s\n", len(allIDs), idsPath)

	if err := os.MkdirAll(outDir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "mkdir %s: %v\n", outDir, err)
		os.Exit(1)
	}

	for i, id := range allIDs {
		u1 := novelfetch.ChapterPageURL(bookBase, id)
		ch1, err := client.FetchChapter(ctx, u1)
		if err != nil {
			fmt.Fprintf(os.Stderr, "chapter %s: %v\n", id, err)
			os.Exit(1)
		}
		title := ch1.Title
		lines := stripTitleDup(ch1.Lines, title)

		if !skipSecond {
			u2 := novelfetch.ChapterSecondPageURL(bookBase, id)
			ch2, err := client.FetchChapterIfOK(ctx, u2)
			if err != nil {
				fmt.Fprintf(os.Stderr, "chapter %s _2: %v\n", id, err)
				os.Exit(1)
			}
			if ch2 != nil {
				lines = append(lines, stripTitleDup(ch2.Lines, title)...)
			}
		}

		var b strings.Builder
		if title != "" {
			b.WriteString(title)
			b.WriteString("\n\n")
		}
		b.WriteString(strings.Join(lines, "\n"))
		b.WriteString("\n")

		outPath := filepath.Join(outDir, id+".txt")
		if err := os.WriteFile(outPath, []byte(b.String()), 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "write %s: %v\n", outPath, err)
			os.Exit(1)
		}
		if (i+1)%50 == 0 || i == len(allIDs)-1 {
			fmt.Fprintf(os.Stderr, "chapters %d/%d\n", i+1, len(allIDs))
		}
	}
	fmt.Fprintf(os.Stderr, "done: %d files in %s\n", len(allIDs), outDir)
}

func stripTitleDup(lines []string, title string) []string {
	if len(lines) == 0 || title == "" {
		return lines
	}
	if strings.TrimSpace(lines[0]) == title {
		return lines[1:]
	}
	return lines
}
