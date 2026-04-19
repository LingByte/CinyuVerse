package novelfetch

import (
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// MaxCatalogPage parses the index <select> options (e.g. /biqu45919/2/) and returns
// the highest page number (1 is the first page without /N/ in the path).
func MaxCatalogPage(htmlBody []byte, bookPath string) int {
	bookPath = strings.TrimSuffix(bookPath, "/")
	esc := regexp.QuoteMeta(bookPath)
	re := regexp.MustCompile(esc + `/(\d+)/`)
	max := 1
	for _, m := range re.FindAllStringSubmatch(string(htmlBody), -1) {
		if len(m) < 2 {
			continue
		}
		n, err := strconv.Atoi(m[1])
		if err == nil && n > max {
			max = n
		}
	}
	return max
}

// ChapterIDsFromCatalogHTML collects unique chapter file ids from hrefs like
// /biqu45919/22908456.html (digits only before .html; excludes …_2.html).
func ChapterIDsFromCatalogHTML(htmlBody []byte, bookPath string) []string {
	bookPath = strings.TrimSuffix(bookPath, "/")
	esc := regexp.QuoteMeta(bookPath)
	re := regexp.MustCompile(esc + `/(\d+)\.html`)
	seen := map[string]struct{}{}
	var ids []string
	for _, m := range re.FindAllStringSubmatch(string(htmlBody), -1) {
		if len(m) < 2 {
			continue
		}
		id := m[1]
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool {
		ai, _ := strconv.Atoi(ids[i])
		bj, _ := strconv.Atoi(ids[j])
		return ai < bj
	})
	return ids
}

// BookPath returns the URL path prefix for the book without trailing slash, e.g. /biqu45919.
func BookPath(bookBase *url.URL) string {
	p := strings.TrimSuffix(bookBase.Path, "/")
	return p
}

// CatalogIndexURL builds the catalog list URL for page 1..maxPage (page 1 is …/biqu45919/).
func CatalogIndexURL(bookBase *url.URL, page int) string {
	bp := BookPath(bookBase)
	if page <= 1 {
		u := *bookBase
		u.Path = bp + "/"
		u.RawQuery = ""
		u.Fragment = ""
		return u.String()
	}
	u := *bookBase
	u.Path = bp + "/" + strconv.Itoa(page) + "/"
	u.RawQuery = ""
	u.Fragment = ""
	return u.String()
}

// ChapterPageURL builds the reader URL for a chapter id (e.g. 22908453 -> …/22908453.html).
func ChapterPageURL(bookBase *url.URL, chapterID string) string {
	u := *bookBase
	u.Path = BookPath(bookBase) + "/" + chapterID + ".html"
	u.RawQuery = ""
	u.Fragment = ""
	return u.String()
}

// ChapterSecondPageURL builds …/22908453_2.html when the chapter is split across two pages.
func ChapterSecondPageURL(bookBase *url.URL, chapterID string) string {
	u := *bookBase
	u.Path = BookPath(bookBase) + "/" + chapterID + "_2.html"
	u.RawQuery = ""
	u.Fragment = ""
	return u.String()
}
