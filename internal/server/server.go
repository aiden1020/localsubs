package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"localsubs/internal/runtime"
)

const (
	DefaultMaxBodyBytes = 32 * 1024
	DefaultMaxTextBytes = 4 * 1024
)

type Config struct {
	Token               string
	AllowedOrigins      []string
	MaxBodyBytes        int64
	MaxTextBytes        int
	DefaultContextLines int
	RequestTimeout      time.Duration
}

type Server struct {
	config     Config
	translator runtime.Translator
}

type ErrorEnvelope struct {
	Status  string `json:"status"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func New(config Config, translator runtime.Translator) *Server {
	if config.MaxBodyBytes <= 0 {
		config.MaxBodyBytes = DefaultMaxBodyBytes
	}
	if config.MaxTextBytes <= 0 {
		config.MaxTextBytes = DefaultMaxTextBytes
	}
	if config.DefaultContextLines < 0 {
		config.DefaultContextLines = 1
	}
	if config.RequestTimeout <= 0 {
		config.RequestTimeout = 10 * time.Second
	}
	return &Server{config: config, translator: translator}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/translate", s.handleTranslate)
	return mux
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method is not allowed.")
		return
	}
	s.writeJSON(w, http.StatusOK, s.translator.Health(r.Context()))
}

func (s *Server) handleTranslate(w http.ResponseWriter, r *http.Request) {
	if s.applyCORS(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		s.writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method is not allowed.")
		return
	}
	if !s.authorized(r) {
		s.writeError(w, http.StatusForbidden, "forbidden", "Missing or invalid local helper token.")
		return
	}
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		s.writeError(w, http.StatusUnsupportedMediaType, "unsupported_content_type", "Content-Type must be application/json.")
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, s.config.MaxBodyBytes))
	if err != nil {
		s.writeError(w, http.StatusRequestEntityTooLarge, "request_too_large", "Request body is too large.")
		return
	}
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	req, empty, err := s.decodeTranslate(raw)
	if err != nil {
		if !s.writeCodedError(w, err) {
			s.writeError(w, http.StatusUnprocessableEntity, "invalid_request", err.Error())
		}
		return
	}
	if err := runtime.ValidateTextSize(req, s.config.MaxTextBytes); err != nil {
		s.writeCodedError(w, err)
		return
	}
	if empty {
		s.writeJSON(w, http.StatusOK, runtime.TranslateResult{Status: "ok", Translation: "", Cache: "none", Superseded: false, Model: runtime.DefaultModelID})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.config.RequestTimeout)
	defer cancel()
	result, err := s.translator.Translate(ctx, req)
	if err != nil {
		if !s.writeCodedError(w, err) {
			s.writeError(w, http.StatusInternalServerError, "internal_error", "Internal helper error.")
		}
		return
	}
	if result.Status == "" {
		result.Status = "ok"
	}
	s.writeJSON(w, http.StatusOK, result)
}

func (s *Server) applyCORS(w http.ResponseWriter, r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin != "" {
		if !s.originAllowed(origin) {
			s.writeError(w, http.StatusForbidden, "forbidden_origin", "Origin is not allowed.")
			return true
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return true
	}
	return false
}

func (s *Server) originAllowed(origin string) bool {
	if len(s.config.AllowedOrigins) == 0 {
		return origin == "" || strings.HasPrefix(origin, "chrome-extension://")
	}
	for _, allowed := range s.config.AllowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}

func (s *Server) authorized(r *http.Request) bool {
	if s.config.Token == "" {
		return true
	}
	return r.Header.Get("Authorization") == "Bearer "+s.config.Token
}

func (s *Server) decodeTranslate(raw map[string]any) (runtime.TranslateRequest, bool, error) {
	return runtime.DecodeTranslate(raw, runtime.DecodeOptions{DefaultContextLines: s.config.DefaultContextLines})
}

func (s *Server) writeCodedError(w http.ResponseWriter, err error) bool {
	if errors.Is(err, context.DeadlineExceeded) {
		s.writeError(w, http.StatusRequestTimeout, "request_timeout", "Translation request timed out.")
		return true
	}
	if errors.Is(err, context.Canceled) {
		s.writeError(w, http.StatusRequestTimeout, "request_canceled", "Translation request was canceled.")
		return true
	}
	var coded runtime.CodedError
	if errors.As(err, &coded) {
		s.writeError(w, coded.HTTPStatus, coded.Code, coded.Message)
		return true
	}
	return false
}

func (s *Server) writeJSON(w http.ResponseWriter, status int, payload any) {
	body, _ := json.Marshal(payload)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

func (s *Server) writeError(w http.ResponseWriter, status int, code string, message string) {
	s.writeJSON(w, status, ErrorEnvelope{Status: "error", Code: code, Message: message})
}
