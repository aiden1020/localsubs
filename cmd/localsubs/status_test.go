package main

import (
	"os"
	"path/filepath"
	"testing"

	"localsubs/internal/model"
	"localsubs/internal/nativehost"
)

func TestAssembleLocalStatusRequiresEveryRuntimeComponent(t *testing.T) {
	native := nativehost.InstalledStatus{Installed: true, Valid: true}
	runtimeStatus := localRuntimeStatus{Found: true, Path: "/usr/local/bin/llama-server"}
	modelStatus := model.Status{ID: "localsubs", Version: "test", State: "verified"}

	if status := assembleLocalStatus(native, runtimeStatus, modelStatus); !status.Ready {
		t.Fatalf("expected ready status: %#v", status)
	}
	native.Valid = false
	if status := assembleLocalStatus(native, runtimeStatus, modelStatus); status.Ready {
		t.Fatal("invalid native host must make LocalSubs not ready")
	}
	native.Valid = true
	runtimeStatus.Found = false
	if status := assembleLocalStatus(native, runtimeStatus, modelStatus); status.Ready {
		t.Fatal("missing llama-server must make LocalSubs not ready")
	}
	runtimeStatus.Found = true
	modelStatus.State = "missing"
	if status := assembleLocalStatus(native, runtimeStatus, modelStatus); status.Ready {
		t.Fatal("missing model must make LocalSubs not ready")
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
