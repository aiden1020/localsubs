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
