import { errorPayload } from "../core/errors.js";
import { inferenceBackendForInstall } from "../core/settings.js";
import { createInferenceRouter } from "./inference-router.js";
import { NativeClient } from "./native-client.js";
import { createTranslatorService } from "./translator-service.js";
import { createWebLLMManager } from "./webllm-manager.js";
import { WEBLLM_MODEL_URL, createWebLLMTranslator } from "./webllm-translator.js";
import { normalizeModelTier, tierForHelperChannel } from "../core/model-catalog.js";

const NATIVE_HOST_NAME = "localsubs_helper";
const NATIVE_REQUEST_TIMEOUT_MS = 10000;

const nativeClient = new NativeClient({
  hostName: NATIVE_HOST_NAME,
  timeoutMs: NATIVE_REQUEST_TIMEOUT_MS,
  connectNative: (hostName) => chrome.runtime.connectNative(hostName),
  getLastError: () => chrome.runtime.lastError
});
const nativeTranslator = createTranslatorService(nativeClient);
let inferenceBackend = "webllm";
let modelTier = "fast";
const backendReady = chrome.storage.sync.get({ inferenceBackend: "webllm", modelTier: "fast" }).then((stored) => {
  inferenceBackend = stored.inferenceBackend === "native" ? "native" : "webllm";
  modelTier = normalizeModelTier(stored.modelTier);
});
const webllmTranslator = createWebLLMManager({
  createTranslator(entry) {
    const { webllm } = entry;
    return createWebLLMTranslator({
      modelId: webllm.modelId,
      // The build-time override (used by end-to-end tests) targets the default model.
      modelURL: entry.tier === "fast" ? WEBLLM_MODEL_URL : webllm.modelURL,
      modelLibURL: chrome.runtime.getURL(webllm.libFile),
      vramMB: webllm.vramMB
    });
  },
  async getTier() {
    await backendReady;
    return modelTier;
  }
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

function selectModelTier(value) {
  const nextTier = normalizeModelTier(value);
  if (nextTier === modelTier) return;
  modelTier = nextTier;
  if (inferenceBackend === "webllm") {
    webllmTranslator.unload().catch(() => {});
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
  Promise.all([
    chrome.storage.sync.get(["inferenceBackend", "modelTier"]),
    chrome.storage.local.get({ helperModelChannel: "stable" })
  ]).then(([stored, local]) => {
    const backend = inferenceBackendForInstall(details.reason, stored.inferenceBackend);
    selectInferenceBackend(backend);
    // Installs from before model tiers stored the helper channel instead.
    const tier = stored.modelTier ? normalizeModelTier(stored.modelTier) : tierForHelperChannel(local.helperModelChannel);
    selectModelTier(tier);
    return chrome.storage.sync.set({ inferenceBackend: backend, modelTier: tier });
  }).finally(() => {
    if (details.reason === "install") {
      chrome.tabs.create({
        url: chrome.runtime.getURL("options.html")
      });
    }
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;
  if (changes.inferenceBackend) {
    selectInferenceBackend(changes.inferenceBackend.newValue);
  }
  if (changes.modelTier) {
    selectModelTier(changes.modelTier.newValue);
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
    backendReady.then(async () => {
      selectInferenceBackend(message.backend);
      sendResponse({ ok: true, backend: inferenceBackend });
    }).catch((error) => sendResponse({ ok: false, error: errorPayload(error, "model_selection_failed") }));
    return true;
  }

  if (message?.type === "SET_MODEL_TIER") {
    backendReady.then(() => {
      selectModelTier(message.tier);
      sendResponse({ ok: true, tier: modelTier });
    }).catch((error) => sendResponse({ ok: false, error: errorPayload(error, "model_selection_failed") }));
    return true;
  }

  if (message?.type === "LIST_WEBLLM_MODELS") {
    respondAsync(webllmTranslator.listModels().then((models) => ({ ok: true, models })), sendResponse, "model_list_failed");
    return true;
  }

  if (message?.type === "PRUNE_LEGACY_HELPER_MODELS") {
    respondAsync(nativeTranslator.pruneLegacyModels().then((removed) => ({ ok: true, removed })), sendResponse, "model_prune_failed");
    return true;
  }

  if (message?.type === "LIST_HELPER_MODELS") {
    respondAsync(nativeTranslator.listModels(), sendResponse, "model_list_failed");
    return true;
  }

  if (message?.type === "DOWNLOAD_HELPER_MODEL") {
    respondAsync(nativeTranslator.downloadModel(message.channel), sendResponse, "model_download_failed");
    return true;
  }

  if (message?.type === "REMOVE_HELPER_MODEL") {
    respondAsync(nativeTranslator.removeModel(message.channel), sendResponse, "model_remove_failed");
    return true;
  }

  if (message?.type === "SELECT_HELPER_MODEL") {
    respondAsync(nativeTranslator.selectModel(message.channel), sendResponse, "model_selection_failed");
    return true;
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
