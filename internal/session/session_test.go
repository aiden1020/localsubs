package session

import (
	"context"
	"sync"
	"testing"
	"time"

	"localsubs/internal/runtime"
)

type countingTranslator struct {
	mu    sync.Mutex
	calls int
	wait  chan struct{}
}

func (t *countingTranslator) Translate(ctx context.Context, req runtime.TranslateRequest) (runtime.TranslateResult, error) {
	t.mu.Lock()
	t.calls++
	t.mu.Unlock()
	if t.wait != nil {
		<-t.wait
	}
	return runtime.TranslateResult{Status: "ok", Translation: "譯文", Cache: "miss", Model: runtime.DefaultModelID}, nil
}

func (t *countingTranslator) Health(ctx context.Context) runtime.Health {
	return runtime.Health{OK: true}
}

func (t *countingTranslator) callCount() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.calls
}

func TestCacheHitAvoidsBackend(t *testing.T) {
	backend := &countingTranslator{}
	service := NewService(backend, runtime.DefaultProfile())
	req := runtime.TranslateRequest{CurrentText: "Hello.", TargetLanguage: "zh-Hant"}

	first, err := service.Translate(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.Translate(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if first.Cache != "miss" || second.Cache != "hit" {
		t.Fatalf("unexpected cache states: %q %q", first.Cache, second.Cache)
	}
	if backend.callCount() != 1 {
		t.Fatalf("backend calls = %d, want 1", backend.callCount())
	}
}

func TestInflightRequestDedupes(t *testing.T) {
	wait := make(chan struct{})
	backend := &countingTranslator{wait: wait}
	service := NewService(backend, runtime.DefaultProfile())
	req := runtime.TranslateRequest{CurrentText: "Hello.", TargetLanguage: "zh-Hant"}

	results := make(chan runtime.TranslateResult, 2)
	go func() {
		result, _ := service.Translate(context.Background(), req)
		results <- result
	}()
	waitUntil(t, func() bool {
		return backend.callCount() == 1
	})
	go func() {
		result, _ := service.Translate(context.Background(), req)
		results <- result
	}()
	close(wait)

	<-results
	<-results
	if backend.callCount() != 1 {
		t.Fatalf("backend calls = %d, want 1", backend.callCount())
	}
}

func waitUntil(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("condition was not met before deadline")
}

func TestDifferentSessionsDoNotShareLatestCueState(t *testing.T) {
	backend := &countingTranslator{}
	service := NewService(backend, runtime.DefaultProfile())
	oldReq := runtime.TranslateRequest{SessionID: "tab-1", CueID: "old", CurrentText: "Old.", TargetLanguage: "zh-Hant"}
	newReq := runtime.TranslateRequest{SessionID: "tab-2", CueID: "new", CurrentText: "New.", TargetLanguage: "zh-Hant"}

	oldResult, err := service.Translate(context.Background(), oldReq)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Translate(context.Background(), newReq); err != nil {
		t.Fatal(err)
	}
	if oldResult.Superseded {
		t.Fatal("different session should not supersede old request")
	}
}
