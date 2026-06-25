package events

import (
	"encoding/json"
	"sync"
	"time"
)

// Event is one broadcast payload for SSE clients.
type Event struct {
	Type      string         `json:"type"`
	Timestamp time.Time      `json:"timestamp"`
	BookID    string         `json:"bookId,omitempty"`
	Chapter   int            `json:"chapter,omitempty"`
	Agent     string         `json:"agent,omitempty"`
	Message   string         `json:"message,omitempty"`
	Data      map[string]any `json:"data,omitempty"`
}

// Subscriber receives events until the channel is closed.
type Subscriber struct {
	Ch     chan Event
	filter func(Event) bool
}

// Hub broadcasts pipeline/daemon/agent events to SSE subscribers.
type Hub struct {
	mu          sync.RWMutex
	subscribers map[int]*Subscriber
	nextID      int
	buffer      []Event
	maxBuffer   int
}

// NewHub creates an event hub with a rolling buffer for late subscribers.
func NewHub() *Hub {
	return &Hub{
		subscribers: map[int]*Subscriber{},
		maxBuffer:   200,
	}
}

// Publish sends an event to all subscribers and stores in buffer.
func (h *Hub) Publish(ev Event) {
	if ev.Timestamp.IsZero() {
		ev.Timestamp = time.Now().UTC()
	}
	h.mu.Lock()
	h.buffer = append(h.buffer, ev)
	if len(h.buffer) > h.maxBuffer {
		h.buffer = h.buffer[len(h.buffer)-h.maxBuffer:]
	}
	subs := make([]*Subscriber, 0, len(h.subscribers))
	for _, s := range h.subscribers {
		subs = append(subs, s)
	}
	h.mu.Unlock()
	for _, s := range subs {
		if s.filter != nil && !s.filter(ev) {
			continue
		}
		select {
		case s.Ch <- ev:
		default:
		}
	}
}

// Subscribe registers a new listener. Caller must call Unsubscribe when done.
func (h *Hub) Subscribe(filter func(Event) bool) (*Subscriber, func()) {
	h.mu.Lock()
	id := h.nextID
	h.nextID++
	sub := &Subscriber{Ch: make(chan Event, 64), filter: filter}
	h.subscribers[id] = sub
	buf := append([]Event(nil), h.buffer...)
	h.mu.Unlock()
	for _, ev := range buf {
		if filter == nil || filter(ev) {
			select {
			case sub.Ch <- ev:
			default:
			}
		}
	}
	unsub := func() {
		h.mu.Lock()
		delete(h.subscribers, id)
		close(sub.Ch)
		h.mu.Unlock()
	}
	return sub, unsub
}

// Recent returns a copy of buffered events, optionally filtered by type prefix.
func (h *Hub) Recent(typePrefix string, limit int) []Event {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if limit <= 0 || limit > len(h.buffer) {
		limit = len(h.buffer)
	}
	start := len(h.buffer) - limit
	var out []Event
	for _, ev := range h.buffer[start:] {
		if typePrefix == "" || len(ev.Type) >= len(typePrefix) && ev.Type[:len(typePrefix)] == typePrefix {
			out = append(out, ev)
		}
	}
	return out
}

// FormatSSE encodes one event as an SSE data frame.
func FormatSSE(ev Event) []byte {
	b, _ := json.Marshal(ev)
	return append(append([]byte("data: "), b...), '\n', '\n')
}

// Log publishes a log-line event.
func (h *Hub) Log(msg string, data map[string]any) {
	h.Publish(Event{Type: "log", Message: msg, Data: data})
}

// Write publishes write pipeline stage events.
func (h *Hub) Write(stage, bookID string, chapter int, msg string, data map[string]any) {
	h.Publish(Event{Type: "write:" + stage, BookID: bookID, Chapter: chapter, Message: msg, Data: data})
}

// Daemon publishes daemon lifecycle events.
func (h *Hub) Daemon(stage, msg string, data map[string]any) {
	h.Publish(Event{Type: "daemon:" + stage, Message: msg, Data: data})
}

// Agent publishes agent invocation events.
func (h *Hub) Agent(name, bookID string, msg string, data map[string]any) {
	h.Publish(Event{Type: "agent:" + name, Agent: name, BookID: bookID, Message: msg, Data: data})
}

// Tool publishes conversation tool events.
func (h *Hub) Tool(name, bookID string, data map[string]any) {
	h.Publish(Event{Type: "tool:" + name, BookID: bookID, Message: name, Data: data})
}
