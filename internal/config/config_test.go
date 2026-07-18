package config

import (
	"path/filepath"
	"testing"
)

func TestNativeHostLogPathForHome(t *testing.T) {
	home := filepath.Join("tmp", "user")
	want := filepath.Join(home, "Library", "Application Support", "LocalSubs", "logs", "native-host.log")
	if got := NativeHostLogPathForHome(home); got != want {
		t.Fatalf("log path = %q, want %q", got, want)
	}
}
