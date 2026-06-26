package events_test

import (
	"testing"

	"github.com/LingByte/CinyuVerse/pkg/story/events"
)

func TestHubPublishSubscribe(t *testing.T) {
	hub := events.NewHub()
	sub, unsub := hub.Subscribe(nil)
	defer unsub()
	hub.Write("start", "book1", 1, "test", nil)
	select {
	case ev := <-sub.Ch:
		if ev.Type != "write:start" || ev.BookID != "book1" {
			t.Fatalf("event: %+v", ev)
		}
	default:
		t.Fatal("expected event")
	}
}

func TestHubRecent(t *testing.T) {
	hub := events.NewHub()
	hub.Log("hello", nil)
	recent := hub.Recent("log", 10)
	if len(recent) != 1 {
		t.Fatalf("recent=%d", len(recent))
	}
}
