//go:build windows

package nativehost

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"golang.org/x/sys/windows/registry"

	"localsubs/internal/config"
)

func TestBuildManifestWindowsUsesLocalAppDataAndDirectExecutable(t *testing.T) {
	home := t.TempDir()
	binary := filepath.Join(home, "LocalSubs Test", "localsubs.exe")
	build, err := BuildManifest(InstallOptions{
		HomeDir: home, Browser: "chrome", BinaryPath: binary,
	})
	if err != nil {
		t.Fatal(err)
	}
	wantManifest := filepath.Join(home, "AppData", "Local", "LocalSubs", "native-messaging", config.NativeHostName+".json")
	if build.ManifestPath != wantManifest {
		t.Fatalf("manifest path = %q, want %q", build.ManifestPath, wantManifest)
	}
	if build.Manifest.Path != binary || build.LauncherPath != binary {
		t.Fatalf("Windows manifest must point directly to helper: %#v", build)
	}
}

func TestInstallManifestWindowsWritesManifestAndRegistry(t *testing.T) {
	home := t.TempDir()
	binary := filepath.Join(home, "bin", "localsubs.exe")
	if err := os.MkdirAll(filepath.Dir(binary), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(binary, []byte("test helper"), 0o644); err != nil {
		t.Fatal(err)
	}
	const hostName = "localsubs_test_helper"
	registryRoot, err := browserRegistryRoot("chrome")
	if err != nil {
		t.Fatal(err)
	}
	keyPath := registryRoot + `\` + hostName
	defer registry.DeleteKey(registry.CURRENT_USER, keyPath)

	result, err := InstallManifest(InstallOptions{
		HomeDir: home, Browser: "chrome", HostName: hostName,
		ExtensionID: "abcdefghijklmnopabcdefghijklmnop", BinaryPath: binary,
	})
	if err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(result.Path)
	if err != nil {
		t.Fatal(err)
	}
	var manifest Manifest
	if err := json.Unmarshal(body, &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Path != binary || manifest.Name != hostName {
		t.Fatalf("unexpected manifest: %#v", manifest)
	}
	key, err := registry.OpenKey(registry.CURRENT_USER, keyPath, registry.QUERY_VALUE)
	if err != nil {
		t.Fatal(err)
	}
	defer key.Close()
	registeredPath, _, err := key.GetStringValue("")
	if err != nil {
		t.Fatal(err)
	}
	if registeredPath != result.Path {
		t.Fatalf("registered path = %q, want %q", registeredPath, result.Path)
	}
}

func TestInspectLauncherWindowsValidatesDirectExecutable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "localsubs.exe")
	if err := os.WriteFile(path, []byte("helper"), 0o644); err != nil {
		t.Fatal(err)
	}
	status := InspectLauncher(path)
	if !status.Valid || status.BinaryPath != path {
		t.Fatalf("unexpected helper status: %#v", status)
	}
}

func TestBrowserInvocationRequiresValidChromeOrigin(t *testing.T) {
	if !IsBrowserInvocation([]string{"chrome-extension://abcdefghijklmnopabcdefghijklmnop/", "--parent-window=0"}) {
		t.Fatal("valid Chrome native host invocation was not recognized")
	}
	for _, args := range [][]string{{}, {"version"}, {"chrome-extension://invalid/"}} {
		if IsBrowserInvocation(args) {
			t.Fatalf("invalid invocation accepted: %#v", args)
		}
	}
}

func TestUninstallManifestWindowsPreservesSharedManifestUntilLastBrowser(t *testing.T) {
	home := t.TempDir()
	binary := filepath.Join(home, "bin", "localsubs.exe")
	if err := os.MkdirAll(filepath.Dir(binary), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(binary, []byte("helper"), 0o644); err != nil {
		t.Fatal(err)
	}
	const hostName = "localsubs_uninstall_test_helper"
	for _, browser := range []string{"chrome", "edge"} {
		root, _ := browserRegistryRoot(browser)
		defer registry.DeleteKey(registry.CURRENT_USER, root+`\`+hostName)
		if _, err := InstallManifest(InstallOptions{
			HomeDir: home, Browser: browser, HostName: hostName, BinaryPath: binary,
		}); err != nil {
			t.Fatal(err)
		}
	}
	manifestPath := filepath.Join(config.AppDataDirForHome(home), "native-messaging", hostName+".json")
	chromeResult, err := UninstallManifest(UninstallOptions{HomeDir: home, Browser: "chrome", HostName: hostName})
	if err != nil {
		t.Fatal(err)
	}
	if !chromeResult.RegistrationRemoved || chromeResult.ManifestRemoved {
		t.Fatalf("unexpected first uninstall result: %#v", chromeResult)
	}
	if _, err := os.Stat(manifestPath); err != nil {
		t.Fatalf("shared manifest removed too early: %v", err)
	}
	edgeResult, err := UninstallManifest(UninstallOptions{HomeDir: home, Browser: "edge", HostName: hostName})
	if err != nil {
		t.Fatal(err)
	}
	if !edgeResult.RegistrationRemoved || !edgeResult.ManifestRemoved {
		t.Fatalf("unexpected final uninstall result: %#v", edgeResult)
	}
	if _, err := os.Stat(manifestPath); !os.IsNotExist(err) {
		t.Fatalf("manifest remains after final uninstall: %v", err)
	}
}
