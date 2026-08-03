package nativehost

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
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
	LogPath      string
	Manifest     Manifest
	BinaryPath   string
	WorkDir      string
}

type InstallResult struct {
	Path         string
	LauncherPath string
	Manifest     Manifest
}

type UninstallOptions struct {
	HomeDir  string
	Browser  string
	HostName string
}

type UninstallResult struct {
	Browser             string `json:"browser"`
	ManifestPath        string `json:"manifestPath"`
	LauncherPath        string `json:"launcherPath,omitempty"`
	RegistrationRemoved bool   `json:"registrationRemoved"`
	ManifestRemoved     bool   `json:"manifestRemoved"`
	LauncherRemoved     bool   `json:"launcherRemoved"`
}

type InstalledStatus struct {
	Browser      string `json:"browser"`
	ManifestPath string `json:"manifestPath"`
	HostPath     string `json:"hostPath,omitempty"`
	Installed    bool   `json:"installed"`
	Valid        bool   `json:"valid"`
	Reason       string `json:"reason,omitempty"`
}

type LauncherStatus struct {
	Path       string `json:"path"`
	BinaryPath string `json:"binaryPath,omitempty"`
	Valid      bool   `json:"valid"`
	Reason     string `json:"reason,omitempty"`
}

func inferWorkDir(binaryPath string) string {
	binaryDir := filepath.Dir(binaryPath)
	parentDir := filepath.Dir(binaryDir)
	if fileExists(filepath.Join(parentDir, runtime.DefaultModelFilename)) {
		return parentDir
	}
	return binaryDir
}

// InspectInstalled validates the native messaging manifest and the host path
// it references. Native hosts are started on demand, so this describes
// installation readiness rather than whether a persistent process is running.
func InspectInstalled(homeDir, browser string) InstalledStatus {
	return InspectInstalledForExtension(homeDir, browser, config.DefaultExtensionID)
}

// InspectInstalledForExtension validates readiness for a specific extension.
func InspectInstalledForExtension(homeDir, browser, extensionID string) InstalledStatus {
	extensionID = strings.TrimSpace(extensionID)
	if extensionID == "" {
		extensionID = config.DefaultExtensionID
	}
	if strings.TrimSpace(browser) == "" {
		browser = "chrome"
	}
	status := InstalledStatus{Browser: browser}
	manifestPath, installed, err := CheckInstalled(homeDir, browser)
	status.ManifestPath = manifestPath
	status.Installed = installed
	if err != nil {
		status.Reason = err.Error()
		return status
	}
	if !installed {
		status.Reason = "native messaging manifest is not installed"
		return status
	}

	body, err := os.ReadFile(manifestPath)
	if err != nil {
		status.Reason = err.Error()
		return status
	}
	var manifest Manifest
	if err := json.Unmarshal(body, &manifest); err != nil {
		status.Reason = "native messaging manifest is invalid JSON"
		return status
	}
	status.HostPath = manifest.Path
	switch {
	case manifest.Name != config.NativeHostName:
		status.Reason = "native messaging manifest has an unexpected host name"
	case manifest.Type != "stdio":
		status.Reason = "native messaging manifest must use stdio"
	case !filepath.IsAbs(manifest.Path):
		status.Reason = "native messaging host path is not absolute"
	case !validAllowedOrigins(manifest.AllowedOrigins):
		status.Reason = "native messaging manifest has invalid allowed extension origins"
	case !containsOrigin(manifest.AllowedOrigins, fmt.Sprintf("chrome-extension://%s/", extensionID)):
		status.Reason = "native messaging manifest does not allow the expected extension"
	default:
		info, statErr := os.Stat(manifest.Path)
		if statErr != nil {
			status.Reason = "native messaging host path does not exist"
			return status
		}
		if info.IsDir() {
			status.Reason = "native messaging host path is a directory"
			return status
		}
		if !hostPathExecutable(info, manifest.Path) {
			status.Reason = "native messaging host path is not executable"
			return status
		}
		status.Valid = true
	}
	return status
}

func containsOrigin(origins []string, expected string) bool {
	for _, origin := range origins {
		if origin == expected {
			return true
		}
	}
	return false
}

var chromeExtensionOriginPattern = regexp.MustCompile(`^chrome-extension://[a-p]{32}/$`)

// IsBrowserInvocation reports whether args were supplied by a Chromium browser
// launching the Windows executable directly from a native messaging manifest.
func IsBrowserInvocation(args []string) bool {
	return len(args) > 0 && chromeExtensionOriginPattern.MatchString(args[0])
}

func validAllowedOrigins(origins []string) bool {
	if len(origins) == 0 {
		return false
	}
	for _, origin := range origins {
		if !chromeExtensionOriginPattern.MatchString(origin) {
			return false
		}
	}
	return true
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
