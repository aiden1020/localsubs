package main

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"localsubs/internal/diagnostics"
	"localsubs/internal/model"
	"localsubs/internal/nativehost"
	"localsubs/internal/runtime"
)

func TestBuildDoctorReportReady(t *testing.T) {
	root := t.TempDir()
	modelDir := filepath.Join(root, "models")
	logDir := filepath.Join(root, "logs")
	for _, directory := range []string{modelDir, logDir} {
		if err := os.MkdirAll(directory, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	_, launcher := makeTestHost(t, root)
	snapshot := readinessSnapshot{
		NativeHost: nativehost.InstalledStatus{
			Browser: "chrome", Installed: true, Valid: true,
			ManifestPath: filepath.Join(root, "manifest.json"),
			HostPath:     launcher,
		},
		Runtime:      localRuntimeStatus{Found: true, Path: "/opt/homebrew/bin/llama-server"},
		Manifest:     model.Manifest{SchemaVersion: 1},
		ModelEntry:   model.Entry{ID: "localsubs", Version: "test"},
		ModelEntryOK: true,
		Model:        model.Status{State: "verified", Path: filepath.Join(modelDir, "model.gguf")},
	}
	report := buildDoctorReport(snapshot, "chrome", "extension", doctorDependencies{
		ProbeVersion: func(string) (string, string, error) {
			return runtime.HelperVersion, runtime.APIVersion, nil
		},
		ModelDir: modelDir,
		LogDir:   logDir,
	})
	if !report.Ready || report.Summary.Failed != 0 {
		t.Fatalf("expected ready report: %#v", report)
	}
	if report.Summary.Passed != 8 {
		t.Fatalf("passed checks = %d, want 8", report.Summary.Passed)
	}
}

func TestBuildDoctorReportFailsRequiredChecksAndSkipsDependents(t *testing.T) {
	root := t.TempDir()
	snapshot := readinessSnapshot{
		NativeHost: nativehost.InstalledStatus{
			Browser: "chrome", Reason: "manifest missing",
		},
		Model:       model.Status{State: "incompatible"},
		ManifestErr: errors.New("invalid manifest"),
	}
	report := buildDoctorReport(snapshot, "chrome", "extension", doctorDependencies{
		ProbeVersion: func(string) (string, string, error) {
			t.Fatal("version probe must be skipped")
			return "", "", nil
		},
		ModelDir: filepath.Join(root, "models"),
		LogDir:   filepath.Join(root, "logs"),
	})
	if report.Ready {
		t.Fatal("required failures must make report unready")
	}
	if report.Summary.Failed != 3 {
		t.Fatalf("failed checks = %d, want 3: %#v", report.Summary.Failed, report)
	}
	if report.Summary.Skipped != 3 {
		t.Fatalf("skipped checks = %d, want 3: %#v", report.Summary.Skipped, report)
	}
	if report.Summary.Warnings != 2 {
		t.Fatalf("warnings = %d, want 2: %#v", report.Summary.Warnings, report)
	}
}

func TestProbeHelperVersion(t *testing.T) {
	t.Setenv(testModeEnvironment, "version")
	version, apiVersion, err := probeHelperVersion(os.Args[0])
	if err != nil {
		t.Fatal(err)
	}
	if version != "9.8.7" || apiVersion != "1" {
		t.Fatalf("unexpected version response: %s, %s", version, apiVersion)
	}
}

func TestDoctorReportJSONSchema(t *testing.T) {
	report := buildDoctorReport(readinessSnapshot{
		NativeHost:  nativehost.InstalledStatus{Browser: "chrome", Reason: "manifest missing"},
		ManifestErr: errors.New("invalid manifest"),
	}, "chrome", "extension", doctorDependencies{
		ModelDir: filepath.Join(t.TempDir(), "models"),
		LogDir:   filepath.Join(t.TempDir(), "logs"),
	})
	body, err := json.Marshal(report)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(body, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded["schemaVersion"] != float64(1) {
		t.Fatalf("schemaVersion = %#v, want 1", decoded["schemaVersion"])
	}
	if decoded["ready"] != false {
		t.Fatalf("ready = %#v, want false", decoded["ready"])
	}
	if decoded["deep"] != false {
		t.Fatalf("deep = %#v, want false", decoded["deep"])
	}
	results, ok := decoded["results"].([]any)
	if !ok || len(results) != 8 {
		t.Fatalf("results = %#v, want 8 checks", decoded["results"])
	}
}

func TestAddDeepDiagnosticSkipsWithoutPrerequisites(t *testing.T) {
	report := diagnostics.NewReport(runtime.APIVersion, runtime.HelperVersion, "chrome", "extension")
	called := false
	addDeepDiagnostic(&report, readinessSnapshot{}, time.Second, func(
		context.Context,
		readinessSnapshot,
		time.Duration,
	) diagnostics.Result {
		called = true
		return diagnostics.Result{}
	})
	if called {
		t.Fatal("deep probe must not run without its prerequisites")
	}
	if report.Summary.Skipped != 1 || report.Results[0].ID != "inference_probe" {
		t.Fatalf("unexpected report: %#v", report)
	}
}

func TestAddDeepDiagnosticFailureMakesReportUnready(t *testing.T) {
	report := diagnostics.NewReport(runtime.APIVersion, runtime.HelperVersion, "chrome", "extension")
	snapshot := readinessSnapshot{
		Runtime:      localRuntimeStatus{Found: true, Path: "/tmp/llama-server"},
		ModelEntryOK: true,
		Model:        model.Status{State: "verified", Path: "/tmp/model.gguf"},
	}
	addDeepDiagnostic(&report, snapshot, time.Second, func(
		context.Context,
		readinessSnapshot,
		time.Duration,
	) diagnostics.Result {
		return diagnostics.Result{
			ID: "inference_probe", Status: diagnostics.StatusFail,
		}
	})
	if report.Ready || report.Summary.Failed != 1 {
		t.Fatalf("deep failure must make report unready: %#v", report)
	}
}

func TestRunDeepInferenceProbeStartsAndStopsBackend(t *testing.T) {
	launcher, portFile := prepareFakeLlamaServer(t)

	result := runDeepInferenceProbe(context.Background(), readinessSnapshot{
		Runtime: localRuntimeStatus{Found: true, Path: launcher},
		Model:   model.Status{State: "verified", Path: filepath.Join(t.TempDir(), "model.gguf")},
	}, 5*time.Second)
	if result.Status != diagnostics.StatusPass {
		t.Fatalf("deep probe failed: %#v", result)
	}
	portBody, err := os.ReadFile(portFile)
	if err != nil {
		t.Fatal(err)
	}
	connection, err := net.DialTimeout("tcp", "127.0.0.1:"+string(portBody), 200*time.Millisecond)
	if err == nil {
		connection.Close()
		t.Fatal("deep probe left its temporary llama-server running")
	}
}

func TestRunDeepInferenceProbeTimesOut(t *testing.T) {
	launcher, _ := prepareFakeLlamaServer(t)
	t.Setenv("LOCALSUBS_TEST_COMPLETION_DELAY", "2s")
	const timeout = 500 * time.Millisecond
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	result := runDeepInferenceProbe(ctx, readinessSnapshot{
		Runtime: localRuntimeStatus{Found: true, Path: launcher},
		Model:   model.Status{State: "verified", Path: filepath.Join(t.TempDir(), "model.gguf")},
	}, timeout)
	if result.Status != diagnostics.StatusFail || result.Detail != "deep check timed out after 500ms" {
		t.Fatalf("unexpected timeout result: %#v", result)
	}
}

func prepareFakeLlamaServer(t *testing.T) (string, string) {
	t.Helper()
	t.Setenv(testModeEnvironment, "llama-server")
	portFile := filepath.Join(t.TempDir(), "port")
	t.Setenv("LOCALSUBS_TEST_PORT_FILE", portFile)
	return os.Args[0], portFile
}
