package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"localsubs/internal/runtime"
	"localsubs/internal/session"
)

func newTestServer() *Server {
	backend := &runtime.StaticTranslator{Profile: runtime.DefaultProfile(), Translation: "我馬上回來。", Ready: true}
	service := session.NewService(backend, runtime.DefaultProfile())
	return New(Config{
		Token:               "test-token",
		AllowedOrigins:      []string{"chrome-extension://abc"},
		MaxBodyBytes:        1024,
		MaxTextBytes:        128,
		DefaultContextLines: 1,
	}, service)
}

func performJSON(handler http.Handler, method, path, token string, payload any) *httptest.ResponseRecorder {
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func TestHealthReturnsStructuredState(t *testing.T) {
	handler := newTestServer().Handler()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var payload runtime.Health
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if !payload.OK || payload.APIVersion != "1" || payload.Backend.Kind == "" {
		t.Fatalf("unexpected health payload: %#v", payload)
	}
}

func TestTranslateRequiresAuth(t *testing.T) {
	rec := performJSON(newTestServer().Handler(), http.MethodPost, "/translate", "", map[string]any{"text": "Hello."})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "forbidden") {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

func TestTranslateAcceptsLegacyPayload(t *testing.T) {
	rec := performJSON(newTestServer().Handler(), http.MethodPost, "/translate", "test-token", map[string]any{
		"text":           "Wait here.\nI'll be right back.",
		"sourceLanguage": "en",
		"targetLanguage": "zh-Hant",
		"ctxSize":        1,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
	}
	var payload runtime.TranslateResult
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Translation != "我馬上回來。" || payload.Status != "ok" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestTranslateAcceptsV1Payload(t *testing.T) {
	rec := performJSON(newTestServer().Handler(), http.MethodPost, "/translate", "test-token", map[string]any{
		"sessionId":      "tab-1",
		"cueId":          "cue-1",
		"currentText":    "I'll be right back.",
		"contextLines":   []string{"Wait here."},
		"sourceLanguage": "en",
		"targetLanguage": "zh-Hant",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestTranslateHandlesOptionsAndAllowedOrigin(t *testing.T) {
	req := httptest.NewRequest(http.MethodOptions, "/translate", nil)
	req.Header.Set("Origin", "chrome-extension://abc")
	rec := httptest.NewRecorder()
	newTestServer().Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "chrome-extension://abc" {
		t.Fatalf("missing allowed origin")
	}
}

func TestTranslateRejectsUnknownOrigin(t *testing.T) {
	req := httptest.NewRequest(http.MethodOptions, "/translate", nil)
	req.Header.Set("Origin", "https://evil.example")
	rec := httptest.NewRecorder()
	newTestServer().Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestDefaultOriginPolicyAllowsExtensionsAndRejectsWebPages(t *testing.T) {
	backend := &runtime.StaticTranslator{Profile: runtime.DefaultProfile(), Translation: "我馬上回來。", Ready: true}
	api := New(Config{Token: "test-token"}, backend).Handler()

	extensionReq := httptest.NewRequest(http.MethodOptions, "/translate", nil)
	extensionReq.Header.Set("Origin", "chrome-extension://abc")
	extensionRec := httptest.NewRecorder()
	api.ServeHTTP(extensionRec, extensionReq)
	if extensionRec.Code != http.StatusNoContent {
		t.Fatalf("extension origin status = %d", extensionRec.Code)
	}

	webReq := httptest.NewRequest(http.MethodOptions, "/translate", nil)
	webReq.Header.Set("Origin", "https://example.com")
	webRec := httptest.NewRecorder()
	api.ServeHTTP(webRec, webReq)
	if webRec.Code != http.StatusForbidden {
		t.Fatalf("web origin status = %d", webRec.Code)
	}
}

func TestTranslateRejectsInvalidJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/translate", strings.NewReader("{bad"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer test-token")
	rec := httptest.NewRecorder()
	newTestServer().Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestTranslateRejectsOversizedBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/translate", strings.NewReader(strings.Repeat("x", 2048)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer test-token")
	rec := httptest.NewRecorder()
	newTestServer().Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d", rec.Code)
	}
}
