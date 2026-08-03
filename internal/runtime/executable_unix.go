//go:build !windows

package runtime

import (
	"fmt"
	"os"
	"os/exec"
)

func platformResolveExecutable(binary string) (string, error) {
	if path, err := exec.LookPath(binary); err == nil {
		return path, nil
	}
	if binary != "llama-server" {
		return "", fmt.Errorf("%s not found on PATH", binary)
	}
	for _, candidate := range []string{
		"/opt/homebrew/bin/llama-server",
		"/usr/local/bin/llama-server",
	} {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("llama-server not found; install it with `brew install llama.cpp`")
}
