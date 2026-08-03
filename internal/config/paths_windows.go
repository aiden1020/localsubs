//go:build windows

package config

import (
	"os"
	"path/filepath"
)

func platformAppDataDir() string {
	if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
		return filepath.Join(localAppData, "LocalSubs")
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return AppDataDirForHome(home)
	}
	return "."
}

func AppDataDirForHome(home string) string {
	return filepath.Join(home, "AppData", "Local", "LocalSubs")
}

// Windows hosts use absolute bundled runtime paths. PATH remains a fallback
// for developer installations and portable archives.
func NativeHostSearchPath() string {
	return os.Getenv("PATH")
}
