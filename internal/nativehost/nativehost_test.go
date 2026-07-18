package nativehost

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"
	"time"

	"localsubs/internal/runtime"
	"localsubs/internal/session"
)

type failingTranslator struct {
	err error
}

type concurrentTranslator struct {
	mu      sync.Mutex
	calls   int
	started chan struct{}
	release chan struct{}
}

type boundedTranslator struct {
	mu      sync.Mutex
	active  int
	peak    int
	started chan struct{}
	release chan struct{}
}

type cancelAwareTranslator struct {
	canceled chan struct{}
}

func (t *cancelAwareTranslator) Translate(ctx context.Context, _ runtime.TranslateRequest) (runtime.TranslateResult, error) {
	<-ctx.Done()
	close(t.canceled)
	return runtime.TranslateResult{}, ctx.Err()
}

func (t *cancelAwareTranslator) Health(context.Context) runtime.Health {
	return runtime.Health{OK: true}
}

func (t *boundedTranslator) Translate(context.Context, runtime.TranslateRequest) (runtime.TranslateResult, error) {
	t.mu.Lock()
	t.active++
	if t.active > t.peak {
		t.peak = t.active
	}
	t.mu.Unlock()
	t.started <- struct{}{}
	<-t.release
	t.mu.Lock()
	t.active--
	t.mu.Unlock()
	return runtime.TranslateResult{Status: "ok", Translation: "譯文"}, nil
}

func (t *boundedTranslator) Health(context.Context) runtime.Health {
	return runtime.Health{OK: true}
}

func (t *boundedTranslator) peakCalls() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.peak
}

func (t *concurrentTranslator) Translate(context.Context, runtime.TranslateRequest) (runtime.TranslateResult, error) {
	t.mu.Lock()
	t.calls++
	if t.calls == 2 {
		close(t.started)
	}
	t.mu.Unlock()
	<-t.release
	return runtime.TranslateResult{Status: "ok", Translation: "譯文", Model: runtime.DefaultModelID}, nil
}

func (t *concurrentTranslator) Health(context.Context) runtime.Health {
	return runtime.Health{OK: true}
}

func (t failingTranslator) Translate(context.Context, runtime.TranslateRequest) (runtime.TranslateResult, error) {
	return runtime.TranslateResult{}, t.err
}

func (t failingTranslator) Health(context.Context) runtime.Health {
	return runtime.Health{}
}

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

func TestHandleMapsDeadlineExceededToRequestTimeout(t *testing.T) {
	host := New(Config{}, failingTranslator{err: context.DeadlineExceeded})
	response := host.Handle(context.Background(), Message{
		ID:      "timeout",
		Type:    "translate",
		Payload: mustRawMessage(t, map[string]any{"currentText": "Wait."}),
	})
	if response.OK || response.Error == nil {
		t.Fatalf("expected timeout response: %#v", response)
	}
	if response.Error.Code != "request_timeout" {
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
	responseTypes := make(map[string]bool)
	for range 2 {
		response, err := ReadMessage(&output, DefaultMaxFrameBytes)
		if err != nil {
			t.Fatal(err)
		}
		responseTypes[response.Type] = true
	}
	if !responseTypes["health.result"] || !responseTypes["translate.result"] {
		t.Fatalf("unexpected response types: %#v", responseTypes)
	}
}

func TestServeProcessesCuesConcurrentlyAndMarksOldCueSuperseded(t *testing.T) {
	var input bytes.Buffer
	var output bytes.Buffer
	backend := &concurrentTranslator{started: make(chan struct{}), release: make(chan struct{})}
	service := session.NewService(backend, runtime.DefaultProfile())
	host := New(Config{RequestTimeout: time.Second}, service)
	for sequence, text := range []string{"Old.", "New."} {
		if err := WriteMessage(&input, Message{
			ID:   text,
			Type: "translate",
			Payload: mustRawMessage(t, map[string]any{
				"sessionId":   "page-1",
				"cueId":       fmt.Sprintf("%d", sequence+1),
				"cueSequence": sequence + 1,
				"currentText": text,
			}),
		}); err != nil {
			t.Fatal(err)
		}
	}
	done := make(chan error, 1)
	go func() { done <- host.Serve(context.Background(), &input, &output) }()
	select {
	case <-backend.started:
	case <-time.After(time.Second):
		t.Fatal("native host did not start both translations concurrently")
	}
	close(backend.release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}

	results := make(map[string]runtime.TranslateResult)
	for range 2 {
		response, err := ReadMessage(&output, DefaultMaxFrameBytes)
		if err != nil {
			t.Fatal(err)
		}
		body, err := json.Marshal(response.Payload)
		if err != nil {
			t.Fatal(err)
		}
		var result runtime.TranslateResult
		if err := json.Unmarshal(body, &result); err != nil {
			t.Fatal(err)
		}
		results[response.ID] = result
	}
	if !results["Old."].Superseded {
		t.Fatal("old cue should be superseded")
	}
	if results["New."].Superseded {
		t.Fatal("new cue should remain current")
	}
}

func TestServeBoundsConcurrentRequests(t *testing.T) {
	const (
		requests = 12
		limit    = 3
	)
	var input bytes.Buffer
	var output bytes.Buffer
	backend := &boundedTranslator{
		started: make(chan struct{}, requests),
		release: make(chan struct{}),
	}
	host := New(Config{
		MaxConcurrentRequests: limit,
		RequestTimeout:        time.Second,
	}, backend)
	for i := range requests {
		if err := WriteMessage(&input, Message{
			ID:   fmt.Sprintf("%d", i),
			Type: "translate",
			Payload: mustRawMessage(t, map[string]any{
				"currentText": fmt.Sprintf("Cue %d.", i),
			}),
		}); err != nil {
			t.Fatal(err)
		}
	}
	done := make(chan error, 1)
	go func() { done <- host.Serve(context.Background(), &input, &output) }()
	for range limit {
		select {
		case <-backend.started:
		case <-time.After(time.Second):
			t.Fatal("bounded workers did not start")
		}
	}
	select {
	case <-backend.started:
		t.Fatal("request concurrency exceeded configured limit")
	case <-time.After(50 * time.Millisecond):
	}
	close(backend.release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if peak := backend.peakCalls(); peak > limit {
		t.Fatalf("peak concurrency = %d, want <= %d", peak, limit)
	}
}

func TestServeCancelsActiveRequestOnEOF(t *testing.T) {
	var input bytes.Buffer
	var output bytes.Buffer
	backend := &cancelAwareTranslator{canceled: make(chan struct{})}
	host := New(Config{RequestTimeout: time.Second}, backend)
	if err := WriteMessage(&input, Message{
		ID:      "closing",
		Type:    "translate",
		Payload: mustRawMessage(t, map[string]any{"currentText": "Wait."}),
	}); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- host.Serve(context.Background(), &input, &output) }()
	select {
	case <-backend.canceled:
	case <-time.After(250 * time.Millisecond):
		t.Fatal("EOF did not cancel active translation")
	}
	if err := <-done; err != nil {
		t.Fatal(err)
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
