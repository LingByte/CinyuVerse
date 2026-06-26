// Command cinyu-story is a CLI for the governed fiction writing pipeline.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/LingByte/CinyuVerse/internal/api"
	"github.com/LingByte/CinyuVerse/pkg/protocol"
	_ "github.com/LingByte/CinyuVerse/pkg/protocol/ollama"
	_ "github.com/LingByte/CinyuVerse/pkg/protocol/openai"
	"github.com/LingByte/CinyuVerse/pkg/story/agent"
	"github.com/LingByte/CinyuVerse/pkg/story/agents"
	"github.com/LingByte/CinyuVerse/pkg/story/bootstrap"
	"github.com/LingByte/CinyuVerse/pkg/story/interaction"
	"github.com/LingByte/CinyuVerse/pkg/story/models"
	"github.com/LingByte/CinyuVerse/pkg/story/pipeline"
	"github.com/LingByte/CinyuVerse/pkg/story/references"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}
	switch os.Args[1] {
	case "init":
		runInit(os.Args[2:])
	case "write-next":
		runWriteNext(os.Args[2:])
	case "plan":
		runPlan(os.Args[2:])
	case "draft":
		runDraft(os.Args[2:])
	case "audit":
		runAudit(os.Args[2:])
	case "revise":
		runRevise(os.Args[2:])
	case "agents":
		runAgents(os.Args[2:])
	case "short":
		runShort(os.Args[2:])
	case "play":
		runPlay(os.Args[2:])
	case "interact":
		runInteract(os.Args[2:])
	case "serve":
		runServe(os.Args[2:])
	case "daemon":
		runDaemon(os.Args[2:])
	case "compose":
		runCompose(os.Args[2:])
	case "detect":
		runDetect(os.Args[2:])
	case "consolidate":
		runConsolidate(os.Args[2:])
	case "cover":
		runCover(os.Args[2:])
	case "radar":
		runRadar(os.Args[2:])
	case "fanfic":
		runFanfic(os.Args[2:])
	case "import-chapters":
		runImportChapters(os.Args[2:])
	case "polish":
		runPolish(os.Args[2:])
	case "rewrite":
		runRewrite(os.Args[2:])
	case "references":
		runReferences(os.Args[2:])
	default:
		usage()
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintf(os.Stderr, `cinyu-story — governed long-form fiction pipeline

Usage:
  cinyu-story init --root <dir> --title <title> [--id <book-id>] [--genre xuanhuan] [--brief <file>]
  cinyu-story write-next --root <dir> --book <id> [--context "..."] [--json]
  cinyu-story plan --root <dir> --book <id> [--context "..."] [--json]
  cinyu-story draft --root <dir> --book <id> [--context "..."] [--json]
  cinyu-story audit --root <dir> --book <id> [--chapter N] [--json]
  cinyu-story revise --root <dir> --book <id> --chapter N [--mode auto|polish|rewrite] [--json]
  cinyu-story agents [--json]
  cinyu-story short --root <dir> --direction "..." [--chapters 12] [--json]
  cinyu-story play start --root <dir> --session <id> --title "..." [--premise "..."]
  cinyu-story play step --root <dir> --session <id> --action "..."
  cinyu-story interact --root <dir> --book <id> --message "..."
  cinyu-story serve [--addr :4567] [--root <dir>]
  cinyu-story daemon start|stop|status [--root <dir>]
  cinyu-story references sync|list [--root <dir>] [--json]

LLM env (OpenAI-compatible):
  STORY_LLM_PROVIDER=openai|ollama|custom
  STORY_LLM_BASE_URL=https://api.openai.com/v1
  STORY_LLM_API_KEY=sk-...
  STORY_LLM_MODEL=gpt-4o-mini
`)
}

func runInit(args []string) {
	fs := flag.NewFlagSet("init", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	title := fs.String("title", "", "book title")
	id := fs.String("id", "", "book id (default: derived from title)")
	genre := fs.String("genre", "xuanhuan", "genre id")
	lang := fs.String("lang", "zh", "language zh|en")
	briefFile := fs.String("brief", "", "optional brief markdown file")
	_ = fs.Parse(args)

	if *title == "" {
		fatal("--title required")
	}
	bookID := *id
	if bookID == "" {
		bookID = slug(*title)
	}
	var brief string
	if *briefFile != "" {
		data, err := os.ReadFile(*briefFile)
		if err != nil {
			fatal(err.Error())
		}
		brief = string(data)
	}
	language := models.LanguageZH
	if *lang == "en" {
		language = models.LanguageEN
	}
	cfg := models.BookConfig{
		ID:       bookID,
		Title:    *title,
		Genre:    *genre,
		Language: language,
		Status:   models.BookStatusDraft,
	}
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	if err := runner.InitBook(context.Background(), cfg, brief); err != nil {
		fatal(err.Error())
	}
	fmt.Printf("initialized book %q at %s\n", bookID, filepath.Join(*root, "books", bookID))
}

func runWriteNext(args []string) {
	fs := flag.NewFlagSet("write-next", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	book := fs.String("book", "", "book id")
	guidance := fs.String("context", "", "chapter guidance")
	asJSON := fs.Bool("json", false, "JSON output")
	_ = fs.Parse(args)
	if *book == "" {
		fatal("--book required")
	}
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	result, err := runner.WriteNextChapter(context.Background(), *book, 0, *guidance)
	if err != nil {
		fatal(err.Error())
	}
	if *asJSON {
		printJSON(result)
		return
	}
	fmt.Printf("chapter %d %q (%d chars) status=%s revised=%v audit_passed=%v\n",
		result.ChapterNumber, result.Title, result.WordCount, result.Status, result.Revised, result.Audit.Passed)
}

func runPlan(args []string) {
	fs := flag.NewFlagSet("plan", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	book := fs.String("book", "", "book id")
	guidance := fs.String("context", "", "chapter guidance")
	asJSON := fs.Bool("json", false, "JSON output")
	_ = fs.Parse(args)
	if *book == "" {
		fatal("--book required")
	}
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	plan, err := runner.PlanChapter(context.Background(), *book, *guidance)
	if err != nil {
		fatal(err.Error())
	}
	if *asJSON {
		printJSON(plan)
		return
	}
	fmt.Println(plan.IntentMarkdown)
}

func runDraft(args []string) {
	fs := flag.NewFlagSet("draft", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	book := fs.String("book", "", "book id")
	guidance := fs.String("context", "", "chapter guidance")
	asJSON := fs.Bool("json", false, "JSON output")
	_ = fs.Parse(args)
	if *book == "" {
		fatal("--book required")
	}
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	out, err := runner.DraftChapter(context.Background(), *book, 0, *guidance)
	if err != nil {
		fatal(err.Error())
	}
	if *asJSON {
		printJSON(out)
		return
	}
	fmt.Printf("draft chapter %d %q (%d chars)\n", out.ChapterNumber, out.Title, out.WordCount)
}

func runAudit(args []string) {
	fs := flag.NewFlagSet("audit", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	book := fs.String("book", "", "book id")
	chapter := fs.Int("chapter", 0, "chapter number (0 = latest)")
	asJSON := fs.Bool("json", false, "JSON output")
	_ = fs.Parse(args)
	if *book == "" {
		fatal("--book required")
	}
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	out, err := runner.AuditChapter(context.Background(), *book, *chapter)
	if err != nil {
		fatal(err.Error())
	}
	if *asJSON {
		printJSON(out)
		return
	}
	fmt.Printf("audit passed=%v score=%d summary=%s issues=%d\n",
		out.Passed, out.OverallScore, out.Summary, len(out.Issues))
}

func runRevise(args []string) {
	fs := flag.NewFlagSet("revise", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	book := fs.String("book", "", "book id")
	chapter := fs.Int("chapter", 0, "chapter number")
	mode := fs.String("mode", "auto", "revise mode")
	asJSON := fs.Bool("json", false, "JSON output")
	_ = fs.Parse(args)
	if *book == "" || *chapter <= 0 {
		fatal("--book and --chapter required")
	}
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	out, err := runner.ReviseChapter(context.Background(), *book, *chapter, agents.ReviseMode(*mode), false, false)
	if err != nil {
		fatal(err.Error())
	}
	if *asJSON {
		printJSON(out)
		return
	}
	if out.Skipped {
		fmt.Println(out.Message)
		return
	}
	fmt.Printf("saved=%v mode=%s aiTell %d→%d issues %d→%d\n",
		out.Saved, out.Mode, out.AITellBefore, out.AITellAfter, len(out.IssuesBefore), len(out.IssuesAfter))
}

func runAgents(args []string) {
	fs := flag.NewFlagSet("agents", flag.ExitOnError)
	asJSON := fs.Bool("json", false, "JSON output")
	_ = fs.Parse(args)
	list := agents.All()
	if *asJSON {
		printJSON(list)
		return
	}
	for _, d := range list {
		llm := "llm"
		if !d.UsesLLM {
			llm = "rules"
		}
		fmt.Printf("%-32s temp=%.2f %s\n", d.Name, d.Temperature, llm)
	}
}

func runShort(args []string) {
	fs := flag.NewFlagSet("short", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	direction := fs.String("direction", "", "story direction")
	chapters := fs.Int("chapters", 12, "chapter count")
	asJSON := fs.Bool("json", false, "JSON output")
	_ = fs.Parse(args)
	if *direction == "" {
		fatal("--direction required")
	}
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	out, err := runner.RunShortFiction(context.Background(), agents.ShortFictionRunInput{
		Direction: *direction, Chapters: *chapters,
	})
	if err != nil {
		fatal(err.Error())
	}
	if *asJSON {
		printJSON(out)
		return
	}
	fmt.Printf("short fiction %q written to %s\n", out.Title, out.OutputDir)
}

func runPlay(args []string) {
	if len(args) < 1 {
		fatal("play requires subcommand: start|step")
	}
	switch args[0] {
	case "start":
		runPlayStart(args[1:])
	case "step":
		runPlayStep(args[1:])
	default:
		fatal("unknown play subcommand")
	}
}

func runPlayStart(args []string) {
	fs := flag.NewFlagSet("play start", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	session := fs.String("session", "", "session id")
	title := fs.String("title", "", "play title")
	premise := fs.String("premise", "", "premise")
	asJSON := fs.Bool("json", false, "JSON output")
	_ = fs.Parse(args)
	if *session == "" || *title == "" {
		fatal("--session and --title required")
	}
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	out, err := runner.PlayStart(context.Background(), agents.PlayStartInput{
		SessionID: *session, Title: *title, Premise: *premise,
	})
	if err != nil {
		fatal(err.Error())
	}
	if *asJSON {
		printJSON(out)
		return
	}
	fmt.Printf("play started: %s\n%s\n", out.Title, out.CurrentScene)
}

func runPlayStep(args []string) {
	fs := flag.NewFlagSet("play step", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	session := fs.String("session", "", "session id")
	action := fs.String("action", "", "player action")
	asJSON := fs.Bool("json", false, "JSON output")
	_ = fs.Parse(args)
	if *session == "" || *action == "" {
		fatal("--session and --action required")
	}
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	out, err := runner.PlayStep(context.Background(), agents.PlayStepInput{SessionID: *session, Action: *action})
	if err != nil {
		fatal(err.Error())
	}
	if *asJSON {
		printJSON(out)
		return
	}
	fmt.Printf("scene:\n%s\n", out.CurrentScene)
}

func runInteract(args []string) {
	fs := flag.NewFlagSet("interact", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	book := fs.String("book", "", "book id")
	message := fs.String("message", "", "user message")
	_ = fs.Parse(args)
	if *book == "" || *message == "" {
		fatal("--book and --message required")
	}
	client, model, err := llmFromEnv()
	if err != nil {
		fatal(err.Error())
	}
	router := agent.Router{DefaultClient: client, DefaultModel: model}
	run := pipeline.NewRunner(pipeline.Config{ProjectRoot: *root, Router: router})
	sess := interaction.NewSession(interaction.SessionConfig{
		Router: router, ProjectRoot: *root, Pipeline: run, BookID: *book, Language: "zh",
	})
	out, err := sess.Run(context.Background(), *message)
	if err != nil {
		fatal(err.Error())
	}
	fmt.Println(out)
}

func runServe(args []string) {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	addr := fs.String("addr", ":4567", "listen address")
	_ = fs.Parse(args)

	client, model, err := llmFromEnv()
	if err != nil {
		fatal(err.Error())
	}
	srv := api.NewServer(*root, agent.Router{DefaultClient: client, DefaultModel: model})
	fmt.Printf("listening on %s (project=%s)\n", *addr, *root)
	if err := http.ListenAndServe(*addr, srv.Handler()); err != nil {
		fatal(err.Error())
	}
}

func runDaemon(args []string) {
	if len(args) < 1 {
		fatal("daemon requires: start|stop|status")
	}
	fs := flag.NewFlagSet("daemon", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	_ = fs.Parse(args[1:])
	client, model, err := llmFromEnv()
	if err != nil {
		fatal(err.Error())
	}
	srv := api.NewServer(*root, agent.Router{DefaultClient: client, DefaultModel: model})
	switch args[0] {
	case "start":
		if err := srv.Daemon.Start(context.Background()); err != nil {
			fatal(err.Error())
		}
		fmt.Println("daemon started")
	case "stop":
		if err := srv.Daemon.Stop(context.Background()); err != nil {
			fatal(err.Error())
		}
		fmt.Println("daemon stopped")
	case "status":
		state, cfg, err := srv.Daemon.Status(context.Background())
		if err != nil {
			fatal(err.Error())
		}
		printJSON(map[string]any{"runtime": state, "config": cfg})
	default:
		fatal("unknown daemon command")
	}
}

func newRunner(root string) (*pipeline.Runner, error) {
	client, model, err := llmFromEnv()
	if err != nil {
		return nil, err
	}
	router, proj, err := bootstrap.RouterFromProject(root, client, model)
	if err != nil {
		return nil, err
	}
	return pipeline.NewRunner(bootstrap.PipelineConfigFromProject(proj, root, router, nil)), nil
}

func llmFromEnv() (protocol.ChatModel, string, error) {
	provider := envOr("STORY_LLM_PROVIDER", "openai")
	baseURL := os.Getenv("STORY_LLM_BASE_URL")
	apiKey := os.Getenv("STORY_LLM_API_KEY")
	model := envOr("STORY_LLM_MODEL", "gpt-4o-mini")
	pt := protocol.ProviderOpenAI
	switch provider {
	case "ollama":
		pt = protocol.ProviderOllama
	case "openai":
		pt = protocol.ProviderOpenAI
	case "custom":
		pt = protocol.ProviderOpenAI
	default:
		return nil, "", fmt.Errorf("unsupported STORY_LLM_PROVIDER %q", provider)
	}
	if baseURL == "" && pt == protocol.ProviderOllama {
		baseURL = "http://127.0.0.1:11434"
	}
	client, err := protocol.NewClient(protocol.ClientConfig{
		Provider: pt,
		BaseURL:  baseURL,
		APIKey:   apiKey,
	})
	if err != nil {
		return nil, "", err
	}
	return client, model, nil
}

func printJSON(v any) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func slug(title string) string {
	s := strings.ToLower(strings.TrimSpace(title))
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r >= '\u4e00' && r <= '\u9fff':
			b.WriteRune(r)
		default:
			b.WriteRune('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return fmt.Sprintf("book-%d", time.Now().Unix())
	}
	return out
}

func fatal(msg string) {
	fmt.Fprintln(os.Stderr, "error:", msg)
	os.Exit(1)
}

func runCompose(args []string) {
	fs := flag.NewFlagSet("compose", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	book := fs.String("book", "", "book id")
	guidance := fs.String("context", "", "guidance")
	asJSON := fs.Bool("json", false, "JSON output")
	_ = fs.Parse(args)
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	out, err := runner.ComposeChapter(context.Background(), *book, *guidance)
	if err != nil {
		fatal(err.Error())
	}
	if *asJSON {
		printJSON(out)
		return
	}
	fmt.Println(out.IntentMarkdown)
}

func runDetect(args []string) {
	fs := flag.NewFlagSet("detect", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	book := fs.String("book", "", "book id")
	chapter := fs.Int("chapter", 0, "chapter number (0=all)")
	_ = fs.Bool("json", false, "JSON output")
	_ = fs.Parse(args)
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	if *chapter > 0 {
		local, zhuque, err := runner.DetectChapterFull(context.Background(), *book, *chapter)
		if err != nil {
			fatal(err.Error())
		}
		resp := map[string]any{
			"chapterNumber": local.ChapterNumber, "title": local.Title,
			"aiTells": local.AITells, "sensitive": local.Sensitive, "postWrite": local.PostWrite,
		}
		if zhuque != nil {
			resp["zhuque"] = zhuque
		}
		printJSON(resp)
		return
	}
	out, err := runner.DetectAllChapters(context.Background(), *book)
	if err != nil {
		fatal(err.Error())
	}
	printJSON(out)
}

func runReferences(args []string) {
	if len(args) < 1 {
		fatal("references requires subcommand: sync|list")
	}
	switch args[0] {
	case "sync":
		runReferencesSync(args[1:])
	case "list":
		runReferencesList(args[1:])
	default:
		fatal("unknown references subcommand")
	}
}

func runReferencesSync(args []string) {
	fs := flag.NewFlagSet("references sync", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	asJSON := fs.Bool("json", false, "JSON output")
	force := fs.Bool("force", false, "re-analyze all reference files")
	_ = fs.Parse(args)
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	corpus, err := runner.SyncReferenceLibrary(context.Background(), *force)
	if err != nil {
		fatal(err.Error())
	}
	if *asJSON {
		printJSON(map[string]any{"status": "ok", "corpusChars": len([]rune(corpus))})
		return
	}
	fmt.Printf("synced style corpus (%d chars)\n", len([]rune(corpus)))
}

func runReferencesList(args []string) {
	fs := flag.NewFlagSet("references list", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	asJSON := fs.Bool("json", false, "JSON output")
	_ = fs.Parse(args)
	lib := references.NewLibrary(*root)
	_ = lib.EnsureLayout()
	files, err := lib.ListSourceFiles()
	if err != nil {
		fatal(err.Error())
	}
	pending, _ := lib.NeedsSync()
	if *asJSON {
		printJSON(map[string]any{"files": files, "pendingSync": pending})
		return
	}
	fmt.Println("reference files:", files)
	fmt.Println("pending sync:", pending)
}

func runConsolidate(args []string) {
	fs := flag.NewFlagSet("consolidate", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	book := fs.String("book", "", "book id")
	_ = fs.Parse(args)
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	out, err := runner.ConsolidateSummaries(context.Background(), *book)
	if err != nil {
		fatal(err.Error())
	}
	fmt.Println(out)
}

func runCover(args []string) {
	fs := flag.NewFlagSet("cover", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	title := fs.String("title", "", "cover title")
	intro := fs.String("intro", "", "synopsis")
	_ = fs.Parse(args)
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	out, err := runner.GenerateCover(context.Background(), agents.CoverInput{
		ProjectRoot: *root, Title: *title, Intro: *intro,
	})
	if err != nil {
		fatal(err.Error())
	}
	printJSON(out)
}

func runRadar(args []string) {
	fs := flag.NewFlagSet("radar", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	ctx := fs.String("context", "web fiction trends", "platform context")
	_ = fs.Parse(args)
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	out, err := runner.RadarScan(context.Background(), *ctx, models.LanguageZH)
	if err != nil {
		fatal(err.Error())
	}
	printJSON(out)
}

func runFanfic(args []string) {
	fs := flag.NewFlagSet("fanfic", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	title := fs.String("title", "", "book title")
	id := fs.String("id", "", "book id")
	sourceFile := fs.String("from", "", "source text file")
	mode := fs.String("mode", "canon", "canon|au|ooc|cp")
	_ = fs.Parse(args)
	if *title == "" || *sourceFile == "" {
		fatal("--title and --from required")
	}
	data, err := os.ReadFile(*sourceFile)
	if err != nil {
		fatal(err.Error())
	}
	bookID := *id
	if bookID == "" {
		bookID = slug(*title)
	}
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	cfg := models.BookConfig{ID: bookID, Title: *title, Language: models.LanguageZH, Status: models.BookStatusDraft}
	if err := runner.InitFanficBook(context.Background(), cfg, string(data), *sourceFile, models.FanficMode(*mode)); err != nil {
		fatal(err.Error())
	}
	fmt.Printf("fanfic book %q initialized\n", bookID)
}

func runImportChapters(args []string) {
	fs := flag.NewFlagSet("import-chapters", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	book := fs.String("book", "", "book id")
	dir := fs.String("from", "", "directory with *.md chapters")
	_ = fs.Parse(args)
	if *book == "" || *dir == "" {
		fatal("--book and --from required")
	}
	entries, err := os.ReadDir(*dir)
	if err != nil {
		fatal(err.Error())
	}
	var chapters []agents.ImportChapterMeta
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(*dir, e.Name()))
		if err != nil {
			continue
		}
		chapters = append(chapters, agents.ImportChapterMeta{Title: strings.TrimSuffix(e.Name(), ".md"), Content: string(data)})
	}
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	out, err := runner.ImportChapters(context.Background(), *book, chapters)
	if err != nil {
		fatal(err.Error())
	}
	printJSON(out)
}

func runPolish(args []string) {
	fs := flag.NewFlagSet("polish", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	book := fs.String("book", "", "book id")
	textFile := fs.String("file", "", "text file to polish")
	_ = fs.Parse(args)
	content := ""
	if *textFile != "" {
		data, err := os.ReadFile(*textFile)
		if err != nil {
			fatal(err.Error())
		}
		content = string(data)
	}
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	out, err := runner.PolishChapter(context.Background(), *book, content)
	if err != nil {
		fatal(err.Error())
	}
	fmt.Println(out)
}

func runRewrite(args []string) {
	fs := flag.NewFlagSet("rewrite", flag.ExitOnError)
	root := fs.String("root", ".", "project root")
	book := fs.String("book", "", "book id")
	chapter := fs.Int("chapter", 0, "chapter number")
	guidance := fs.String("context", "", "guidance")
	asJSON := fs.Bool("json", false, "JSON output")
	_ = fs.Parse(args)
	if *book == "" || *chapter <= 0 {
		fatal("--book and --chapter required")
	}
	runner, err := newRunner(*root)
	if err != nil {
		fatal(err.Error())
	}
	out, err := runner.RewriteChapter(context.Background(), *book, *chapter, *guidance, 0)
	if err != nil {
		fatal(err.Error())
	}
	if *asJSON {
		printJSON(out)
		return
	}
	fmt.Printf("rewrote chapter %d %q\n", out.ChapterNumber, out.Title)
}
