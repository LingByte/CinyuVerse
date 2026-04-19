// Package novelfetch fetches a novel chapter page over HTTP and extracts plain text
// from common 笔趣阁-style HTML layouts (e.g. div#content with p tags).
package novelfetch

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"golang.org/x/net/html"
)

const defaultUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// Chapter is one fetched reader page (may be part of a split chapter).
type Chapter struct {
	Title       string
	Lines       []string
	NextPageURL string // absolute URL if the site splits the chapter across pages
}

// Client performs HTTP GET with a browser-like User-Agent and timeout.
type Client struct {
	HTTP    *http.Client
	UA      string
	Timeout time.Duration
}

func (c *Client) httpClient() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	timeout := c.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	return &http.Client{Timeout: timeout}
}

func (c *Client) userAgent() string {
	if c.UA != "" {
		return c.UA
	}
	return defaultUserAgent
}

func (c *Client) getBytes(ctx context.Context, rawURL string) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", c.userAgent())
	req.Header.Set("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return body, resp.StatusCode, nil
}

// FetchHTMLBody returns the response body for a 200 OK page (e.g. catalog index).
func (c *Client) FetchHTMLBody(ctx context.Context, rawURL string) ([]byte, error) {
	body, code, err := c.getBytes(ctx, rawURL)
	if err != nil {
		return nil, err
	}
	if code != http.StatusOK {
		return nil, fmt.Errorf("GET %s: HTTP %d", rawURL, code)
	}
	return body, nil
}

// FetchChapter downloads the page at rawURL and extracts title and body lines.
func (c *Client) FetchChapter(ctx context.Context, rawURL string) (*Chapter, error) {
	body, code, err := c.getBytes(ctx, rawURL)
	if err != nil {
		return nil, err
	}
	if code != http.StatusOK {
		return nil, fmt.Errorf("GET %s: HTTP %d", rawURL, code)
	}
	base, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	return parseChapterHTML(body, base)
}

// FetchChapterIfOK parses a chapter page; returns (nil, nil) if HTTP status is not 200
// or the page has no readable #content (e.g. missing split page).
func (c *Client) FetchChapterIfOK(ctx context.Context, rawURL string) (*Chapter, error) {
	body, code, err := c.getBytes(ctx, rawURL)
	if err != nil {
		return nil, err
	}
	if code != http.StatusOK {
		return nil, nil
	}
	base, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	ch, err := parseChapterHTML(body, base)
	if err != nil {
		return nil, nil
	}
	return ch, nil
}

func parseChapterHTML(body []byte, base *url.URL) (*Chapter, error) {
	doc, err := html.Parse(strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	ch := &Chapter{
		Title: strings.TrimSpace(findH1Title(doc)),
		Lines: extractContentParagraphs(doc),
	}
	if next := findNextPageHref(doc); next != "" {
		if abs, err := base.Parse(next); err == nil {
			ch.NextPageURL = abs.String()
		}
	}
	if len(ch.Lines) == 0 {
		return nil, fmt.Errorf("no paragraph text found in #content (layout may have changed)")
	}
	return ch, nil
}

func findH1Title(n *html.Node) string {
	if n.Type == html.ElementNode && n.Data == "h1" && hasClass(n, "title") {
		return normalizeSpace(innerText(n))
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if s := findH1Title(c); s != "" {
			return s
		}
	}
	return ""
}

func findContentDiv(n *html.Node) *html.Node {
	if n.Type == html.ElementNode && n.Data == "div" {
		if idAttr(n) == "content" {
			return n
		}
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if d := findContentDiv(c); d != nil {
			return d
		}
	}
	return nil
}

func extractContentParagraphs(doc *html.Node) []string {
	div := findContentDiv(doc)
	if div == nil {
		return nil
	}
	var lines []string
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "p" {
			t := normalizeSpace(innerText(n))
			if t != "" {
				lines = append(lines, t)
			}
			return
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(div)
	return lines
}

func findNextPageHref(n *html.Node) string {
	var href string
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if href != "" {
			return
		}
		if node.Type == html.ElementNode && node.Data == "a" {
			if idAttr(node) == "next_url" {
				href = attr(node, "href")
				return
			}
		}
		for c := node.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return strings.TrimSpace(href)
}

func idAttr(n *html.Node) string {
	return attr(n, "id")
}

func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

func hasClass(n *html.Node, want string) bool {
	cls := attr(n, "class")
	for _, part := range strings.Fields(cls) {
		if part == want {
			return true
		}
	}
	return false
}

func innerText(n *html.Node) string {
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.TextNode {
			b.WriteString(node.Data)
			return
		}
		if node.Type == html.ElementNode && node.Data == "br" {
			b.WriteByte('\n')
			return
		}
		for c := node.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return b.String()
}

func normalizeSpace(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "")
	return strings.TrimSpace(s)
}

// ContinuationPage reports whether nextURL is another page of the same chapter
// (e.g. 22908453_2.html after 22908453.html). It is a heuristic for split chapters.
func ContinuationPage(currentURL, nextURL string) bool {
	cu, err := url.Parse(currentURL)
	if err != nil {
		return false
	}
	nu, err := url.Parse(nextURL)
	if err != nil {
		return false
	}
	cur := strings.TrimSuffix(path.Base(cu.Path), ".html")
	nxt := strings.TrimSuffix(path.Base(nu.Path), ".html")
	if cur == "" || nxt == "" {
		return false
	}
	chapterID := strings.Split(cur, "_")[0]
	return strings.HasPrefix(nxt, chapterID+"_")
}
