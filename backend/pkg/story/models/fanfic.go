package models

// FanficMode controls how closely fan fiction follows source canon.
type FanficMode string

const (
	FanficModeCanon FanficMode = "canon"
	FanficModeAU    FanficMode = "au"
	FanficModeOOC   FanficMode = "ooc"
	FanficModeCP    FanficMode = "cp"
)
