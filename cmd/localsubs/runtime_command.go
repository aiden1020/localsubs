package main

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"localsubs/internal/config"
	localruntime "localsubs/internal/runtime"
	"localsubs/internal/ui"
)

type installedRuntimeMarker struct {
	Version   string                      `json:"version"`
	Backend   localruntime.BackendMode    `json:"backend"`
	Installed string                      `json:"installedAt"`
	Assets    []localruntime.RuntimeAsset `json:"assets"`
}

func runtimeCommand(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("runtime subcommand is required: download or status")
	}
	switch args[0] {
	case "download":
		return runtimeDownload(args[1:])
	case "status":
		return runtimeStatus(args[1:])
	case "help", "-h", "--help":
		fmt.Println("Usage: localsubs runtime <download|status> [--backend cpu|cuda]")
		return nil
	default:
		return fmt.Errorf("unknown runtime command: %s", args[0])
	}
}

func runtimeDownload(args []string) error {
	flags := flag.NewFlagSet("runtime-download", flag.ContinueOnError)
	backendValue := flags.String("backend", "cpu", "runtime backend: cpu or cuda")
	if err := parseFlags(flags, args); err != nil {
		return err
	}
	backend, err := localruntime.ParseBackendMode(*backendValue)
	if err != nil {
		return err
	}
	if backend == localruntime.BackendAuto {
		backend = localruntime.PreferredBackend()
	}
	bundle, err := localruntime.RuntimeBundleForBackend(backend)
	if err != nil {
		return err
	}
	destination := localruntime.RuntimeInstallDir(backend)
	serverPath := localruntime.RuntimeExecutablePath(backend)
	if runtimeExecutableHealthy(serverPath) {
		fmt.Println(ui.OK(fmt.Sprintf("%s runtime already installed", strings.ToUpper(string(backend)))))
		ui.PrintRow("File", ui.CompactPath(serverPath))
		return nil
	}
	if err := installRuntimeBundle(bundle, destination); err != nil {
		return err
	}
	if !runtimeExecutableHealthy(serverPath) {
		return fmt.Errorf("installed %s runtime failed its startup probe", backend)
	}
	regenerated, err := exec.Command(serverPath, "--version").CombinedOutput()
	if err != nil {
		return fmt.Errorf("probe installed runtime: %w: %s", err, strings.TrimSpace(string(regenerated)))
	}
	fmt.Println(ui.OK(fmt.Sprintf("%s runtime ready", strings.ToUpper(string(backend)))))
	ui.PrintRow("Version", bundle.Version)
	ui.PrintRow("File", ui.CompactPath(serverPath))
	return nil
}

func installRuntimeBundle(bundle localruntime.RuntimeBundle, destination string) error {
	downloadDir := filepath.Join(config.RuntimeDir(), "downloads", bundle.Version)
	if err := os.MkdirAll(downloadDir, 0o755); err != nil {
		return err
	}
	archives := make([]string, 0, len(bundle.Assets))
	for _, asset := range bundle.Assets {
		archivePath := filepath.Join(downloadDir, asset.Name)
		valid, err := fileMatchesSHA256(archivePath, asset.SHA256)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		if !valid {
			fmt.Printf("  Downloading %s  %s\n", ui.Bold(asset.Name), ui.Dim("("+formatBytes(asset.SizeBytes)+")"))
			if err := downloadWithProgress(archivePath, asset.URL, asset.SizeBytes); err != nil {
				return err
			}
			fmt.Println()
		}
		valid, err = fileMatchesSHA256(archivePath, asset.SHA256)
		if err != nil {
			return err
		}
		if !valid {
			return fmt.Errorf("runtime archive checksum mismatch: %s", asset.Name)
		}
		archives = append(archives, archivePath)
	}

	parent := filepath.Dir(destination)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return err
	}
	staging, err := os.MkdirTemp(parent, "."+string(bundle.Backend)+"-install-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(staging)
	for _, archivePath := range archives {
		if err := extractZip(archivePath, staging); err != nil {
			return err
		}
	}
	if _, err := os.Stat(filepath.Join(staging, "llama-server.exe")); err != nil {
		return fmt.Errorf("runtime archive does not contain llama-server.exe")
	}
	marker := installedRuntimeMarker{
		Version: bundle.Version, Backend: bundle.Backend,
		Installed: time.Now().UTC().Format(time.RFC3339), Assets: bundle.Assets,
	}
	body, err := json.MarshalIndent(marker, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(staging, "runtime.json"), append(body, '\n'), 0o644); err != nil {
		return err
	}
	if _, err := os.Stat(destination); err == nil {
		backup := destination + ".invalid-" + time.Now().UTC().Format("20060102T150405Z")
		if err := os.Rename(destination, backup); err != nil {
			return fmt.Errorf("preserve incomplete runtime: %w", err)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.Rename(staging, destination); err != nil {
		return err
	}
	return nil
}

func extractZip(archivePath, destination string) error {
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer reader.Close()
	destinationPrefix := filepath.Clean(destination) + string(os.PathSeparator)
	for _, entry := range reader.File {
		target := filepath.Join(destination, filepath.FromSlash(entry.Name))
		if !strings.HasPrefix(filepath.Clean(target), destinationPrefix) {
			return fmt.Errorf("unsafe runtime archive path: %s", entry.Name)
		}
		if entry.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		source, err := entry.Open()
		if err != nil {
			return err
		}
		destinationFile, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
		if err != nil {
			source.Close()
			return err
		}
		_, copyErr := io.Copy(destinationFile, source)
		closeDestinationErr := destinationFile.Close()
		closeSourceErr := source.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeDestinationErr != nil {
			return closeDestinationErr
		}
		if closeSourceErr != nil {
			return closeSourceErr
		}
	}
	return nil
}

func fileMatchesSHA256(path, expected string) (bool, error) {
	file, err := os.Open(path)
	if err != nil {
		return false, err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return false, err
	}
	return strings.EqualFold(hex.EncodeToString(hash.Sum(nil)), expected), nil
}

func runtimeExecutableHealthy(path string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	command := exec.Command(path, "--version")
	return command.Run() == nil
}

func runtimeStatus(args []string) error {
	flags := flag.NewFlagSet("runtime-status", flag.ContinueOnError)
	jsonMode := flags.Bool("json", false, "output raw JSON")
	if err := parseFlags(flags, args); err != nil {
		return err
	}
	type backendStatus struct {
		Backend   localruntime.BackendMode `json:"backend"`
		Installed bool                     `json:"installed"`
		Healthy   bool                     `json:"healthy"`
		Path      string                   `json:"path"`
	}
	statuses := make([]backendStatus, 0, 2)
	for _, backend := range []localruntime.BackendMode{localruntime.BackendCPU, localruntime.BackendCUDA} {
		path := localruntime.RuntimeExecutablePath(backend)
		_, err := os.Stat(path)
		statuses = append(statuses, backendStatus{
			Backend: backend, Installed: err == nil, Healthy: runtimeExecutableHealthy(path), Path: path,
		})
	}
	if *jsonMode {
		return json.NewEncoder(os.Stdout).Encode(statuses)
	}
	for _, status := range statuses {
		state := ui.Fail("not installed")
		if status.Healthy {
			state = ui.OK("ready")
		} else if status.Installed {
			state = ui.Fail("unhealthy")
		}
		ui.PrintRow(strings.ToUpper(string(status.Backend)), state)
		ui.PrintHint(ui.CompactPath(status.Path))
	}
	return nil
}
