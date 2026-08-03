//go:build windows

package main

import (
	"os"
	"os/exec"
	"runtime"
	"strings"
)

func collectBenchmarkSystem() benchmarkSystem {
	system := benchmarkSystem{
		OS: runtime.GOOS, Architecture: runtime.GOARCH,
		CPU: os.Getenv("PROCESSOR_IDENTIFIER"), LogicalProcessors: os.Getenv("NUMBER_OF_PROCESSORS"),
	}
	output, err := exec.Command("nvidia-smi.exe", "--query-gpu=name,driver_version", "--format=csv,noheader").Output()
	if err == nil {
		fields := strings.SplitN(strings.TrimSpace(string(output)), ",", 2)
		if len(fields) > 0 {
			system.GPU = strings.TrimSpace(fields[0])
		}
		if len(fields) > 1 {
			system.NVIDIADriver = strings.TrimSpace(fields[1])
		}
	}
	return system
}
