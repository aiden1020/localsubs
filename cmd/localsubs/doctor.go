package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"localsubs/internal/config"
	"localsubs/internal/diagnostics"
	"localsubs/internal/nativehost"
	"localsubs/internal/runtime"
	"localsubs/internal/ui"
)

type helperVersionProbe func(string) (string, string, error)
type deepInferenceProbe func(context.Context, readinessSnapshot, time.Duration) diagnostics.Result

type doctorDependencies struct {
	ProbeVersion helperVersionProbe
	ModelDir     string
	LogDir       string
}

func doctor(args []string) error {
	flags := flag.NewFlagSet("doctor", flag.ContinueOnError)
	jsonMode := flags.Bool("json", false, "output a structured diagnostic report")
	deep := flags.Bool("deep", false, "start llama-server and run a test inference")
	timeout := flags.Duration("timeout", 90*time.Second, "maximum duration for a deep diagnostic")
	browser := flags.String("browser", "chrome", "browser installation to inspect")
	extensionID := flags.String("extension-id", config.DefaultExtensionID, "extension ID expected to connect")
	if err := parseFlags(flags, args); err != nil {
		return err
	}
	if *timeout <= 0 {
		return fmt.Errorf("doctor timeout must be greater than zero")
	}
	homeDir, _ := os.UserHomeDir()
	snapshot := collectReadiness(homeDir, *browser, *extensionID)
	report := buildDoctorReport(snapshot, *browser, *extensionID, doctorDependencies{
		ProbeVersion: probeHelperVersion,
		ModelDir:     filepath.Join(config.AppDataDir(), "models"),
		LogDir:       config.LogDir(),
	})
	if *deep {
		report.Deep = true
		addDeepDiagnostic(&report, snapshot, *timeout, runDeepInferenceProbe)
	}

	if *jsonMode {
		if err := json.NewEncoder(os.Stdout).Encode(report); err != nil {
			return err
		}
	} else {
		printDoctorReport(report)
	}
	if !report.Ready {
		return silentError{fmt.Errorf("LocalSubs diagnostics failed")}
	}
	return nil
}

func addDeepDiagnostic(
	report *diagnostics.Report,
	snapshot readinessSnapshot,
	timeout time.Duration,
	probe deepInferenceProbe,
) {
	if !snapshot.Runtime.Found || snapshot.ManifestErr != nil || !snapshot.ModelEntryOK ||
		!modelStateReady(snapshot.Model.State) {
		report.Add(diagnostics.Result{
			ID: "inference_probe", Category: "Deep check", Label: "Test inference",
			Status: diagnostics.StatusSkip, Detail: "runtime and verified model are required",
		})
		return
	}
	if probe == nil {
		probe = runDeepInferenceProbe
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	report.Add(probe(ctx, snapshot, timeout))
}

func runDeepInferenceProbe(
	ctx context.Context,
	snapshot readinessSnapshot,
	timeout time.Duration,
) (result diagnostics.Result) {
	startedAt := time.Now()
	result = diagnostics.Result{
		ID: "inference_probe", Category: "Deep check", Label: "Test inference",
		Status:      diagnostics.StatusFail,
		Remediation: "localsubs doctor && localsubs logs",
	}
	defer func() {
		result.DurationMS = time.Since(startedAt).Milliseconds()
	}()

	port, err := runtime.AllocateLocalPort()
	if err != nil {
		result.Detail = "could not allocate a local port: " + err.Error()
		return result
	}
	profile := runtime.DefaultProfile()
	profile.ModelPath = snapshot.Model.Path
	backend, err := runtime.StartManagedBackend(ctx, runtime.LlamaServerCommand{
		Binary:  snapshot.Runtime.Path,
		Model:   profile.ModelPath,
		Host:    "127.0.0.1",
		Port:    port,
		Profile: profile,
	}, timeout)
	if err != nil {
		result.Detail = "llama-server startup failed: " + err.Error()
		return result
	}
	defer backend.Stop()

	inferenceStarted := time.Now()
	translation, err := runtime.NewLlamaClient(backend.BaseURL, profile, true).Translate(
		ctx,
		runtime.TranslateRequest{
			CurrentText:    "Hello, how are you?",
			SourceLanguage: "en",
			TargetLanguage: "zh-Hant",
		},
	)
	if err != nil {
		if ctx.Err() != nil {
			result.Detail = fmt.Sprintf("deep check timed out after %s", timeout)
		} else {
			result.Detail = "test inference failed: " + err.Error()
		}
		return result
	}
	if strings.TrimSpace(translation.Translation) == "" {
		result.Detail = "test inference returned an empty translation"
		return result
	}
	result.Status = diagnostics.StatusPass
	result.Remediation = ""
	result.Detail = fmt.Sprintf(
		"model loaded and inference completed · inference %d ms",
		time.Since(inferenceStarted).Milliseconds(),
	)
	return result
}

func buildDoctorReport(
	snapshot readinessSnapshot,
	browser string,
	extensionID string,
	dependencies doctorDependencies,
) diagnostics.Report {
	if dependencies.ProbeVersion == nil {
		dependencies.ProbeVersion = probeHelperVersion
	}
	report := diagnostics.NewReport(runtime.APIVersion, runtime.HelperVersion, browser, extensionID)

	nativeResult := diagnostics.Result{
		ID: "native_manifest", Category: "Installation", Label: "Native manifest",
		DurationMS: snapshot.NativeDurationMS,
	}
	if snapshot.NativeHost.Valid {
		nativeResult.Status = diagnostics.StatusPass
		nativeResult.Detail = snapshot.NativeHost.ManifestPath
	} else {
		nativeResult.Status = diagnostics.StatusFail
		nativeResult.Detail = snapshot.NativeHost.Reason
		nativeResult.Remediation = "localsubs install --browser " + browser
	}
	report.Add(nativeResult)

	addLauncherDiagnostics(&report, snapshot.NativeHost, dependencies.ProbeVersion)

	runtimeResult := diagnostics.Result{
		ID: "llama_runtime", Category: "Runtime", Label: "llama-server",
		DurationMS: snapshot.RuntimeDurationMS,
	}
	if snapshot.Runtime.Found {
		runtimeResult.Status = diagnostics.StatusPass
		runtimeResult.Detail = snapshot.Runtime.Path
	} else {
		runtimeResult.Status = diagnostics.StatusFail
		runtimeResult.Detail = "not found in the Native Host PATH"
		runtimeResult.Remediation = "brew install llama.cpp"
	}
	report.Add(runtimeResult)

	manifestResult := diagnostics.Result{
		ID: "model_manifest", Category: "Model", Label: "Manifest",
		DurationMS: snapshot.ManifestDurationMS,
	}
	if snapshot.ManifestErr != nil {
		manifestResult.Status = diagnostics.StatusFail
		manifestResult.Detail = snapshot.ManifestErr.Error()
	} else if !snapshot.ModelEntryOK {
		manifestResult.Status = diagnostics.StatusFail
		manifestResult.Detail = "default model channel is missing"
	} else {
		manifestResult.Status = diagnostics.StatusPass
		manifestResult.Detail = fmt.Sprintf(
			"schema %d · %s %s",
			snapshot.Manifest.SchemaVersion,
			snapshot.ModelEntry.ID,
			snapshot.ModelEntry.Version,
		)
	}
	report.Add(manifestResult)

	modelResult := diagnostics.Result{
		ID: "model_file", Category: "Model", Label: "Model file",
		DurationMS: snapshot.ModelDurationMS,
	}
	if snapshot.ManifestErr != nil || !snapshot.ModelEntryOK {
		modelResult.Status = diagnostics.StatusSkip
		modelResult.Detail = "model manifest is unavailable"
	} else {
		modelResult.Detail = snapshot.Model.Path
		switch snapshot.Model.State {
		case "verified", "ready":
			modelResult.Status = diagnostics.StatusPass
			modelResult.Detail += " · " + snapshot.Model.State
		default:
			modelResult.Status = diagnostics.StatusFail
			if snapshot.Model.Reason != "" {
				modelResult.Detail += " · " + snapshot.Model.Reason
			}
			modelResult.Remediation = "localsubs model download"
		}
	}
	report.Add(modelResult)

	report.Add(inspectDirectory(
		"model_directory", "Filesystem", "Model directory", dependencies.ModelDir,
		"localsubs model download",
	))
	report.Add(inspectDirectory(
		"log_directory", "Filesystem", "Log directory", dependencies.LogDir,
		"localsubs install --browser "+browser,
	))

	return report
}

func addLauncherDiagnostics(
	report *diagnostics.Report,
	nativeStatus nativehost.InstalledStatus,
	probeVersion helperVersionProbe,
) {
	if !nativeStatus.Valid {
		report.Add(diagnostics.Result{
			ID: "native_launcher", Category: "Installation", Label: "Launcher",
			Status: diagnostics.StatusSkip, Detail: "native manifest is invalid",
		})
		report.Add(diagnostics.Result{
			ID: "installed_helper", Category: "Installation", Label: "Installed helper",
			Status: diagnostics.StatusSkip, Detail: "native launcher is unavailable",
		})
		return
	}

	started := time.Now()
	launcher := nativehost.InspectLauncher(nativeStatus.HostPath)
	launcherResult := diagnostics.Result{
		ID: "native_launcher", Category: "Installation", Label: "Launcher",
		DurationMS: time.Since(started).Milliseconds(),
	}
	if launcher.Valid {
		launcherResult.Status = diagnostics.StatusPass
		launcherResult.Detail = launcher.BinaryPath
	} else {
		launcherResult.Status = diagnostics.StatusFail
		launcherResult.Detail = launcher.Reason
		launcherResult.Remediation = "localsubs install --browser " + nativeStatus.Browser
	}
	report.Add(launcherResult)

	if !launcher.Valid {
		report.Add(diagnostics.Result{
			ID: "installed_helper", Category: "Installation", Label: "Installed helper",
			Status: diagnostics.StatusSkip, Detail: "native launcher target is invalid",
		})
		return
	}

	started = time.Now()
	version, apiVersion, err := probeVersion(launcher.BinaryPath)
	helperResult := diagnostics.Result{
		ID: "installed_helper", Category: "Installation", Label: "Installed helper",
		DurationMS: time.Since(started).Milliseconds(),
	}
	switch {
	case err != nil:
		helperResult.Status = diagnostics.StatusFail
		helperResult.Detail = err.Error()
		helperResult.Remediation = "brew upgrade localsubs && localsubs install"
	case version != runtime.HelperVersion || apiVersion != runtime.APIVersion:
		helperResult.Status = diagnostics.StatusFail
		helperResult.Detail = fmt.Sprintf("helper %s · API %s", version, apiVersion)
		helperResult.Remediation = "brew upgrade localsubs && localsubs install"
	default:
		helperResult.Status = diagnostics.StatusPass
		helperResult.Detail = fmt.Sprintf("helper %s · API %s", version, apiVersion)
	}
	report.Add(helperResult)
}

func probeHelperVersion(binary string) (string, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, binary, "version").CombinedOutput()
	if err != nil {
		if ctx.Err() != nil {
			return "", "", fmt.Errorf("helper version check timed out")
		}
		return "", "", fmt.Errorf("helper version check failed: %w", err)
	}
	fields := strings.Fields(string(output))
	if len(fields) != 4 || fields[0] != "localsubs" || fields[2] != "api" {
		return "", "", fmt.Errorf("helper returned an unexpected version response")
	}
	return fields[1], fields[3], nil
}

func inspectDirectory(id, category, label, path, remediation string) diagnostics.Result {
	started := time.Now()
	result := diagnostics.Result{
		ID: id, Category: category, Label: label, Detail: path,
	}
	info, err := os.Stat(path)
	switch {
	case err == nil && info.IsDir():
		result.Status = diagnostics.StatusPass
	case err == nil:
		result.Status = diagnostics.StatusFail
		result.Detail += " · path is not a directory"
		result.Remediation = remediation
	case os.IsNotExist(err):
		result.Status = diagnostics.StatusWarn
		result.Detail += " · not created yet"
		result.Remediation = remediation
	default:
		result.Status = diagnostics.StatusFail
		result.Detail += " · " + err.Error()
		result.Remediation = remediation
	}
	result.DurationMS = time.Since(started).Milliseconds()
	return result
}

func printDoctorReport(report diagnostics.Report) {
	state := ui.OK("Ready")
	if !report.Ready {
		state = ui.Fail(fmt.Sprintf("%d %s found", report.Summary.Failed, pluralize(report.Summary.Failed, "issue", "issues")))
	} else if report.Summary.Warnings > 0 {
		state = ui.Warn(fmt.Sprintf("%d %s", report.Summary.Warnings, pluralize(report.Summary.Warnings, "warning", "warnings")))
	}
	fmt.Printf("%s  %s  %s\n\n", ui.Bold("LocalSubs Doctor"), ui.Dim("v"+report.HelperVersion), state)
	category := ""
	for _, result := range report.Results {
		if result.Category != category {
			if category != "" {
				ui.PrintBlank()
			}
			category = result.Category
			ui.PrintHeader(category)
		}
		detail := ui.CompactPath(result.Detail)
		switch result.Status {
		case diagnostics.StatusPass:
			ui.PrintCheck(true, result.Label, detail)
		case diagnostics.StatusWarn:
			ui.PrintWarn(result.Label, detail)
		case diagnostics.StatusFail:
			ui.PrintCheck(false, result.Label, detail)
		case diagnostics.StatusSkip:
			ui.PrintSkip(result.Label, detail)
		}
		if result.Remediation != "" {
			ui.PrintDetail("Fix: " + result.Remediation)
		}
	}
	ui.PrintBlank()
	fmt.Printf(
		"Result: %d passed, %d warnings, %d failed, %d skipped (%d ms)\n",
		report.Summary.Passed,
		report.Summary.Warnings,
		report.Summary.Failed,
		report.Summary.Skipped,
		report.TotalDurationMS,
	)
}

func pluralize(count int, singular, plural string) string {
	if count == 1 {
		return singular
	}
	return plural
}
