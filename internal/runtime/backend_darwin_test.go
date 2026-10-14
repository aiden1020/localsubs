//go:build darwin

package runtime

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDarwinDiscoversMetalRuntime(t *testing.T) {
	binDir := t.TempDir()
	runtimePath := filepath.Join(binDir, "llama-server")
	if err := os.WriteFile(runtimePath, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", binDir)

	candidates, err := DiscoverRuntimeCandidates(BackendMetal)
	if err != nil {
		t.Fatal(err)
	}
	if len(candidates) != 1 || candidates[0].Backend != BackendMetal || candidates[0].Path != runtimePath {
		t.Fatalf("Metal candidates = %#v, want %q", candidates, runtimePath)
	}
}

func TestDarwinAutoBackendRemainsCPU(t *testing.T) {
	binDir := t.TempDir()
	runtimePath := filepath.Join(binDir, "llama-server")
	if err := os.WriteFile(runtimePath, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", binDir)

	candidates, err := DiscoverRuntimeCandidates(BackendAuto)
	if err != nil {
		t.Fatal(err)
	}
	if len(candidates) != 1 || candidates[0].Backend != BackendCPU {
		t.Fatalf("auto candidates = %#v, want CPU compatibility default", candidates)
	}
}
