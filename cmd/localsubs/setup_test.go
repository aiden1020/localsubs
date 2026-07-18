package main

import (
	"errors"
	"flag"
	"reflect"
	"strings"
	"testing"
)

func TestSetupHelpAndBrowserValidation(t *testing.T) {
	if err := setup([]string{"--help"}); !errors.Is(err, flag.ErrHelp) {
		t.Fatalf("setup help error = %v, want flag.ErrHelp", err)
	}
	if err := setup([]string{"--browser", "safari"}); err == nil ||
		!strings.Contains(err.Error(), "unsupported browser") {
		t.Fatalf("unsupported browser error = %v", err)
	}
}

func TestRunSetupDownloadsBeforeInstalling(t *testing.T) {
	events := make([]string, 0, 2)
	var installArgs []string
	err := runSetup("edge", "extension", setupDependencies{
		downloadModel: func() error {
			events = append(events, "download")
			return nil
		},
		installIntegration: func(args []string) error {
			events = append(events, "install")
			installArgs = append([]string(nil), args...)
			return nil
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(events, []string{"download", "install"}) {
		t.Fatalf("setup order = %#v", events)
	}
	wantArgs := []string{"--browser", "edge", "--extension-id", "extension"}
	if !reflect.DeepEqual(installArgs, wantArgs) {
		t.Fatalf("install args = %#v, want %#v", installArgs, wantArgs)
	}
}

func TestRunSetupStopsWhenDownloadFails(t *testing.T) {
	downloadErr := errors.New("download failed")
	installed := false
	err := runSetup("chrome", "extension", setupDependencies{
		downloadModel: func() error { return downloadErr },
		installIntegration: func([]string) error {
			installed = true
			return nil
		},
	})
	if !errors.Is(err, downloadErr) {
		t.Fatalf("setup error = %v, want download failure", err)
	}
	if installed {
		t.Fatal("setup must not install the integration after a download failure")
	}
}

func TestDisplayBrowserName(t *testing.T) {
	tests := map[string]string{
		"chrome":         "Chrome",
		"google-chrome":  "Chrome",
		"chromium":       "Chromium",
		"edge":           "Microsoft Edge",
		"microsoft-edge": "Microsoft Edge",
	}
	for input, expected := range tests {
		if got := displayBrowserName(input); got != expected {
			t.Fatalf("displayBrowserName(%q) = %q, want %q", input, got, expected)
		}
	}
}
