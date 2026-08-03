//go:build !windows

package main

import "os"

func executableNames(name string) []string {
	return []string{name}
}

func runnableFile(info os.FileInfo, _ string) bool {
	return !info.IsDir() && info.Mode().Perm()&0o111 != 0
}
