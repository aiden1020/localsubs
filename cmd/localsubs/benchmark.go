package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	embeddeddata "localsubs"
	localruntime "localsubs/internal/runtime"
	"localsubs/internal/ui"
)

const benchmarkSchemaVersion = 1
const builtInBenchmarkDatasetPath = "builtin:mini_test_set.jsonl"

type benchmarkMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type benchmarkCase struct {
	ID       string             `json:"id"`
	Messages []benchmarkMessage `json:"messages"`
}

type benchmarkResult struct {
	ID          string  `json:"id"`
	LatencyMS   float64 `json:"latencyMs"`
	CurrentText string  `json:"currentText"`
	Expected    string  `json:"expected"`
	Translation string  `json:"translation,omitempty"`
	ExactMatch  bool    `json:"exactMatch"`
	Error       string  `json:"error,omitempty"`
}

type latencySummary struct {
	Count             int     `json:"count"`
	Failures          int     `json:"failures"`
	MinMS             float64 `json:"minMs"`
	MeanMS            float64 `json:"meanMs"`
	P50MS             float64 `json:"p50Ms"`
	P90MS             float64 `json:"p90Ms"`
	P95MS             float64 `json:"p95Ms"`
	P99MS             float64 `json:"p99Ms"`
	MaxMS             float64 `json:"maxMs"`
	ThroughputPerSec  float64 `json:"throughputPerSecond"`
	ExactMatchPercent float64 `json:"exactMatchPercent"`
}

type benchmarkSystem struct {
	OS                string `json:"os"`
	Architecture      string `json:"architecture"`
	CPU               string `json:"cpu,omitempty"`
	LogicalProcessors string `json:"logicalProcessors,omitempty"`
	GPU               string `json:"gpu,omitempty"`
	NVIDIADriver      string `json:"nvidiaDriver,omitempty"`
}

type benchmarkReport struct {
	SchemaVersion    int                      `json:"schemaVersion"`
	GeneratedAt      string                   `json:"generatedAt"`
	HelperVersion    string                   `json:"helperVersion"`
	RuntimeVersion   string                   `json:"runtimeVersion"`
	Backend          localruntime.BackendMode `json:"backend"`
	RuntimePath      string                   `json:"runtimePath"`
	ModelPath        string                   `json:"modelPath"`
	ModelSHA256      string                   `json:"modelSha256"`
	DatasetPath      string                   `json:"datasetPath"`
	DatasetSHA256    string                   `json:"datasetSha256"`
	WarmupIterations int                      `json:"warmupIterations"`
	GPUOffloadLayers int                      `json:"gpuOffloadLayers"`
	StartupLatencyMS float64                  `json:"startupLatencyMs"`
	System           benchmarkSystem          `json:"system"`
	Summary          latencySummary           `json:"summary"`
	Results          []benchmarkResult        `json:"results"`
}

func benchmarkCommand(args []string) error {
	flags := flag.NewFlagSet("benchmark", flag.ContinueOnError)
	backendValue := flags.String("backend", "auto", "inference backend: auto, cpu, or cuda")
	runtimePath := flags.String("runtime", "", "explicit llama-server executable")
	modelPath := flags.String("model", localruntime.DefaultModelFilename, "GGUF model path")
	datasetPath := flags.String("dataset", "", "custom JSONL benchmark dataset (default: built-in 100-case workload)")
	outputPath := flags.String("output", "", "write the full JSON report to this path")
	warmup := flags.Int("warmup", 3, "warmup requests before measurement")
	limit := flags.Int("limit", 0, "maximum measured samples; 0 uses all")
	startupTimeout := flags.Duration("startup-timeout", 90*time.Second, "llama-server startup timeout")
	requestTimeout := flags.Duration("request-timeout", 30*time.Second, "timeout per translation")
	jsonMode := flags.Bool("json", false, "print the full JSON report")
	if err := parseFlags(flags, args); err != nil {
		return err
	}
	if *warmup < 0 || *limit < 0 || *startupTimeout <= 0 || *requestTimeout <= 0 {
		return fmt.Errorf("warmup and limit must be non-negative; timeouts must be positive")
	}
	mode, err := localruntime.ParseBackendMode(*backendValue)
	if err != nil {
		return err
	}
	candidate, err := selectBenchmarkRuntime(mode, *runtimePath)
	if err != nil {
		return err
	}
	cases, resolvedDatasetPath, datasetSHA256, err := loadBenchmarkDataset(*datasetPath, *limit)
	if err != nil {
		return err
	}
	if len(cases) == 0 {
		return fmt.Errorf("benchmark dataset contains no cases")
	}
	resolvedModel := resolveModelPath(*modelPath)
	if info, err := os.Stat(resolvedModel); err != nil || info.IsDir() {
		return fmt.Errorf("benchmark model not found: %s", resolvedModel)
	}
	report, err := executeBenchmark(
		candidate, resolvedModel, resolvedDatasetPath, datasetSHA256,
		cases, *warmup, *startupTimeout, *requestTimeout,
	)
	if reportErr := writeBenchmarkReport(report, *outputPath, *jsonMode); reportErr != nil {
		return reportErr
	}
	if err != nil {
		return err
	}
	return nil
}

func selectBenchmarkRuntime(mode localruntime.BackendMode, explicitPath string) (localruntime.RuntimeCandidate, error) {
	if strings.TrimSpace(explicitPath) != "" {
		if mode == localruntime.BackendAuto {
			return localruntime.RuntimeCandidate{}, fmt.Errorf("--runtime requires an explicit --backend cpu or cuda")
		}
		absolute, err := filepath.Abs(explicitPath)
		if err != nil {
			return localruntime.RuntimeCandidate{}, err
		}
		return localruntime.RuntimeCandidate{Backend: mode, Path: absolute}, nil
	}
	candidates, err := localruntime.DiscoverRuntimeCandidates(mode)
	if err != nil {
		return localruntime.RuntimeCandidate{}, err
	}
	return candidates[0], nil
}

func executeBenchmark(
	candidate localruntime.RuntimeCandidate,
	modelPath string,
	datasetPath string,
	datasetSHA256 string,
	cases []benchmarkCase,
	warmup int,
	startupTimeout time.Duration,
	requestTimeout time.Duration,
) (benchmarkReport, error) {
	report := benchmarkReport{
		SchemaVersion: benchmarkSchemaVersion, GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		HelperVersion: localruntime.HelperVersion, Backend: candidate.Backend,
		RuntimePath: ui.CompactPath(candidate.Path), ModelPath: ui.CompactPath(modelPath), DatasetPath: datasetPath,
		DatasetSHA256:    datasetSHA256,
		WarmupIterations: warmup, System: collectBenchmarkSystem(),
	}
	report.RuntimeVersion = executableVersion(candidate.Path)
	report.ModelSHA256, _ = fileSHA256(modelPath)

	profile := localruntime.DefaultProfile()
	profile.ModelPath = modelPath
	if candidate.Backend == localruntime.BackendCPU {
		profile.GPULayers = 0
	}
	report.GPUOffloadLayers = profile.GPULayers
	port, err := localruntime.AllocateLocalPort()
	if err != nil {
		return report, err
	}
	startupStarted := time.Now()
	backend, err := localruntime.StartManagedBackend(context.Background(), localruntime.LlamaServerCommand{
		Binary: candidate.Path, Model: modelPath, Host: "127.0.0.1", Port: port, Profile: profile,
	}, startupTimeout)
	report.StartupLatencyMS = milliseconds(time.Since(startupStarted))
	if err != nil {
		return report, err
	}
	defer backend.Stop()

	client := localruntime.NewLlamaClientWithBackend(backend.BaseURL, profile, true, "llama.cpp-"+string(candidate.Backend))
	client.HTTPClient.Timeout = requestTimeout
	for index := 0; index < warmup; index++ {
		request, _, parseErr := benchmarkRequest(cases[index%len(cases)])
		if parseErr != nil {
			return report, parseErr
		}
		ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
		_, warmupErr := client.Translate(ctx, request)
		cancel()
		if warmupErr != nil {
			return report, fmt.Errorf("warmup request failed: %w", warmupErr)
		}
	}

	report.Results = make([]benchmarkResult, 0, len(cases))
	var benchmarkErrors []error
	for index, item := range cases {
		request, expected, parseErr := benchmarkRequest(item)
		result := benchmarkResult{ID: item.ID, CurrentText: request.CurrentText, Expected: expected}
		if parseErr != nil {
			result.Error = parseErr.Error()
			benchmarkErrors = append(benchmarkErrors, parseErr)
			report.Results = append(report.Results, result)
			continue
		}
		started := time.Now()
		ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
		translation, translateErr := client.Translate(ctx, request)
		cancel()
		result.LatencyMS = milliseconds(time.Since(started))
		if translateErr != nil {
			result.Error = translateErr.Error()
			benchmarkErrors = append(benchmarkErrors, fmt.Errorf("%s: %w", item.ID, translateErr))
		} else {
			result.Translation = translation.Translation
			result.ExactMatch = strings.TrimSpace(result.Translation) == strings.TrimSpace(expected)
		}
		report.Results = append(report.Results, result)
		fmt.Fprintf(os.Stderr, "\r  %s benchmark %d/%d", strings.ToUpper(string(candidate.Backend)), index+1, len(cases))
	}
	fmt.Fprintln(os.Stderr)
	report.Summary = summarizeBenchmark(report.Results)
	if len(benchmarkErrors) > 0 {
		return report, fmt.Errorf("benchmark completed with %d failed requests", len(benchmarkErrors))
	}
	return report, nil
}

func loadBenchmarkDataset(path string, limit int) ([]benchmarkCase, string, string, error) {
	resolvedPath := strings.TrimSpace(path)
	var body []byte
	var err error
	if resolvedPath == "" {
		resolvedPath = builtInBenchmarkDatasetPath
		body = embeddeddata.MiniBenchmarkDataset()
	} else {
		body, err = os.ReadFile(resolvedPath)
		if err != nil {
			return nil, "", "", fmt.Errorf("read benchmark dataset %q: %w", resolvedPath, err)
		}
	}
	cases, err := decodeBenchmarkCases(bytes.NewReader(body), limit)
	if err != nil {
		return nil, "", "", err
	}
	return cases, resolvedPath, bytesSHA256(body), nil
}

func decodeBenchmarkCases(reader io.Reader, limit int) ([]benchmarkCase, error) {
	cases := make([]benchmarkCase, 0, 100)
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		var item benchmarkCase
		if err := json.Unmarshal(scanner.Bytes(), &item); err != nil {
			return nil, fmt.Errorf("decode benchmark line %d: %w", len(cases)+1, err)
		}
		cases = append(cases, item)
		if limit > 0 && len(cases) >= limit {
			break
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return cases, nil
}

func benchmarkRequest(item benchmarkCase) (localruntime.TranslateRequest, string, error) {
	userContent := ""
	expected := ""
	for _, message := range item.Messages {
		switch message.Role {
		case "user":
			userContent = message.Content
		case "assistant":
			expected = message.Content
		}
	}
	const currentMarker = "\n\nCUR:\n"
	if !strings.HasPrefix(userContent, "CTX:\n") || !strings.Contains(userContent, currentMarker) {
		return localruntime.TranslateRequest{}, expected, fmt.Errorf("case %s has an invalid CTX/CUR prompt", item.ID)
	}
	parts := strings.SplitN(strings.TrimPrefix(userContent, "CTX:\n"), currentMarker, 2)
	contextLines := make([]string, 0)
	for _, line := range strings.Split(parts[0], "\n") {
		if line = strings.TrimSpace(line); line != "" {
			contextLines = append(contextLines, line)
		}
	}
	current := strings.TrimSpace(parts[1])
	if current == "" {
		return localruntime.TranslateRequest{}, expected, fmt.Errorf("case %s has empty current text", item.ID)
	}
	return localruntime.TranslateRequest{
		SessionID: "benchmark", CueID: item.ID, CurrentText: current,
		ContextLines: contextLines, SourceLanguage: "en", TargetLanguage: "zh-Hant",
	}, expected, nil
}

func summarizeBenchmark(results []benchmarkResult) latencySummary {
	latencies := make([]float64, 0, len(results))
	failures := 0
	exact := 0
	for _, result := range results {
		if result.Error != "" {
			failures++
			continue
		}
		latencies = append(latencies, result.LatencyMS)
		if result.ExactMatch {
			exact++
		}
	}
	summary := latencySummary{Count: len(latencies), Failures: failures}
	if len(latencies) == 0 {
		return summary
	}
	sort.Float64s(latencies)
	var total float64
	for _, latency := range latencies {
		total += latency
	}
	summary.MinMS = latencies[0]
	summary.MeanMS = total / float64(len(latencies))
	summary.P50MS = percentile(latencies, 0.50)
	summary.P90MS = percentile(latencies, 0.90)
	summary.P95MS = percentile(latencies, 0.95)
	summary.P99MS = percentile(latencies, 0.99)
	summary.MaxMS = latencies[len(latencies)-1]
	if summary.MeanMS > 0 {
		summary.ThroughputPerSec = 1000 / summary.MeanMS
	}
	summary.ExactMatchPercent = float64(exact) / float64(len(latencies)) * 100
	return summary
}

func percentile(sorted []float64, quantile float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	index := int(math.Ceil(quantile*float64(len(sorted)))) - 1
	if index < 0 {
		index = 0
	}
	if index >= len(sorted) {
		index = len(sorted) - 1
	}
	return sorted[index]
}

func writeBenchmarkReport(report benchmarkReport, outputPath string, jsonMode bool) error {
	body, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return err
	}
	if outputPath != "" {
		if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil && filepath.Dir(outputPath) != "." {
			return err
		}
		if err := os.WriteFile(outputPath, append(body, '\n'), 0o644); err != nil {
			return err
		}
	}
	if jsonMode {
		fmt.Println(string(body))
		return nil
	}
	fmt.Printf("%s  %s\n\n", ui.Bold("LocalSubs Benchmark"), strings.ToUpper(string(report.Backend)))
	ui.PrintRow("Runtime", ui.CompactPath(report.RuntimePath))
	ui.PrintRow("Samples", fmt.Sprintf("%d (%d failures)", report.Summary.Count, report.Summary.Failures))
	ui.PrintRow("Startup", fmt.Sprintf("%.1f ms", report.StartupLatencyMS))
	ui.PrintRow("Mean", fmt.Sprintf("%.1f ms", report.Summary.MeanMS))
	ui.PrintRow("P50 / P95", fmt.Sprintf("%.1f / %.1f ms", report.Summary.P50MS, report.Summary.P95MS))
	ui.PrintRow("P99 / Max", fmt.Sprintf("%.1f / %.1f ms", report.Summary.P99MS, report.Summary.MaxMS))
	ui.PrintRow("Throughput", fmt.Sprintf("%.2f subtitles/s", report.Summary.ThroughputPerSec))
	if outputPath != "" {
		ui.PrintRow("Report", ui.CompactPath(outputPath))
	}
	return nil
}

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := bufio.NewReader(file).WriteTo(hash); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func bytesSHA256(body []byte) string {
	hash := sha256.Sum256(body)
	return hex.EncodeToString(hash[:])
}

func executableVersion(path string) string {
	output, err := exec.Command(path, "--version").CombinedOutput()
	if err != nil {
		return "unknown"
	}
	return strings.TrimSpace(string(output))
}

func milliseconds(duration time.Duration) float64 {
	return float64(duration.Microseconds()) / 1000
}
