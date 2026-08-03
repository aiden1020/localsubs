package runtime

import (
	"fmt"
	"strings"
)

type BackendMode string

const (
	BackendAuto BackendMode = "auto"
	BackendCPU  BackendMode = "cpu"
	BackendCUDA BackendMode = "cuda"

	RuntimeReleaseVersion = "b10240"
)

type RuntimeCandidate struct {
	Backend BackendMode `json:"backend"`
	Path    string      `json:"path"`
}

type RuntimeAsset struct {
	Name      string `json:"name"`
	URL       string `json:"url"`
	SHA256    string `json:"sha256"`
	SizeBytes int64  `json:"sizeBytes"`
}

type RuntimeBundle struct {
	Version string         `json:"version"`
	Backend BackendMode    `json:"backend"`
	Assets  []RuntimeAsset `json:"assets"`
}

func ParseBackendMode(value string) (BackendMode, error) {
	mode := BackendMode(strings.ToLower(strings.TrimSpace(value)))
	if mode == "" {
		mode = BackendAuto
	}
	switch mode {
	case BackendAuto, BackendCPU, BackendCUDA:
		return mode, nil
	default:
		return "", fmt.Errorf("unsupported backend %q; use auto, cpu, or cuda", value)
	}
}

func DiscoverRuntimeCandidates(mode BackendMode) ([]RuntimeCandidate, error) {
	parsed, err := ParseBackendMode(string(mode))
	if err != nil {
		return nil, err
	}
	return platformRuntimeCandidates(parsed)
}

func RuntimeBundleForBackend(mode BackendMode) (RuntimeBundle, error) {
	if mode != BackendCPU && mode != BackendCUDA {
		return RuntimeBundle{}, fmt.Errorf("runtime download requires cpu or cuda backend")
	}
	return platformRuntimeBundle(mode)
}

func RuntimeInstallDir(mode BackendMode) string {
	return platformRuntimeInstallDir(mode)
}

func RuntimeExecutablePath(mode BackendMode) string {
	return platformRuntimeExecutablePath(mode)
}

func PreferredBackend() BackendMode {
	return platformPreferredBackend()
}

func ManagedRuntimeDownloads() bool {
	return platformManagedRuntimeDownloads()
}
