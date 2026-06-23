package model

import (
	"os"
	"path/filepath"
	"testing"
)

func TestManifestEntryAndMissingStatus(t *testing.T) {
	manifest := Manifest{
		SchemaVersion:  1,
		DefaultChannel: "stable",
		Models: []Entry{{
			Channel:   "stable",
			ID:        "model-id",
			Version:   "v1",
			Path:      filepath.Join(t.TempDir(), "missing.gguf"),
			SizeBytes: 10,
		}},
	}
	entry, ok := manifest.Entry("")
	if !ok {
		t.Fatal("entry not found")
	}
	status := Check(entry)
	if status.State != "missing" {
		t.Fatalf("state = %q", status.State)
	}
}

func TestModelStatusDetectsSizeMismatch(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "model.gguf")
	if err := os.WriteFile(path, []byte("small"), 0o600); err != nil {
		t.Fatal(err)
	}
	status := Check(Entry{ID: "model-id", Version: "v1", Path: path, SizeBytes: 100})
	if status.State != "corrupt" {
		t.Fatalf("state = %q", status.State)
	}
}
