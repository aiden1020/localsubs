package runtime

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestErrorCodeMapsContextErrors(t *testing.T) {
	if got := ErrorCode(context.DeadlineExceeded); got != "request_timeout" {
		t.Fatalf("deadline error code = %q", got)
	}
	if got := ErrorCode(context.Canceled); got != "request_canceled" {
		t.Fatalf("canceled error code = %q", got)
	}
}

func TestDecodeTranslateAcceptsCueSequence(t *testing.T) {
	req, empty, err := DecodeTranslate(map[string]any{
		"sessionId":   "page-1",
		"cueId":       "2",
		"cueSequence": float64(2),
		"currentText": "Wait.",
	}, DecodeOptions{})
	if err != nil || empty {
		t.Fatalf("unexpected decode result: empty=%v err=%v", empty, err)
	}
	if req.CueSequence != 2 {
		t.Fatalf("cue sequence = %d, want 2", req.CueSequence)
	}
}

func TestBuildPromptUsesContextAndCurrentCue(t *testing.T) {
	prompt := BuildPrompt("I'll be right back.", []string{"Wait here."})
	want := "<|im_start|>user\nCTX:\nWait here.\n\nCUR:\nI'll be right back.<|im_end|>\n<|im_start|>assistant\n"
	if prompt != want {
		t.Fatalf("prompt mismatch\nwant: %q\n got: %q", want, prompt)
	}
}

func TestCleanTranslationRemovesMarkersAndEcho(t *testing.T) {
	got := CleanTranslation("CTX:\nhello\nCUR:\nworld\n<|im_start|>assistant\n我馬上回來。<|im_end|>")
	if got != "hello\nworld\n我馬上回來。" {
		t.Fatalf("unexpected cleaned translation: %q", got)
	}
}

func TestLlamaClientCompletionPayload(t *testing.T) {
	var completionPayload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			w.WriteHeader(http.StatusOK)
		case "/completion":
			if err := json.NewDecoder(r.Body).Decode(&completionPayload); err != nil {
				t.Fatal(err)
			}
			_, _ = w.Write([]byte(`{"content":"我馬上回來。<|im_end|>"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	client := NewLlamaClient(server.URL, DefaultProfile(), true)
	result, err := client.Translate(context.Background(), TranslateRequest{
		CurrentText:    "I'll be right back.",
		ContextLines:   []string{"Wait here."},
		TargetLanguage: "zh-Hant",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Translation != "我馬上回來。" {
		t.Fatalf("unexpected translation: %q", result.Translation)
	}
	if completionPayload["n_predict"].(float64) != 24 {
		t.Fatalf("n_predict mismatch: %#v", completionPayload["n_predict"])
	}
	if completionPayload["temperature"].(float64) != 0 {
		t.Fatalf("temperature mismatch: %#v", completionPayload["temperature"])
	}
	if completionPayload["cache_prompt"] != true {
		t.Fatalf("cache_prompt mismatch: %#v", completionPayload["cache_prompt"])
	}
}
