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

type failureTranslatorWithPrefill struct {
	err      error
	prefills chan runtime.TranslateRequest
}

type backgroundPrefillTranslator struct {
	prefillStarted chan runtime.TranslateRequest
	prefillDone    chan struct{}
	prefillWait    <-chan struct{}
}

func (t *backgroundPrefillTranslator) Translate(context.Context, runtime.TranslateRequest) (runtime.TranslateResult, error) {
	return runtime.TranslateResult{Status: "ok", Translation: "譯文", Model: runtime.DefaultModelID}, nil
}

func (t *backgroundPrefillTranslator) Health(context.Context) runtime.Health {
	return runtime.Health{OK: true}
}

func (t *backgroundPrefillTranslator) PrefillNext(req runtime.TranslateRequest) {
	go func() {
		t.prefillStarted <- req
		<-t.prefillWait
		close(t.prefillDone)
	}()
}

func (t *failureTranslatorWithPrefill) Translate(context.Context, runtime.TranslateRequest) (runtime.TranslateResult, error) {
	return runtime.TranslateResult{}, t.err
}

func (t *failureTranslatorWithPrefill) Health(context.Context) runtime.Health {
	return runtime.Health{OK: true}
}

func (t *failureTranslatorWithPrefill) PrefillNext(req runtime.TranslateRequest) {
	t.prefills <- req
}

type supersedeTranslatorWithPrefill struct {
	oldStarted chan struct{}
	releaseOld <-chan struct{}
	prefills   chan runtime.TranslateRequest
}

func (t *supersedeTranslatorWithPrefill) Translate(_ context.Context, req runtime.TranslateRequest) (runtime.TranslateResult, error) {
	if req.CueID == "old" {
		close(t.oldStarted)
		<-t.releaseOld
	}
	return runtime.TranslateResult{Status: "ok", Translation: "譯文", Model: runtime.DefaultModelID}, nil
}

func (t *supersedeTranslatorWithPrefill) Health(context.Context) runtime.Health {
	return runtime.Health{OK: true}
}

func (t *supersedeTranslatorWithPrefill) PrefillNext(req runtime.TranslateRequest) {
	t.prefills <- req
}

func TestSuccessfulTranslationPrefillsInBackground(t *testing.T) {
	prefillWait := make(chan struct{})
	var releaseOnce sync.Once
	releasePrefill := func() { releaseOnce.Do(func() { close(prefillWait) }) }
	defer func() {
		releasePrefill()
	}()
	backend := &backgroundPrefillTranslator{
		prefillStarted: make(chan runtime.TranslateRequest, 1),
		prefillDone:    make(chan struct{}),
		prefillWait:    prefillWait,
	}
	service := NewService(backend, runtime.DefaultProfile())
	req := runtime.TranslateRequest{SessionID: "tab-1", CueID: "cue-1", CurrentText: "Hello.", TargetLanguage: "zh-Hant"}
	type response struct {
		result runtime.TranslateResult
		err    error
	}
	resultCh := make(chan response, 1)
	go func() {
		result, err := service.Translate(context.Background(), req)
		resultCh <- response{result: result, err: err}
	}()

	select {
	case got := <-backend.prefillStarted:
		if got.CueID != req.CueID {
			t.Fatalf("prefill request cue = %q, want %q", got.CueID, req.CueID)
		}
	case <-time.After(time.Second):
		t.Fatal("successful translation did not start next-sentence preparation")
	}

	select {
	case got := <-resultCh:
		if got.err != nil {
			t.Fatalf("Translate() error = %v", got.err)
		}
		if got.result.Translation == "" {
			t.Fatal("Translate() returned an empty translation")
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("Translate() waited for next-sentence preparation")
	}
	select {
	case <-backend.prefillDone:
		t.Fatal("next-sentence preparation finished before being released")
	default:
	}
}

func TestFailedTranslationDoesNotPrefill(t *testing.T) {
	wantErr := context.DeadlineExceeded
	backend := &failureTranslatorWithPrefill{err: wantErr, prefills: make(chan runtime.TranslateRequest, 1)}
	service := NewService(backend, runtime.DefaultProfile())

	_, err := service.Translate(context.Background(), runtime.TranslateRequest{CurrentText: "Hello."})
	if err != wantErr {
		t.Fatalf("Translate() error = %v, want %v", err, wantErr)
	}
	select {
	case req := <-backend.prefills:
		t.Fatalf("failed translation started next-sentence preparation: %#v", req)
	default:
	}
}

func TestSupersededTranslationDoesNotPrefill(t *testing.T) {
	oldStarted := make(chan struct{})
	releaseOld := make(chan struct{})
	backend := &supersedeTranslatorWithPrefill{
		oldStarted: oldStarted,
		releaseOld: releaseOld,
		prefills:   make(chan runtime.TranslateRequest, 2),
	}
	service := NewService(backend, runtime.DefaultProfile())
	oldReq := runtime.TranslateRequest{SessionID: "tab-1", CueID: "old", CurrentText: "Old.", TargetLanguage: "zh-Hant"}
	newReq := runtime.TranslateRequest{SessionID: "tab-1", CueID: "new", CurrentText: "New.", TargetLanguage: "zh-Hant"}
	oldResultCh := make(chan runtime.TranslateResult, 1)
	go func() {
		result, _ := service.Translate(context.Background(), oldReq)
		oldResultCh <- result
	}()
	select {
	case <-oldStarted:
	case <-time.After(time.Second):
		close(releaseOld)
		t.Fatal("older translation did not start")
	}

	newResult, err := service.Translate(context.Background(), newReq)
	if err != nil {
		close(releaseOld)
		t.Fatalf("newer Translate() error = %v", err)
	}
	if newResult.Superseded {
		close(releaseOld)
		t.Fatal("newer translation was unexpectedly marked superseded")
	}
	select {
	case got := <-backend.prefills:
		if got.CueID != newReq.CueID {
			close(releaseOld)
			t.Fatalf("prefill was requested for cue %q, want %q", got.CueID, newReq.CueID)
		}
	case <-time.After(time.Second):
		close(releaseOld)
		t.Fatal("successful current translation did not start next-sentence preparation")
	}

	close(releaseOld)
	oldResult := <-oldResultCh
	if !oldResult.Superseded {
		t.Fatal("older translation was not marked superseded")
	}
	select {
	case req := <-backend.prefills:
		t.Fatalf("superseded translation started next-sentence preparation: %#v", req)
	default:
	}
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

func TestSupersededStateIsNotStoredInSharedCache(t *testing.T) {
	wait := make(chan struct{})
	backend := &countingTranslator{wait: wait}
	service := NewService(backend, runtime.DefaultProfile())
	oldReq := runtime.TranslateRequest{
		SessionID: "tab-1", CueID: "old", CurrentText: "Same.", TargetLanguage: "zh-Hant",
	}
	newReq := runtime.TranslateRequest{
		SessionID: "tab-1", CueID: "new", CurrentText: "New.", TargetLanguage: "zh-Hant",
	}

	oldResult := make(chan runtime.TranslateResult, 1)
	go func() {
		result, _ := service.Translate(context.Background(), oldReq)
		oldResult <- result
	}()
	waitUntil(t, func() bool { return backend.callCount() == 1 })
	newResult := make(chan runtime.TranslateResult, 1)
	go func() {
		result, _ := service.Translate(context.Background(), newReq)
		newResult <- result
	}()
	waitUntil(t, func() bool { return backend.callCount() == 2 })
	close(wait)

	if result := <-oldResult; !result.Superseded {
		t.Fatal("old request should be marked superseded")
	}
	if result := <-newResult; result.Superseded {
		t.Fatal("new request should not be marked superseded")
	}
	currentReq := oldReq
	currentReq.CueID = "current"
	result, err := service.Translate(context.Background(), currentReq)
	if err != nil {
		t.Fatal(err)
	}
	if result.Superseded {
		t.Fatal("request-specific superseded state must not be stored in cache")
	}
	if result.Cache != "hit" {
		t.Fatalf("cache state = %q, want hit", result.Cache)
	}
}
