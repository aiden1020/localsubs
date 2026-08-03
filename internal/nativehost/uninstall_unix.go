//go:build !windows

package nativehost

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	"localsubs/internal/config"
)

func UninstallManifest(options UninstallOptions) (UninstallResult, error) {
	homeDir := strings.TrimSpace(options.HomeDir)
	if homeDir == "" {
		var err error
		homeDir, err = os.UserHomeDir()
		if err != nil {
			return UninstallResult{}, err
		}
	}
	browser := strings.TrimSpace(options.Browser)
	if browser == "" {
		browser = "chrome"
	}
	hostName := strings.TrimSpace(options.HostName)
	if hostName == "" {
		hostName = config.NativeHostName
	}
	root, err := nativeMessagingRoot(homeDir, browser)
	if err != nil {
		return UninstallResult{}, err
	}
	result := UninstallResult{
		Browser: browser, ManifestPath: filepath.Join(root, hostName+".json"),
		LauncherPath: filepath.Join(root, hostName+"_launcher"),
	}
	result.ManifestRemoved, err = removeFileIfPresent(result.ManifestPath)
	if err != nil {
		return result, err
	}
	result.LauncherRemoved, err = removeFileIfPresent(result.LauncherPath)
	result.RegistrationRemoved = result.ManifestRemoved
	return result, err
}

func removeFileIfPresent(path string) (bool, error) {
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
