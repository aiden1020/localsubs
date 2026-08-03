//go:build windows

package nativehost

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows/registry"

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
	if err := writeManifest(build.ManifestPath, build.Manifest); err != nil {
		return InstallResult{}, err
	}
	if err := registerNativeHost(options.Browser, build.Manifest.Name, build.ManifestPath); err != nil {
		return InstallResult{}, err
	}
	return InstallResult{Path: build.ManifestPath, LauncherPath: build.Manifest.Path, Manifest: build.Manifest}, nil
}

func BuildManifest(options InstallOptions) (ManifestBuild, error) {
	browser := options.Browser
	if browser == "" {
		browser = "chrome"
	}
	if _, err := browserRegistryRoot(browser); err != nil {
		return ManifestBuild{}, err
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
	appDataDir := config.AppDataDir()
	if strings.TrimSpace(options.HomeDir) != "" {
		appDataDir = config.AppDataDirForHome(options.HomeDir)
	}
	manifestDir := filepath.Join(appDataDir, "native-messaging")
	manifest := Manifest{
		Name: hostName, Description: "LocalSubs local helper", Path: absoluteBinaryPath, Type: "stdio",
		AllowedOrigins: []string{fmt.Sprintf("chrome-extension://%s/", extensionID)},
	}
	return ManifestBuild{
		ManifestPath: filepath.Join(manifestDir, hostName+".json"), LauncherPath: absoluteBinaryPath,
		LogPath: filepath.Join(appDataDir, "logs", "native-host.log"), Manifest: manifest,
		BinaryPath: absoluteBinaryPath, WorkDir: absoluteWorkDir,
	}, nil
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

func browserRegistryRoot(browser string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(browser)) {
	case "", "chrome", "google-chrome":
		return `Software\Google\Chrome\NativeMessagingHosts`, nil
	case "chromium":
		return `Software\Chromium\NativeMessagingHosts`, nil
	case "edge", "microsoft-edge":
		return `Software\Microsoft\Edge\NativeMessagingHosts`, nil
	default:
		return "", fmt.Errorf("unsupported browser %q", browser)
	}
}

func registerNativeHost(browser, hostName, manifestPath string) error {
	root, err := browserRegistryRoot(browser)
	if err != nil {
		return err
	}
	key, _, err := registry.CreateKey(registry.CURRENT_USER, root+`\`+hostName, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("register native messaging host: %w", err)
	}
	defer key.Close()
	if err := key.SetStringValue("", manifestPath); err != nil {
		return fmt.Errorf("write native messaging registry value: %w", err)
	}
	return nil
}

func CheckInstalled(_ string, browser string) (path string, ok bool, err error) {
	root, err := browserRegistryRoot(browser)
	if err != nil {
		return "", false, err
	}
	key, err := registry.OpenKey(registry.CURRENT_USER, root+`\`+config.NativeHostName, registry.QUERY_VALUE)
	if err != nil {
		if err == registry.ErrNotExist {
			return "", false, nil
		}
		return "", false, err
	}
	defer key.Close()
	manifestPath, _, err := key.GetStringValue("")
	if err != nil {
		return "", false, err
	}
	_, statErr := os.Stat(manifestPath)
	return manifestPath, statErr == nil, nil
}

func InspectLauncher(path string) LauncherStatus {
	status := LauncherStatus{Path: path, BinaryPath: path}
	info, err := os.Stat(path)
	if err != nil {
		status.Reason = "native messaging host executable does not exist"
		return status
	}
	if info.IsDir() || !hostPathExecutable(info, path) {
		status.Reason = "native messaging host path is not executable"
		return status
	}
	status.Valid = true
	return status
}

func hostPathExecutable(_ os.FileInfo, path string) bool {
	return strings.EqualFold(filepath.Ext(path), ".exe")
}
