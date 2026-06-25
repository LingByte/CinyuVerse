package detection

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"strings"

	"github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common"
	"github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common/profile"
	tms "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/tms/v20201229"
)

// ZhuqueConfig holds Tencent TMS (朱雀 AI 生成识别) settings.
type ZhuqueConfig struct {
	Enabled    bool
	Region     string // e.g. ap-guangzhou
	BizType    string
	SecretID   string
	SecretKey  string
	Threshold  int  // AIGC score 0-100; >= threshold triggers revise (default 60)
	MaxChars   int  // chunk size (API limit 10000; console recommends 350-2000)
}

// ZhuqueResult is external AIGC detection output.
type ZhuqueResult struct {
	Provider    string  `json:"provider"`
	AIGCScore   int     `json:"aigcScore"`   // 0-100, higher = more likely AI
	Suggestion  string  `json:"suggestion"`  // Block | Review | Pass
	Label       string  `json:"label"`
	Summary     string  `json:"summary"`
	HighRisk    bool    `json:"highRisk"`
	ChunkCount  int     `json:"chunkCount"`
	RawScores   []int   `json:"rawScores,omitempty"`
}

// LoadZhuqueConfigFromEnv merges project config with environment credentials.
func LoadZhuqueConfigFromEnv(cfg ZhuqueConfig) ZhuqueConfig {
	if cfg.SecretID == "" {
		cfg.SecretID = os.Getenv("TENCENTCLOUD_SECRET_ID")
	}
	if cfg.SecretKey == "" {
		cfg.SecretKey = os.Getenv("TENCENTCLOUD_SECRET_KEY")
	}
	if cfg.Region == "" {
		cfg.Region = envOr("STORY_ZHUQUE_REGION", "ap-guangzhou")
	}
	if cfg.BizType == "" {
		cfg.BizType = envOr("STORY_ZHUQUE_BIZ_TYPE", "TencentCloudDefault")
	}
	if cfg.Threshold <= 0 {
		cfg.Threshold = 60
	}
	if cfg.MaxChars <= 0 {
		cfg.MaxChars = 1800
	}
	cfg.Enabled = cfg.Enabled && cfg.SecretID != "" && cfg.SecretKey != ""
	return cfg
}

// ZhuqueClient calls Tencent TMS TextModeration with Type=TEXT_AIGC.
type ZhuqueClient struct {
	cfg    ZhuqueConfig
	client *tms.Client
}

// NewZhuqueClient creates a client; returns nil if not configured.
func NewZhuqueClient(cfg ZhuqueConfig) (*ZhuqueClient, error) {
	cfg = LoadZhuqueConfigFromEnv(cfg)
	if !cfg.Enabled {
		return nil, fmt.Errorf("zhuque: not configured (set TENCENTCLOUD_SECRET_ID/KEY and detection.enabled)")
	}
	credential := common.NewCredential(cfg.SecretID, cfg.SecretKey)
	cpf := profile.NewClientProfile()
	cpf.HttpProfile.Endpoint = "tms.tencentcloudapi.com"
	client, err := tms.NewClient(credential, cfg.Region, cpf)
	if err != nil {
		return nil, err
	}
	return &ZhuqueClient{cfg: cfg, client: client}, nil
}

// Detect analyzes text; long chapters are chunked and max score returned.
func (z *ZhuqueClient) Detect(ctx context.Context, text string) (ZhuqueResult, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return ZhuqueResult{}, fmt.Errorf("zhuque: empty text")
	}
	chunks := chunkText(text, z.cfg.MaxChars)
	var scores []int
	var lastSuggestion, lastLabel string
	maxScore := 0
	for _, chunk := range chunks {
		req := tms.NewTextModerationRequest()
		req.Content = common.StringPtr(base64.StdEncoding.EncodeToString([]byte(chunk)))
		req.Type = common.StringPtr("TEXT_AIGC")
		req.BizType = common.StringPtr(z.cfg.BizType)
		req.SourceLanguage = common.StringPtr("zh")
		resp, err := z.client.TextModerationWithContext(ctx, req)
		if err != nil {
			return ZhuqueResult{}, fmt.Errorf("zhuque api: %w", err)
		}
		if resp.Response == nil {
			continue
		}
		score := 0
		if resp.Response.Score != nil {
			score = int(*resp.Response.Score)
		}
		scores = append(scores, score)
		if score > maxScore {
			maxScore = score
		}
		if resp.Response.Suggestion != nil {
			lastSuggestion = *resp.Response.Suggestion
		}
		if resp.Response.Label != nil {
			lastLabel = *resp.Response.Label
		}
	}
	high := maxScore >= z.cfg.Threshold || strings.EqualFold(lastSuggestion, "Block")
	summary := fmt.Sprintf("朱雀/TMS AIGC score=%d suggestion=%s label=%s (%d chunks)", maxScore, lastSuggestion, lastLabel, len(chunks))
	return ZhuqueResult{
		Provider: "zhuque-tms", AIGCScore: maxScore, Suggestion: lastSuggestion,
		Label: lastLabel, Summary: summary, HighRisk: high,
		ChunkCount: len(chunks), RawScores: scores,
	}, nil
}

func chunkText(text string, maxRunes int) []string {
	runes := []rune(text)
	if len(runes) <= maxRunes {
		return []string{text}
	}
	var chunks []string
	for i := 0; i < len(runes); i += maxRunes {
		end := i + maxRunes
		if end > len(runes) {
			end = len(runes)
		}
		chunks = append(chunks, string(runes[i:end]))
	}
	return chunks
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
