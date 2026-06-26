package models

// PlayMode is open-world vs guided branching.
type PlayMode string

const (
	PlayModeOpen   PlayMode = "open"
	PlayModeGuided PlayMode = "guided"
)

// PlayEntity is a world entity (character, item, location, evidence).
type PlayEntity struct {
	ID          string            `json:"id"`
	Type        string            `json:"type"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	State       map[string]string `json:"state,omitempty"`
}

// PlayWorld is the persisted interactive world state.
type PlayWorld struct {
	ID            string       `json:"id"`
	Title         string       `json:"title"`
	Mode          PlayMode     `json:"mode"`
	Premise       string       `json:"premise"`
	WorldContract string       `json:"worldContract"`
	VisualContract string      `json:"visualContract,omitempty"`
	CurrentScene  string       `json:"currentScene"`
	HUD           string       `json:"hud,omitempty"`
	Entities      []PlayEntity `json:"entities"`
	SuggestedActions []string  `json:"suggestedActions,omitempty"`
	Transcript    []PlayTurn   `json:"transcript"`
}

// PlayTurn is one player/system step.
type PlayTurn struct {
	Role    string `json:"role"` // user | narrator | system
	Content string `json:"content"`
}

// PlayMutation is a structured world change from the mutator.
type PlayMutation struct {
	SceneUpdate      string       `json:"sceneUpdate,omitempty"`
	HUDUpdate        string       `json:"hudUpdate,omitempty"`
	EntityUpserts    []PlayEntity `json:"entityUpserts,omitempty"`
	SuggestedActions []string     `json:"suggestedActions,omitempty"`
	Narration        string       `json:"narration"`
}
