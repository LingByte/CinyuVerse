// Package lingo provides local replacements for LingByte/lingoroutine modules.
package lingo

import (
	"os"
	"strings"
)

// LoadEnv loads .env and .env.$MODE files from the working directory.
func LoadEnv(mode string) error {
	files := []string{".env"}
	if mode != "" {
		files = append(files, ".env."+mode)
	}
	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) != 2 {
				continue
			}
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(strings.Trim(parts[1], `"'`))
			if key != "" && os.Getenv(key) == "" {
				os.Setenv(key, val)
			}
		}
	}
	return nil
}

// GetEnv reads an environment variable, defaults to empty string.
func GetEnv(key string) string {
	return os.Getenv(key)
}

// GetBoolEnv reads an environment variable as boolean.
func GetBoolEnv(key string) bool {
	v := strings.ToLower(os.Getenv(key))
	return v == "true" || v == "1" || v == "yes"
}
