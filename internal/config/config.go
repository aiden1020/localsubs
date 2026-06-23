package config

import (
	"os"
	"path/filepath"
)

const (
	DefaultLocalHelperToken = "localsubs-local-dev"
	NativeHostName          = "localsubs_helper"
	DefaultExtensionID      = "dpacileladlkfgdjbdjdjhgnepicejjb"
)

func AppDataDir() string {
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return filepath.Join(home, "Library", "Application Support", "LocalSubs")
	}
	return "."
}
