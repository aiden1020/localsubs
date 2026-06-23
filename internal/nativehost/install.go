package nativehost

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"localsubs/internal/config"
	"localsubs/internal/runtime"
)

type Manifest struct {
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Path           string   `json:"path"`
	Type           string   `json:"type"`
	AllowedOrigins []string `json:"allowed_origins"`
}

type InstallOptions struct {
	HomeDir     string
	Browser     string
	HostName    string
	ExtensionID string
	BinaryPath  string
	WorkDir     string
}

type ManifestBuild struct {
	ManifestPath string
	LauncherPath string
	Manifest     Manifest
	BinaryPath   string
	WorkDir      string
}

type InstallResult struct {
	Path         string
	LauncherPath string
	Manifest     Manifest
}

func InstallManifest(options InstallOptions) (InstallResult, error) {
	build, err := BuildManifest(options)
	if err != nil {
		return InstallResult{}, err
	}
	if err := os.MkdirAll(filepath.Dir(build.ManifestPath), 0o755); err != nil {
		return InstallResult{}, err
	}
	logPath := filepath.Join(filepath.Dir(build.LauncherPath), "localsubs_helper.log")
	launcher := []byte(
		"#!/bin/sh\n" +
			"export PATH=\"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH\"\n" +
			"cd " + shellQuote(build.WorkDir) + " || exit 1\n" +
			"exec " + shellQuote(build.BinaryPath) + " native-host \"$@\" 2>>" + shellQuote(logPath) + "\n",
	)
	if err := os.WriteFile(build.LauncherPath, launcher, 0o755); err != nil {
		return InstallResult{}, err
	}
	body, err := json.MarshalIndent(build.Manifest, "", "  ")
	if err != nil {
		return InstallResult{}, err
	}
	if err := os.WriteFile(build.ManifestPath, append(body, '\n'), 0o644); err != nil {
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
	binaryPath := strings.TrimSpace(options.BinaryPath)
	if binaryPath == "" {
		executable, err := os.Executable()
		if err != nil {
			return ManifestBuild{}, err
		}
		binaryPath = executable
	}
	absoluteBinaryPath, err := filepath.Abs(binaryPath)
	if err != nil {
		return ManifestBuild{}, err
	}
	workDir := strings.TrimSpace(options.WorkDir)
	if workDir == "" {
		workDir = inferWorkDir(absoluteBinaryPath)
	}
	absoluteWorkDir, err := filepath.Abs(workDir)
	if err != nil {
		return ManifestBuild{}, err
	}
	root, err := nativeMessagingRoot(homeDir, browser)
	if err != nil {
		return ManifestBuild{}, err
	}
	launcherPath := filepath.Join(root, hostName+"_launcher")
	manifest := Manifest{
		Name:           hostName,
		Description:    "LocalSubs local helper",
		Path:           launcherPath,
		Type:           "stdio",
		AllowedOrigins: []string{fmt.Sprintf("chrome-extension://%s/", extensionID)},
	}
	return ManifestBuild{
		ManifestPath: filepath.Join(root, hostName+".json"),
		LauncherPath: launcherPath,
		Manifest:     manifest,
		BinaryPath:   absoluteBinaryPath,
		WorkDir:      absoluteWorkDir,
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

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func inferWorkDir(binaryPath string) string {
	binaryDir := filepath.Dir(binaryPath)
	parentDir := filepath.Dir(binaryDir)
	if fileExists(filepath.Join(parentDir, runtime.DefaultModelFilename)) {
		return parentDir
	}
	return binaryDir
}

// CheckInstalled reports whether the native messaging manifest exists for
// the given browser. Returns the manifest path regardless of whether it exists.
func CheckInstalled(homeDir, browser string) (path string, ok bool, err error) {
	if homeDir == "" {
		homeDir, err = os.UserHomeDir()
		if err != nil {
			return "", false, err
		}
	}
	if browser == "" {
		browser = "chrome"
	}
	root, err := nativeMessagingRoot(homeDir, browser)
	if err != nil {
		return "", false, err
	}
	manifestPath := filepath.Join(root, config.NativeHostName+".json")
	_, statErr := os.Stat(manifestPath)
	return manifestPath, statErr == nil, nil
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
