package main

import (
	"os"
	"path/filepath"
	"testing"

	"localsubs/internal/model"
	"localsubs/internal/nativehost"
	"localsubs/internal/runtime"
)

func TestAssembleLocalStatusRequiresEveryRuntimeComponent(t *testing.T) {
	native := nativehost.InstalledStatus{Installed: true, Valid: true}
	launcher := nativehost.LauncherStatus{Valid: true}
	helper := installedHelperStatus{Ready: true, Version: runtime.HelperVersion, APIVersion: runtime.APIVersion}
	runtimeStatus := localRuntimeStatus{Found: true, Path: "/usr/local/bin/llama-server"}
	modelStatus := model.Status{ID: "localsubs", Version: "test", State: "verified"}

	if status := assembleLocalStatus(native, launcher, helper, runtimeStatus, modelStatus); !status.Ready {
		t.Fatalf("expected ready status: %#v", status)
	}
	native.Valid = false
	if status := assembleLocalStatus(native, launcher, helper, runtimeStatus, modelStatus); status.Ready {
		t.Fatal("invalid native host must make LocalSubs not ready")
	}
	native.Valid = true
	launcher.Valid = false
	if status := assembleLocalStatus(native, launcher, helper, runtimeStatus, modelStatus); status.Ready {
		t.Fatal("invalid launcher must make LocalSubs not ready")
	}
	launcher.Valid = true
	helper.Ready = false
	if status := assembleLocalStatus(native, launcher, helper, runtimeStatus, modelStatus); status.Ready ||
		status.Command != "brew upgrade localsubs && localsubs install" {
		t.Fatalf("unexpected incompatible helper status: %#v", status)
	}
	helper.Ready = true
	runtimeStatus.Found = false
	if status := assembleLocalStatus(native, launcher, helper, runtimeStatus, modelStatus); status.Ready {
		t.Fatal("missing llama-server must make LocalSubs not ready")
	}
	runtimeStatus.Found = true
	modelStatus.State = "missing"
	if status := assembleLocalStatus(native, launcher, helper, runtimeStatus, modelStatus); status.Ready {
		t.Fatal("missing model must make LocalSubs not ready")
	}
}

func TestInspectHelperInstallationRejectsVersionMismatch(t *testing.T) {
	root := t.TempDir()
	binary := filepath.Join(root, "localsubs")
	if err := os.WriteFile(binary, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	launcherPath := filepath.Join(root, "launcher")
	launcherBody := "#!/bin/sh\nexec '" + binary + "' native-host \"$@\"\n"
	if err := os.WriteFile(launcherPath, []byte(launcherBody), 0o755); err != nil {
		t.Fatal(err)
	}
	launcher, helper := inspectHelperInstallation(nativehost.InstalledStatus{
		Valid: true, HostPath: launcherPath,
	}, func(string) (string, string, error) {
		return "0.1.0", runtime.APIVersion, nil
	})
	if !launcher.Valid || helper.Ready {
		t.Fatalf("expected valid launcher and incompatible helper: %#v %#v", launcher, helper)
	}
	if helper.Version != "0.1.0" || helper.Reason == "" {
		t.Fatalf("unexpected helper status: %#v", helper)
	}
}

func TestFindExecutableUsesProvidedNativeHostPath(t *testing.T) {
	dir := t.TempDir()
	binary := filepath.Join(dir, "llama-server")
	if err := os.WriteFile(binary, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	got, err := findExecutable(dir, "llama-server")
	if err != nil || got != binary {
		t.Fatalf("findExecutable() = %q, %v", got, err)
	}
	if _, err := findExecutable(t.TempDir(), "llama-server"); err == nil {
		t.Fatal("expected missing executable error")
	}
}
