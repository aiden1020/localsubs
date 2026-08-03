package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"testing"
	"time"
)

const testModeEnvironment = "LOCALSUBS_TEST_MODE"

func TestMain(m *testing.M) {
	switch os.Getenv(testModeEnvironment) {
	case "version":
		fmt.Println("localsubs 9.8.7  api 1")
		os.Exit(0)
	case "llama-server":
		runFakeLlamaServerProcess()
		os.Exit(0)
	default:
		os.Exit(m.Run())
	}
}

func runFakeLlamaServerProcess() {
	port := ""
	for index, argument := range os.Args {
		if argument == "--port" && index+1 < len(os.Args) {
			port = os.Args[index+1]
			break
		}
	}
	if _, err := strconv.Atoi(port); err != nil {
		os.Exit(2)
	}
	if err := os.WriteFile(os.Getenv("LOCALSUBS_TEST_PORT_FILE"), []byte(port), 0o600); err != nil {
		os.Exit(2)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("/completion", func(writer http.ResponseWriter, _ *http.Request) {
		if delay, err := time.ParseDuration(os.Getenv("LOCALSUBS_TEST_COMPLETION_DELAY")); err == nil {
			time.Sleep(delay)
		}
		writer.Header().Set("Content-Type", "application/json")
		fmt.Fprint(writer, `{"content":"你好"}`)
	})
	if err := http.ListenAndServe("127.0.0.1:"+port, mux); err != nil {
		os.Exit(2)
	}
}

func makeTestHost(t *testing.T, root string) (binaryPath, hostPath string) {
	t.Helper()
	binaryName := "localsubs"
	if runtime.GOOS == "windows" {
		binaryName += ".exe"
	}
	binaryPath = filepath.Join(root, binaryName)
	if err := os.WriteFile(binaryPath, []byte("test helper"), 0o755); err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS == "windows" {
		return binaryPath, binaryPath
	}
	hostPath = filepath.Join(root, "launcher")
	launcherBody := "#!/bin/sh\nexec '" + binaryPath + "' native-host \"$@\"\n"
	if err := os.WriteFile(hostPath, []byte(launcherBody), 0o755); err != nil {
		t.Fatal(err)
	}
	return binaryPath, hostPath
}

func testExecutableName(name string) string {
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}
