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

type installedHelperStatus struct {
	Ready      bool   `json:"ready"`
	Path       string `json:"path,omitempty"`
	Version    string `json:"version,omitempty"`
	APIVersion string `json:"apiVersion,omitempty"`
	Reason     string `json:"reason,omitempty"`
}

type localStatus struct {
	Ready                 bool                       `json:"ready"`
	Command               string                     `json:"command,omitempty"`
	APIVersion            string                     `json:"apiVersion"`
	HelperVersion         string                     `json:"helperVersion"`
	ExpectedHelperVersion string                     `json:"expectedHelperVersion"`
	NativeHost            nativehost.InstalledStatus `json:"nativeHost"`
	Launcher              nativehost.LauncherStatus  `json:"launcher"`
	InstalledHelper       installedHelperStatus      `json:"installedHelper"`
	Runtime               localRuntimeStatus         `json:"runtime"`
	Model                 model.Status               `json:"model"`
}

type readinessSnapshot struct {
	NativeHost         nativehost.InstalledStatus
	Runtime            localRuntimeStatus
	Model              model.Status
	Manifest           model.Manifest
	ModelEntry         model.Entry
	ManifestErr        error
	ModelEntryOK       bool
	NativeDurationMS   int64
	RuntimeDurationMS  int64
	ManifestDurationMS int64
	ModelDurationMS    int64
}

type helperInstallationInspection struct {
	Launcher         nativehost.LauncherStatus
	LauncherDuration int64
	Version          string
	APIVersion       string
	ProbeErr         error
	ProbeDuration    int64
}

func modelStateReady(state string) bool {
	return state == "ready" || state == "verified"
}

func collectReadiness(homeDir, browser, extensionID string) readinessSnapshot {
	snapshot := readinessSnapshot{Model: model.Status{
		State: "incompatible", Reason: "embedded model manifest is invalid",
	}}
	started := time.Now()
	snapshot.NativeHost = nativehost.InspectInstalledForExtension(homeDir, browser, extensionID)
	snapshot.NativeDurationMS = time.Since(started).Milliseconds()

	started = time.Now()
	llamaPath, llamaErr := findExecutable(config.NativeHostBasePath, "llama-server")
	snapshot.Runtime = localRuntimeStatus{Found: llamaErr == nil, Path: llamaPath}
	snapshot.RuntimeDurationMS = time.Since(started).Milliseconds()

	started = time.Now()
	snapshot.Manifest, snapshot.ManifestErr = model.ParseManifest(manifest.Data)
	snapshot.ManifestDurationMS = time.Since(started).Milliseconds()
	if snapshot.ManifestErr == nil {
		snapshot.ModelEntry, snapshot.ModelEntryOK = snapshot.Manifest.Entry("")
		if snapshot.ModelEntryOK {
			entry := snapshot.ModelEntry
			entry.Path = resolveModelPath(entry.Path)
			snapshot.ModelEntry = entry
			started = time.Now()
			snapshot.Model = model.Check(entry)
			snapshot.ModelDurationMS = time.Since(started).Milliseconds()
		}
	}
	return snapshot
}

func collectLocalStatus(homeDir, browser, extensionID string) localStatus {
	snapshot := collectReadiness(homeDir, browser, extensionID)
	launcher, helper := inspectHelperInstallation(snapshot.NativeHost, probeHelperVersion)
	return assembleLocalStatus(snapshot.NativeHost, launcher, helper, snapshot.Runtime, snapshot.Model)
}

func inspectHelperInstallation(
	nativeStatus nativehost.InstalledStatus,
	probe helperVersionProbe,
) (nativehost.LauncherStatus, installedHelperStatus) {
	if probe == nil {
		probe = probeHelperVersion
	}
	inspection := inspectInstalledHelper(nativeStatus, probe)
	launcher := inspection.Launcher
	helper := installedHelperStatus{}
	if !nativeStatus.Valid {
		helper.Reason = "Chrome integration is not installed"
		return launcher, helper
	}
	if !launcher.Valid {
		helper.Reason = launcher.Reason
		return launcher, helper
	}
	helper.Path = launcher.BinaryPath
	if inspection.ProbeErr != nil {
		helper.Reason = inspection.ProbeErr.Error()
		return launcher, helper
	}
	helper.Version = inspection.Version
	helper.APIVersion = inspection.APIVersion
	if inspection.Version != runtime.HelperVersion {
		helper.Reason = fmt.Sprintf("helper %s is installed; %s is required", inspection.Version, runtime.HelperVersion)
		return launcher, helper
	}
	if inspection.APIVersion != runtime.APIVersion {
		helper.Reason = fmt.Sprintf("helper API %s is incompatible with API %s", inspection.APIVersion, runtime.APIVersion)
		return launcher, helper
	}
	helper.Ready = true
	return launcher, helper
}

func inspectInstalledHelper(
	nativeStatus nativehost.InstalledStatus,
	probe helperVersionProbe,
) helperInstallationInspection {
	inspection := helperInstallationInspection{
		Launcher: nativehost.LauncherStatus{Path: nativeStatus.HostPath},
	}
	if !nativeStatus.Valid {
		return inspection
	}

	started := time.Now()
	inspection.Launcher = nativehost.InspectLauncher(nativeStatus.HostPath)
	inspection.LauncherDuration = time.Since(started).Milliseconds()
	if !inspection.Launcher.Valid {
		return inspection
	}

	started = time.Now()
	inspection.Version, inspection.APIVersion, inspection.ProbeErr = probe(inspection.Launcher.BinaryPath)
	inspection.ProbeDuration = time.Since(started).Milliseconds()
	return inspection
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
	launcherStatus nativehost.LauncherStatus,
	helperStatus installedHelperStatus,
	runtimeStatus localRuntimeStatus,
	modelStatus model.Status,
) localStatus {
	modelReady := modelStateReady(modelStatus.State)
	status := localStatus{
		Ready:                 nativeStatus.Valid && launcherStatus.Valid && helperStatus.Ready && runtimeStatus.Found && modelReady,
		APIVersion:            runtime.APIVersion,
		HelperVersion:         helperStatus.Version,
		ExpectedHelperVersion: runtime.HelperVersion,
		NativeHost:            nativeStatus,
		Launcher:              launcherStatus,
		InstalledHelper:       helperStatus,
		Runtime:               runtimeStatus,
		Model:                 modelStatus,
	}
	status.Command = localStatusFix(status)
	return status
}

func printLocalStatusHuman(status localStatus) {
	state := ui.OK("Ready")
	if !status.Ready {
		state = ui.Fail("Needs attention")
	}
	fmt.Printf("%s  %s\n\n", ui.Bold("LocalSubs"), state)

	if status.NativeHost.Valid && status.Launcher.Valid {
		ui.PrintRow("Chrome", ui.OK("integration ready"))
		ui.PrintHint(ui.CompactPath(status.NativeHost.ManifestPath))
	} else {
		ui.PrintRow("Chrome", ui.Fail("integration unavailable"))
		reason := status.NativeHost.Reason
		if status.NativeHost.Valid && status.Launcher.Reason != "" {
			reason = status.Launcher.Reason
		}
		ui.PrintHint(reason)
	}
	if status.InstalledHelper.Ready {
		ui.PrintRow("Helper", ui.OK("v"+status.InstalledHelper.Version+" · API "+status.InstalledHelper.APIVersion))
		ui.PrintHint(ui.CompactPath(status.InstalledHelper.Path))
	} else {
		ui.PrintRow("Helper", ui.Fail("unavailable"))
		ui.PrintHint(status.InstalledHelper.Reason)
	}
	if status.Runtime.Found {
		ui.PrintRow("Runtime", ui.OK("llama.cpp available"))
		ui.PrintHint(ui.CompactPath(status.Runtime.Path))
	} else {
		ui.PrintRow("Runtime", ui.Fail("llama.cpp unavailable"))
	}
	modelText := status.Model.ID + "  " + ui.Dim(status.Model.Version)
	if modelStateReady(status.Model.State) {
		modelText += "  " + ui.OK(status.Model.State)
	} else {
		modelText += "  " + ui.Fail(status.Model.State)
	}
	ui.PrintRow("Model", modelText)
	if status.Model.Reason != "" && status.Model.State != "verified" {
		ui.PrintHint(status.Model.Reason)
	}
	if fix := localStatusFix(status); fix != "" {
		ui.PrintBlank()
		fmt.Println(ui.Bold("Fix:"))
		fmt.Println("  " + fix)
	} else {
		ui.PrintBlank()
		fmt.Println(ui.Dim("The model starts automatically when Chrome requests a translation."))
	}
}

func localStatusFix(status localStatus) string {
	switch {
	case !status.NativeHost.Valid || !status.Launcher.Valid:
		return "localsubs install --browser " + status.NativeHost.Browser
	case !status.InstalledHelper.Ready:
		return "brew upgrade localsubs && localsubs install"
	case !status.Runtime.Found:
		return "brew install llama.cpp"
	case !modelStateReady(status.Model.State):
		return "localsubs model download"
	default:
		return ""
	}
}

func statusHTTP(baseURL string, jsonMode bool) error {
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(strings.TrimRight(baseURL, "/") + "/health")
	if err != nil {
		if jsonMode {
			return writeStatusJSONError(
				"helper_unreachable", "Helper is not reachable", err.Error(), "localsubs doctor",
			)
		}
		fmt.Printf("%s  %s\n\n", ui.Bold("LocalSubs Service"), ui.Fail("Needs attention"))
		ui.PrintRow("Helper", ui.Fail("unreachable"))
		ui.PrintHint(err.Error())
		ui.PrintBlank()
		fmt.Println(ui.Bold("Next:"))
		fmt.Println("  localsubs doctor")
		return silentError{fmt.Errorf("helper not reachable: %w", err)}
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		message := fmt.Sprintf("helper returned HTTP %d", resp.StatusCode)
		if jsonMode {
			return writeStatusJSONError(
				"helper_http_error", "Helper returned an error", message, "localsubs doctor",
			)
		}
		ui.PrintRow("Helper", ui.Fail("not ready"))
		ui.PrintHint(message)
		return silentError{fmt.Errorf("%s", message)}
	}

	var health runtime.Health
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		if jsonMode {
			return writeStatusJSONError(
				"invalid_helper_response", "Helper returned an invalid response", err.Error(), "localsubs doctor",
			)
		}
		return err
	}
	if jsonMode {
		if err := json.NewEncoder(os.Stdout).Encode(health); err != nil {
			return err
		}
		if !health.OK {
			return silentError{fmt.Errorf("helper is not ready")}
		}
		return nil
	}
	printStatusHuman(health, baseURL)
	if !health.OK {
		return silentError{fmt.Errorf("helper is not ready")}
	}
	return nil
}

func writeStatusJSONError(code, message, detail, command string) error {
	payload := struct {
		OK    bool `json:"ok"`
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
			Detail  string `json:"detail,omitempty"`
			Command string `json:"command,omitempty"`
		} `json:"error"`
	}{}
	payload.Error.Code = code
	payload.Error.Message = message
	payload.Error.Detail = detail
	payload.Error.Command = command
	if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {
		return err
	}
	return silentError{fmt.Errorf("%s", message)}
}
