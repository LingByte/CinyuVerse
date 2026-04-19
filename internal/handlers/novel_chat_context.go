package handlers

import (
	"strconv"
	"strings"

	"github.com/LingByte/CinyuVerse/internal/models"
	"gorm.io/gorm"
)

// 为灵感对话注入小说设定：较早章节仅摘要；最近若干章附正文节选（头+尾），避免只凭摘要臆测。
const (
	novelChatRecentChapters    = 8
	novelChatOlderSummaryRunes = 100
	novelChatHeadRunes         = 500
	novelChatTailRunes         = 1500
	novelChatBlockMaxRunes     = 16000
)

func truncateRunesStr(s string, max int) string {
	if max <= 0 {
		return ""
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max]) + "…"
}

// buildNovelContextBlockForChat 生成注入 system prompt 的小说上下文块。
func buildNovelContextBlockForChat(db *gorm.DB, novelID uint) string {
	if db == nil || novelID == 0 {
		return ""
	}
	novel, err := models.GetNovelByID(db, novelID)
	if err != nil || novel == nil {
		return ""
	}
	chapters, err := models.ListChaptersByNovelOrdered(db, novelID)
	if err != nil {
		return ""
	}
	var b strings.Builder
	b.WriteString("【本书上下文｜供讨论后续发展，请严格依据下列已写内容推理，勿编造未出现的剧情】\n")
	b.WriteString("书名：")
	b.WriteString(novel.Title)
	b.WriteString("\n")
	if strings.TrimSpace(novel.Theme) != "" {
		b.WriteString("主题：")
		b.WriteString(novel.Theme)
		b.WriteString("\n")
	}
	if strings.TrimSpace(novel.Description) != "" {
		b.WriteString("简介：")
		b.WriteString(truncateRunesStr(novel.Description, 600))
		b.WriteString("\n")
	}
	if len(chapters) == 0 {
		b.WriteString("\n（尚无章节正文）\n")
		return trimNovelContextBlock(b.String())
	}

	n := len(chapters)
	recentStart := 0
	if n > novelChatRecentChapters {
		recentStart = n - novelChatRecentChapters
	}
	older := chapters[:recentStart]
	recent := chapters[recentStart:]

	if len(older) > 0 {
		b.WriteString("\n【前序章节脉络】（仅摘要）\n")
		for _, ch := range older {
			b.WriteString("- ")
			b.WriteString(ch.Title)
			b.WriteString("｜第")
			b.WriteString(strconv.Itoa(ch.OrderNo))
			b.WriteString("章｜")
			sum := strings.TrimSpace(ch.Summary)
			if sum == "" {
				sum = "（无摘要）"
			} else {
				sum = truncateRunesStr(sum, novelChatOlderSummaryRunes)
			}
			b.WriteString(sum)
			b.WriteString("\n")
		}
	}

	b.WriteString("\n【最近章节｜摘要 + 正文节选】\n")
	for _, ch := range recent {
		b.WriteString("\n--- 《")
		b.WriteString(ch.Title)
		b.WriteString("》 第")
		b.WriteString(strconv.Itoa(ch.OrderNo))
		b.WriteString("章 ---\n")
		if strings.TrimSpace(ch.Summary) != "" {
			b.WriteString("摘要：")
			b.WriteString(strings.TrimSpace(ch.Summary))
			b.WriteString("\n")
		}
		body := strings.TrimSpace(ch.Content)
		if body == "" {
			b.WriteString("正文：（空）\n")
			continue
		}
		rn := []rune(body)
		if len(rn) <= novelChatHeadRunes+novelChatTailRunes+50 {
			b.WriteString("正文：")
			b.WriteString(body)
			b.WriteString("\n")
			continue
		}
		headLen := novelChatHeadRunes
		if len(rn) < headLen {
			headLen = len(rn)
		}
		b.WriteString("正文开头：")
		b.WriteString(string(rn[:headLen]))
		b.WriteString("\n……\n正文结尾：")
		tailStart := len(rn) - novelChatTailRunes
		if tailStart < 0 {
			tailStart = 0
		}
		b.WriteString(string(rn[tailStart:]))
		b.WriteString("\n")
	}

	return trimNovelContextBlock(b.String())
}

func trimNovelContextBlock(s string) string {
	r := []rune(s)
	if len(r) <= novelChatBlockMaxRunes {
		return s
	}
	return string(r[:novelChatBlockMaxRunes]) + "…\n（上下文过长已截断）"
}
