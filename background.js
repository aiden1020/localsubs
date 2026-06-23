const NATIVE_HOST_NAME = "localsubs_helper";
const NATIVE_REQUEST_TIMEOUT_MS = 10000;

let nativePort = null;
let nativePending = new Map();

function getStartCommand() {
  return "localsubs install";
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("options.html")
    });
  }
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("options.html")
  });
});

async function checkLocalTranslator(warmup = false) {
  const startedAt = performance.now();
  try {
    const health = await sendNativeMessage("health", {});
    let translation = "";

    if (warmup) {
      const warmupResult = await translateSubtitle({
        text: "Warm up.\nReady.",
        sourceLanguage: "en",
        targetLanguage: "zh-Hant",
        ctxSize: 1
      });
      translation = warmupResult.translation || "";
    }

    return {
      ok: Boolean(health.ok),
      latencyMs: Math.round(performance.now() - startedAt),
      translation,
      transport: "native"
    };
  } catch (nativeErr) {
    const nativeMessage = nativeErr instanceof Error ? nativeErr.message : "Native host unavailable";
    throw new Error(`Native helper failed: ${nativeMessage}`);
  }
}

async function translateSubtitle(payload) {
  try {
    const result = await sendNativeMessage("translate", payload);
    return {
      ok: true,
      translation: typeof result.translation === "string" ? result.translation : "",
      cache: typeof result.cache === "string" ? result.cache : "",
      transport: "native"
    };
  } catch (nativeErr) {
    const nativeMessage = nativeErr instanceof Error ? nativeErr.message : "Native host unavailable";
    throw new Error(`Native helper failed: ${nativeMessage}`);
  }
}

function sendNativeMessage(type, payload) {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timeout = setTimeout(() => {
      nativePending.delete(id);
      reject(new Error("Native host request timed out"));
      resetNativePort();
    }, NATIVE_REQUEST_TIMEOUT_MS);

    nativePending.set(id, { resolve, reject, timeout });

    try {
      getNativePort().postMessage({ id, type, payload });
    } catch (err) {
      clearTimeout(timeout);
      nativePending.delete(id);
      resetNativePort();
      reject(err instanceof Error ? err : new Error("Unable to send native message"));
    }
  });
}

function getNativePort() {
  if (nativePort) {
    return nativePort;
  }

  nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  nativePort.onMessage.addListener((response) => {
    const id = response?.id;
    if (!id || !nativePending.has(id)) {
      return;
    }
    const pending = nativePending.get(id);
    nativePending.delete(id);
    clearTimeout(pending.timeout);

    if (!response.ok) {
      const code = response.error?.code || "native_host_error";
      const message = response.error?.message || "Native host returned an error";
      pending.reject(new Error(`${code}: ${message}`));
      return;
    }
    pending.resolve(response.payload || {});
  });

  nativePort.onDisconnect.addListener(() => {
    const message = chrome.runtime.lastError?.message || "Native host disconnected";
    rejectAllNativePending(message);
    nativePort = null;
  });

  return nativePort;
}

function resetNativePort() {
  if (!nativePort) {
    return;
  }
  try {
    nativePort.disconnect();
  } catch (err) {
    // The port may already be disconnected.
  }
  nativePort = null;
}

function rejectAllNativePending(message) {
  nativePending.forEach((pending) => {
    clearTimeout(pending.timeout);
    pending.reject(new Error(message));
  });
  nativePending = new Map();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OPEN_OPTIONS") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("options.html")
    });
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "GET_LOCAL_HELPER_COMMAND") {
    sendResponse({ ok: true, command: getStartCommand() });
    return false;
  }

  if (message?.type === "TRANSLATE_SUBTITLE") {
    translateSubtitle(message.payload || {})
      .then((result) => sendResponse(result))
      .catch((err) => {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : "Unable to translate subtitle"
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
        error: err instanceof Error ? err.message : "Unable to reach local translator"
      });
    });

  return true;
});
