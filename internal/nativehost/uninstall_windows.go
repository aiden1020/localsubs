//go:build windows

package nativehost

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows/registry"

	"localsubs/internal/config"
)

func UninstallManifest(options UninstallOptions) (UninstallResult, error) {
	browser := strings.TrimSpace(options.Browser)
	if browser == "" {
		browser = "chrome"
	}
	hostName := strings.TrimSpace(options.HostName)
	if hostName == "" {
		hostName = config.NativeHostName
	}
	root, err := browserRegistryRoot(browser)
	if err != nil {
		return UninstallResult{}, err
	}
	appDataDir := config.AppDataDir()
	if strings.TrimSpace(options.HomeDir) != "" {
		appDataDir = config.AppDataDirForHome(options.HomeDir)
	}
	result := UninstallResult{
		Browser:      browser,
		ManifestPath: filepath.Join(appDataDir, "native-messaging", hostName+".json"),
	}
	keyPath := root + `\` + hostName
	if err := registry.DeleteKey(registry.CURRENT_USER, keyPath); err != nil {
		if !errors.Is(err, registry.ErrNotExist) {
			return result, err
		}
	} else {
		result.RegistrationRemoved = true
	}
	remaining, err := windowsHostRegistrationExists(hostName)
	if err != nil {
		return result, err
	}
	if !remaining {
		result.ManifestRemoved, err = removeWindowsFileIfPresent(result.ManifestPath)
	}
	return result, err
}

func windowsHostRegistrationExists(hostName string) (bool, error) {
	for _, browser := range []string{"chrome", "chromium", "edge"} {
		root, err := browserRegistryRoot(browser)
		if err != nil {
			return false, err
		}
		key, err := registry.OpenKey(registry.CURRENT_USER, root+`\`+hostName, registry.QUERY_VALUE)
		if err == nil {
			key.Close()
			return true, nil
		}
		if !errors.Is(err, registry.ErrNotExist) {
			return false, err
		}
	}
	return false, nil
}

func removeWindowsFileIfPresent(path string) (bool, error) {
	err := os.Remove(path)
	switch {
	case err == nil:
		return true, nil
	case errors.Is(err, os.ErrNotExist):
		return false, nil
	default:
		return false, err
	}
}
