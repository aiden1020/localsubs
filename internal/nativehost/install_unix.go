//go:build !windows

package nativehost

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"localsubs/internal/config"
)

func InstallManifest(options InstallOptions) (InstallResult, error) {
	build, err := BuildManifest(options)
	if err != nil {
		return InstallResult{}, err
	}
	if err := os.MkdirAll(filepath.Dir(build.ManifestPath), 0o755); err != nil {
		return InstallResult{}, err
	}
	if err := os.MkdirAll(filepath.Dir(build.LogPath), 0o755); err != nil {
		return InstallResult{}, err
	}
	launcher := []byte(
		"#!/bin/sh\n" +
			"export PATH=\"" + config.NativeHostSearchPath() + ":$PATH\"\n" +
			"cd " + shellQuote(build.WorkDir) + " || exit 1\n" +
			"exec " + shellQuote(build.BinaryPath) + " native-host \"$@\" 2>>" + shellQuote(build.LogPath) + "\n",
	)
	if err := os.WriteFile(build.LauncherPath, launcher, 0o755); err != nil {
		return InstallResult{}, err
	}
	if err := os.Chmod(build.LauncherPath, 0o755); err != nil {
		return InstallResult{}, err
	}
	if err := writeManifest(build.ManifestPath, build.Manifest); err != nil {
		return InstallResult{}, err
	}
	return InstallResult{Path: build.ManifestPath, LauncherPath: build.LauncherPath, Manifest: build.Manifest}, nil
}

func BuildManifest(options InstallOptions) (ManifestBuild, error) {
	homeDir := options.HomeDir
	if strings.TrimSpace(homeDir) == "" {
		var err error
		homeDir, err = os.UserHomeDir()
		if err != nil {
			return ManifestBuild{}, err
		}
	}
	browser := options.Browser
	if browser == "" {
		browser = "chrome"
	}
	hostName := options.HostName
	if hostName == "" {
		hostName = config.NativeHostName
	}
	extensionID := strings.TrimSpace(options.ExtensionID)
	if extensionID == "" {
		extensionID = config.DefaultExtensionID
	}
	absoluteBinaryPath, absoluteWorkDir, err := resolveInstallPaths(options)
	if err != nil {
		return ManifestBuild{}, err
	}
	root, err := nativeMessagingRoot(homeDir, browser)
	if err != nil {
		return ManifestBuild{}, err
	}
	launcherPath := filepath.Join(root, hostName+"_launcher")
	manifest := Manifest{
		Name: hostName, Description: "LocalSubs local helper", Path: launcherPath, Type: "stdio",
		AllowedOrigins: []string{fmt.Sprintf("chrome-extension://%s/", extensionID)},
	}
	return ManifestBuild{
		ManifestPath: filepath.Join(root, hostName+".json"), LauncherPath: launcherPath,
		LogPath: config.NativeHostLogPathForHome(homeDir), Manifest: manifest,
		BinaryPath: absoluteBinaryPath, WorkDir: absoluteWorkDir,
	}, nil
}

func nativeMessagingRoot(homeDir string, browser string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(browser)) {
	case "", "chrome", "google-chrome":
		return filepath.Join(homeDir, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts"), nil
	case "chromium":
		return filepath.Join(homeDir, "Library", "Application Support", "Chromium", "NativeMessagingHosts"), nil
	case "edge", "microsoft-edge":
		return filepath.Join(homeDir, "Library", "Application Support", "Microsoft Edge", "NativeMessagingHosts"), nil
	default:
		return "", fmt.Errorf("unsupported browser %q", browser)
	}
}

func CheckInstalled(homeDir, browser string) (path string, ok bool, err error) {
	if homeDir == "" {
		homeDir, err = os.UserHomeDir()
		if err != nil {
			return "", false, err
		}
	}
	root, err := nativeMessagingRoot(homeDir, browser)
	if err != nil {
		return "", false, err
	}
	manifestPath := filepath.Join(root, config.NativeHostName+".json")
	_, statErr := os.Stat(manifestPath)
	return manifestPath, statErr == nil, nil
}

func InspectLauncher(path string) LauncherStatus {
	status := LauncherStatus{Path: path}
	body, err := os.ReadFile(path)
	if err != nil {
		status.Reason = err.Error()
		return status
	}
	const marker = ` native-host "$@"`
	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "exec ") {
			continue
		}
		command := strings.TrimPrefix(line, "exec ")
		index := strings.Index(command, marker)
		if index < 0 {
			continue
		}
		binary, ok := parseShellQuoted(strings.TrimSpace(command[:index]))
		if !ok || !filepath.IsAbs(binary) {
			status.Reason = "native messaging launcher has an invalid helper command"
			return status
		}
		status.BinaryPath = binary
		info, statErr := os.Stat(binary)
		if statErr != nil {
			status.Reason = "native messaging launcher target does not exist"
			return status
		}
		if info.IsDir() || !hostPathExecutable(info, binary) {
			status.Reason = "native messaging launcher target is not executable"
			return status
		}
		status.Valid = true
		return status
	}
	status.Reason = "native messaging launcher does not contain a helper command"
	return status
}

func resolveInstallPaths(options InstallOptions) (string, string, error) {
	binaryPath := strings.TrimSpace(options.BinaryPath)
	if binaryPath == "" {
		executable, err := os.Executable()
		if err != nil {
			return "", "", err
		}
		binaryPath = executable
	}
	absoluteBinaryPath, err := filepath.Abs(binaryPath)
	if err != nil {
		return "", "", err
	}
	workDir := strings.TrimSpace(options.WorkDir)
	if workDir == "" {
		workDir = inferWorkDir(absoluteBinaryPath)
	}
	absoluteWorkDir, err := filepath.Abs(workDir)
	return absoluteBinaryPath, absoluteWorkDir, err
}

func writeManifest(path string, manifest Manifest) error {
	body, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(body, '\n'), 0o644)
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func parseShellQuoted(value string) (string, bool) {
	if len(value) < 2 || value[0] != '\'' || value[len(value)-1] != '\'' {
		return "", false
	}
	return strings.ReplaceAll(value[1:len(value)-1], "'\"'\"'", "'"), true
}

func hostPathExecutable(info os.FileInfo, _ string) bool {
	return info.Mode().Perm()&0o111 != 0
}
