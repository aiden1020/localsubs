package main

import (
	"bytes"
	"errors"
	"flag"
	"io"
	"strings"
	"testing"
)

func TestParseFlagsDistinguishesHelpFromInvalidInput(t *testing.T) {
	helpFlags := flag.NewFlagSet("test", flag.ContinueOnError)
	helpFlags.SetOutput(io.Discard)
	if err := parseFlags(helpFlags, []string{"--help"}); !errors.Is(err, flag.ErrHelp) {
		t.Fatalf("help error = %v, want flag.ErrHelp", err)
	}

	invalidFlags := flag.NewFlagSet("test", flag.ContinueOnError)
	invalidFlags.SetOutput(io.Discard)
	err := parseFlags(invalidFlags, []string{"--unknown"})
	var silent silentError
	if !errors.As(err, &silent) {
		t.Fatalf("invalid flag error = %T, want silentError", err)
	}
}

func TestRootUsageIncludesUserFacingModelStatus(t *testing.T) {
	var output bytes.Buffer
	printUsageTo(&output)
	for _, expected := range []string{"model download", "model status [--json]", "doctor [--json] [--deep]"} {
		if !strings.Contains(output.String(), expected) {
			t.Fatalf("usage does not contain %q:\n%s", expected, output.String())
		}
	}
}

func TestNormalizeInvocationRecognizesBrowserNativeHostArgs(t *testing.T) {
	args, browserInvocation := normalizeInvocation([]string{
		"chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
		"--parent-window=0",
	})
	if !browserInvocation || len(args) != 1 || args[0] != "native-host" {
		t.Fatalf("unexpected normalized invocation: %#v, browser=%v", args, browserInvocation)
	}
	versionArgs, browserInvocation := normalizeInvocation([]string{"version"})
	if browserInvocation || len(versionArgs) != 1 || versionArgs[0] != "version" {
		t.Fatalf("normal CLI invocation changed: %#v, browser=%v", versionArgs, browserInvocation)
	}
}

func TestDefaultBackendModeSupportsProcessOverride(t *testing.T) {
	t.Setenv("LOCALSUBS_BACKEND", " cpu ")
	if got := defaultBackendMode(); got != "cpu" {
		t.Fatalf("defaultBackendMode() = %q, want cpu", got)
	}
	t.Setenv("LOCALSUBS_BACKEND", "")
	if got := defaultBackendMode(); got != "auto" {
		t.Fatalf("defaultBackendMode() = %q, want auto", got)
	}
}

func TestDefaultFakeBackendRequiresExplicitE2EEnvironment(t *testing.T) {
	t.Setenv("LOCALSUBS_E2E_FAKE_BACKEND", "1")
	if !defaultFakeBackend() {
		t.Fatal("defaultFakeBackend() = false, want true")
	}
	t.Setenv("LOCALSUBS_E2E_FAKE_BACKEND", "true")
	if defaultFakeBackend() {
		t.Fatal("defaultFakeBackend() accepted a value other than 1")
	}
}
