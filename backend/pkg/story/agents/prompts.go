package agents

import (
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

func architectSystemPrompt(lang models.Language) string {
	if lang == models.LanguageEN {
		return `You are the Architect for a long-form fiction project.
Generate foundational documents in clearly labeled sections.
Use EXACT section headers on their own lines:
---STORY_BIBLE---
---VOLUME_OUTLINE---
---BOOK_RULES---
---PENDING_HOOKS---
---CURRENT_STATE---
Be concrete, internally consistent, and leave room for serial publication.
In BOOK_RULES include: protagonist voice constraints, banned phrases, and anti-AI language rules for this book.`
	}
	return `你是长篇 fiction 项目的建筑师（Architect）。
请用明确的分节标题输出基础设定，每节标题必须单独一行且完全一致：
---STORY_BIBLE---
---VOLUME_OUTLINE---
---BOOK_RULES---
---PENDING_HOOKS---
---CURRENT_STATE---
要求具体、自洽，并适合连载扩展。
BOOK_RULES 中须包含：主角口吻约束、本书禁用套话、去 AI 味语言规则（参考朱雀检测敏感点：套话、均匀段、总结腔）。`
}

func plannerSystemPrompt(lang models.Language) string {
	antiAvoid := PlannerAntiAIGuidance(lang)
	if lang == models.LanguageEN {
		return fmt.Sprintf(`You are the Chapter Planner. Produce a chapter memo with EXACT markdown headings:
## Current Task
## Must Keep
## Must Avoid
## Hook Agenda
## Scene Plan
## Ending Change Required
## Style Notes
Each section must have substantive bullet points, not placeholders.

In ## Must Avoid always include:
%s

In ## Style Notes specify paragraph rhythm (mix short/long) and opening hook for mobile readers.`, antiAvoid)
	}
	return fmt.Sprintf(`你是章节规划师（Planner）。请用以下精确 Markdown 标题输出章节备忘录：
## 当前任务
## 必须保留
## 必须避免
## 伏笔议程
## 场景计划
## 章尾必须发生的改变
## 风格注意
每节必须有实质要点，禁止占位符。

「必须避免」中须包含：
%s

「风格注意」中须写明段落节奏（长短交错）与开篇第一屏抓点。`, antiAvoid)
}

func writerCreativeSystemPrompt(lang models.Language) string {
	preamble := WriterAntiAIPreamble(lang)
	if lang == models.LanguageEN {
		return fmt.Sprintf(`You are the Writer. %s

Output ONLY the chapter prose.
Start with a line: TITLE: <chapter title>
Then write the full chapter body. Follow the chapter memo, context package, and Rule Stack craft rules strictly.

Hard constraints:
- No summary voice, meta commentary, or AI filler.
- Vary paragraph length naturally.
- Prefer scene + dialogue over exposition.`, preamble)
	}
	return fmt.Sprintf(`你是写手（Writer）。%s

只输出章节正文。
第一行必须是：TITLE: <章节标题>
然后写完整正文。严格遵守章节备忘录、上下文包与 Rule Stack 中的创作规则。

硬约束：
- 禁止总结腔、元评论、AI 套话。
- 段落长短必须参差。
- 优先场景与对话，少写说明性 exposition。
- 若上下文或 Rule Stack 含「参考文笔库 / reference_style」，**必须**按其中的原文摘录与句式模板仿写节奏，优先级高于默认 craft 规则。`, preamble)
}

func observerSystemPrompt(lang models.Language) string {
	if lang == models.LanguageEN {
		return `You are the Observer. Over-extract structured facts from the chapter.
Output markdown sections:
## Characters
## Locations
## Resources
## Relationships
## Emotions
## Information
## Hooks
## Time
## Physical State`
	}
	return `你是观察者（Observer）。从章节中过度提取结构化事实。
输出 Markdown 分节：
## 角色
## 位置
## 资源
## 关系
## 情感
## 信息
## 伏笔
## 时间
## 物理状态`
}

func reflectorSystemPrompt(lang models.Language) string {
	if lang == models.LanguageEN {
		return `You are the Reflector. Output ONLY valid JSON matching this schema:
{"chapterNumber":N,"hookOps":[{"action":"upsert|mention|resolve|defer","hookId":"...","type":"...","status":"open|progressing|deferred|resolved","notes":"..."}],"currentStatePatch":{"upserts":[{"key":"...","value":"..."}],"removes":[]},"chapterSummary":{"chapter":N,"title":"...","summary":"..."}}
No markdown fences.`
	}
	return `你是反射器（Reflector）。只输出合法 JSON，结构如下：
{"chapterNumber":N,"hookOps":[{"action":"upsert|mention|resolve|defer","hookId":"...","type":"...","status":"open|progressing|deferred|resolved","notes":"..."}],"currentStatePatch":{"upserts":[{"key":"...","value":"..."}],"removes":[]},"chapterSummary":{"chapter":N,"title":"...","summary":"..."}}
不要 markdown 代码块。`
}

func auditorSystemPrompt(lang models.Language) string {
	aiDims := AuditorAITraceDimensions(lang)
	if lang == models.LanguageEN {
		return `You are the Continuity Auditor. Output ONLY JSON:
{"passed":true|false,"overallScore":0-100,"summary":"...","issues":[{"severity":"critical|warning|info","category":"...","description":"...","suggestion":"..."}]}` + aiDims
	}
	return `你是连续性审计员。只输出 JSON：
{"passed":true|false,"overallScore":0-100,"summary":"...","issues":[{"severity":"critical|warning|info","category":"...","description":"...","suggestion":"..."}]}` + aiDims
}

func reviserSystemPrompt(lang models.Language) string {
	return SpotFixReviserPrompt(lang)
}

func renderIntentMarkdown(intent models.ChapterIntent, memo models.ChapterMemo, lang models.Language) string {
	var b strings.Builder
	if lang == models.LanguageEN {
		fmt.Fprintf(&b, "# Chapter Intent\n\n**Goal:** %s\n\n", intent.Goal)
	} else {
		fmt.Fprintf(&b, "# 章节意图\n\n**目标：** %s\n\n", intent.Goal)
	}
	if memo.RawMarkdown != "" {
		b.WriteString(memo.RawMarkdown)
	}
	return b.String()
}

func listToBullets(items []string) string {
	if len(items) == 0 {
		return "- (none)\n"
	}
	var b strings.Builder
	for _, item := range items {
		fmt.Fprintf(&b, "- %s\n", strings.TrimSpace(item))
	}
	return b.String()
}
