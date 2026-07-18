package ui

import (
	"path/filepath"
	"testing"
)

func TestCompactPathOnlyReplacesHomePrefix(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	path := filepath.Join(home, "Library", "Application Support", "LocalSubs")
	if got := CompactPath(path); got != "~/Library/Application Support/LocalSubs" {
		t.Fatalf("CompactPath(%q) = %q", path, got)
	}
	nonHomePath := filepath.Join(t.TempDir(), filepath.Base(home), "file")
	if got := CompactPath(nonHomePath); got != nonHomePath {
		t.Fatalf("CompactPath changed non-home path: %q", got)
	}
}
