import { DEFAULT_SETTINGS, sanitizeSettings } from "../core/settings.js";
import { normalizeCaption, normalizeText } from "./captions.js";
import { OverlayRenderer } from "./overlay-renderer.js";
import { SubtitleDetector } from "./subtitle-detector.js";
import { TranslationController } from "./translation-controller.js";
import { shouldApplyTranslationResult } from "./translation-request.js";

(() => {
  const BUILD = "0.3.1";
  const STATUS_OVERLAY_ID = "localsubs-status";
  const STATUS_HIDE_AFTER_MS = 6500;
  if (window.__openStreamSubtitlesLoaded) {
    return;
  }

  window.__openStreamSubtitlesLoaded = true;
  window.__localSubsBuild = BUILD;

  let lastCaption = "";
  let detectScheduled = false;
  let activeCaptionRequestId = 0;
  let activeTranslationAbortController = null;
  let lastTranslation = "";
  let needsReposition = false;
  let captionDetectedAt = 0;
  let lastTranslationLatencyMs = 0;
  let statusOverlay = null;
  let statusOverlayTimer = null;
  let captionHideTimer = null;
  let captionMissingSince = 0;
  let modelPollTimer = null;
  let modelPollGeneration = 0;
  let modelReadyShown = false;
  let settings = { ...DEFAULT_SETTINGS };
  const overlayRenderer = new OverlayRenderer({ getSettings: () => settings });
  const subtitleDetector = new SubtitleDetector({
    onNodeChange: (node) => overlayRenderer.setSubtitleNode(node),
    onMutation: () => {
      needsReposition = true;
      detectCaption();
    }
  });
  const translationController = new TranslationController({
    getSettings: () => settings,
    sendMessage: (message) => chrome.runtime.sendMessage(message),
    showStatus: (message) => showStatusMessage(message)
  });

  function ensureStatusOverlay() {
    if (statusOverlay?.isConnected) {
      return statusOverlay;
    }

    statusOverlay = document.getElementById(STATUS_OVERLAY_ID);

    if (!statusOverlay) {
      statusOverlay = document.createElement("button");
      statusOverlay.id = STATUS_OVERLAY_ID;
      statusOverlay.type = "button";
      statusOverlay.style.position = "fixed";
      statusOverlay.style.right = "18px";
      statusOverlay.style.bottom = "18px";
      statusOverlay.style.zIndex = "2147483647";
      statusOverlay.style.maxWidth = "min(360px, calc(100vw - 36px))";
      statusOverlay.style.padding = "12px 14px";
      statusOverlay.style.border = "1px solid rgba(255, 255, 255, 0.22)";
      statusOverlay.style.borderRadius = "8px";
      statusOverlay.style.background = "rgba(14, 18, 25, 0.94)";
      statusOverlay.style.color = "#ffffff";
      statusOverlay.style.font = "600 13px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      statusOverlay.style.textAlign = "left";
      statusOverlay.style.boxShadow = "0 12px 34px rgba(0, 0, 0, 0.38)";
      statusOverlay.style.cursor = "pointer";
      statusOverlay.style.display = "none";
      statusOverlay.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
      });
    }

    document.documentElement.appendChild(statusOverlay);
    return statusOverlay;
  }

  function showStatusMessage(message, persistent = false) {
    if (window !== window.top) {
      return;
    }

    if (document.fullscreenElement) {
      clearStatusMessage();
      return;
    }

    const node = ensureStatusOverlay();
    node.textContent = message;
    node.style.display = "block";
    window.clearTimeout(statusOverlayTimer);
    if (!persistent) {
      statusOverlayTimer = window.setTimeout(() => {
        node.style.display = "none";
      }, STATUS_HIDE_AFTER_MS);
    }
  }

  function clearStatusMessage() {
    window.clearTimeout(statusOverlayTimer);
    if (statusOverlay) {
      statusOverlay.style.display = "none";
    }
  }

  function applySettings(nextSettings) {
    const previousSettings = settings;
    settings = sanitizeSettings(nextSettings);

    translationController.handleSettingsChange(previousSettings, settings);

    overlayRenderer.applySettings();

    if (!settings.translationEnabled) {
      modelPollGeneration += 1;
      window.clearTimeout(modelPollTimer);
      modelPollTimer = null;
      modelReadyShown = false;
      clearStatusMessage();
      activeCaptionRequestId += 1;
      activeTranslationAbortController?.abort();
      activeTranslationAbortController = null;
      lastTranslation = "";
      overlayRenderer.enterFallback();
      return;
    }

    if (lastCaption) {
      activeCaptionRequestId += 1;
      overlayRenderer.enterPending(lastCaption);
      if (settings.translationEnabled) {
        void renderTranslationForCaption(lastCaption, activeCaptionRequestId);
      }
    }
  }

  async function loadSettings() {
    if (!chrome?.storage?.sync) {
      applySettings(DEFAULT_SETTINGS);
      return;
    }

    const storedSettings = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
    applySettings(storedSettings);
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "sync") {
      return;
    }

    const nextSettings = { ...settings };
    let hasRelevantChange = false;

    for (const [key, change] of Object.entries(changes)) {
      if (!(key in DEFAULT_SETTINGS)) {
        continue;
      }

      nextSettings[key] = change.newValue;
      hasRelevantChange = true;
    }

    if (hasRelevantChange) {
      applySettings(nextSettings);
    }
  }


  async function renderTranslationForCaption(caption, requestId) {
    if (!settings.translationEnabled) {
      return;
    }

    if (activeTranslationAbortController) {
      activeTranslationAbortController.abort();
    }
    const controller = new AbortController();
    activeTranslationAbortController = controller;

    const translatedText = await translationController.translateWithContext(
      caption,
      controller.signal,
      String(requestId)
    );

    if (activeTranslationAbortController === controller) {
      activeTranslationAbortController = null;
    }

    if (!shouldApplyTranslationResult({
      requestId,
      activeRequestId: activeCaptionRequestId,
      caption,
      currentCaption: lastCaption
    })) {
      return;
    }

    if (translatedText && captionDetectedAt > 0) {
      lastTranslationLatencyMs = Date.now() - captionDetectedAt;
    }
    lastTranslation = translatedText;
    overlayRenderer.enterTranslated(caption, translatedText);
  }

  function scheduleDetect() {
    if (detectScheduled) {
      return;
    }

    detectScheduled = true;
    window.requestAnimationFrame(() => {
      detectScheduled = false;
      detectCaption();
    });
  }


  function cancelPendingCaptionHide() {
    window.clearTimeout(captionHideTimer);
    captionHideTimer = null;
    captionMissingSince = 0;
  }

  function scheduleCaptionHide(delayMs) {
    if (captionHideTimer !== null) {
      return;
    }

    captionHideTimer = window.setTimeout(() => {
      captionHideTimer = null;
      detectCaption();
    }, delayMs);
  }

  function detectCaption() {
    const caption = normalizeCaption(subtitleDetector.getCaption());

    if (!caption) {
      if (subtitleDetector.hasActiveContent()) {
        cancelPendingCaptionHide();
        return;
      }

      const compensationMs = Math.min(lastTranslationLatencyMs, 3000);
      const hideDelayMs = compensationMs;
      const now = Date.now();
      if (captionMissingSince === 0) {
        captionMissingSince = now;
      }

      const remainingMs = hideDelayMs - (now - captionMissingSince);
      if (remainingMs > 0) {
        scheduleCaptionHide(remainingMs);
        return;
      }

      cancelPendingCaptionHide();
      activeCaptionRequestId += 1;
      translationController.resetHistory();
      overlayRenderer.enterFallback();
      lastCaption = "";
      lastTranslationLatencyMs = 0;
      return;
    }

    cancelPendingCaptionHide();
    if (!settings.translationEnabled) {
      if (caption !== lastCaption) {
        activeCaptionRequestId += 1;
        lastCaption = caption;
        lastTranslation = "";
        translationController.resetHistory();
      }
      overlayRenderer.enterFallback();
      return;
    }

    if (caption === lastCaption) {
      if (overlayRenderer.isVisible()) {
        if (needsReposition) {
          overlayRenderer.position();
          needsReposition = false;
        }
      } else if (lastTranslation) {
        overlayRenderer.enterTranslated(caption, lastTranslation);
      }
      return;
    }

    lastCaption = caption;
    lastTranslation = "";
    captionDetectedAt = Date.now();
    lastTranslationLatencyMs = 0;
    needsReposition = true;
    activeCaptionRequestId += 1;
    translationController.updateHistory(caption);

    overlayRenderer.enterPending(caption);
    void renderTranslationForCaption(caption, activeCaptionRequestId);
  }

  function bindVideoListeners() {
    const videos = Array.from(document.querySelectorAll("video"));

    if (videos.length === 0) {
      return;
    }

    for (const video of videos) {
      if (video.dataset.openStreamSubtitlesBound === "true") {
        continue;
      }

      video.dataset.openStreamSubtitlesBound = "true";
      video.addEventListener("timeupdate", scheduleDetect, { passive: true });
      video.addEventListener("seeked", scheduleDetect, { passive: true });
      video.addEventListener("playing", scheduleDetect, { passive: true });
      video.addEventListener("loadedmetadata", scheduleDetect, { passive: true });
    }
  }

  function startDetection() {
    bindVideoListeners();
    detectCaption();
  }

  function hasPlayableVideo() {
    return Array.from(document.querySelectorAll("video")).some((video) => {
      return Boolean(video.currentSrc || video.src);
    });
  }

  function shouldRun() {
    const path = window.location.pathname || "";
    const isPlaybackPage =
      path.includes("/video/watch/") ||
      path.includes("/play") ||
      path.includes("/watch");
    const isPlayerLikeFrame =
      path.includes("/player") ||
      window.location.hostname.startsWith("play.");

    return isPlaybackPage || isPlayerLikeFrame || hasPlayableVideo();
  }

  if (!shouldRun()) {
    return;
  }

  const observer = new MutationObserver(() => {
    bindVideoListeners();
    scheduleDetect();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  document.addEventListener("fullscreenchange", () => {
    clearStatusMessage();
    overlayRenderer.updateHost();
    needsReposition = true;
    scheduleDetect();
  });

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener(handleStorageChange);
  }

  async function pollUntilModelReady(generation) {
    if (!settings.translationEnabled || generation !== modelPollGeneration) {
      clearStatusMessage();
      return;
    }
    try {
      const result = await chrome.runtime.sendMessage({
        type: "CHECK_LOCAL_TRANSLATOR",
        warmup: false
      });
      if (!settings.translationEnabled || generation !== modelPollGeneration) {
        clearStatusMessage();
        return;
      }
      if (result?.ok) {
        if (!modelReadyShown) {
          modelReadyShown = true;
          showStatusMessage("LocalSubs: Model ready");
        }
      } else if (result?.loading) {
        showStatusMessage("LocalSubs: Loading model...", true);
        modelPollTimer = window.setTimeout(() => pollUntilModelReady(generation), 4000);
      } else if (result?.error?.code === "incompatible_api") {
        showStatusMessage(`LocalSubs: ${result.error.message}`, true);
      } else {
        clearStatusMessage();
      }
    } catch {
      clearStatusMessage();
    }
  }

  function startModelPolling() {
    modelPollGeneration += 1;
    const generation = modelPollGeneration;
    window.clearTimeout(modelPollTimer);
    modelPollTimer = null;
    modelReadyShown = false;
    showStatusMessage("LocalSubs: Starting model...", true);
    void pollUntilModelReady(generation);
  }

  void loadSettings().finally(() => {
    if (
      window === window.top &&
      settings.translationEnabled
    ) {
      startModelPolling();
    }
    startDetection();
  });
})();
