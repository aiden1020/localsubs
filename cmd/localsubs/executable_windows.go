//go:build windows

package main

import (
	"os"
	"path/filepath"
	"strings"
)

func executableNames(name string) []string {
	if strings.EqualFold(filepath.Ext(name), ".exe") {
		return []string{name}
	}
	return []string{name + ".exe", name}
}

func runnableFile(info os.FileInfo, path string) bool {
	return !info.IsDir() && strings.EqualFold(filepath.Ext(path), ".exe")
}
