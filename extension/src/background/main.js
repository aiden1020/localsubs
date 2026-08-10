import { errorPayload } from "../core/errors.js";
import { inferenceBackendForInstall } from "../core/settings.js";
import { createInferenceRouter } from "./inference-router.js";
import { NativeClient } from "./native-client.js";
import { createTranslatorService } from "./translator-service.js";
import { createWebLLMTranslator } from "./webllm-translator.js";

const NATIVE_HOST_NAME = "localsubs_helper";
const NATIVE_REQUEST_TIMEOUT_MS = 10000;

const nativeClient = new NativeClient({
  hostName: NATIVE_HOST_NAME,
  timeoutMs: NATIVE_REQUEST_TIMEOUT_MS,
  connectNative: (hostName) => chrome.runtime.connectNative(hostName),
  getLastError: () => chrome.runtime.lastError
});
const nativeTranslator = createTranslatorService(nativeClient);
const webllmTranslator = createWebLLMTranslator();
let inferenceBackend = "webllm";
const backendReady = chrome.storage.sync.get({ inferenceBackend: "webllm" }).then((stored) => {
  inferenceBackend = stored.inferenceBackend === "native" ? "native" : "webllm";
});
const { checkTranslator, translateSubtitle } = createInferenceRouter({
  nativeTranslator,
  webllmTranslator,
  async getBackend() {
    await backendReady;
    return inferenceBackend;
  }
});

function selectInferenceBackend(value) {
  const nextBackend = value === "native" ? "native" : "webllm";
  if (nextBackend === inferenceBackend) return;
  inferenceBackend = nextBackend;
  if (nextBackend === "native") {
    webllmTranslator.unload().catch(() => {});
  } else {
    nativeClient.reset();
  }
}

function respondAsync(promise, sendResponse, fallbackCode) {
  promise
    .then((result) => sendResponse(result))
    .catch((err) => {
      sendResponse({
        ok: false,
        error: errorPayload(err, fallbackCode)
      });
    });
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.storage.sync.get("inferenceBackend").then((stored) => {
    const backend = inferenceBackendForInstall(details.reason, stored.inferenceBackend);
    selectInferenceBackend(backend);
    return chrome.storage.sync.set({ inferenceBackend: backend });
  }).finally(() => {
    if (details.reason === "install") {
      chrome.tabs.create({
        url: chrome.runtime.getURL("options.html")
      });
    }
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.inferenceBackend) {
    selectInferenceBackend(changes.inferenceBackend.newValue);
  }
});

// Only preheat an explicitly selected native helper here. The playback-page
// content script preheats WebLLM only after confirming its weights are cached,
// so opening a video never starts a large model download unexpectedly.
backendReady.then(() => {
  if (inferenceBackend !== "native") return;
  chrome.storage.sync.get({ translationEnabled: true }, (settings) => {
    if (settings.translationEnabled) {
      nativeClient.send("health", {}).catch(() => {});
    }
  });
});


chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("options.html")
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OPEN_OPTIONS") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("options.html")
    });
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "SET_INFERENCE_BACKEND") {
    selectInferenceBackend(message.backend);
    sendResponse({ ok: true, backend: inferenceBackend });
    return false;
  }

  if (message?.type === "TRANSLATE_SUBTITLE") {
    respondAsync(translateSubtitle(message.payload || {}), sendResponse, "translation_failed");
    return true;
  }

  if (message?.type !== "CHECK_TRANSLATOR" && message?.type !== "CHECK_LOCAL_TRANSLATOR") {
    return false;
  }

  respondAsync(checkTranslator(Boolean(message.warmup)), sendResponse, "translator_unavailable");
  return true;
});
