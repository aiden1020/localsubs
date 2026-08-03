//go:build windows

package runtime

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func platformResolveExecutable(binary string) (string, error) {
	if path, err := exec.LookPath(binary); err == nil {
		return path, nil
	}
	if binary != "llama-server" && binary != "llama-server.exe" {
		return "", fmt.Errorf("%s not found", binary)
	}
	executable, err := os.Executable()
	if err == nil {
		root := filepath.Dir(executable)
		for _, candidate := range []string{
			filepath.Join(root, "runtime", "cpu", "llama-server.exe"),
			filepath.Join(root, "runtime", "cuda", "llama-server.exe"),
			filepath.Join(root, "runtime", "llama-server.exe"),
			filepath.Join(root, "llama-server.exe"),
		} {
			if info, statErr := os.Stat(candidate); statErr == nil && !info.IsDir() {
				return candidate, nil
			}
		}
	}
	return "", fmt.Errorf("llama-server.exe not found; reinstall LocalSubs or provide a runtime path")
}
