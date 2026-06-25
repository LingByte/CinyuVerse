package store

import (
	"os"
	"path/filepath"
	"time"

	"github.com/LingByte/CinyuVerse/pkg/story/models"
)

const projectConfigFile = "project.json"

// LoadProjectConfig reads project.json or returns defaults.
func (s *ProjectStore) LoadProjectConfig() (models.ProjectConfig, error) {
	path := filepath.Join(s.Root, projectConfigFile)
	var cfg models.ProjectConfig
	if err := readJSON(path, &cfg); err != nil {
		if os.IsNotExist(err) {
			return models.DefaultProjectConfig(), nil
		}
		return models.ProjectConfig{}, err
	}
	if cfg.Daemon.MaxConcurrentBooks <= 0 {
		cfg.Daemon = models.DefaultDaemonConfig()
	}
	return cfg, nil
}

// SaveProjectConfig writes project.json.
func (s *ProjectStore) SaveProjectConfig(cfg models.ProjectConfig) error {
	cfg.UpdatedAt = time.Now().UTC()
	return writeJSON(filepath.Join(s.Root, projectConfigFile), cfg)
}
