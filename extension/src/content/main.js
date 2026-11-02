import { MODEL_CATALOG, normalizeModelTier } from "../core/model-catalog.js";
import { DEFAULT_SETTINGS, LEGACY_SETTING_KEYS, sanitizeSettings } from "../core/settings.js";
import { normalizeCaption } from "./captions.js";
import { OverlayRenderer } from "./overlay-renderer.js";
import { createPlatformForHost } from "./platforms.js";
import { PlayerPanel } from "./player-panel.js";
import { SetupCard } from "./setup-card.js";
import { TranslationController } from "./translation-controller.js";
import { shouldApplyTranslationResult } from "./translation-request.js";

(() => {
  const BUILD = "0.8.0";
  const NOTICE_HIDE_AFTER_MS = 8000;
  const DOWNLOAD_POLL_MS = 1000;
  const TRANSLATE_AHEAD_CUES = 3;
  // Settings that only change how the overlay looks. Changing them must not
  // re-translate: a slider dragged during playback would otherwise send a
  // request every few hundred milliseconds and interrupt each one.
  const STYLE_ONLY_SETTINGS = new Set([
    "fontSize",
    "overlayBackgroundOpacity",
    "optionsLanguage",
    "translationCacheLimit"
  ]);
  if (window.__openStreamSubtitlesLoaded) {
    return;
  }

  window.__openStreamSubtitlesLoaded = true;
  window.__localSubsBuild = BUILD;

  let lastCaption = "";
  let detectScheduled = false;
  let activeCaptionRequestId = 0;
  let activeTranslationAbortController = null;
  let aheadAbortController = null;
  let lastTranslation = "";
  let needsReposition = false;
  let captionDetectedAt = 0;
  let lastTranslationLatencyMs = 0;
  let captionHideTimer = null;
  let captionMissingSince = 0;
  let modelPollTimer = null;
  let modelPollGeneration = 0;
  // A download or load card was shown, so "ready" is worth saying.
  let modelSetupShown = false;
  let warmupInFlight = false;
  let checkInFlight = false;
  // The model needs downloading and is waiting for a video to play.
  let downloadPending = null;
  let settings = { ...DEFAULT_SETTINGS };
  const platform = createPlatformForHost(window.location.hostname, { getSettings: () => settings });
  if (!platform) {
    return;
  }
  const overlayRenderer = new OverlayRenderer({
    getSettings: () => settings,
    getHost: () => platform.getHost(),
    nativeSubtitles: platform.nativeSubtitles
  });
  const playerPanel = new PlayerPanel({
    getSettings: () => settings,
    getHost: () => overlayRenderer.getHost(),
    storage: { set: (values) => chrome.storage.sync.set(values) },
    sendMessage: (message) => chrome.runtime.sendMessage(message)
  });
  const translationController = new TranslationController({
    getSettings: () => settings,
    sendMessage: (message) => chrome.runtime.sendMessage(message),
    showStatus: (error) => showTranslatorError(error)
  });

  const setupCard = new SetupCard({
    getSettings: () => settings,
    getHost: () => overlayRenderer.getHost(),
    openOptions: () => chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" })
  });

  // A failed check or translation, as the card that says what to do about it.
  function showTranslatorError(error) {
    const code = error?.code;
    if (code === "model_loading") {
      // The model poll shows download and load progress; start it if needed.
      if (!warmupInFlight && !checkInFlight && modelPollTimer === null) startModelPolling();
    } else if (code === "webgpu_unavailable" || code === "webgpu_feature_missing") {
      setupCard.show("noGpu");
    } else if (code === "native_permission_required") {
      setupCard.show("nativePermission");
    } else {
      setupCard.show("unavailable", { detail: error?.message || "" });
    }
  }

  function clearStatusMessage() {
    setupCard.hide();
  }

  function applySettings(nextSettings) {
    const previousSettings = settings;
    settings = sanitizeSettings(nextSettings);

    translationController.handleSettingsChange(previousSettings, settings);
    platform.applySettings?.(previousSettings, settings);

    overlayRenderer.applySettings();
    playerPanel.applySettings();
    setupCard.applySettings();

    if (!settings.translationEnabled) {
      modelPollGeneration += 1;
      window.clearTimeout(modelPollTimer);
      modelPollTimer = null;
      modelSetupShown = false;
      downloadPending = null;
      clearStatusMessage();
      activeCaptionRequestId += 1;
      activeTranslationAbortController?.abort();
      activeTranslationAbortController = null;
      cancelTranslateAhead();
      lastTranslation = "";
      overlayRenderer.enterFallback();
      return;
    }

    const changedKeys = Object.keys(settings).filter((key) => previousSettings[key] !== settings[key]);
    if (changedKeys.every((key) => STYLE_ONLY_SETTINGS.has(key))) {
      if (overlayRenderer.isVisible()) overlayRenderer.position();
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

    const storedSettings = await chrome.storage.sync.get([...Object.keys(DEFAULT_SETTINGS), ...LEGACY_SETTING_KEYS]);
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
    cancelTranslateAhead();
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
    translateAhead();
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

  function resetCaptionState() {
    cancelPendingCaptionHide();
    activeCaptionRequestId += 1;
    activeTranslationAbortController?.abort();
    activeTranslationAbortController = null;
    cancelTranslateAhead();
    translationController.resetHistory();
    overlayRenderer.enterFallback();
    lastCaption = "";
    lastTranslation = "";
    lastTranslationLatencyMs = 0;
  }

  function detectCaption() {
    const caption = normalizeCaption(platform.getCurrentCue()?.text || "");

    if (!caption) {
      if (platform.hasActiveContent()) {
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
      if (platform.keepsNativeHiddenBetweenCues?.() && settings.translationEnabled) {
        // A captured track keeps its history across gaps: the look-ahead
        // translated the next line with this context.
        overlayRenderer.enterIdle();
      } else {
        translationController.resetHistory();
        overlayRenderer.enterFallback();
      }
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

    // Translated ahead: show both lines in this frame instead of hiding the
    // overlay for a round trip.
    const cached = translationController.cachedTranslation(caption);
    if (cached) {
      activeTranslationAbortController?.abort();
      activeTranslationAbortController = null;
      lastTranslation = cached;
      overlayRenderer.enterTranslated(caption, cached);
      translateAhead();
      return;
    }

    overlayRenderer.enterPending(caption);
    void renderTranslationForCaption(caption, activeCaptionRequestId);
  }

  // Platforms that hold the whole track translate the next lines while the
  // current one shows. One request at a time, and only while no line on
  // screen is waiting: WebLLM interrupts the running request for a new one.
  function translateAhead() {
    if (aheadAbortController || activeTranslationAbortController || !settings.translationEnabled) return;
    const upcoming = (platform.getUpcomingCues?.(TRANSLATE_AHEAD_CUES) || [])
      .map((cue) => normalizeCaption(cue.text))
      .filter(Boolean);
    if (upcoming.length === 0) return;
    const controller = new AbortController();
    aheadAbortController = controller;
    void translationController.translateAhead(upcoming, controller.signal).finally(() => {
      if (aheadAbortController === controller) aheadAbortController = null;
    });
  }

  function cancelTranslateAhead() {
    aheadAbortController?.abort();
    aheadAbortController = null;
  }

  function bindVideoListeners() {
    const videos = Array.from(document.querySelectorAll("video"));

    if (videos.length === 0) {
      return;
    }

    playerPanel.ensure();

    for (const video of videos) {
      if (video.dataset.openStreamSubtitlesBound === "true") {
        continue;
      }

      video.dataset.openStreamSubtitlesBound = "true";
      video.addEventListener("timeupdate", scheduleDetect, { passive: true });
      video.addEventListener("seeked", scheduleDetect, { passive: true });
      video.addEventListener("playing", scheduleDetect, { passive: true });
      video.addEventListener("playing", startPendingDownload, { passive: true });
      video.addEventListener("loadedmetadata", scheduleDetect, { passive: true });
    }
  }

  function startDetection() {
    platform.start({
      onChange: ({ reposition = false } = {}) => {
        if (reposition) needsReposition = true;
        detectCaption();
      },
      onReset: resetCaptionState,
      onSubtitleNode: (node) => overlayRenderer.setSubtitleNode(node),
      showStatus: (notice) => setupCard.show(notice, { autoHideMs: NOTICE_HIDE_AFTER_MS })
    });
    bindVideoListeners();
    detectCaption();
  }

  if (!platform.shouldRun()) {
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
    setupCard.updateHost();
    overlayRenderer.updateHost();
    playerPanel.updateHost();
    needsReposition = true;
    scheduleDetect();
  });

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener(handleStorageChange);
  }

  function modelSize() {
    return MODEL_CATALOG[normalizeModelTier(settings.modelTier)].webllm.downloadMB;
  }

  function showModelProgress({ cached, progress, legacyCached }) {
    const state = cached ? "preparing" : legacyCached ? "upgrading" : "downloading";
    // WebLLM reports progress per finished shard, so it sits at 0 for a while:
    // show the bar as busy until there's a real number.
    setupCard.show(state, { progress: progress > 0 ? progress : null, size: modelSize() });
    modelSetupShown = true;
  }

  function handleModelReady() {
    if (modelSetupShown) {
      modelSetupShown = false;
      setupCard.show("ready", { autoHideMs: 4000 });
    }
    // Translate the subtitle that showed while the model was loading.
    if (lastCaption && !lastTranslation && !activeTranslationAbortController) {
      activeCaptionRequestId += 1;
      captionDetectedAt = Date.now();
      overlayRenderer.enterPending(lastCaption);
      void renderTranslationForCaption(lastCaption, activeCaptionRequestId);
    }
  }

  function isVideoPlaying() {
    return Array.from(document.querySelectorAll("video")).some((video) => !video.paused && !video.ended);
  }

  // Downloads or loads the model in the background, then checks again. A
  // failure is shown instead of retried, so a broken download doesn't loop.
  function startWarmup(generation) {
    if (warmupInFlight) return;
    warmupInFlight = true;
    void chrome.runtime.sendMessage({ type: "CHECK_TRANSLATOR", warmup: true })
      .catch((error) => ({ ok: false, error: { message: error instanceof Error ? error.message : "" } }))
      .then((result) => {
        warmupInFlight = false;
        if (!settings.translationEnabled || generation !== modelPollGeneration) return;
        window.clearTimeout(modelPollTimer);
        modelPollTimer = null;
        if (result?.ok) {
          handleModelReady();
        } else if (result?.error) {
          showTranslatorError(result.error);
        } else {
          void pollUntilModelReady(generation);
        }
      });
  }

  // A model that isn't downloaded starts downloading once a video plays.
  function startPendingDownload() {
    if (!downloadPending || downloadPending.generation !== modelPollGeneration) return;
    const { generation, legacyCached } = downloadPending;
    downloadPending = null;
    showModelProgress({ cached: false, progress: 0, legacyCached });
    startWarmup(generation);
    modelPollTimer = window.setTimeout(() => pollUntilModelReady(generation), DOWNLOAD_POLL_MS);
  }

  async function pollUntilModelReady(generation) {
    modelPollTimer = null;
    const stale = () => !settings.translationEnabled || generation !== modelPollGeneration;
    if (stale()) {
      clearStatusMessage();
      return;
    }
    let result;
    checkInFlight = true;
    try {
      result = await chrome.runtime.sendMessage({ type: "CHECK_TRANSLATOR", warmup: false });
    } catch {
      clearStatusMessage();
      return;
    } finally {
      checkInFlight = false;
    }
    if (stale()) {
      clearStatusMessage();
      return;
    }

    if (result?.ok) {
      handleModelReady();
    } else if (result?.loading || result?.needsInitialization) {
      if (result.needsInitialization) startWarmup(generation);
      showModelProgress(result);
      modelPollTimer = window.setTimeout(() => pollUntilModelReady(generation), DOWNLOAD_POLL_MS);
    } else if (result?.needsDownload) {
      downloadPending = { generation, legacyCached: Boolean(result.legacyCached) };
      if (isVideoPlaying()) startPendingDownload();
    } else if (result?.error) {
      showTranslatorError(result.error);
    } else {
      clearStatusMessage();
    }
  }

  function startModelPolling() {
    modelPollGeneration += 1;
    const generation = modelPollGeneration;
    window.clearTimeout(modelPollTimer);
    modelPollTimer = null;
    downloadPending = null;
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
