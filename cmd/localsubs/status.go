package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"localsubs/internal/config"
	"localsubs/internal/manifest"
	"localsubs/internal/model"
	"localsubs/internal/nativehost"
	"localsubs/internal/runtime"
	"localsubs/internal/ui"
)

type localRuntimeStatus struct {
	Found bool   `json:"found"`
	Path  string `json:"path,omitempty"`
}

type localStatus struct {
	Ready         bool                       `json:"ready"`
	APIVersion    string                     `json:"apiVersion"`
	HelperVersion string                     `json:"helperVersion"`
	NativeHost    nativehost.InstalledStatus `json:"nativeHost"`
	Runtime       localRuntimeStatus         `json:"runtime"`
	Model         model.Status               `json:"model"`
}

func collectLocalStatus(homeDir, browser, extensionID string) localStatus {
	nativeStatus := nativehost.InspectInstalledForExtension(homeDir, browser, extensionID)
	llamaPath, llamaErr := findExecutable(config.NativeHostBasePath, "llama-server")
	runtimeStatus := localRuntimeStatus{Found: llamaErr == nil, Path: llamaPath}

	modelStatus := model.Status{State: "incompatible", Reason: "embedded model manifest is invalid"}
	if parsed, err := model.ParseManifest(manifest.Data); err == nil {
		if entry, ok := parsed.Entry(""); ok {
			entry.Path = resolveModelPath(entry.Path)
			modelStatus = model.Check(entry)
		}
	}
	return assembleLocalStatus(nativeStatus, runtimeStatus, modelStatus)
}

func findExecutable(searchPath, name string) (string, error) {
	for _, directory := range filepath.SplitList(searchPath) {
		candidate := filepath.Join(directory, name)
		info, err := os.Stat(candidate)
		if err == nil && !info.IsDir() && info.Mode().Perm()&0o111 != 0 {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("%s not found in native host PATH", name)
}

func assembleLocalStatus(
	nativeStatus nativehost.InstalledStatus,
	runtimeStatus localRuntimeStatus,
	modelStatus model.Status,
) localStatus {
	modelReady := modelStatus.State == "ready" || modelStatus.State == "verified"
	return localStatus{
		Ready:         nativeStatus.Valid && runtimeStatus.Found && modelReady,
		APIVersion:    runtime.APIVersion,
		HelperVersion: runtime.HelperVersion,
		NativeHost:    nativeStatus,
		Runtime:       runtimeStatus,
		Model:         modelStatus,
	}
}

func printLocalStatusHuman(status localStatus) {
	if status.NativeHost.Valid {
		ui.PrintRow("Helper", ui.OK("installed on demand"))
		ui.PrintHint(status.NativeHost.ManifestPath)
	} else {
		ui.PrintRow("Helper", ui.Fail("not ready"))
		ui.PrintHint(status.NativeHost.Reason)
	}
	ui.PrintRow("API", fmt.Sprintf("v%s  ·  helper %s", status.APIVersion, status.HelperVersion))
	if status.Runtime.Found {
		ui.PrintRow("Runtime", ui.OK("llama-server found"))
		ui.PrintHint(status.Runtime.Path)
	} else {
		ui.PrintRow("Runtime", ui.Fail("llama-server not found"))
	}
	modelText := status.Model.ID + "  " + ui.Dim(status.Model.Version)
	if status.Model.State == "ready" || status.Model.State == "verified" {
		modelText += "  " + ui.OK(status.Model.State)
	} else {
		modelText += "  " + ui.Fail(status.Model.State)
	}
	ui.PrintRow("Model", modelText)
	if status.Model.Reason != "" && status.Model.State != "verified" {
		ui.PrintHint(status.Model.Reason)
	}
}

func statusHTTP(baseURL string, jsonMode bool) error {
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(strings.TrimRight(baseURL, "/") + "/health")
	if err != nil {
		if jsonMode {
			return fmt.Errorf("helper not reachable: %w", err)
		}
		ui.PrintRow("Helper", ui.Fail("not running"))
		ui.PrintHint(err.Error())
		return silentError{fmt.Errorf("helper not reachable: %w", err)}
	}
	defer resp.Body.Close()

	var health runtime.Health
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		return err
	}
	if jsonMode {
		return json.NewEncoder(os.Stdout).Encode(health)
	}
	printStatusHuman(health, baseURL)
	return nil
}
