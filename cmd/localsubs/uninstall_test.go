package main

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestUninstallBrowserList(t *testing.T) {
	got, err := uninstallBrowserList("all")
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"chrome", "chromium", "edge"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("browser list = %#v, want %#v", got, want)
	}
	if _, err := uninstallBrowserList("safari"); err == nil {
		t.Fatal("unsupported browser must fail")
	}
}

func TestValidatePurgePath(t *testing.T) {
	if err := validatePurgePath(filepath.Join(t.TempDir(), "LocalSubs")); err != nil {
		t.Fatalf("safe LocalSubs path rejected: %v", err)
	}
	for _, path := range []string{string(filepath.Separator), t.TempDir(), filepath.Join(t.TempDir(), "OtherApp")} {
		if err := validatePurgePath(path); err == nil {
			t.Fatalf("unsafe purge path accepted: %q", path)
		}
	}
}

func TestUninstallPurgeRequiresConfirmation(t *testing.T) {
	if err := uninstallCommand([]string{"--purge"}); err == nil {
		t.Fatal("--purge without --yes must fail")
	}
}
