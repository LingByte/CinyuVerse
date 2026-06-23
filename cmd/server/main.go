package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/LingByte/CinyuVerse/internal/handlers"
	"github.com/LingByte/CinyuVerse/internal/models"
	"github.com/LingByte/CinyuVerse/internal/service/workspace"
	"github.com/LingByte/CinyuVerse/pkg/config"
	"github.com/LingByte/CinyuVerse/pkg/lingo"
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
	app.handlers.RegisterHandlers(r)
}

func main() {
	if err := config.Load(); err != nil {
		log.Fatalf("config load: %v", err)
	}
	if err := config.GlobalConfig.Validate(); err != nil {
		log.Fatalf("config validate: %v", err)
	}

	// 初始化日志
	logDir := filepath.Dir(config.GlobalConfig.Log.Filename)
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		log.Fatalf("mkdir logs: %v", err)
	}
	if err := lingo.Init(&config.GlobalConfig.Log, config.GlobalConfig.LogMode()); err != nil {
		log.Fatalf("init logger: %v", err)
	}

	// 数据库目录
	if !strings.Contains(config.GlobalConfig.Database.DSN, ":memory:") {
		if d := filepath.Dir(config.GlobalConfig.Database.DSN); d != "." && d != "" {
			if err := os.MkdirAll(d, 0o755); err != nil {
				log.Fatalf("mkdir database dir: %v", err)
			}
		}
	}

	// 初始化数据库
	db, err := lingo.SetupDatabase(
		config.GlobalConfig.Database.DSN,
		&models.Novel{},
		&models.ChatSession{},
		&models.ChatMessage{},
	)
	if err != nil {
		lingo.Lg.Fatal("database bootstrap", zap.Error(err))
	}

	if config.GlobalConfig.Server.Mode == "production" || config.GlobalConfig.Server.Mode == "prod" {
		gin.SetMode(gin.ReleaseMode)
	} else {
		gin.SetMode(gin.DebugMode)
	}
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(lingo.InjectDB(db))
	r.Use(lingo.CorsMiddleware())

	// 初始化工作区文件服务
	if err := workspace.Init(config.GlobalConfig.Server.WorkspaceDir); err != nil {
		lingo.Lg.Fatal("workspace init", zap.Error(err))
	}

	app := NewCinyuVerseApp(db)
	app.RegisterRoutes(r)
	addr := config.GlobalConfig.Server.Addr
	lingo.Lg.Info("http listening", zap.String("addr", addr))
	if err := r.Run(addr); err != nil && err != http.ErrServerClosed {
		lingo.Lg.Fatal("http server", zap.Error(err))
	}
}
