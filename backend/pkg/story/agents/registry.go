package agents

import "github.com/LingByte/CinyuVerse/pkg/story/agent"

// Descriptor documents one pipeline agent for routing and discovery.
type Descriptor struct {
	Name        agent.Name
	Description string
	Temperature float32
	UsesLLM     bool
}

// All returns the full InkOS-equivalent agent registry.
func All() []Descriptor {
	return []Descriptor{
		{Name: agent.NameArchitect, Description: "Generate book foundation (bible, outline, rules)", Temperature: 0.8, UsesLLM: true},
		{Name: agent.NameFoundationReviewer, Description: "Review architect foundation quality", Temperature: 0.3, UsesLLM: true},
		{Name: agent.NameFoundationReviser, Description: "Revise architect foundation from feedback", Temperature: 0.6, UsesLLM: true},
		{Name: agent.NamePlanner, Description: "Generate chapter memo and intent", Temperature: 0.7, UsesLLM: true},
		{Name: agent.NameComposer, Description: "Assemble governed context; may compress via LLM", Temperature: 0.2, UsesLLM: true},
		{Name: agent.NameWriter, Description: "Write chapter creative prose", Temperature: 0.7, UsesLLM: true},
		{Name: agent.NameObserver, Description: "Extract factual observations from chapter prose", Temperature: 0.5, UsesLLM: true},
		{Name: agent.NameReflector, Description: "Emit runtime state JSON delta from observations", Temperature: 0.3, UsesLLM: true},
		{Name: agent.NameLengthNormalizer, Description: "Single-pass length compress/expand", Temperature: 0.2, UsesLLM: true},
		{Name: agent.NameAuditor, Description: "Continuity and quality audit (33+ dims via LLM + rules)", Temperature: 0.3, UsesLLM: true},
		{Name: agent.NameReviser, Description: "Repair audit issues (polish/rewrite/anti-detect)", Temperature: 0.3, UsesLLM: true},
		{Name: agent.NameStateValidator, Description: "Validate runtime state delta before apply", Temperature: 0.1, UsesLLM: true},
		{Name: agent.NameChapterAnalyzer, Description: "Reverse-engineer state from imported chapters", Temperature: 0.3, UsesLLM: true},
		{Name: agent.NameConsolidator, Description: "Merge chapter summaries for long books", Temperature: 0.3, UsesLLM: true},
		{Name: agent.NameRadar, Description: "Platform trend scan", Temperature: 0.6, UsesLLM: true},
		{Name: agent.NamePolisher, Description: "Light polish on approved chapters", Temperature: 0.4, UsesLLM: true},
		{Name: agent.NameFanficCanonImporter, Description: "Import fanfic canon from source", Temperature: 0.3, UsesLLM: true},
		{Name: agent.NameStyleAnalyzer, Description: "Statistical style fingerprint (zero LLM)", Temperature: 0, UsesLLM: false},
		{Name: agent.NameStyleVoiceCurator, Description: "Compress reference novels into style corpus for voice imitation", Temperature: 0.35, UsesLLM: true},
		{Name: agent.NameSpinoffArchitect, Description: "Spinoff book foundation from source book", Temperature: 0.75, UsesLLM: true},
		{Name: agent.NameImitationArchitect, Description: "Book foundation from style imitation", Temperature: 0.75, UsesLLM: true},
		{Name: agent.NameCoverGenerator, Description: "Cover prompt and image artifact generation", Temperature: 0.45, UsesLLM: false},
		{Name: agent.NamePostWriteValidator, Description: "Deterministic post-write checks", Temperature: 0, UsesLLM: false},
		{Name: agent.NameAITellsDetector, Description: "Deterministic AI-tell heuristics", Temperature: 0, UsesLLM: false},
		{Name: agent.NameSensitiveWords, Description: "Deterministic sensitive word scan", Temperature: 0, UsesLLM: false},
		{Name: agent.NameShortFictionOutline, Description: "Short fiction outline", Temperature: 0.55, UsesLLM: true},
		{Name: agent.NameShortFictionOutlineReviewer, Description: "Review short fiction outline", Temperature: 0.3, UsesLLM: true},
		{Name: agent.NameShortFictionOutlineReviser, Description: "Revise short fiction outline", Temperature: 0.45, UsesLLM: true},
		{Name: agent.NameShortFictionWriter, Description: "Short fiction draft", Temperature: 0.58, UsesLLM: true},
		{Name: agent.NameShortFictionDraftReviewer, Description: "Review short fiction draft", Temperature: 0.3, UsesLLM: true},
		{Name: agent.NameShortFictionDraftReviser, Description: "Revise short fiction draft", Temperature: 0.45, UsesLLM: true},
		{Name: agent.NameShortFictionPackaging, Description: "Synopsis and selling points", Temperature: 0.45, UsesLLM: true},
		{Name: agent.NamePlayActionInterpreter, Description: "Interpret play user action", Temperature: 0.4, UsesLLM: true},
		{Name: agent.NamePlayWorldMutator, Description: "Apply play world mutation", Temperature: 0.55, UsesLLM: true},
		{Name: agent.NamePlaySceneRenderer, Description: "Render play scene prose", Temperature: 0.65, UsesLLM: true},
		{Name: agent.NamePlaySceneReconciler, Description: "Reconcile scene with world state", Temperature: 0.45, UsesLLM: true},
		{Name: agent.NameConversation, Description: "Tool-use conversation orchestrator", Temperature: 0.7, UsesLLM: true},
	}
}

// DeterministicModules lists zero-LLM helpers used in the audit pipeline.
func DeterministicModules() []string {
	return []string{
		"AnalyzeAITells", "AnalyzeSensitiveWords", "ValidatePostWrite",
		"ApplyRuntimeStateDelta", "HookGovernance", "LengthSpec", "AnalyzeStyle",
	}
}
