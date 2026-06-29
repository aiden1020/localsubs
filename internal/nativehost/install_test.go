package nativehost

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"localsubs/internal/config"
	"localsubs/internal/runtime"
)

func TestInstallManifestWritesChromeManifest(t *testing.T) {
	home := t.TempDir()
	projectRoot := filepath.Join(home, "project")
	binary := filepath.Join(projectRoot, "bin", "localsubs")
	if err := os.MkdirAll(filepath.Dir(binary), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(binary, []byte("helper"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(projectRoot, runtime.DefaultModelFilename), []byte("fake"), 0o644); err != nil {
		t.Fatal(err)
	}

	result, err := InstallManifest(InstallOptions{
		HomeDir:     home,
		Browser:     "chrome",
		ExtensionID: "abcdefghijklmnopabcdefghijklmnop",
		BinaryPath:  binary,
	})
	if err != nil {
		t.Fatal(err)
	}

	expectedPath := filepath.Join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts", config.NativeHostName+".json")
	if result.Path != expectedPath {
		t.Fatalf("unexpected manifest path:\nwant %s\ngot  %s", expectedPath, result.Path)
	}
	body, err := os.ReadFile(result.Path)
	if err != nil {
		t.Fatal(err)
	}
	var manifest Manifest
	if err := json.Unmarshal(body, &manifest); err != nil {
		t.Fatal(err)
	}
	expectedLauncher := filepath.Join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts", config.NativeHostName+"_launcher")
	if manifest.Name != config.NativeHostName {
		t.Fatalf("unexpected host name: %s", manifest.Name)
	}
	if !filepath.IsAbs(manifest.Path) || manifest.Path != expectedLauncher {
		t.Fatalf("unexpected launcher path: %s", manifest.Path)
	}
	launcher, err := os.ReadFile(expectedLauncher)
	if err != nil {
		t.Fatal(err)
	}
	expectedLogPath := filepath.Join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts", "localsubs_helper.log")
	expectedLauncherBody := "#!/bin/sh\n" +
		"export PATH=\"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH\"\n" +
		"cd '" + projectRoot + "' || exit 1\n" +
		"exec '" + binary + "' native-host \"$@\" 2>>'" + expectedLogPath + "'\n"
	if string(launcher) != expectedLauncherBody {
		t.Fatalf("unexpected launcher body: %q", string(launcher))
	}
	if len(manifest.AllowedOrigins) != 1 || manifest.AllowedOrigins[0] != "chrome-extension://abcdefghijklmnopabcdefghijklmnop/" {
		t.Fatalf("unexpected allowed origins: %#v", manifest.AllowedOrigins)
	}
}

func TestBuildManifestUsesDefaultExtensionID(t *testing.T) {
	build, err := BuildManifest(InstallOptions{
		HomeDir:    t.TempDir(),
		BinaryPath: "helper",
	})
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(build.ManifestPath) != config.NativeHostName+".json" {
		t.Fatalf("unexpected manifest path: %s", build.ManifestPath)
	}
	if filepath.Base(build.LauncherPath) != config.NativeHostName+"_launcher" || build.Manifest.Path != build.LauncherPath {
		t.Fatalf("unexpected launcher path: %s", build.LauncherPath)
	}
	expectedOrigin := "chrome-extension://" + config.DefaultExtensionID + "/"
	if build.Manifest.AllowedOrigins[0] != expectedOrigin {
		t.Fatalf("unexpected origin: %s", build.Manifest.AllowedOrigins[0])
	}
}

func TestBuildManifestUsesExplicitWorkDir(t *testing.T) {
	home := t.TempDir()
	workDir := filepath.Join(home, "models")
	build, err := BuildManifest(InstallOptions{
		HomeDir:    home,
		BinaryPath: filepath.Join(home, "bin", "helper"),
		WorkDir:    workDir,
	})
	if err != nil {
		t.Fatal(err)
	}
	if build.WorkDir != workDir {
		t.Fatalf("unexpected workdir: %s", build.WorkDir)
	}
}

func TestBuildManifestRejectsUnsupportedBrowser(t *testing.T) {
	_, err := BuildManifest(InstallOptions{
		HomeDir:    t.TempDir(),
		Browser:    "safari",
		BinaryPath: "helper",
	})
	if err == nil {
		t.Fatal("expected unsupported browser error")
	}
}
