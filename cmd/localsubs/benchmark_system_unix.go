//go:build !windows

package main

import (
	"os"
	"runtime"
)

func collectBenchmarkSystem() benchmarkSystem {
	return benchmarkSystem{
		OS: runtime.GOOS, Architecture: runtime.GOARCH,
		CPU: os.Getenv("PROCESSOR_IDENTIFIER"), LogicalProcessors: os.Getenv("NUMBER_OF_PROCESSORS"),
	}
}
