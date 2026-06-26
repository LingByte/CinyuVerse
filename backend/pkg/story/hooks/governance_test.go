package hooks

import (
	"testing"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

func TestEvaluateHooksStaleDebt(t *testing.T) {
	hooks := models.HooksState{Hooks: []models.HookRecord{{
		HookID: "h1", StartChapter: 1, Status: models.HookStatusOpen, LastAdvancedChapter: 1,
	}}}
	report := EvaluateHooks(hooks, 8)
	if report.StaleDebt != 1 {
		t.Fatalf("expected stale debt 1, got %d", report.StaleDebt)
	}
}

func TestValidateAdmissionResolvedHook(t *testing.T) {
	hooks := models.HooksState{Hooks: []models.HookRecord{{
		HookID: "h1", Status: models.HookStatusResolved,
	}}}
	issues := ValidateAdmission(models.HookOp{Action: "upsert", HookID: "h1"}, hooks)
	if len(issues) == 0 {
		t.Fatal("expected admission issue for resolved hook upsert")
	}
}
