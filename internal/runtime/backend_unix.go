//go:build !windows

package runtime

import (
	"fmt"
	"path/filepath"

	"localsubs/internal/config"
)

func platformRuntimeCandidates(mode BackendMode) ([]RuntimeCandidate, error) {
	if mode == BackendCUDA {
		return nil, fmt.Errorf("CUDA runtime is currently supported on Windows only")
	}
	path, err := platformResolveExecutable("llama-server")
	if err != nil {
		return nil, err
	}
	return []RuntimeCandidate{{Backend: BackendCPU, Path: path}}, nil
}

func platformRuntimeInstallDir(mode BackendMode) string {
	return filepath.Join(config.RuntimeDir(), RuntimeReleaseVersion, string(mode))
}

func platformRuntimeExecutablePath(mode BackendMode) string {
	return filepath.Join(platformRuntimeInstallDir(mode), "llama-server")
}

func platformPreferredBackend() BackendMode {
	return BackendCPU
}

func platformManagedRuntimeDownloads() bool {
	return false
}

func platformRuntimeBundle(mode BackendMode) (RuntimeBundle, error) {
	return RuntimeBundle{}, fmt.Errorf("managed %s runtime downloads are currently supported on Windows only", mode)
}
