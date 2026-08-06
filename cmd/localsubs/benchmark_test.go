package main

import (
	"archive/zip"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadMiniBenchmarkSetAndParsePrompts(t *testing.T) {
	cases, datasetPath, datasetSHA256, err := loadBenchmarkDataset("", 0)
	if err != nil {
		t.Fatal(err)
	}
	if datasetPath != builtInBenchmarkDatasetPath {
		t.Fatalf("dataset path = %q, want %q", datasetPath, builtInBenchmarkDatasetPath)
	}
	if len(cases) != 100 {
		t.Fatalf("mini test set has %d cases, want 100", len(cases))
	}
	fileSHA256, err := fileSHA256(filepath.Join("..", "..", "mini_test_set.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if datasetSHA256 != fileSHA256 {
		t.Fatalf("embedded dataset SHA-256 = %q, repository dataset = %q", datasetSHA256, fileSHA256)
	}
	request, expected, err := benchmarkRequest(cases[0])
	if err != nil {
		t.Fatal(err)
	}
	if request.CurrentText != "There are multiple universes." || len(request.ContextLines) != 1 || expected != "而是存在多重宇宙" {
		t.Fatalf("unexpected parsed benchmark case: %#v, expected %q", request, expected)
	}
}

func TestLoadCustomBenchmarkDataset(t *testing.T) {
	path := filepath.Join("..", "..", "mini_test_set.jsonl")
	cases, datasetPath, _, err := loadBenchmarkDataset(path, 1)
	if err != nil {
		t.Fatal(err)
	}
	if datasetPath != path || len(cases) != 1 {
		t.Fatalf("custom dataset path = %q, cases = %d", datasetPath, len(cases))
	}
}

func TestExtractZipRejectsTraversalAndExtractsFiles(t *testing.T) {
	safeArchive := filepath.Join(t.TempDir(), "safe.zip")
	writeTestZip(t, safeArchive, map[string]string{"llama-server.exe": "binary", "runtime.dll": "dll"})
	destination := t.TempDir()
	if err := extractZip(safeArchive, destination); err != nil {
		t.Fatal(err)
	}
	if body, err := os.ReadFile(filepath.Join(destination, "llama-server.exe")); err != nil || string(body) != "binary" {
		t.Fatalf("unexpected extracted runtime: %q, %v", body, err)
	}

	unsafeArchive := filepath.Join(t.TempDir(), "unsafe.zip")
	writeTestZip(t, unsafeArchive, map[string]string{"../escape.dll": "bad"})
	if err := extractZip(unsafeArchive, t.TempDir()); err == nil {
		t.Fatal("archive traversal must be rejected")
	}
}

func TestFileMatchesSHA256(t *testing.T) {
	path := filepath.Join(t.TempDir(), "asset.zip")
	if err := os.WriteFile(path, []byte("localsubs"), 0o644); err != nil {
		t.Fatal(err)
	}
	valid, err := fileMatchesSHA256(path, "f3fb062a1c812970da5c5943be44424c19180cc8380f759a87973fe4de9ce8b9")
	if err != nil || !valid {
		t.Fatalf("expected checksum match: valid=%v err=%v", valid, err)
	}
	valid, err = fileMatchesSHA256(path, "0000000000000000000000000000000000000000000000000000000000000000")
	if err != nil || valid {
		t.Fatalf("expected checksum mismatch: valid=%v err=%v", valid, err)
	}
}

func writeTestZip(t *testing.T, path string, entries map[string]string) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(file)
	for name, body := range entries {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestSummarizeBenchmarkUsesNearestRankPercentiles(t *testing.T) {
	results := []benchmarkResult{
		{LatencyMS: 10, ExactMatch: true}, {LatencyMS: 20}, {LatencyMS: 30, ExactMatch: true},
		{LatencyMS: 40}, {LatencyMS: 50}, {Error: "failed"},
	}
	summary := summarizeBenchmark(results)
	if summary.Count != 5 || summary.Failures != 1 || summary.MeanMS != 30 || summary.P50MS != 30 || summary.P95MS != 50 {
		t.Fatalf("unexpected benchmark summary: %#v", summary)
	}
	if summary.ExactMatchPercent != 40 {
		t.Fatalf("exact match = %f, want 40", summary.ExactMatchPercent)
	}
}
