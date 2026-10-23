package main

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"localsubs/internal/config"
	"localsubs/internal/model"
)

func useTempModelDirectory(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	t.Setenv("HOME", root)
	t.Setenv("LOCALAPPDATA", root)
	return filepath.Join(config.AppDataDir(), "models")
}

func TestEmbeddedManifestIncludesOfficialSottoModels(t *testing.T) {
	manifest, err := loadManifest()
	if err != nil {
		t.Fatal(err)
	}
	if manifest.DefaultChannel != "stable" {
		t.Errorf("default channel = %q", manifest.DefaultChannel)
	}
	cases := []struct {
		channel string
		path    string
		size    int64
		sha256  string
	}{
		{"stable", "Sotto-EN-ZH-TW-0.6B-Q5_K_M.gguf", 381332736, "4c4fc4dc1eb08ddf1e2c27b329c48882071dfd53150bba04846fdc4e17bc671a"},
		{"1.7b", "Sotto-EN-ZH-TW-1.7B-Q5_K_M.gguf", 1134373600, "f7e5c35d2dbb8674badd3321545bc21bb99a3f3443c49ae68a06dde0fe8762e6"},
	}
	for _, tc := range cases {
		entry, ok := manifest.Entry(tc.channel)
		if !ok {
			t.Fatalf("channel %q is missing from embedded manifest", tc.channel)
		}
		if entry.Path != tc.path {
			t.Errorf("%s path = %q", tc.channel, entry.Path)
		}
		if entry.SizeBytes != tc.size {
			t.Errorf("%s size = %d", tc.channel, entry.SizeBytes)
		}
		if entry.SHA256 != tc.sha256 {
			t.Errorf("%s checksum = %q", tc.channel, entry.SHA256)
		}
		wantURL := "https://huggingface.co/Aiden1020/" + strings.TrimSuffix(tc.path, "-Q5_K_M.gguf") + "/resolve/main/" + tc.path
		if entry.URL != wantURL {
			t.Errorf("%s url = %q", tc.channel, entry.URL)
		}
	}
}

func writeTestModel(t *testing.T, modelDir, filename string, body []byte) model.Entry {
	t.Helper()
	if err := os.MkdirAll(modelDir, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(modelDir, filename)
	if err := os.WriteFile(path, body, 0o600); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(body)
	return model.Entry{
		Channel:   strings.TrimSuffix(filename, ".gguf"),
		Name:      filename,
		ID:        filename,
		Version:   "test",
		Path:      filename,
		SizeBytes: int64(len(body)),
		SHA256:    hex.EncodeToString(sum[:]),
	}
}

func TestModelManagerListsOfficialDownloadAndLocalAlpha(t *testing.T) {
	modelDir := useTempModelDirectory(t)
	stable := writeTestModel(t, modelDir, "stable.gguf", []byte("official"))
	stable.Channel = "stable"
	stable.Name = "Official model"
	stable.URL = "https://example.invalid/stable.gguf"
	alpha := writeTestModel(t, modelDir, "alpha.gguf", []byte("internal"))
	alpha.Channel = "alpha"
	alpha.Name = "Internal alpha"
	manifest := model.Manifest{SchemaVersion: 1, DefaultChannel: "stable", Models: []model.Entry{stable, alpha}}
	manager := newModelManager(manifest)

	models, err := manager.list()
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 2 {
		t.Fatalf("model count = %d, want 2", len(models))
	}
	if !models[0].Selected || !models[0].Downloadable || models[0].State != "downloaded" {
		t.Fatalf("official model info = %#v", models[0])
	}
	if models[0].CanRemove {
		t.Fatal("active model must not be removable")
	}
	if models[1].Downloadable || models[1].State != "downloaded" || !models[1].CanRemove {
		t.Fatalf("local alpha model info = %#v", models[1])
	}
}

func TestModelManagerSelectionAndRemovalAreScopedToCatalog(t *testing.T) {
	modelDir := useTempModelDirectory(t)
	stable := writeTestModel(t, modelDir, "stable.gguf", []byte("stable"))
	stable.Channel = "stable"
	alpha := writeTestModel(t, modelDir, "alpha.gguf", []byte("alpha"))
	alpha.Channel = "alpha"
	manager := newModelManager(model.Manifest{SchemaVersion: 1, DefaultChannel: "stable", Models: []model.Entry{stable, alpha}})

	changed, err := manager.selectModel("alpha")
	if err != nil || !changed {
		t.Fatalf("select alpha = (%v, %v), want changed", changed, err)
	}
	if err := manager.removeModel("alpha"); err == nil || !strings.Contains(err.Error(), "switch") {
		t.Fatalf("removing active model error = %v, want switch guidance", err)
	}
	if err := manager.removeModel("stable"); err != nil {
		t.Fatalf("remove inactive model: %v", err)
	}
	if _, err := os.Stat(filepath.Join(modelDir, "stable.gguf")); !os.IsNotExist(err) {
		t.Fatalf("inactive model still exists, stat error = %v", err)
	}
	if err := manager.removeModel("../../outside"); err == nil {
		t.Fatal("unknown channel was accepted for removal")
	}
}

func TestModelManagerRefusesUnpublishedDownload(t *testing.T) {
	useTempModelDirectory(t)
	alpha := model.Entry{Channel: "alpha", Name: "Internal alpha", Path: "alpha.gguf"}
	manager := newModelManager(model.Manifest{SchemaVersion: 1, DefaultChannel: "alpha", Models: []model.Entry{alpha}})
	if _, err := manager.downloadModel("alpha"); err == nil || !strings.Contains(err.Error(), "not available for download") {
		t.Fatalf("internal alpha download error = %v, want unpublished model error", err)
	}
}

func TestManagedModelPathRejectsPathTraversal(t *testing.T) {
	for _, filename := range []string{"../model.gguf", filepath.Join("nested", "model.gguf"), ".."} {
		if _, err := managedModelPath(filename); err == nil {
			t.Errorf("managedModelPath(%q) accepted a non-catalog filename", filename)
		}
	}
}

func TestModelManagerPrunesOnlyListedLegacyFilesAfterVerification(t *testing.T) {
	modelDir := useTempModelDirectory(t)
	current := writeTestModel(t, modelDir, "current.gguf", []byte("current"))
	current.Channel = "stable"
	writeTestModel(t, modelDir, "old.gguf", []byte("old model"))
	writeTestModel(t, modelDir, "unrelated.gguf", []byte("user file"))
	manifest := model.Manifest{
		SchemaVersion:  1,
		DefaultChannel: "stable",
		Models:         []model.Entry{current},
		LegacyFiles:    []string{"old.gguf", "current.gguf", "missing.gguf"},
	}
	manager := newModelManager(manifest)

	info, err := manager.legacy()
	if err != nil || info.Files != 1 || info.SizeBytes != int64(len("old model")) {
		t.Fatalf("legacy = %#v, %v", info, err)
	}
	removed, err := manager.pruneLegacy()
	if err != nil || removed.Files != 1 {
		t.Fatalf("prune = %#v, %v", removed, err)
	}
	if _, err := os.Stat(filepath.Join(modelDir, "old.gguf")); !os.IsNotExist(err) {
		t.Fatalf("legacy file still exists: %v", err)
	}
	for _, name := range []string{"current.gguf", "unrelated.gguf"} {
		if _, err := os.Stat(filepath.Join(modelDir, name)); err != nil {
			t.Fatalf("%s must be kept: %v", name, err)
		}
	}
}

func TestModelManagerKeepsLegacyFilesWhenCurrentModelIsNotVerified(t *testing.T) {
	modelDir := useTempModelDirectory(t)
	current := writeTestModel(t, modelDir, "current.gguf", []byte("current"))
	current.Channel = "stable"
	current.SHA256 = strings.Repeat("0", 64)
	writeTestModel(t, modelDir, "old.gguf", []byte("old model"))
	manager := newModelManager(model.Manifest{
		SchemaVersion:  1,
		DefaultChannel: "stable",
		Models:         []model.Entry{current},
		LegacyFiles:    []string{"old.gguf"},
	})

	if _, err := manager.pruneLegacy(); err == nil {
		t.Fatal("prune succeeded with an unverified current model")
	}
	if _, err := os.Stat(filepath.Join(modelDir, "old.gguf")); err != nil {
		t.Fatalf("legacy file was removed: %v", err)
	}
}

func TestModelManagerPruneSkipsSymlinksAndInvalidNames(t *testing.T) {
	modelDir := useTempModelDirectory(t)
	current := writeTestModel(t, modelDir, "current.gguf", []byte("current"))
	current.Channel = "stable"
	outside := filepath.Join(t.TempDir(), "outside.gguf")
	if err := os.WriteFile(outside, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(modelDir, "link.gguf")); err != nil {
		t.Skip("symlinks unavailable")
	}
	manager := newModelManager(model.Manifest{
		SchemaVersion: 1, DefaultChannel: "stable", Models: []model.Entry{current},
		LegacyFiles: []string{"link.gguf"},
	})
	removed, err := manager.pruneLegacy()
	if err != nil || removed.Files != 0 {
		t.Fatalf("prune = %#v, %v", removed, err)
	}
	if _, err := os.Stat(outside); err != nil {
		t.Fatalf("symlink target was removed: %v", err)
	}
	bad := newModelManager(model.Manifest{
		SchemaVersion: 1, DefaultChannel: "stable", Models: []model.Entry{current},
		LegacyFiles: []string{"../escape.gguf"},
	})
	if _, err := bad.pruneLegacy(); err == nil {
		t.Fatal("path traversal in legacy list was accepted")
	}
}
