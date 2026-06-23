package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	APIVersion             = "1"
	HelperVersion          = "0.1.0"
	DefaultProfileName     = "default"
	PromptTemplateVersion  = "subtitle-v1"
	DefaultModelID         = "subtitle-en2tw-0.6b"
	DefaultModelVersion    = "2026.06-dev"
	DefaultModelFilename   = "SubtitleEN2TW-0.6B-Q5_K_M.gguf"
	DefaultManifestFilename = "model_manifest.json"
)

type Profile struct {
	Name                 string
	ModelPath            string
	ModelID              string
	ModelVersion         string
	NPredict             int
	SubtitleContextLines int
	CachePrompt          bool
	CacheReuse           *int
	LlamaContext         int
	GPULayers            int
	PromptTemplate       string
}

func DefaultProfile() Profile {
	return Profile{
		Name:                 DefaultProfileName,
		ModelPath:            DefaultModelFilename,
		ModelID:              DefaultModelID,
		ModelVersion:         DefaultModelVersion,
		NPredict:             24,
		SubtitleContextLines: 1,
		CachePrompt:          true,
		CacheReuse:           nil,
		LlamaContext:         512,
		GPULayers:            99,
		PromptTemplate:       PromptTemplateVersion,
	}
}

type TranslateRequest struct {
	SessionID      string
	CueID          string
	CurrentText    string
	ContextLines   []string
	SourceLanguage string
	TargetLanguage string
}

type DecodeOptions struct {
	DefaultContextLines int
}

type TranslateResult struct {
	Status      string `json:"status"`
	Translation string `json:"translation"`
	Cache       string `json:"cache"`
	Superseded  bool   `json:"superseded"`
	Model       string `json:"model"`
}

type BackendState struct {
	Kind  string `json:"kind"`
	Ready bool   `json:"ready"`
	Owned bool   `json:"owned"`
}

type ModelState struct {
	ID      string `json:"id"`
	Version string `json:"version"`
	Status  string `json:"status"`
}

type Health struct {
	OK            bool         `json:"ok"`
	APIVersion    string       `json:"apiVersion"`
	HelperVersion string       `json:"helperVersion"`
	Backend       BackendState `json:"backend"`
	Model         ModelState   `json:"model"`
	Profile       string       `json:"profile"`
	LastError     string       `json:"lastError"`
}

type Translator interface {
	Translate(ctx context.Context, req TranslateRequest) (TranslateResult, error)
	Health(ctx context.Context) Health
}

type CodedError struct {
	Code       string
	Message    string
	HTTPStatus int
}

func (e CodedError) Error() string {
	if e.Message == "" {
		return e.Code
	}
	return e.Message
}

func ErrorCode(err error) string {
	var coded CodedError
	if errors.As(err, &coded) {
		return coded.Code
	}
	return "internal_error"
}

func DecodeTranslate(raw map[string]any, options DecodeOptions) (TranslateRequest, bool, error) {
	defaultContextLines := options.DefaultContextLines
	if defaultContextLines < 0 {
		defaultContextLines = 1
	}
	targetLanguage := stringField(raw, "targetLanguage", "zh-Hant")
	sourceLanguage := stringField(raw, "sourceLanguage", "en")
	if currentText, ok := raw["currentText"].(string); ok {
		req := TranslateRequest{
			SessionID:      stringField(raw, "sessionId", ""),
			CueID:          stringField(raw, "cueId", ""),
			CurrentText:    strings.TrimSpace(currentText),
			ContextLines:   stringSliceField(raw, "contextLines"),
			SourceLanguage: sourceLanguage,
			TargetLanguage: targetLanguage,
		}
		return req, req.CurrentText == "" && len(req.ContextLines) == 0, nil
	}

	textValue, ok := raw["text"]
	if !ok {
		return TranslateRequest{}, false, CodedError{Code: "unsupported_request", Message: "Missing currentText or legacy text field.", HTTPStatus: http.StatusUnprocessableEntity}
	}
	text, ok := textValue.(string)
	if !ok {
		return TranslateRequest{}, false, CodedError{Code: "invalid_field", Message: "text must be a string.", HTTPStatus: http.StatusBadRequest}
	}
	ctxSize, err := intField(raw, "ctxSize", defaultContextLines)
	if err != nil {
		return TranslateRequest{}, false, CodedError{Code: "invalid_field", Message: "ctxSize must be an integer.", HTTPStatus: http.StatusBadRequest}
	}
	if ctxSize < 0 || ctxSize > 8 {
		return TranslateRequest{}, false, CodedError{Code: "invalid_context_size", Message: "ctxSize must be between 0 and 8.", HTTPStatus: http.StatusBadRequest}
	}
	lines := nonEmptyLines(text)
	if len(lines) == 0 {
		return TranslateRequest{SourceLanguage: sourceLanguage, TargetLanguage: targetLanguage}, true, nil
	}
	current := lines[len(lines)-1]
	contextLines := lines[:len(lines)-1]
	if len(contextLines) > ctxSize {
		contextLines = contextLines[len(contextLines)-ctxSize:]
	}
	return TranslateRequest{
		CurrentText:    current,
		ContextLines:   contextLines,
		SourceLanguage: sourceLanguage,
		TargetLanguage: targetLanguage,
	}, false, nil
}

func modelStatus(ready bool) string {
	if ready {
		return "ready"
	}
	return "missing"
}

func ValidateTextSize(req TranslateRequest, maxBytes int) error {
	if maxBytes <= 0 {
		return nil
	}
	if len(req.CurrentText) > maxBytes {
		return CodedError{Code: "text_too_large", Message: "Subtitle text is too large.", HTTPStatus: http.StatusRequestEntityTooLarge}
	}
	for _, line := range req.ContextLines {
		if len(line) > maxBytes {
			return CodedError{Code: "text_too_large", Message: "Subtitle text is too large.", HTTPStatus: http.StatusRequestEntityTooLarge}
		}
	}
	return nil
}

func stringField(raw map[string]any, key string, fallback string) string {
	if value, ok := raw[key].(string); ok {
		return value
	}
	return fallback
}

func stringSliceField(raw map[string]any, key string) []string {
	values, ok := raw[key].([]any)
	if !ok {
		return nil
	}
	result := make([]string, 0, len(values))
	for _, value := range values {
		if line, ok := value.(string); ok && strings.TrimSpace(line) != "" {
			result = append(result, strings.TrimSpace(line))
		}
	}
	return result
}

func intField(raw map[string]any, key string, fallback int) (int, error) {
	value, ok := raw[key]
	if !ok {
		return fallback, nil
	}
	switch typed := value.(type) {
	case float64:
		if typed != float64(int(typed)) {
			return 0, strconv.ErrSyntax
		}
		return int(typed), nil
	case string:
		return strconv.Atoi(typed)
	default:
		return 0, strconv.ErrSyntax
	}
}

func nonEmptyLines(text string) []string {
	rawLines := strings.Split(text, "\n")
	lines := make([]string, 0, len(rawLines))
	for _, line := range rawLines {
		line = strings.TrimSpace(line)
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}

func BuildPrompt(current string, contextLines []string) string {
	cleanContext := make([]string, 0, len(contextLines))
	for _, line := range contextLines {
		line = strings.TrimSpace(line)
		if line != "" {
			cleanContext = append(cleanContext, line)
		}
	}
	current = strings.TrimSpace(current)
	contextText := strings.Join(cleanContext, "\n")
	userContent := fmt.Sprintf("CTX:\n%s\n\nCUR:\n%s", contextText, current)
	return "<|im_start|>user\n" + userContent + "<|im_end|>\n<|im_start|>assistant\n"
}

var translationCleaner = strings.NewReplacer("<|im_start|>", "", "<|im_end|>", "", "assistant", "")

func CleanTranslation(text string) string {
	text = translationCleaner.Replace(text)
	lines := strings.Split(text, "\n")
	cleaned := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || line == "CTX:" || line == "CUR:" || strings.HasPrefix(line, "CTX:") || strings.HasPrefix(line, "CUR:") {
			continue
		}
		cleaned = append(cleaned, line)
	}
	return strings.Join(cleaned, "\n")
}

type LlamaClient struct {
	BaseURL    string
	HTTPClient *http.Client
	Profile    Profile
	ModelReady bool
	Owned      bool
	LastError  string
}

func NewLlamaClient(baseURL string, profile Profile, owned bool) *LlamaClient {
	return &LlamaClient{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTPClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		Profile:    profile,
		ModelReady: true,
		Owned:      owned,
	}
}

func (c *LlamaClient) Translate(ctx context.Context, req TranslateRequest) (TranslateResult, error) {
	if !c.ModelReady {
		return TranslateResult{}, CodedError{Code: "model_not_ready", Message: "Model is not loaded yet.", HTTPStatus: http.StatusServiceUnavailable}
	}
	prompt := BuildPrompt(req.CurrentText, req.ContextLines)
	payload := map[string]any{
		"prompt":       prompt,
		"n_predict":    c.Profile.NPredict,
		"temperature":  0,
		"stop":         []string{"<|im_end|>"},
		"cache_prompt": c.Profile.CachePrompt,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return TranslateResult{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/completion", bytes.NewReader(body))
	if err != nil {
		return TranslateResult{}, err
	}
	request.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTPClient.Do(request)
	if err != nil {
		c.LastError = err.Error()
		return TranslateResult{}, CodedError{Code: "backend_timeout", Message: "Backend request failed.", HTTPStatus: http.StatusGatewayTimeout}
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		c.LastError = fmt.Sprintf("backend status %d", resp.StatusCode)
		return TranslateResult{}, CodedError{Code: "backend_error", Message: "Backend returned an error.", HTTPStatus: http.StatusServiceUnavailable}
	}
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return TranslateResult{}, err
	}
	var decoded struct {
		Content string `json:"content"`
	}
	if err := json.Unmarshal(respBody, &decoded); err != nil {
		c.LastError = "backend returned malformed JSON"
		return TranslateResult{}, CodedError{Code: "backend_malformed_json", Message: "Backend returned malformed JSON.", HTTPStatus: http.StatusServiceUnavailable}
	}
	return TranslateResult{
		Status:      "ok",
		Translation: CleanTranslation(decoded.Content),
		Cache:       "miss",
		Superseded:  false,
		Model:       c.Profile.ModelID,
	}, nil
}

func (c *LlamaClient) Health(ctx context.Context) Health {
	ready := c.ModelReady
	lastError := c.LastError
	if c.BaseURL != "" {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/health", nil)
		if err == nil {
			resp, err := c.HTTPClient.Do(request)
			if err == nil {
				ready = resp.StatusCode == http.StatusOK
				resp.Body.Close()
			} else {
				ready = false
				lastError = err.Error()
			}
		}
	}
	return Health{
		OK:            ready,
		APIVersion:    APIVersion,
		HelperVersion: HelperVersion,
		Backend: BackendState{
			Kind:  "llama.cpp",
			Ready: ready,
			Owned: c.Owned,
		},
		Model: ModelState{
			ID:      c.Profile.ModelID,
			Version: c.Profile.ModelVersion,
			Status:  modelStatus(ready),
		},
		Profile:   c.Profile.Name,
		LastError: lastError,
	}
}

type StaticTranslator struct {
	Profile     Profile
	Translation string
	Ready       bool
	Calls       int
}

func (t *StaticTranslator) Translate(ctx context.Context, req TranslateRequest) (TranslateResult, error) {
	t.Calls++
	if !t.Ready {
		return TranslateResult{}, CodedError{Code: "model_not_ready", Message: "Model is not loaded yet.", HTTPStatus: http.StatusServiceUnavailable}
	}
	return TranslateResult{
		Status:      "ok",
		Translation: t.Translation,
		Cache:       "miss",
		Superseded:  false,
		Model:       t.Profile.ModelID,
	}, nil
}

func (t *StaticTranslator) Health(ctx context.Context) Health {
	return Health{
		OK:            t.Ready,
		APIVersion:    APIVersion,
		HelperVersion: HelperVersion,
		Backend:       BackendState{Kind: "fake", Ready: t.Ready, Owned: true},
		Model:         ModelState{ID: t.Profile.ModelID, Version: t.Profile.ModelVersion, Status: modelStatus(t.Ready)},
		Profile:       t.Profile.Name,
		LastError:     "",
	}
}
