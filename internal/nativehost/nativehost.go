package nativehost

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"localsubs/internal/runtime"
)

const (
	DefaultMaxFrameBytes = 32 * 1024
	DefaultMaxTextBytes  = 4 * 1024
)

type Config struct {
	MaxFrameBytes       uint32
	MaxTextBytes        int
	DefaultContextLines int
	RequestTimeout      time.Duration
	IdleTimeout         time.Duration // exit after this long with no messages; 0 = no timeout
}

type Host struct {
	config     Config
	translator runtime.Translator
}

type Message struct {
	ID      string          `json:"id,omitempty"`
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type Response struct {
	ID      string `json:"id,omitempty"`
	Type    string `json:"type"`
	OK      bool   `json:"ok"`
	Payload any    `json:"payload,omitempty"`
	Error   *Error `json:"error,omitempty"`
}

type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func New(config Config, translator runtime.Translator) *Host {
	if config.MaxFrameBytes == 0 {
		config.MaxFrameBytes = DefaultMaxFrameBytes
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
	return &Host{config: config, translator: translator}
}

func (h *Host) Serve(ctx context.Context, input io.Reader, output io.Writer) error {
	type readResult struct {
		msg Message
		err error
	}

	var idleTimer *time.Timer
	var idleC <-chan time.Time
	if h.config.IdleTimeout > 0 {
		idleTimer = time.NewTimer(h.config.IdleTimeout)
		idleC = idleTimer.C
		defer idleTimer.Stop()
	}

	for {
		ch := make(chan readResult, 1)
		go func() {
			msg, err := ReadMessage(input, h.config.MaxFrameBytes)
			ch <- readResult{msg, err}
		}()

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-idleC:
			return nil // idle timeout — defer cleanup will kill llama-server
		case r := <-ch:
			if r.err != nil {
				if errors.Is(r.err, io.EOF) || errors.Is(r.err, io.ErrUnexpectedEOF) {
					return nil
				}
				return r.err
			}
			if idleTimer != nil {
				idleTimer.Reset(h.config.IdleTimeout)
			}
			response := h.Handle(ctx, r.msg)
			if err := WriteMessage(output, response); err != nil {
				return err
			}
		}
	}
}

func (h *Host) Handle(ctx context.Context, message Message) Response {
	switch message.Type {
	case "health", "CHECK_LOCAL_TRANSLATOR":
		return Response{ID: message.ID, Type: message.Type + ".result", OK: true, Payload: h.translator.Health(ctx)}
	case "translate", "TRANSLATE_SUBTITLE":
		return h.handleTranslate(ctx, message)
	default:
		return errorResponse(message.ID, message.Type, "unsupported_message", "Unsupported native message type.")
	}
}

func (h *Host) handleTranslate(parent context.Context, message Message) Response {
	var raw map[string]any
	if len(message.Payload) == 0 {
		return errorResponse(message.ID, message.Type, "invalid_request", "Missing payload.")
	}
	if err := json.Unmarshal(message.Payload, &raw); err != nil {
		return errorResponse(message.ID, message.Type, "invalid_json", "Payload must be valid JSON.")
	}
	req, empty, err := runtime.DecodeTranslate(raw, runtime.DecodeOptions{DefaultContextLines: h.config.DefaultContextLines})
	if err != nil {
		return codedErrorResponse(message.ID, message.Type, err)
	}
	if err := runtime.ValidateTextSize(req, h.config.MaxTextBytes); err != nil {
		return codedErrorResponse(message.ID, message.Type, err)
	}
	if empty {
		return Response{
			ID:   message.ID,
			Type: message.Type + ".result",
			OK:   true,
			Payload: runtime.TranslateResult{
				Status:      "ok",
				Translation: "",
				Cache:       "none",
				Superseded:  false,
				Model:       runtime.DefaultModelID,
			},
		}
	}

	ctx, cancel := context.WithTimeout(parent, h.config.RequestTimeout)
	defer cancel()
	result, err := h.translator.Translate(ctx, req)
	if err != nil {
		return codedErrorResponse(message.ID, message.Type, err)
	}
	if result.Status == "" {
		result.Status = "ok"
	}
	return Response{ID: message.ID, Type: message.Type + ".result", OK: true, Payload: result}
}

func ReadMessage(input io.Reader, maxFrameBytes uint32) (Message, error) {
	var length uint32
	if err := binary.Read(input, binary.LittleEndian, &length); err != nil {
		return Message{}, err
	}
	if maxFrameBytes == 0 {
		maxFrameBytes = DefaultMaxFrameBytes
	}
	if length > maxFrameBytes {
		return Message{}, fmt.Errorf("native message frame is too large: %d bytes", length)
	}
	body := make([]byte, length)
	if _, err := io.ReadFull(input, body); err != nil {
		return Message{}, err
	}
	var message Message
	if err := json.Unmarshal(body, &message); err != nil {
		return Message{}, err
	}
	return message, nil
}

func WriteMessage(output io.Writer, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if len(body) > int(^uint32(0)) {
		return fmt.Errorf("native message response is too large: %d bytes", len(body))
	}
	if err := binary.Write(output, binary.LittleEndian, uint32(len(body))); err != nil {
		return err
	}
	_, err = output.Write(body)
	return err
}

func errorResponse(id string, messageType string, code string, message string) Response {
	return Response{
		ID:    id,
		Type:  messageType + ".error",
		OK:    false,
		Error: &Error{Code: code, Message: message},
	}
}

func codedErrorResponse(id string, messageType string, err error) Response {
	var coded runtime.CodedError
	if errors.As(err, &coded) {
		code := coded.Code
		if coded.HTTPStatus == http.StatusRequestTimeout {
			code = "request_timeout"
		}
		return errorResponse(id, messageType, code, coded.Message)
	}
	return errorResponse(id, messageType, runtime.ErrorCode(err), "Internal helper error.")
}
