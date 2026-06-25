package agents

import (
	"context"
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/protocol"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/references"
)

// StyleVoiceCuratorAgent compresses reference novels into a reusable style corpus (InkOS style import + LLM guide).
type StyleVoiceCuratorAgent struct {
	ctx agent.Context
	lib *references.Library
}

func NewStyleVoiceCuratorAgent(ctx agent.Context, projectRoot string) *StyleVoiceCuratorAgent {
	return &StyleVoiceCuratorAgent{ctx: ctx, lib: references.NewLibrary(projectRoot)}
}

// SyncReferences analyzes reference folder and updates style_corpus.md.
// When force is true, re-analyzes all source files even if hashes unchanged.
func (a *StyleVoiceCuratorAgent) SyncReferences(ctx context.Context, lang models.Language, force bool) (string, error) {
	if err := a.lib.EnsureLayout(); err != nil {
		return "", err
	}
	var pending []string
	var err error
	if force {
		pending, err = a.lib.ListSourceFiles()
	} else {
		pending, err = a.lib.NeedsSync()
	}
	if err != nil {
		return "", err
	}
	if len(pending) == 0 && !force {
		corpus, _ := a.lib.LoadCorpus()
		if corpus != "" {
			return corpus, nil
		}
		pending, _ = a.lib.ListSourceFiles()
	}
	if len(pending) == 0 {
		return "", fmt.Errorf("no reference files in references/ (.txt or .md)")
	}

	idx, _ := a.lib.LoadIndex()
	if force {
		idx = references.Index{Files: map[string]references.FileMeta{}}
	}
	var sections []string

	for _, name := range pending {
		text, err := a.lib.ReadSource(name)
		if err != nil {
			continue
		}
		excerpt := truncateRunes(text, 12000)
		section, err := a.analyzeOne(ctx, lang, name, excerpt)
		if err != nil {
			return "", err
		}
		sections = append(sections, section)
		_ = a.lib.UpdateFileMeta(&idx, name, truncateRunes(text, 200))
	}

	merged, err := a.mergeCorpus(ctx, lang, sections)
	if err != nil {
		merged = strings.Join(sections, "\n\n---\n\n")
	}
	if err := a.lib.SaveCorpus(merged); err != nil {
		return "", err
	}
	if err := a.lib.SaveIndex(idx); err != nil {
		return "", err
	}
	return merged, nil
}

func (a *StyleVoiceCuratorAgent) analyzeOne(ctx context.Context, lang models.Language, sourceName, excerpt string) (string, error) {
	sys := styleVoiceSystemPrompt(lang)
	user := fmt.Sprintf("Source: %s\n\nExcerpt:\n%s", sourceName, excerpt)
	resp, err := a.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(sys),
		protocol.UserMessage(user),
	}, 0.35)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("## 参考：《%s》\n\n%s", sourceName, strings.TrimSpace(resp.FirstContent())), nil
}

func (a *StyleVoiceCuratorAgent) mergeCorpus(ctx context.Context, lang models.Language, sections []string) (string, error) {
	if len(sections) <= 1 {
		if len(sections) == 1 {
			return sections[0], nil
		}
		return "", nil
	}
	combined := strings.Join(sections, "\n\n")
	user := "Merge the following per-book style analyses into ONE compact style guide (≤2500 Chinese chars). Keep actionable rules, not plot summary.\n\n" + combined
	if lang == models.LanguageEN {
		user = "Merge into ONE compact style guide (≤1500 words). Keep actionable rules.\n\n" + combined
	}
	resp, err := a.ctx.Chat(ctx, []protocol.Message{
		protocol.SystemMessage(styleVoiceMergePrompt(lang)),
		protocol.UserMessage(user),
	}, 0.25)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(resp.FirstContent()), nil
}

func styleVoiceSystemPrompt(lang models.Language) string {
	if lang == models.LanguageEN {
		return `You are a Style Voice Curator. Extract WRITING TECHNIQUE from reference prose — NOT plot.
Output markdown sections:
### Sentence Rhythm
### Dialogue Voice
### Scene Construction
### Rhetoric & Imagery
### What to Imitate
### What NOT to Copy (plot-specific)
Do NOT summarize story events. Focus on how the author writes.`
	}
	return `你是「文笔仿写策展人」。从参考文本提取**可执行的仿写手册**，不是文学评论，不是剧情梗概。

必须输出以下 Markdown 分节（不可省略）：

### 原文摘录（verbatim）
从 excerpt 中**原样复制** 6–10 个短句/短段（每段 ≤35 字），展示作者真实句长与换行习惯。禁止改写。

### 节奏参数（量化）
- 典型段落字数范围（估算）
- 单句成段占比（高/中/低）
- 对话与叙述比例（估算）

### 句式模板（填空）
给出 4–6 条可直接套用的句式，用 [ ] 表占位，例如：「[动词]。」「[名词]。[更短的动作]。」

### 对话与场景
各 2–3 条**具体规则**（禁止「功能性强」这类空话；要写「对话≤15字」「动作后立刻接结果」等）

### 仿写检查清单
5 条写完可自检的 yes/no（如「单句成段是否≤30%」「是否2–4句一段而非一词一行」）

### 场景适配
说明参考文风适用场景（如战斗高潮）；**非战斗/测试/对话场景**应「中等短句+2–4句一段」，勿把每个短语单独成段。

### 禁止照搬
仅列原书专有人名、地名、招式名

禁止：泛泛形容词、学术论文腔、Markdown 公式符号（$\\rightarrow$）。`
}

func styleVoiceMergePrompt(lang models.Language) string {
	if lang == models.LanguageEN {
		return "Merge style analyses into one writer-facing guide. Dedupe. Output markdown only."
	}
	return "合并为一份**写手仿写手册**（≤2200字）。保留所有「原文摘录」和「句式模板」；删除重复；禁止空泛评论。只输出 Markdown。"
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

// LoadCorpusForProject returns existing style corpus if any.
func LoadCorpusForProject(projectRoot string) (string, error) {
	return references.NewLibrary(projectRoot).LoadCorpus()
}
