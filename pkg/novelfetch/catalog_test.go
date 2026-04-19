package novelfetch

import (
	"testing"
)

func TestMaxCatalogPage(t *testing.T) {
	html := `<select id="indexselect"><option value="/biqu45919/" selected="selected">1 - 200章</option>` +
		`<option value="/biqu45919/2/">201 - 400章</option><option value="/biqu45919/12/">2201 - 2280章</option></select>`
	n := MaxCatalogPage([]byte(html), "/biqu45919")
	if n != 12 {
		t.Fatalf("got %d want 12", n)
	}
}

func TestChapterIDsFromCatalogHTML(t *testing.T) {
	html := `<a href="/biqu45919/22908453.html">x</a><a href="/biqu45919/22908453_2.html">skip</a><a href="/biqu45919/22908450.html">y</a>`
	ids := ChapterIDsFromCatalogHTML([]byte(html), "/biqu45919")
	if len(ids) != 2 {
		t.Fatalf("got %v (len=%d)", ids, len(ids))
	}
	if ids[0] != "22908450" || ids[1] != "22908453" {
		t.Fatalf("got %v", ids)
	}
}
