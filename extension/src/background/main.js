import { errorPayload } from "../core/errors.js";
import { NativeClient } from "./native-client.js";
import { createTranslatorService } from "./translator-service.js";

const NATIVE_HOST_NAME = "localsubs_helper";
const NATIVE_REQUEST_TIMEOUT_MS = 10000;

const nativeClient = new NativeClient({
  hostName: NATIVE_HOST_NAME,
  timeoutMs: NATIVE_REQUEST_TIMEOUT_MS,
  connectNative: (hostName) => chrome.runtime.connectNative(hostName),
  getLastError: () => chrome.runtime.lastError
});
const { checkLocalTranslator, translateSubtitle } = createTranslatorService(nativeClient);

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("options.html")
    });
  }
});

// Preheat: start the native host only when translation is enabled.
chrome.storage.sync.get({ translationEnabled: true }, (settings) => {
  if (settings.translationEnabled) {
    nativeClient.send("health", {}).catch(() => {});
  }
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

  if (message?.type === "TRANSLATE_SUBTITLE") {
    translateSubtitle(message.payload || {})
      .then((result) => sendResponse(result))
      .catch((err) => {
        sendResponse({
          ok: false,
          error: errorPayload(err, "translation_failed")
        });
      });

    return true;
  }

  if (message?.type !== "CHECK_LOCAL_TRANSLATOR") {
    return false;
  }

  checkLocalTranslator(Boolean(message.warmup))
    .then((result) => sendResponse(result))
    .catch((err) => {
      sendResponse({
        ok: false,
        error: errorPayload(err, "helper_unavailable")
      });
    });

  return true;
});
