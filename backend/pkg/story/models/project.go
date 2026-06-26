package models

import "time"

// DaemonSchedule configures cron-like intervals (simplified to minutes in Go daemon).
type DaemonSchedule struct {
	WriteIntervalMinutes int `json:"writeIntervalMinutes"`
	RadarIntervalMinutes int `json:"radarIntervalMinutes"`
}

// DaemonQualityGates controls auto-write quality behavior.
type DaemonQualityGates struct {
	MaxAuditRetries              int     `json:"maxAuditRetries"`
	PauseAfterConsecutiveFailures int     `json:"pauseAfterConsecutiveFailures"`
	RetryTemperatureStep         float32 `json:"retryTemperatureStep"`
}

// DaemonConfig is persisted in project.json.
type DaemonConfig struct {
	Enabled                  bool               `json:"enabled"`
	Schedule                 DaemonSchedule     `json:"schedule"`
	MaxConcurrentBooks       int                `json:"maxConcurrentBooks"`
	ChaptersPerCycle         int                `json:"chaptersPerCycle"`
	RetryDelayMs             int                `json:"retryDelayMs"`
	CooldownAfterChapterMs   int                `json:"cooldownAfterChapterMs"`
	MaxChaptersPerDay        int                `json:"maxChaptersPerDay"`
	QualityGates             DaemonQualityGates `json:"qualityGates"`
	AutoBookIDs              []string           `json:"autoBookIds,omitempty"`
}

// DefaultDaemonConfig returns InkOS-equivalent defaults.
func DefaultDaemonConfig() DaemonConfig {
	return DaemonConfig{
		Enabled: false,
		Schedule: DaemonSchedule{
			WriteIntervalMinutes: 15,
			RadarIntervalMinutes: 360,
		},
		MaxConcurrentBooks:     3,
		ChaptersPerCycle:       1,
		RetryDelayMs:           30_000,
		CooldownAfterChapterMs: 10_000,
		MaxChaptersPerDay:      50,
		QualityGates: DaemonQualityGates{
			MaxAuditRetries:               2,
			PauseAfterConsecutiveFailures: 3,
			RetryTemperatureStep:          0.1,
		},
	}
}

// DaemonRuntimeState is ephemeral daemon status (not persisted).
type DaemonRuntimeState struct {
	Running              bool      `json:"running"`
	StartedAt            time.Time `json:"startedAt,omitempty"`
	LastCycleAt          time.Time `json:"lastCycleAt,omitempty"`
	ChaptersWrittenToday int       `json:"chaptersWrittenToday"`
	DayStarted           time.Time `json:"dayStarted,omitempty"`
	PausedBookIDs        []string  `json:"pausedBookIds,omitempty"`
	LastError            string    `json:"lastError,omitempty"`
}

// ProjectConfig is the root project.json (InkOS-compatible subset).
type ProjectConfig struct {
	Language              Language              `json:"language"`
	ChapterReviewMode     string                `json:"chapterReviewMode,omitempty"`
	InputGovernanceMode   string                `json:"inputGovernanceMode,omitempty"`
	Writing               WritingConfig         `json:"writing,omitempty"`
	Foundation            FoundationConfig      `json:"foundation,omitempty"`
	ModelOverrides        map[string]string     `json:"modelOverrides,omitempty"`
	Detection             DetectionConfig       `json:"detection,omitempty"`
	Daemon                DaemonConfig          `json:"daemon"`
	UpdatedAt             time.Time             `json:"updatedAt"`
}

// WritingConfig controls review retries and word targets.
type WritingConfig struct {
	ReviewRetries   int `json:"reviewRetries"`
	ChapterWordCount int `json:"chapterWordCount,omitempty"`
}

// FoundationConfig controls architect review loop.
type FoundationConfig struct {
	ReviewRetries int `json:"reviewRetries"`
}

// DetectionConfig controls AIGC detection (Tencent 朱雀 / TMS API).
type DetectionConfig struct {
	Enabled          bool   `json:"enabled"`
	Provider         string `json:"provider,omitempty"` // zhuque | local
	Region           string `json:"region,omitempty"`
	BizType          string `json:"bizType,omitempty"`
	Threshold        int    `json:"threshold,omitempty"`        // AIGC score 0-100, default 60
	AutoRevise       bool   `json:"autoRevise,omitempty"`       // auto anti-detect when high
	MaxCharsPerCall  int    `json:"maxCharsPerCall,omitempty"`  // chunk size, default 1800
	ReferenceAutoSync bool  `json:"referenceAutoSync,omitempty"` // sync references/ before compose
}

// DefaultProjectConfig returns a new project configuration.
func DefaultProjectConfig() ProjectConfig {
	return ProjectConfig{
		Language:            LanguageZH,
		ChapterReviewMode:   "auto",
		InputGovernanceMode: "v2",
		Writing: WritingConfig{
			ReviewRetries: 1,
		},
		Foundation: FoundationConfig{
			ReviewRetries: 2,
		},
		Detection: DetectionConfig{
			Enabled: false, Provider: "zhuque", Region: "ap-guangzhou",
			BizType: "TencentCloudDefault", Threshold: 60, AutoRevise: true,
			MaxCharsPerCall: 1800, ReferenceAutoSync: true,
		},
		Daemon:    DefaultDaemonConfig(),
		UpdatedAt: time.Now().UTC(),
	}
}
