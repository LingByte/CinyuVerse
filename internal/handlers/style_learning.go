package handlers

import (
	"encoding/json"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/LingByte/CinyuVerse/internal/models"
	"github.com/LingByte/lingoroutine/response"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type styleProfileListResp[T any] struct {
	Items []*T  `json:"items"`
	Total int64 `json:"total"`
	Page  int   `json:"page"`
	Size  int   `json:"size"`
}

type styleProfileReq struct {
	NovelID     uint   `json:"novelId"`
	Name        string `json:"name" binding:"required"`
	Status      string `json:"status"`
	Description string `json:"description"`
	Constraints string `json:"constraints"`
}

type styleSampleReq struct {
	Title   string `json:"title"`
	Source  string `json:"source"`
	Content string `json:"content" binding:"required"`
}

func (ch *CinyuHandlers) registerStyleLearningRoutes(r *gin.RouterGroup) {
	g := r.Group("/style-profiles")
	{
		g.POST("", ch.CreateStyleProfile)
		g.GET("", ch.ListStyleProfiles)
		g.GET("/:id", ch.GetStyleProfile)
		g.PUT("/:id", ch.UpdateStyleProfile)
		g.DELETE("/:id", ch.DeleteStyleProfile)
		g.POST("/:id/samples", ch.CreateStyleSample)
		g.GET("/:id/samples", ch.ListStyleSamples)
		g.DELETE("/samples/:sampleId", ch.DeleteStyleSample)
		g.POST("/:id/learn", ch.LearnStyleProfile)
	}
}

func (ch *CinyuHandlers) CreateStyleProfile(c *gin.Context) {
	var req styleProfileReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	p := &models.StyleProfile{
		NovelID:     req.NovelID,
		Name:        strings.TrimSpace(req.Name),
		Status:      normalizeStyleStatus(req.Status),
		Description: strings.TrimSpace(req.Description),
		Constraints: strings.TrimSpace(req.Constraints),
	}
	p.SetCreateInfo("system")
	if err := models.CreateStyleProfile(ch.db, p); err != nil {
		response.Fail(c, "create style profile failed", nil)
		return
	}
	response.Success(c, "OK", p)
}

func (ch *CinyuHandlers) ListStyleProfiles(c *gin.Context) {
	novelID, _ := strconv.ParseUint(strings.TrimSpace(c.Query("novelId")), 10, 64)
	page, _ := strconv.Atoi(strings.TrimSpace(c.DefaultQuery("page", "1")))
	size, _ := strconv.Atoi(strings.TrimSpace(c.DefaultQuery("size", "20")))
	items, total, err := models.ListStyleProfiles(ch.db, uint(novelID), page, size)
	if err != nil {
		response.Fail(c, "list style profiles failed", nil)
		return
	}
	response.Success(c, "OK", styleProfileListResp[models.StyleProfile]{
		Items: items,
		Total: total,
		Page:  page,
		Size:  size,
	})
}

func (ch *CinyuHandlers) GetStyleProfile(c *gin.Context) {
	id, err := parseUintParam(c, "id")
	if err != nil {
		response.Fail(c, "invalid profile id", nil)
		return
	}
	p, err := models.GetStyleProfileByID(ch.db, id)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			response.FailWithCode(c, 404, "profile not found", nil)
			return
		}
		response.Fail(c, "get profile failed", nil)
		return
	}
	response.Success(c, "OK", p)
}

func (ch *CinyuHandlers) UpdateStyleProfile(c *gin.Context) {
	id, err := parseUintParam(c, "id")
	if err != nil {
		response.Fail(c, "invalid profile id", nil)
		return
	}
	p, err := models.GetStyleProfileByID(ch.db, id)
	if err != nil {
		response.Fail(c, "profile not found", nil)
		return
	}
	var req styleProfileReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	if strings.TrimSpace(req.Name) != "" {
		p.Name = strings.TrimSpace(req.Name)
	}
	if strings.TrimSpace(req.Status) != "" {
		p.Status = normalizeStyleStatus(req.Status)
	}
	p.NovelID = req.NovelID
	p.Description = strings.TrimSpace(req.Description)
	p.Constraints = strings.TrimSpace(req.Constraints)
	p.SetUpdateInfo("system")
	if err := models.UpdateStyleProfile(ch.db, p); err != nil {
		response.Fail(c, "update profile failed", nil)
		return
	}
	response.Success(c, "OK", p)
}

func (ch *CinyuHandlers) DeleteStyleProfile(c *gin.Context) {
	id, err := parseUintParam(c, "id")
	if err != nil {
		response.Fail(c, "invalid profile id", nil)
		return
	}
	if err := models.DeleteStyleProfile(ch.db, id, "system"); err != nil {
		response.Fail(c, "delete profile failed", nil)
		return
	}
	response.Success(c, "OK", gin.H{"id": id})
}

func (ch *CinyuHandlers) CreateStyleSample(c *gin.Context) {
	profileID, err := parseUintParam(c, "id")
	if err != nil {
		response.Fail(c, "invalid profile id", nil)
		return
	}
	if _, err := models.GetStyleProfileByID(ch.db, profileID); err != nil {
		response.Fail(c, "profile not found", nil)
		return
	}
	var req styleSampleReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, err.Error(), nil)
		return
	}
	content := strings.TrimSpace(req.Content)
	if content == "" {
		response.Fail(c, "content is required", nil)
		return
	}
	s := &models.StyleSample{
		ProfileID: profileID,
		Title:     strings.TrimSpace(req.Title),
		Source:    normalizeSampleSource(req.Source),
		Content:   content,
		WordCount: models.CalcWordCount(content),
	}
	s.SetCreateInfo("system")
	if err := models.CreateStyleSample(ch.db, s); err != nil {
		response.Fail(c, "create sample failed", nil)
		return
	}
	response.Success(c, "OK", s)
}

func (ch *CinyuHandlers) ListStyleSamples(c *gin.Context) {
	profileID, err := parseUintParam(c, "id")
	if err != nil {
		response.Fail(c, "invalid profile id", nil)
		return
	}
	page, _ := strconv.Atoi(strings.TrimSpace(c.DefaultQuery("page", "1")))
	size, _ := strconv.Atoi(strings.TrimSpace(c.DefaultQuery("size", "50")))
	items, total, err := models.ListStyleSamples(ch.db, profileID, page, size)
	if err != nil {
		response.Fail(c, "list samples failed", nil)
		return
	}
	response.Success(c, "OK", styleProfileListResp[models.StyleSample]{
		Items: items,
		Total: total,
		Page:  page,
		Size:  size,
	})
}

func (ch *CinyuHandlers) DeleteStyleSample(c *gin.Context) {
	id, err := parseUintParam(c, "sampleId")
	if err != nil {
		response.Fail(c, "invalid sample id", nil)
		return
	}
	if err := models.DeleteStyleSample(ch.db, id, "system"); err != nil {
		response.Fail(c, "delete sample failed", nil)
		return
	}
	response.Success(c, "OK", gin.H{"id": id})
}

func (ch *CinyuHandlers) LearnStyleProfile(c *gin.Context) {
	id, err := parseUintParam(c, "id")
	if err != nil {
		response.Fail(c, "invalid profile id", nil)
		return
	}
	p, err := models.GetStyleProfileByID(ch.db, id)
	if err != nil {
		response.Fail(c, "profile not found", nil)
		return
	}
	samples, _, err := models.ListStyleSamples(ch.db, id, 1, 500)
	if err != nil {
		response.Fail(c, "load samples failed", nil)
		return
	}
	if len(samples) == 0 {
		response.FailWithCode(c, 422, "请先添加学习样本", nil)
		return
	}
	spec, summary := analyzeStyle(samples)
	b, _ := json.Marshal(spec)
	now := time.Now()
	p.LearnedSpec = string(b)
	p.LearnedSummary = summary
	p.LearnedAt = &now
	p.Status = normalizeStyleStatus(p.Status)
	p.SetUpdateInfo("system")
	if err := models.UpdateStyleProfile(ch.db, p); err != nil {
		response.Fail(c, "save learning result failed", nil)
		return
	}
	response.Success(c, "OK", gin.H{
		"profile": p,
		"spec":    spec,
		"summary": summary,
	})
}

func parseUintParam(c *gin.Context, key string) (uint, error) {
	id, err := strconv.ParseUint(strings.TrimSpace(c.Param(key)), 10, 64)
	return uint(id), err
}

func normalizeStyleStatus(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "active":
		return "active"
	case "archived":
		return "archived"
	default:
		return "draft"
	}
}

func normalizeSampleSource(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "upload", "chapter":
		return strings.ToLower(strings.TrimSpace(v))
	default:
		return "manual"
	}
}

func analyzeStyle(samples []*models.StyleSample) (map[string]any, string) {
	var totalChars, sentenceCount, dialogueChars, firstPersonHits int
	keywordFreq := map[string]int{}
	firstPersonWords := []string{"我", "我们", "俺", "余", "吾"}

	for _, s := range samples {
		text := strings.TrimSpace(s.Content)
		rs := []rune(text)
		totalChars += len(rs)
		sentenceCount += countSentences(text)
		dialogueChars += countDialogueChars(text)
		for _, w := range firstPersonWords {
			firstPersonHits += strings.Count(text, w)
		}
		for _, tk := range tokenizeCN(text) {
			if len([]rune(tk)) < 2 {
				continue
			}
			keywordFreq[tk]++
		}
	}

	avgSentence := 0.0
	if sentenceCount > 0 {
		avgSentence = float64(totalChars) / float64(sentenceCount)
	}
	dialogueRatio := 0.0
	if totalChars > 0 {
		dialogueRatio = float64(dialogueChars) / float64(totalChars)
	}
	firstPersonRatio := 0.0
	if totalChars > 0 {
		firstPersonRatio = float64(firstPersonHits) / float64(totalChars)
	}
	topKeywords := topNKeywords(keywordFreq, 12)
	tone := inferTone(avgSentence, dialogueRatio)

	spec := map[string]any{
		"sampleCount":      len(samples),
		"totalChars":       totalChars,
		"avgSentenceChars": round2(avgSentence),
		"dialogueRatio":    round2(dialogueRatio),
		"firstPersonRatio": round4(firstPersonRatio),
		"tone":             tone,
		"keywords":         topKeywords,
		"constraintsHint":  "生成时保持句长、对话密度和关键词意象一致，避免跑题",
	}
	summary := "样本共 " + strconv.Itoa(len(samples)) + " 篇，平均句长约 " + strconv.Itoa(int(avgSentence)) +
		" 字，对话占比约 " + strconv.Itoa(int(dialogueRatio*100)) + "%，建议语气为「" + tone + "」。"
	return spec, summary
}

func countSentences(s string) int {
	n := 0
	for _, r := range s {
		switch r {
		case '。', '！', '？', '.', '!', '?', ';', '；':
			n++
		}
	}
	if n == 0 && strings.TrimSpace(s) != "" {
		return 1
	}
	return n
}

func countDialogueChars(s string) int {
	total := 0
	inDialog := false
	for _, r := range s {
		if r == '“' || r == '"' {
			inDialog = !inDialog
			continue
		}
		if inDialog {
			total++
		}
	}
	return total
}

func tokenizeCN(s string) []string {
	out := make([]string, 0, len(s)/2)
	cur := make([]rune, 0, 8)
	push := func() {
		if len(cur) > 0 {
			out = append(out, string(cur))
			cur = cur[:0]
		}
	}
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || (r >= 0x4E00 && r <= 0x9FFF) {
			cur = append(cur, r)
			continue
		}
		push()
	}
	push()
	return out
}

func topNKeywords(freq map[string]int, n int) []string {
	type kv struct {
		K string
		V int
	}
	arr := make([]kv, 0, len(freq))
	for k, v := range freq {
		if v < 2 {
			continue
		}
		arr = append(arr, kv{K: k, V: v})
	}
	sort.Slice(arr, func(i, j int) bool {
		if arr[i].V == arr[j].V {
			return arr[i].K < arr[j].K
		}
		return arr[i].V > arr[j].V
	})
	if len(arr) > n {
		arr = arr[:n]
	}
	out := make([]string, 0, len(arr))
	for _, it := range arr {
		out = append(out, it.K)
	}
	return out
}

func inferTone(avgSentence, dialogueRatio float64) string {
	switch {
	case dialogueRatio > 0.38:
		return "对白驱动"
	case avgSentence > 30:
		return "抒情厚重"
	case avgSentence < 16:
		return "短句紧凑"
	default:
		return "平衡叙述"
	}
}

func round2(v float64) float64 { return float64(int(v*100+0.5)) / 100 }
func round4(v float64) float64 { return float64(int(v*10000+0.5)) / 10000 }
