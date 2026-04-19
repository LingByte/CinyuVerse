// novelanalyze：用本地 Ollama（OpenAI 兼容 /v1）对 novel_out 等目录做分章摘要与全书汇总。
//
// 用法（在项目根目录，已配置 .env 中的 LLM_*）：
//
//	go run ./cmd/novelanalyze -dir novel_out -out analysis/chapters.jsonl
//	go run ./cmd/novelanalyze -dir novel_out -out analysis/chapters.jsonl -start-id 22902000
//	go run ./cmd/novelanalyze -mode rollup -in analysis/chapters.jsonl -out analysis/book.md
//
// 600 万字需分章多次调用，可中断续跑（已写入 jsonl 的章节会自动跳过）。
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/LingByte/CinyuVerse/pkg/config"
	"github.com/LingByte/CinyuVerse/pkg/novelanalyze"
)

type chapterRecord struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Summary string `json:"summary"`
	Chars   int    `json:"chars"`
}

// 小型多语言模型在提示不明确时常默认英文，必须反复强调「仅简体中文」。
const summarizeSystemZH = `你是中文阅读助手。你必须且只能使用简体中文输出全文，禁止使用英文单词或英文句子，禁止使用 "Okay" "Here's" "Summary" 等英文起句或标题。
任务：根据用户给出的章节正文，用 4～8 句简体中文概括主要情节、人物关系变化与关键转折。
要求：不评价文笔；不编造正文没有的内容；人名保持与原文一致。只输出概括正文，不要小标题、不要前缀、不要翻译腔。`

const summarizeUserSuffix = `

（重要：请全程使用简体中文作答，不要输出任何英文。）`

func formatIDRange(startID, endID int) string {
	lo, hi := "不限下限", "不限上限"
	if startID >= 0 {
		lo = strconv.Itoa(startID)
	}
	if endID >= 0 {
		hi = strconv.Itoa(endID)
	}
	return lo + " ~ " + hi
}

func main() {
	mode := flag.String("mode", "summarize", "summarize（分章摘要） | rollup（由 jsonl 逐级合并成全书梗概）")
	dir := flag.String("dir", "novel_out", "summarize：章节 txt 目录")
	outPath := flag.String("out", "analysis/chapters.jsonl", "summarize：输出 jsonl；rollup：rollup 时可为 book.md")
	inPath := flag.String("in", "", "rollup：输入 chapters.jsonl（默认与 -out 在 summarize 时相同，rollup 请显式指定）")
	maxChars := flag.Int("max-chars", 12000, "每章送入模型的最大字数（按 rune 截断，防超上下文）")
	limit := flag.Int("limit", 0, "仅处理前 N 章，0 表示全部")
	startID := flag.Int("start-id", -1, "只处理文件名 id >= 该值（与 novel_out/22901358.txt 中的数字一致），-1 表示不限制")
	endID := flag.Int("end-id", -1, "只处理文件名 id <= 该值，-1 表示不限制")
	delay := flag.Duration("delay", 400*time.Millisecond, "章节之间间隔，减轻 Ollama 压力")
	temp := flag.Float64("temp", 0.3, "temperature")
	batchSize := flag.Int("rollup-batch", 18, "rollup 每批合并多少条摘要")
	flag.Parse()

	if err := config.Load(); err != nil {
		log.Fatalf("config: %v", err)
	}
	llm := config.GlobalConfig.Services.LLM
	base := strings.TrimSpace(llm.BaseURL)
	if base == "" {
		log.Fatal("LLM_BASE_URL 为空")
	}
	model := strings.TrimSpace(llm.Model)
	if model == "" {
		log.Fatal("LLM_MODEL 为空")
	}
	client := &novelanalyze.Client{
		BaseURL: base,
		APIKey:  strings.TrimSpace(llm.APIKey),
	}

	ctx := context.Background()

	switch *mode {
	case "summarize":
		if err := runSummarize(ctx, client, model, *temp, *dir, *outPath, *maxChars, *limit, *startID, *endID, *delay); err != nil {
			log.Fatal(err)
		}
	case "rollup":
		in := *inPath
		if in == "" {
			in = *outPath
		}
		if err := runRollup(ctx, client, model, *temp, in, *outPath, *batchSize, *delay); err != nil {
			log.Fatal(err)
		}
	default:
		log.Fatalf("unknown -mode %q", *mode)
	}
}

func runSummarize(ctx context.Context, client *novelanalyze.Client, model string, temp float64, dir, outPath string, maxChars, limit, startID, endID int, delay time.Duration) error {
	ids, err := novelanalyze.ListChapterTxt(dir)
	if err != nil {
		return err
	}
	if len(ids) == 0 {
		return fmt.Errorf("目录 %q 下没有数字编号的 *.txt", dir)
	}
	done := loadDoneIDs(outPath)
	var todo []string
	for _, id := range ids {
		n, err := strconv.Atoi(id)
		if err != nil {
			continue
		}
		if startID >= 0 && n < startID {
			continue
		}
		if endID >= 0 && n > endID {
			continue
		}
		if done[id] {
			continue
		}
		todo = append(todo, id)
	}
	if limit > 0 && len(todo) > limit {
		todo = todo[:limit]
	}
	log.Printf("章节总数 %d，id 范围 %s，已跳过已完成 %d，待处理 %d → %s",
		len(ids), formatIDRange(startID, endID), len(done), len(todo), outPath)

	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil && filepath.Dir(outPath) != "." {
		return err
	}
	f, err := os.OpenFile(outPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	enc := json.NewEncoder(f)

	for i, id := range todo {
		path := filepath.Join(dir, id+".txt")
		raw, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read %s: %w", path, err)
		}
		title, body := novelanalyze.SplitTitleBody(string(raw))
		text := body
		if text == "" {
			text = title
		}
		chars := novelanalyze.RuneLen(text)
		excerpt := novelanalyze.TruncateUTF8(text, maxChars)

		userContent := "【章节标题】" + title + "\n\n【正文】\n" + excerpt + summarizeUserSuffix

		content, err := client.ChatCompletion(ctx, model, []novelanalyze.ChatMessage{
			{Role: "system", Content: summarizeSystemZH},
			{Role: "user", Content: userContent},
		}, temp)
		if err != nil {
			return fmt.Errorf("chapter %s: %w", id, err)
		}

		rec := chapterRecord{ID: id, Title: title, Summary: content, Chars: chars}
		if err := enc.Encode(rec); err != nil {
			return err
		}
		if err := f.Sync(); err != nil {
			return err
		}
		log.Printf("[%d/%d] %s %s", i+1, len(todo), id, title)
		if i < len(todo)-1 {
			time.Sleep(delay)
		}
	}
	log.Printf("完成。可执行 rollup：go run ./cmd/novelanalyze -mode rollup -in %s -out analysis/book.md", outPath)
	return nil
}

func loadDoneIDs(jsonlPath string) map[string]bool {
	out := map[string]bool{}
	f, err := os.Open(jsonlPath)
	if err != nil {
		return out
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var rec chapterRecord
		if json.Unmarshal([]byte(line), &rec) == nil && rec.ID != "" {
			out[rec.ID] = true
		}
	}
	return out
}

func runRollup(ctx context.Context, client *novelanalyze.Client, model string, temp float64, inPath, outPath string, batch int, delay time.Duration) error {
	recs, err := readAllRecords(inPath)
	if err != nil {
		return err
	}
	if len(recs) == 0 {
		return fmt.Errorf("jsonl 无记录: %s", inPath)
	}
	summaries := make([]string, len(recs))
	for i := range recs {
		summaries[i] = fmt.Sprintf("[%s %s] %s", recs[i].ID, recs[i].Title, recs[i].Summary)
	}
	log.Printf("rollup：%d 条摘要，batch=%d", len(summaries), batch)

	final, err := hierarchicalRollup(ctx, client, model, temp, summaries, batch, delay)
	if err != nil {
		return err
	}
	themes, err := client.ChatCompletion(ctx, model, []novelanalyze.ChatMessage{
		{Role: "system", Content: `你根据「全书合并梗概」提炼：1）主线剧情脉络 2）主要人物与关系 3）主题与冲突 4）若适合可列时间/阶段划分。用简体中文 Markdown 分节输出，客观基于梗概，不要编造。严禁使用英文段落或英文小标题。`},
		{Role: "user", Content: "【全书合并梗概】\n\n" + final + "\n\n（请全程使用简体中文作答。）"},
	}, temp)
	if err != nil {
		return fmt.Errorf("themes: %w", err)
	}

	var b strings.Builder
	b.WriteString("# 全书合并梗概\n\n")
	b.WriteString(final)
	b.WriteString("\n\n---\n\n# 主题与结构分析（模型归纳）\n\n")
	b.WriteString(themes)
	b.WriteString("\n")

	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil && filepath.Dir(outPath) != "." {
		return err
	}
	if err := os.WriteFile(outPath, []byte(b.String()), 0o644); err != nil {
		return err
	}
	log.Printf("已写入 %s", outPath)
	return nil
}

func readAllRecords(path string) ([]chapterRecord, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var recs []chapterRecord
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var rec chapterRecord
		if json.Unmarshal([]byte(line), &rec) != nil {
			continue
		}
		if rec.ID != "" {
			recs = append(recs, rec)
		}
	}
	return recs, sc.Err()
}

func hierarchicalRollup(ctx context.Context, client *novelanalyze.Client, model string, temp float64, lines []string, batch int, delay time.Duration) (string, error) {
	if len(lines) == 0 {
		return "", nil
	}
	if len(lines) == 1 {
		return lines[0], nil
	}
	if batch < 2 {
		batch = 18
	}

	level := 0
	cur := lines
	for len(cur) > 1 {
		level++
		var next []string
		for i := 0; i < len(cur); i += batch {
			end := i + batch
			if end > len(cur) {
				end = len(cur)
			}
			chunk := cur[i:end]
			merged, err := mergeChunk(ctx, client, model, temp, chunk, level)
			if err != nil {
				return "", err
			}
			next = append(next, merged)
			log.Printf("rollup L%d: 合并 %d～%d → 段 %d/%d", level, i, end-1, len(next), (len(cur)+batch-1)/batch)
			time.Sleep(delay)
		}
		cur = next
	}
	return cur[0], nil
}

func mergeChunk(ctx context.Context, client *novelanalyze.Client, model string, temp float64, chunk []string, level int) (string, error) {
	sb := strings.Builder{}
	for _, s := range chunk {
		sb.WriteString(s)
		sb.WriteString("\n\n")
	}
	sys := `将下列多条「章节摘要」合并成一段连贯的梗概，保留主要人物姓名与关键冲突、转折，删除重复。控制在 800 字以内。只输出梗概正文。
必须使用简体中文，禁止使用英文。`
	if level > 1 {
		sys = `将下列多段「分批梗概」再合并为更紧凑的一段全书向梗概，保留主线与关键人物，控制在 1200 字以内。只输出正文。
必须使用简体中文，禁止使用英文。`
	}
	return client.ChatCompletion(ctx, model, []novelanalyze.ChatMessage{
		{Role: "system", Content: sys},
		{Role: "user", Content: sb.String() + "\n\n（请全程使用简体中文作答，不要输出任何英文。）"},
	}, temp)
}
