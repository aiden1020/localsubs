//go:build !windows

package config

import (
	"os"
	"path/filepath"
)

const nativeHostBasePath = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

func platformAppDataDir() string {
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return AppDataDirForHome(home)
	}
	return "."
}

func AppDataDirForHome(home string) string {
	return filepath.Join(home, "Library", "Application Support", "LocalSubs")
}

func NativeHostSearchPath() string {
	return nativeHostBasePath
}
