package models

// All 返回交给 lingoroutine bootstrap 做 AutoMigrate 的全部模型。
func All() []any {
	return []any{
		&Work{},
		&Plotline{},
		&PlotBeat{},
		&Volume{},
		&Chapter{},
		&Scene{},
		&Character{},
		&Location{},
		&TimelineEvent{},
		&CanonEntry{},
		&MemoryChunk{},
		&GenerationJob{},
	}
}
