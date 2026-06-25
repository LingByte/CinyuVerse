package models

// ShortFictionChapterDraft is one chapter in a short-fiction manuscript.
type ShortFictionChapterDraft struct {
	Number    int    `json:"number"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	CharCount int    `json:"charCount"`
}

// ShortFictionDraft is the parsed short-fiction manuscript.
type ShortFictionDraft struct {
	StoryTitle  string                   `json:"storyTitle"`
	OpeningHook string                   `json:"openingHook,omitempty"`
	Chapters    []ShortFictionChapterDraft `json:"chapters"`
	RawContent  string                   `json:"rawContent"`
}

// ShortFictionOutlineParsed is the parsed outline artifact.
type ShortFictionOutlineParsed struct {
	StoryTitle string `json:"storyTitle"`
	RawContent string `json:"rawContent"`
}

// ShortFictionOutline is the plan for a standalone short story package.
type ShortFictionOutline struct {
	Title    string   `json:"title"`
	Synopsis string   `json:"synopsis"`
	Chapters []string `json:"chapters"`
}

// ShortFictionSalesPackage is marketing copy for a short.
type ShortFictionSalesPackage struct {
	Synopsis      string   `json:"synopsis"`
	SellingPoints []string `json:"sellingPoints"`
}

// ShortFictionResult is the deliverable bundle for a short-fiction run.
type ShortFictionResult struct {
	StoryID      string                   `json:"storyId"`
	Title        string                   `json:"title"`
	OutputDir    string                   `json:"outputDir"`
	FullMarkdown string                   `json:"fullMarkdown"`
	Outline      ShortFictionOutline      `json:"outline"`
	Draft        ShortFictionDraft        `json:"draft"`
	Sales        ShortFictionSalesPackage `json:"sales"`
	CoverPrompt  string                   `json:"coverPrompt,omitempty"`
}
