package nativehost

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"
	"time"

	"localsubs/internal/runtime"
)

func TestReadWriteMessageRoundTrip(t *testing.T) {
	var buffer bytes.Buffer
	input := Message{
		ID:   "1",
		Type: "translate",
		Payload: mustRawMessage(t, map[string]any{
			"text":           "I'll be right back.",
			"sourceLanguage": "en",
			"targetLanguage": "zh-Hant",
		}),
	}

	if err := WriteMessage(&buffer, input); err != nil {
		t.Fatal(err)
	}
	output, err := ReadMessage(&buffer, DefaultMaxFrameBytes)
	if err != nil {
		t.Fatal(err)
	}
	if output.ID != input.ID || output.Type != input.Type {
		t.Fatalf("unexpected message: %#v", output)
	}
}

func TestHandleTranslate(t *testing.T) {
	profile := runtime.DefaultProfile()
	host := New(Config{DefaultContextLines: 1}, &runtime.StaticTranslator{
		Profile:     profile,
		Translation: "我馬上回來。",
		Ready:       true,
	})

	response := host.Handle(context.Background(), Message{
		ID:   "cue-1",
		Type: "translate",
		Payload: mustRawMessage(t, map[string]any{
			"text":           "Previous line.\nI'll be right back.",
			"sourceLanguage": "en",
			"targetLanguage": "zh-Hant",
			"ctxSize":        1,
		}),
	})

	if !response.OK {
		t.Fatalf("expected ok response: %#v", response.Error)
	}
	if response.Type != "translate.result" {
		t.Fatalf("unexpected response type: %s", response.Type)
	}
	body, err := json.Marshal(response.Payload)
	if err != nil {
		t.Fatal(err)
	}
	var result runtime.TranslateResult
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatal(err)
	}
	if result.Translation != "我馬上回來。" {
		t.Fatalf("unexpected translation: %q", result.Translation)
	}
}

func TestHandleHealth(t *testing.T) {
	host := New(Config{}, &runtime.StaticTranslator{Profile: runtime.DefaultProfile(), Ready: true})
	response := host.Handle(context.Background(), Message{ID: "h1", Type: "health"})

	if !response.OK {
		t.Fatalf("expected health ok: %#v", response.Error)
	}
	body, err := json.Marshal(response.Payload)
	if err != nil {
		t.Fatal(err)
	}
	var health runtime.Health
	if err := json.Unmarshal(body, &health); err != nil {
		t.Fatal(err)
	}
	if !health.OK || health.APIVersion != runtime.APIVersion {
		t.Fatalf("unexpected health: %#v", health)
	}
}

func TestHandleInvalidTranslatePayload(t *testing.T) {
	host := New(Config{}, &runtime.StaticTranslator{Profile: runtime.DefaultProfile(), Ready: true})
	response := host.Handle(context.Background(), Message{
		ID:      "bad",
		Type:    "translate",
		Payload: mustRawMessage(t, map[string]any{"ctxSize": 99}),
	})

	if response.OK {
		t.Fatalf("expected error response")
	}
	if response.Error == nil || response.Error.Code != "unsupported_request" {
		t.Fatalf("unexpected error: %#v", response.Error)
	}
}

func TestServeReadsMultipleFrames(t *testing.T) {
	var input bytes.Buffer
	var output bytes.Buffer
	host := New(Config{RequestTimeout: time.Second}, &runtime.StaticTranslator{
		Profile:     runtime.DefaultProfile(),
		Translation: "我們得離開了。",
		Ready:       true,
	})

	if err := WriteMessage(&input, Message{ID: "health", Type: "health"}); err != nil {
		t.Fatal(err)
	}
	if err := WriteMessage(&input, Message{
		ID:   "translate",
		Type: "translate",
		Payload: mustRawMessage(t, map[string]any{
			"text": "We have to go.",
		}),
	}); err != nil {
		t.Fatal(err)
	}

	if err := host.Serve(context.Background(), &input, &output); err != nil {
		t.Fatal(err)
	}
	first, err := ReadMessage(&output, DefaultMaxFrameBytes)
	if err != nil {
		t.Fatal(err)
	}
	second, err := ReadMessage(&output, DefaultMaxFrameBytes)
	if err != nil {
		t.Fatal(err)
	}
	if first.Type != "health.result" || second.Type != "translate.result" {
		t.Fatalf("unexpected response sequence: %s, %s", first.Type, second.Type)
	}
}

func mustRawMessage(t *testing.T, value any) json.RawMessage {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return body
}
