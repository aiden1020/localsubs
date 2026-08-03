package config

import (
	"path/filepath"
)

const (
	DefaultLocalHelperToken = "localsubs-local-dev"
	NativeHostName          = "localsubs_helper"
	DefaultExtensionID      = "dpacileladlkfgdjbdjdjhgnepicejjb"
)

func AppDataDir() string {
	return platformAppDataDir()
}

func LogDir() string {
	return filepath.Join(AppDataDir(), "logs")
}

func RuntimeDir() string {
	return filepath.Join(AppDataDir(), "runtime")
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
