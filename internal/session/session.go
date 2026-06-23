package session

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sync"

	"localsubs/internal/runtime"
)

type Service struct {
	backend runtime.Translator
	profile runtime.Profile

	mu       sync.Mutex
	cache    map[string]runtime.TranslateResult
	inflight map[string]*inflightCall
	latest   map[string]string
}

type inflightCall struct {
	done   chan struct{}
	result runtime.TranslateResult
	err    error
}

func NewService(backend runtime.Translator, profile runtime.Profile) *Service {
	return &Service{
		backend:  backend,
		profile:  profile,
		cache:    make(map[string]runtime.TranslateResult),
		inflight: make(map[string]*inflightCall),
		latest:   make(map[string]string),
	}
}

func (s *Service) Translate(ctx context.Context, req runtime.TranslateRequest) (runtime.TranslateResult, error) {
	key := s.cacheKey(req)

	s.mu.Lock()
	if req.SessionID != "" && req.CueID != "" {
		s.latest[req.SessionID] = req.CueID
	}
	if cached, ok := s.cache[key]; ok {
		cached.Cache = "hit"
		s.mu.Unlock()
		return cached, nil
	}
	if call, ok := s.inflight[key]; ok {
		s.mu.Unlock()
		select {
		case <-call.done:
			result := call.result
			result.Cache = "hit"
			return s.applySuperseded(req, result), call.err
		case <-ctx.Done():
			return runtime.TranslateResult{}, ctx.Err()
		}
	}
	call := &inflightCall{done: make(chan struct{})}
	s.inflight[key] = call
	s.mu.Unlock()

	result, err := s.backend.Translate(ctx, req)
	if err == nil {
		result.Cache = "miss"
		result = s.applySuperseded(req, result)
	}

	s.mu.Lock()
	if err == nil {
		s.cache[key] = result
	}
	call.result = result
	call.err = err
	close(call.done)
	delete(s.inflight, key)
	s.mu.Unlock()

	return result, err
}

func (s *Service) Health(ctx context.Context) runtime.Health {
	return s.backend.Health(ctx)
}

func (s *Service) cacheKey(req runtime.TranslateRequest) string {
	payload := struct {
		ModelID        string
		ModelVersion   string
		TargetLanguage string
		PromptVersion  string
		CurrentText    string
		ContextLines   []string
		NPredict       int
		CachePrompt    bool
	}{
		ModelID:        s.profile.ModelID,
		ModelVersion:   s.profile.ModelVersion,
		TargetLanguage: req.TargetLanguage,
		PromptVersion:  s.profile.PromptTemplate,
		CurrentText:    req.CurrentText,
		ContextLines:   req.ContextLines,
		NPredict:       s.profile.NPredict,
		CachePrompt:    s.profile.CachePrompt,
	}
	body, _ := json.Marshal(payload)
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func (s *Service) applySuperseded(req runtime.TranslateRequest, result runtime.TranslateResult) runtime.TranslateResult {
	if req.SessionID == "" || req.CueID == "" {
		return result
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	result.Superseded = s.latest[req.SessionID] != req.CueID
	return result
}
