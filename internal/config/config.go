package config

import (
	"os"
	"path/filepath"
)

const (
	DefaultLocalHelperToken = "localsubs-local-dev"
	NativeHostName          = "localsubs_helper"
	DefaultExtensionID      = "dpacileladlkfgdjbdjdjhgnepicejjb"
	NativeHostBasePath      = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
)

func AppDataDir() string {
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return AppDataDirForHome(home)
	}
	return "."
}

func AppDataDirForHome(home string) string {
	return filepath.Join(home, "Library", "Application Support", "LocalSubs")
}

func LogDir() string {
	return filepath.Join(AppDataDir(), "logs")
}

func LogDirForHome(home string) string {
	return filepath.Join(AppDataDirForHome(home), "logs")
}

func NativeHostLogPath() string {
	return filepath.Join(LogDir(), "native-host.log")
}

func NativeHostLogPathForHome(home string) string {
	return filepath.Join(LogDirForHome(home), "native-host.log")
}
