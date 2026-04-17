package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/LingByte/CinyuVerse/internal/handlers"
	"github.com/LingByte/CinyuVerse/internal/models"
	"github.com/LingByte/CinyuVerse/pkg/config"
	"github.com/LingByte/lingoroutine/bootstrap"
	"github.com/LingByte/lingoroutine/logger"
	"github.com/LingByte/lingoroutine/middleware"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type CinyuVerseApp struct {
	db       *gorm.DB
	handlers *handlers.CinyuHandlers
}

func NewCinyuVerseApp(db *gorm.DB) *CinyuVerseApp {
	return &CinyuVerseApp{
		db:       db,
		handlers: handlers.NewCinyuHandlers(db),
	}
}

func (app *CinyuVerseApp) RegisterRoutes(r *gin.Engine) {
	// Register system routes (with /api prefix)
	app.handlers.RegisterHandlers(r)
}

func main() {
	if err := config.Load(); err != nil {
		log.Fatalf("config load: %v", err)
	}
	if err := config.GlobalConfig.Validate(); err != nil {
		log.Fatalf("config validate: %v", err)
	}
	logDir := filepath.Dir(config.GlobalConfig.Log.Filename)
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		log.Fatalf("mkdir logs: %v", err)
	}
	if !strings.Contains(config.GlobalConfig.Database.DSN, ":memory:") {
		if d := filepath.Dir(config.GlobalConfig.Database.DSN); d != "." && d != "" {
			if err := os.MkdirAll(d, 0o755); err != nil {
				log.Fatalf("mkdir database dir: %v", err)
			}
		}
	}
	if err := logger.Init(&config.GlobalConfig.Log, config.GlobalConfig.LogMode()); err != nil {
		log.Fatalf("init logger: %v", err)
	}
	bs := bootstrap.NewBootstrap(os.Stdout, &bootstrap.Options{
		DBDriver:      config.GlobalConfig.Database.Driver,
		DSN:           config.GlobalConfig.Database.DSN,
		AutoMigrate:   true,
		SeedNonProd:   false,
		MigrationsDir: "migrations",
		Models: []any{
			&models.Novel{},
			&models.ChatSession{},
			&models.ChatMessage{},
		},
	})
	db, err := bs.SetupDatabase()
	if err != nil {
		logger.Lg.Fatal("database bootstrap", zap.Error(err))
	}

	if config.GlobalConfig.Server.Mode == "production" || config.GlobalConfig.Server.Mode == "prod" {
		gin.SetMode(gin.ReleaseMode)
	} else {
		gin.SetMode(gin.DebugMode)
	}
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.InjectDB(db))
	r.Use(middleware.CorsMiddleware())
	r.StaticFile("/novel-crud-demo", "web/novel-crud-demo.html")
	app := NewCinyuVerseApp(db)
	app.RegisterRoutes(r)
	addr := config.GlobalConfig.Server.Addr
	logger.Lg.Info("http listening", zap.String("addr", addr))
	if err := r.Run(addr); err != nil && err != http.ErrServerClosed {
		logger.Lg.Fatal("http server", zap.Error(err))
	}
}
