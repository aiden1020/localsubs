//go:build windows

package runtime

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWindowsRuntimeEnvironmentPathOverridesManagedBackend(t *testing.T) {
	override := filepath.Join(t.TempDir(), "failing-cuda.exe")
	if err := os.WriteFile(override, []byte("test"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("LOCALSUBS_LLAMA_SERVER_CUDA", override)
	candidates, err := DiscoverRuntimeCandidates(BackendAuto)
	if err != nil {
		t.Fatal(err)
	}
	var cudaPaths []string
	for _, candidate := range candidates {
		if candidate.Backend == BackendCUDA {
			cudaPaths = append(cudaPaths, candidate.Path)
		}
	}
	if len(cudaPaths) != 1 || !strings.EqualFold(cudaPaths[0], override) {
		t.Fatalf("CUDA candidates = %#v, want only override %q", cudaPaths, override)
	}
}
