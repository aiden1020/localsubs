//go:build !windows

package runtime

import (
	"fmt"
	"path/filepath"
	goruntime "runtime"

	"localsubs/internal/config"
)

func platformRuntimeCandidates(mode BackendMode) ([]RuntimeCandidate, error) {
	if mode == BackendCUDA {
		return nil, fmt.Errorf("CUDA runtime is currently supported on Windows only")
	}
	if mode == BackendMetal && goruntime.GOOS != "darwin" {
		return nil, fmt.Errorf("Metal runtime is supported on macOS only")
	}
	path, err := platformResolveExecutable("llama-server")
	if err != nil {
		return nil, err
	}
	backend := BackendCPU
	if mode == BackendMetal {
		backend = BackendMetal
	}
	return []RuntimeCandidate{{Backend: backend, Path: path}}, nil
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
