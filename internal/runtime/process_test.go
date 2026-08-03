package runtime

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"
)

const exitBeforeReadyEnvironment = "LOCALSUBS_TEST_EXIT_BEFORE_READY"

func TestMain(m *testing.M) {
	if os.Getenv(exitBeforeReadyEnvironment) == "1" {
		os.Exit(17)
	}
	os.Exit(m.Run())
}

func TestLlamaServerCommandArgsOmitNilCacheReuse(t *testing.T) {
	cmd := LlamaServerCommand{
		Model:   "model.gguf",
		Host:    "127.0.0.1",
		Port:    8766,
		Profile: DefaultProfile(),
	}
	args := cmd.Args()
	for _, arg := range args {
		if arg == "--cache-reuse" {
			t.Fatal("nil cache reuse should omit --cache-reuse")
		}
	}
}

func TestLlamaServerCommandArgsIncludeCacheReuseWhenSet(t *testing.T) {
	reuse := 4
	profile := DefaultProfile()
	profile.CacheReuse = &reuse
	cmd := LlamaServerCommand{
		Model:   "model.gguf",
		Host:    "127.0.0.1",
		Port:    8766,
		Profile: profile,
	}
	args := cmd.Args()
	found := false
	for i := 0; i < len(args)-1; i++ {
		if args[i] == "--cache-reuse" && args[i+1] == "4" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected cache reuse args in %#v", args)
	}
}

func TestStartManagedBackendReportsEarlyProcessExit(t *testing.T) {
	t.Setenv(exitBeforeReadyEnvironment, "1")
	started := time.Now()
	_, err := StartManagedBackend(context.Background(), LlamaServerCommand{
		Binary: os.Args[0], Host: "127.0.0.1", Port: 1, Profile: DefaultProfile(),
	}, 10*time.Second)
	if err == nil || !strings.Contains(err.Error(), "exited before becoming ready") {
		t.Fatalf("StartManagedBackend() error = %v, want early-exit diagnostic", err)
	}
	if elapsed := time.Since(started); elapsed > 3*time.Second {
		t.Fatalf("early process exit took %s to report", elapsed)
	}
}
