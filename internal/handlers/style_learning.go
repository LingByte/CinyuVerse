package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/LingByte/CinyuVerse/internal/models"
	"github.com/LingByte/CinyuVerse/pkg/config"
	"github.com/LingByte/lingoroutine/llm"
	"github.com/LingByte/lingoroutine/logger"
	"github.com/LingByte/lingoroutine/response"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type styleProfileListResp[T any] struct {
	Items []*T  `json:"items"`
	Total int64 `json:"total"`
	Page  int   `json:"page"`
	Size  int   `json:"size"`
}

type styleProfileReq struct {
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
	page, _ := strconv.Atoi(strings.TrimSpace(c.DefaultQuery("page", "1")))
	size, _ := strconv.Atoi(strings.TrimSpace(c.DefaultQuery("size", "20")))
	items, total, err := models.ListStyleProfiles(ch.db, page, size)
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

	// 1) 统计指标（辅助）
	stats := computeStyleStats(samples)

	// 2) LLM 深度风格分析
	if strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey) == "" {
		response.FailWithCode(c, 503, "LLM 未配置 (LLM_API_KEY)，无法进行深度风格分析", nil)
		return
	}

	analysis, raw, err := callLLMStyleAnalysis(c.Request.Context(), samples, stats, p)
	if err != nil {
		if logger.Lg != nil {
			logger.Lg.Error("style learn LLM call failed", zap.Error(err))
		}
		response.Fail(c, "风格分析失败: "+err.Error(), nil)
		return
	}

	// 3) 合并：stats + LLM 分析
	spec := map[string]any{
		"stats":   stats,
		"analysis": analysis,
	}
	b, _ := json.Marshal(spec)

	now := time.Now()
	p.LearnedSpec = string(b)
	p.LearnedSummary = analysis.Summary
	p.LearnedAt = &now
	if p.Status == "draft" {
		p.Status = "active"
	}
	p.SetUpdateInfo("system")
	if err := models.UpdateStyleProfile(ch.db, p); err != nil {
		response.Fail(c, "save learning result failed", nil)
		return
	}
	response.Success(c, "OK", gin.H{
		"profile": p,
		"spec":    spec,
		"summary": analysis.Summary,
		"raw":     raw,
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

// styleAnalysisResult LLM 返回的结构化风格分析结果
type styleAnalysisResult struct {
	NarrativeVoice  string   `json:"narrativeVoice"`  // 叙事视角：第一人称/第三人称限知/全知等
	ProseRhythm     string   `json:"proseRhythm"`   // 行文节奏：短句紧凑/舒缓/错落有致
	VocabularyLevel string   `json:"vocabularyLevel"` // 词汇风格：口语化/书面典雅/文学性强
	RhetoricTendency string  `json:"rhetoricTendency"` // 修辞倾向：比喻密集/白描为主/排比/意象化
	DialogueStyle   string   `json:"dialogueStyle"`  // 对话风格：简洁利落/含蓄暗示/方言口语/文雅
	EmotionalPalette string  `json:"emotionalPalette"` // 情感基调：冷峻/温情/热血/苍凉/幽默
	StructuralHabits string  `json:"structuralHabits"` // 结构习惯：场景切入/内心独白/倒叙/插叙
	ImageryDomains  []string `json:"imageryDomains"`  // 意象领域：自然/战争/都市/江湖等
	SignatureTraits []string `json:"signatureTraits"` // 标志性写法特征
	StylePrompt     string   `json:"stylePrompt"`    // 可直接注入生成 prompt 的风格指令
	Summary         string   `json:"summary"`        // 一段话总结
}

// computeStyleStats 纯统计指标（辅助 LLM 分析）
type styleStats struct {
	SampleCount      int     `json:"sampleCount"`
	TotalChars       int     `json:"totalChars"`
	AvgSentenceChars float64 `json:"avgSentenceChars"`
	DialogueRatio    float64 `json:"dialogueRatio"`
	FirstPersonRatio float64 `json:"firstPersonRatio"`
	Tone             string  `json:"tone"`
	TopKeywords      []string `json:"topKeywords"`
	ParagraphAvgLen  float64 `json:"paragraphAvgLen"`
	ExclamRatio      float64 `json:"exclamRatio"` // 感叹号密度
	QuestionRatio    float64 `json:"questionRatio"` // 问号密度
}

func computeStyleStats(samples []*models.StyleSample) *styleStats {
	var totalChars, sentenceCount, dialogueChars, firstPersonHits, paragraphCount int
	var exclamCount, questionCount int
	keywordFreq := map[string]int{}
	firstPersonWords := []string{"我", "我们", "俺", "余", "吾"}

	for _, s := range samples {
		text := strings.TrimSpace(s.Content)
		rs := []rune(text)
		totalChars += len(rs)
		sentenceCount += countSentences(text)
		dialogueChars += countDialogueChars(text)
		paragraphCount += countParagraphs(text)
		for _, w := range firstPersonWords {
			firstPersonHits += strings.Count(text, w)
		}
		for _, r := range rs {
			if r == '！' || r == '!' {
				exclamCount++
			}
			if r == '？' || r == '?' {
				questionCount++
			}
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
	paragraphAvgLen := 0.0
	if paragraphCount > 0 {
		paragraphAvgLen = float64(totalChars) / float64(paragraphCount)
	}
	exclamRatio := 0.0
	if totalChars > 0 {
		exclamRatio = float64(exclamCount) / float64(totalChars)
	}
	questionRatio := 0.0
	if totalChars > 0 {
		questionRatio = float64(questionCount) / float64(totalChars)
	}

	return &styleStats{
		SampleCount:      len(samples),
		TotalChars:       totalChars,
		AvgSentenceChars: round2(avgSentence),
		DialogueRatio:    round2(dialogueRatio),
		FirstPersonRatio: round4(firstPersonRatio),
		Tone:             inferTone(avgSentence, dialogueRatio),
		TopKeywords:      topNKeywords(keywordFreq, 15),
		ParagraphAvgLen:  round2(paragraphAvgLen),
		ExclamRatio:      round4(exclamRatio),
		QuestionRatio:    round4(questionRatio),
	}
}

func callLLMStyleAnalysis(ctx context.Context, samples []*models.StyleSample, stats *styleStats, profile *models.StyleProfile) (*styleAnalysisResult, string, error) {
	// 拼接样本文本（控制总量）
	const maxSampleChars = 12000
	var sb strings.Builder
	sb.WriteString("【风格档案】")
	sb.WriteString(profile.Name)
	if profile.Description != "" {
		sb.WriteString("\n说明：")
		sb.WriteString(profile.Description)
	}
	if profile.Constraints != "" {
		sb.WriteString("\n约束：")
		sb.WriteString(profile.Constraints)
	}
	sb.WriteString("\n\n")

	written := 0
	for i, s := range samples {
		if written >= maxSampleChars {
			sb.WriteString(fmt.Sprintf("...(省略剩余 %d 篇样本)\n", len(samples)-i))
			break
		}
		sb.WriteString(fmt.Sprintf("--- 样本 %d: %s (来源:%s, %d字) ---\n", i+1, s.Title, s.Source, s.WordCount))
		content := s.Content
		if written+len([]rune(content)) > maxSampleChars {
			runes := []rune(content)
			remain := maxSampleChars - written
			if remain > 0 {
				content = string(runes[:remain]) + "...(截断)"
			}
		}
		sb.WriteString(content)
		sb.WriteString("\n\n")
		written += len([]rune(s.Content))
	}

	// 拼接统计摘要
	sb.WriteString("【统计指标】\n")
	statsJSON, _ := json.MarshalIndent(stats, "", "  ")
	sb.WriteString(string(statsJSON))

	systemPrompt := buildStyleLearnSystemPrompt()
	userPrompt := sb.String()

	log := logger.Lg
	if log == nil {
		log = zap.NewNop()
	}

	llmOpts := &llm.LLMOptions{
		Provider:     strings.TrimSpace(config.GlobalConfig.Services.LLM.Provider),
		ApiKey:       strings.TrimSpace(config.GlobalConfig.Services.LLM.APIKey),
		BaseURL:      strings.TrimSpace(config.GlobalConfig.Services.LLM.BaseURL),
		SystemPrompt: systemPrompt,
		Logger:       log,
	}

	llmCtx, cancel := context.WithTimeout(ctx, 180*time.Second)
	defer cancel()

	handler, err := llm.NewProviderHandler(llmCtx, llmOpts.Provider, llmOpts)
	if err != nil {
		return nil, "", fmt.Errorf("LLM 初始化失败: %w", err)
	}
	handler.ResetMemory()

	qopts := &llm.QueryOptions{
		Model:            strings.TrimSpace(config.GlobalConfig.Services.LLM.Model),
		MaxTokens:       2400,
		EnableJSONOutput: true,
		OutputFormat:     "json_object",
	}
	if qopts.Model == "" {
		qopts.Model = "gpt-4o-mini"
	}

	qresp, err := handler.QueryWithOptions(userPrompt, qopts)
	if err != nil {
		return nil, "", fmt.Errorf("LLM 请求失败: %w", err)
	}
	if qresp == nil || len(qresp.Choices) == 0 {
		return nil, "", fmt.Errorf("LLM 返回为空")
	}
	raw := strings.TrimSpace(qresp.Choices[0].Content)

	result, err := parseStyleAnalysis(raw)
	if err != nil {
		return nil, raw, fmt.Errorf("解析 LLM 输出失败: %w", err)
	}
	return result, raw, nil
}

func buildStyleLearnSystemPrompt() string {
	return strings.TrimSpace(`你是专业的文学风格分析师。你的任务是从给定的文本样本中深度分析写作风格，输出结构化 JSON。

你必须只输出一个 JSON 对象，不能输出任何额外解释、Markdown、代码块标记。

JSON 字段说明：
- narrativeVoice: 叙事视角，如 "第一人称" "第三人称限知" "全知视角" "第二人称"
- proseRhythm: 行文节奏，如 "短句紧凑" "舒缓悠长" "错落有致" "长短交替"
- vocabularyLevel: 词汇风格，如 "口语化" "书面典雅" "文学性强" "半文半白" "网络流行语"
- rhetoricTendency: 修辞倾向，如 "比喻密集" "白描为主" "排比铺陈" "意象化" "反讽幽默"
- dialogueStyle: 对话风格，如 "简洁利落" "含蓄暗示" "方言口语" "文雅" "长篇独白"
- emotionalPalette: 情感基调，如 "冷峻" "温情" "热血" "苍凉" "幽默" "压抑" "治愈"
- structuralHabits: 结构习惯，如 "场景切入" "内心独白" "倒叙" "插叙" "蒙太奇" "意识流"
- imageryDomains: 意象领域数组，如 ["自然","战争","都市","江湖","科技","宗教"]
- signatureTraits: 标志性写法特征数组（2-5条），如 ["大量使用短句断行","善用通感","对话无提示语"]
- stylePrompt: 一段可直接注入生成 prompt 的风格指令（50-150字），要求具体、可操作、不是空话
- summary: 一段话总结该作者/作品的写作风格（80-200字）

规则：
1) 每个字段都必须基于样本实际内容推断，不可泛泛而谈。
2) stylePrompt 必须是具体的写作指令，例如"使用3-8字短句为主，对话占40%以上，避免心理描写，多用动作推进"，而非"保持风格一致"。
3) signatureTraits 要写出真正区分于其他作者的独特之处。
4) 输出必须是可被标准 JSON.parse 直接解析的合法 JSON。`)
}

func parseStyleAnalysis(raw string) (*styleAnalysisResult, error) {
	candidate := raw
	if !json.Valid([]byte(candidate)) {
		start := strings.Index(candidate, "{")
		end := strings.LastIndex(candidate, "}")
		if start < 0 || end < 0 || start >= end {
			return nil, fmt.Errorf("cannot locate JSON object")
		}
		candidate = candidate[start : end+1]
	}
	// LLM 可能把 string 字段返回成 array，或把 array 字段返回成 string，
	// 所以先用 map[string]any 解析再手动归一化。
	var m map[string]any
	if err := json.Unmarshal([]byte(candidate), &m); err != nil {
		return nil, fmt.Errorf("invalid json: %w", err)
	}
	result := &styleAnalysisResult{
		NarrativeVoice:   flexString(m["narrativeVoice"]),
		ProseRhythm:      flexString(m["proseRhythm"]),
		VocabularyLevel:  flexString(m["vocabularyLevel"]),
		RhetoricTendency: flexString(m["rhetoricTendency"]),
		DialogueStyle:    flexString(m["dialogueStyle"]),
		EmotionalPalette: flexString(m["emotionalPalette"]),
		StructuralHabits: flexString(m["structuralHabits"]),
		ImageryDomains:   flexStringSlice(m["imageryDomains"]),
		SignatureTraits:  flexStringSlice(m["signatureTraits"]),
		StylePrompt:      flexString(m["stylePrompt"]),
		Summary:          flexString(m["summary"]),
	}
	return result, nil
}

// flexString 从 any 中提取字符串：如果 LLM 返回了数组则用逗号拼接。
func flexString(v any) string {
	if v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return x
	case []any:
		parts := make([]string, 0, len(x))
		for _, item := range x {
			if s, ok := item.(string); ok {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, "、")
	default:
		return fmt.Sprint(v)
	}
}

// flexStringSlice 从 any 中提取 []string：如果 LLM 返回了字符串则按顿号/逗号拆分。
func flexStringSlice(v any) []string {
	if v == nil {
		return nil
	}
	switch x := v.(type) {
	case []any:
		out := make([]string, 0, len(x))
		for _, item := range x {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	case string:
		parts := strings.Split(x, "、")
		if len(parts) <= 1 {
			parts = strings.Split(x, ",")
		}
		out := make([]string, 0, len(parts))
		for _, p := range parts {
			if t := strings.TrimSpace(p); t != "" {
				out = append(out, t)
			}
		}
		return out
	default:
		return nil
	}
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

func countParagraphs(s string) int {
	n := 1
	for i := 0; i < len(s)-1; i++ {
		if s[i] == '\n' && s[i+1] == '\n' {
			n++
		}
	}
	if strings.TrimSpace(s) == "" {
		return 0
	}
	return n
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
