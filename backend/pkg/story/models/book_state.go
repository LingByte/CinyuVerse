package models

// ChapterWithContent pairs chapter metadata with prose body.
type ChapterWithContent struct {
	Meta    ChapterMeta `json:"meta"`
	Content string      `json:"content"`
}

// BookState is the portable book snapshot exchanged between client and server.
// The frontend owns persistence; the backend uses this for AI pipeline context.
type BookState struct {
	Config    BookConfig            `json:"config"`
	Chapters  []ChapterWithContent  `json:"chapters"`
	Documents map[string]string     `json:"documents"`
	Runtime   *RuntimeStateSnapshot `json:"runtime,omitempty"`
}

// CreateBookResult is returned when a book is initialized without server-side disk writes.
type CreateBookResult struct {
	Book       BookConfig `json:"book"`
	State      BookState  `json:"state"`
	Foundation struct {
		StoryBible    string `json:"storyBible"`
		VolumeOutline string `json:"volumeOutline"`
		BookRules     string `json:"bookRules"`
		PendingHooks  string `json:"pendingHooks"`
		CurrentState  string `json:"currentState"`
	} `json:"foundation"`
}

// WriteNextResult extends the pipeline outcome with updated portable state.
type WriteNextResult struct {
	ChapterNumber int           `json:"chapterNumber"`
	Title         string        `json:"title"`
	Content       string        `json:"content"`
	WordCount     int           `json:"wordCount"`
	Revised       bool          `json:"revised"`
	Status        ChapterStatus `json:"status"`
	ChapterMeta   ChapterMeta   `json:"chapterMeta"`
	State         BookState     `json:"state"`
}
