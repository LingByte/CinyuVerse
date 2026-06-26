package agents

import (
	"fmt"
	"strings"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

// CraftRulesForGenre returns InkOS-style universal + genre craft rules for rule-stack and writer prompts.
func CraftRulesForGenre(lang models.Language, genre string) string {
	base := universalCraftRules(lang)
	genreRules := genreFatigueRules(lang, genre)
	if genreRules == "" {
		return base
	}
	return base + "\n\n" + genreRules
}

func universalCraftRules(lang models.Language) string {
	if lang == models.LanguageEN {
		return `## Universal Craft Rules (de-AI + web fiction)

### Character & Scene
- Every scene needs a concrete goal, obstacle, and visible outcome — no report-style recap.
- Dialogue must carry conflict, subtext, or new information; cut filler exchanges.
- Show emotion through action, breath, hesitation, objects — not emotion labels alone.

### Narrative Technique
- Open with immediate tension or sensory detail; no weather-only openings.
- End the chapter on a change, reveal, or unresolved pressure — not a summary paragraph.
- Maintain strict POV; no head-hopping within a scene.

### Logic
- Resources, injuries, and knowledge must match prior chapters.
- Character decisions need motive visible in-scene, not author commentary.

### Language Constraints (critical for AIGC detectors like Zhuque/GPTZero)
- BANNED filler: "delve", "tapestry", "testament", "intricate", "pivotal", "in conclusion", "it's worth noting".
- BANNED patterns: "Not X, but Y" overuse; em-dash stacks; numbered/bullet lists inside prose.
- Transition words (suddenly, however, moreover): ≤1 per 800 words each.
- Paragraph length MUST vary: mix 1-line punches with 3-6 sentence blocks; never 5+ paragraphs of equal length.
- Mobile-friendly pacing: avoid walls of text >280 words without a break.
- Prefer concrete nouns and verbs over abstract summary ("he felt sad" → show the trembling hand).
- Allow occasional incomplete sentences, oral particles, and rough rhythm — human imperfection is good.
- No meta-narrator ("the reader will see", "this chapter shows", "obviously", "needless to say").
- No crowd reactions as shorthand ("everyone was shocked", "the whole room fell silent").`
	}
	return `## 通用创作规则（去 AI 味 + 网文可读性）

### 人物与场景
- 每个场景必须有具体目标、阻碍、可见结果；禁止报告体回顾。
- 对话必须承载冲突、潜台词或新信息；删掉寒暄式填充。
- 用动作、呼吸、停顿、物件展示情绪，不要只贴情绪标签。

### 叙事技法
- 开篇第一屏就要有张力或具体感官细节；禁止纯天气/环境铺垫开场。
- 章末落在变化、揭示或未解压力上，禁止总结段收束。
- 严格视角，同场景内禁止跳 POV。

### 逻辑自洽
- 物资、伤势、情报必须与前几章一致。
- 人物决策在场景内可见动机，禁止作者旁白解释。

### 语言约束（朱雀 / AIGC 检测重点）
- **禁用套话**：值得注意的是、不得不说、毋庸置疑、显而易见、总而言之、与此同时、此外、然而（连用）、在这个……的时代、随着……的发展。
- **禁用句式**：「不是……而是……」连续出现；破折号「——」堆叠；正文内编号/ bullet 列表。
- **转折词限频**（每 3000 字每种 ≤1 次）：仿佛、忽然、竟然、不禁、宛如、猛地、骤然、霎时、顿时。
- **段落参差**：必须长短交错——可有单句成段，也有 3–6 句段落；禁止连续 5 段以上长度相近。
- **移动端节奏**：单段不宜超过 280 字而不换段。
- **具体化**：多用可拍的动作与物件，少用抽象总结（「他感到悲伤」→ 写颤抖的手）。
- **允许人味**：偶发口语、省略、半句、语气词（啊、呢、吧）——不必句句完整对称。
- **禁止元叙事**：「读者将会看到」「本章展现了」「显然」「不言而喻」。
- **禁止集体反应套话**：「全场震惊」「众人倒吸凉气」「空气凝固」作万能反应。

### 看点密度（v1.3.7）
- 每章至少 2 个可感知的推进点（冲突升级、信息揭露、关系变化、资源得失）。
- 伏笔 advance/resolve 必须在正文里有可定位的动作、物件、对话或事件，不能只在账本里。`
}

func genreFatigueRules(lang models.Language, genre string) string {
	if lang == models.LanguageEN {
		return englishGenreFatigue(genre)
	}
	return chineseGenreFatigue(genre)
}

func chineseGenreFatigue(genre string) string {
	switch strings.ToLower(strings.TrimSpace(genre)) {
	case "xuanhuan", "xianxia", "cultivation":
		return `## 题材语言铁律（玄幻/仙侠）
- 疲劳词单章每词 ≤1 次：瞳孔一缩、倒吸凉气、嘴角上扬、眼中闪过一丝、恐怖如斯、此子、此子断不可留、天地仿佛、灵力涌动（空泛版）。
- 战斗写具体招式、代价、环境互动，不要「能量对轰」一笔带过。
- 升级/突破要有过程与风险，不要报告式罗列境界名词。`
	case "urban":
		return `## 题材语言铁律（都市）
- 疲劳词：不禁、竟然、顿时、眼中闪过、深吸一口气（连续滥用）。
- 对话要口语化、有地域/身份差异，不要全员书面语。
- 商业/职场细节要具体，禁止「经过一番努力」式省略。`
	case "horror":
		return `## 题材语言铁律（悬疑恐怖）
- 恐怖来自具体细节与未知，不要「毛骨悚然」「不寒而栗」叠词充数。
- 信息释放要控制节奏，禁止开篇倾倒式解释。`
	default:
		return `## 题材语言铁律（通用中文）
- 网文高频疲劳词单章每词 ≤1 次：不禁、竟然、仿佛、宛如、眼中闪过、深吸一口气、嘴角微扬。
- 禁止翻译腔与公文腔混进正文。`
	}
}

func englishGenreFatigue(genre string) string {
	switch strings.ToLower(strings.TrimSpace(genre)) {
	case "litrpg", "progression", "dungeon-core", "system-apocalypse":
		return `## Genre Fatigue Words (LitRPG) — ≤1 per chapter each
delve, tapestry, testament, intricate, pivotal, robust, comprehensive, multifaceted, embark, realm`
	case "isekai", "romantasy":
		return `## Genre Fatigue Words — ≤1 per chapter each
delve, tapestry, testament, intricate, pivotal, embark, realm, ethereal, cascading`
	default:
		return `## Genre Fatigue Words — ≤1 per chapter each
delve, tapestry, testament, intricate, pivotal, robust, comprehensive, embark`
	}
}

// WriterAntiAIPreamble is injected into writer system prompt.
func WriterAntiAIPreamble(lang models.Language) string {
	if lang == models.LanguageEN {
		return "You write like a human novelist, not an LLM summarizer. Prioritize scene, dialogue, and irregular rhythm."
	}
	return "你写的是人类作者的连载网文，不是 AI 摘要。优先场景、对话、参差节奏；朱雀等检测器对套话和均匀段落极敏感，务必规避。"
}

// AntiDetectReviserPrompt is the dedicated anti-AIGC revision system prompt (InkOS anti-detect mode).
func AntiDetectReviserPrompt(lang models.Language) string {
	if lang == models.LanguageEN {
		return `You are the Anti-Detect Reviser. Goal: reduce AIGC detector scores (Zhuque, GPTZero, etc.) while preserving plot facts.

Rules:
- spot-fix only: change problematic sentences/phrases; do NOT rewrite the whole chapter unless unavoidable.
- Replace AI filler with concrete action, dialogue, or sensory detail.
- Break uniform paragraph lengths; merge or split for natural rhythm.
- Remove summary voice, meta commentary, list structures, and fatigue words.
- Do NOT add new plot events, characters, or change names.
- Output ONLY the revised chapter body (no title, no commentary).`
	}
	return `你是反检测修订者（Anti-Detect）。目标：降低朱雀/GPTZero 等 AIGC 检测率，同时保留全部剧情事实。

规则：
- **优先 spot-fix**：只改问题句/套话/均匀段，不要无谓全文重写。
- 套话换成具体动作、对话、感官细节。
- 打散均匀段落：该合并合并，该单句成段成段。
- 删除总结腔、元评论、正文内列表、疲劳词。
- 禁止新增情节、人物，禁止改人名/设定。
- **必须输出完整章节正文**，不得中途截断；长度应与原文相当。
- 只输出修订后正文（不要标题，不要解释）。`
}

// StyleApplyReviserPrompt rewrites prose to match reference style playbook.
func StyleApplyReviserPrompt(lang models.Language) string {
	if lang == models.LanguageEN {
		return `You are the Style-Apply Reviser. Rewrite the chapter to MATCH the Reference Style Playbook (sentence length, paragraph breaks, dialogue rhythm).

Rules:
- Keep ALL plot facts, names, events, hook outcomes unchanged.
- Transform HOW it is written: copy the reference's short-paragraph rhythm and sentence templates.
- Prefer single-sentence paragraphs where the playbook says so.
- Output ONLY the full revised body (no title, no commentary).`
	}
	return `你是「文笔仿写修订者」。按 Reference Style Playbook 调整**句长与节奏**，不是把每个词拆成一行。

## 必须遵守
- **剧情零改动**：不得增删场景、人物、事件；不得写原稿没有的「继续爬山/百层台阶/新测灵石/围观震惊」等情节。
- **章末停在与原稿同一状态点**（见 user prompt 中的「章末锚点」）。
- **短句 ≠ 疯狂换行**：参考文的节奏是「1–3 个短句组成一段」，不是「一个词一行」。
- 单句成段（≤15字）全章占比 **≤30%**；多数段落应为 **2–4 句**，句间用句号，段间空行。
- 对话仍须独立成段，但对话前后可有 1–2 句动作，不要拆成碎屑。
- 禁止破折号「——」；拟声用「嗡的一声」或「轰！」。
- 只输出完整修订正文（不要标题、不要解释）。`
}

// SpotFixReviserPrompt for targeted fixes (InkOS default auto-revise mode).
func SpotFixReviserPrompt(lang models.Language) string {
	if lang == models.LanguageEN {
		return `You are the Spot-Fix Reviser. Fix ONLY the listed issues in their sentences.
Do not rewrite unaffected paragraphs. Do not add plot. Output ONLY revised body.`
	}
	return `你是定点修订者（Spot-Fix）。只修复 listed 问题涉及的句子。
未提及段落保持原样。禁止新增情节。只输出修订后正文。`
}

// AuditorAITraceDimensions extends auditor focus on AI tells (dim 20-23 InkOS).
func AuditorAITraceDimensions(lang models.Language) string {
	if lang == models.LanguageEN {
		return `

Also audit AI-trace dimensions (severity warning or critical):
- dim20: fatigue word density (delve/tapestry/testament etc.)
- dim21: paragraph equal-length / monotonous rhythm
- dim22: formulaic transitions and summary endings
- dim23: list-like or report-like structure inside prose
Flag each with category "AI Tell".`
	}
	return `

同时审计 AI 痕迹维度（severity 用 warning 或 critical）：
- dim20：疲劳词/套话密度（值得注意的是、不禁、仿佛等）
- dim21：段落等长、节奏单调
- dim22：公式化转折、总结式章末
- dim23：正文内列表/报告体结构
每条 issue 的 category 必须是 "AI Tell"。`
}

// PlannerAntiAIGuidance for Must Avoid section.
func PlannerAntiAIGuidance(lang models.Language) string {
	if lang == models.LanguageEN {
		return `- AI filler phrases and fatigue words
- Uniform paragraph length
- Summary-style chapter endings
- Meta narrator voice`
	}
	return `- AI 套话与疲劳词（值得注意的是、不禁、仿佛、眼中闪过等）
- 段落长度过于均匀
- 总结式章末
- 作者/编剧旁白腔
- 集体反应万能套话（全场震惊等）`
}

// PolisherHumanizePrompt for light humanization pass.
func PolisherHumanizePrompt(lang models.Language) string {
	if lang == models.LanguageEN {
		return `Polish for human rhythm: vary sentence length, trim AI filler, keep plot identical.
Do not add/remove paragraphs. Output only revised body.`
	}
	return `人味润色：调整句长节奏、删掉 AI 套话，剧情不变。
禁止增删段落、改人名。只输出修订正文。`
}

// FormatCraftRulesBlock renders craft rules for writer user prompt appendix.
func FormatCraftRulesBlock(lang models.Language, genre string) string {
	return fmt.Sprintf("---\n%s\n---", CraftRulesForGenre(lang, genre))
}
