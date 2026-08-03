//go:build windows

package runtime

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"localsubs/internal/config"
)

func platformRuntimeCandidates(mode BackendMode) ([]RuntimeCandidate, error) {
	backends := []BackendMode{mode}
	if mode == BackendAuto {
		backends = []BackendMode{BackendCUDA, BackendCPU}
	}
	candidates := make([]RuntimeCandidate, 0, len(backends)*3)
	seen := make(map[string]bool)
	add := func(backend BackendMode, path string) {
		if path == "" {
			return
		}
		absolute, err := filepath.Abs(path)
		if err != nil {
			return
		}
		info, err := os.Stat(absolute)
		if err != nil || info.IsDir() {
			return
		}
		key := strings.ToLower(filepath.Clean(absolute))
		if seen[key] {
			return
		}
		seen[key] = true
		candidates = append(candidates, RuntimeCandidate{Backend: backend, Path: absolute})
	}

	executable, _ := os.Executable()
	executableDir := filepath.Dir(executable)
	for _, backend := range backends {
		envName := "LOCALSUBS_LLAMA_SERVER_" + strings.ToUpper(string(backend))
		if override := strings.TrimSpace(os.Getenv(envName)); override != "" {
			add(backend, override)
			continue
		}
		add(backend, RuntimeExecutablePath(backend))
		add(backend, filepath.Join(executableDir, "runtime", string(backend), "llama-server.exe"))
	}
	if mode == BackendAuto || mode == BackendCPU {
		if path, err := exec.LookPath("llama-server.exe"); err == nil {
			add(BackendCPU, path)
		}
	}
	if len(candidates) == 0 {
		return nil, fmt.Errorf("no %s llama.cpp runtime is installed", mode)
	}
	return candidates, nil
}

func platformRuntimeInstallDir(mode BackendMode) string {
	return filepath.Join(config.RuntimeDir(), RuntimeReleaseVersion, string(mode))
}

func platformRuntimeExecutablePath(mode BackendMode) string {
	return filepath.Join(platformRuntimeInstallDir(mode), "llama-server.exe")
}

func platformPreferredBackend() BackendMode {
	nvidiaSMI, err := exec.LookPath("nvidia-smi.exe")
	if err == nil && exec.Command(nvidiaSMI, "-L").Run() == nil {
		return BackendCUDA
	}
	return BackendCPU
}

func platformManagedRuntimeDownloads() bool {
	return true
}

func platformRuntimeBundle(mode BackendMode) (RuntimeBundle, error) {
	bundle := RuntimeBundle{Version: RuntimeReleaseVersion, Backend: mode}
	switch mode {
	case BackendCPU:
		bundle.Assets = []RuntimeAsset{{
			Name:      "llama-b10240-bin-win-cpu-x64.zip",
			URL:       "https://github.com/ggml-org/llama.cpp/releases/download/b10240/llama-b10240-bin-win-cpu-x64.zip",
			SHA256:    "93ed3b520a31c1200f472080afd46ad99420707b87169f266f75a9aceab9e120",
			SizeBytes: 18383307,
		}}
	case BackendCUDA:
		bundle.Assets = []RuntimeAsset{
			{
				Name:      "llama-b10240-bin-win-cuda-12.4-x64.zip",
				URL:       "https://github.com/ggml-org/llama.cpp/releases/download/b10240/llama-b10240-bin-win-cuda-12.4-x64.zip",
				SHA256:    "4994ee0d3a66acaceb6cc7cfbff464536d74c805f6a9af3a44cdb926dcb0112f",
				SizeBytes: 250480686,
			},
			{
				Name:      "cudart-llama-bin-win-cuda-12.4-x64.zip",
				URL:       "https://github.com/ggml-org/llama.cpp/releases/download/b10240/cudart-llama-bin-win-cuda-12.4-x64.zip",
				SHA256:    "8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6",
				SizeBytes: 391443627,
			},
		}
	default:
		return RuntimeBundle{}, fmt.Errorf("unsupported Windows runtime backend %q", mode)
	}
	return bundle, nil
}
