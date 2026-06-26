package genres

// Genre describes a built-in fiction genre template.
type Genre struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Language    string `json:"language"`
	Description string `json:"description"`
}

// BuiltIn returns InkOS-equivalent default genre list.
func BuiltIn() []Genre {
	return []Genre{
		{ID: "xuanhuan", Name: "玄幻", Language: "zh", Description: "东方玄幻升级流"},
		{ID: "xianxia", Name: "仙侠", Language: "zh", Description: "修仙问道"},
		{ID: "urban", Name: "都市", Language: "zh", Description: "现代都市生活"},
		{ID: "horror", Name: "悬疑恐怖", Language: "zh", Description: "悬疑惊悚"},
		{ID: "other", Name: "其他", Language: "zh", Description: "自定义题材"},
		{ID: "litrpg", Name: "LitRPG", Language: "en", Description: "Game-system fantasy"},
		{ID: "progression", Name: "Progression Fantasy", Language: "en", Description: "Power progression focus"},
		{ID: "isekai", Name: "Isekai", Language: "en", Description: "Portal fantasy"},
		{ID: "cultivation", Name: "Cultivation", Language: "en", Description: "Xianxia-style EN"},
		{ID: "romantasy", Name: "Romantasy", Language: "en", Description: "Romance + fantasy"},
		{ID: "sci-fi", Name: "Sci-Fi", Language: "en", Description: "Science fiction"},
	}
}
