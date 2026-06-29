(() => {
  const BUILD = "0.2.0";
  const OVERLAY_ID = "open-stream-subtitles-overlay";
  const STATUS_OVERLAY_ID = "open-stream-subtitles-status";
  const HIDE_AFTER_MS = 500;
  const STATUS_HIDE_AFTER_MS = 6500;
  const TRANSLATION_SOURCE_LANGUAGE = "en";
  const DEFAULT_SETTINGS = {
    translationEnabled: true,
    localTranslatorEnabled: true,
    hideNativeSubtitles: true,
    showPendingOriginalText: true,
    showOriginalText: false,
    targetLanguage: "zh-Hant",
    fontSize: 30,
    overlayBackgroundOpacity: 0.22,
    translationContextWindow: 3,
    localTranslatorCtxSize: 1,
    translationCacheLimit: 120
  };
  const LEGACY_SETTINGS_KEYS = {
    localTranslatorEnabled: "localMlxEnabled",
    localTranslatorCtxSize: "localMlxCtxSize"
  };
  const PRIMARY_SUBTITLE_SELECTORS = [
    "#overlay-root [data-testid='cueBoxRowTextCue']",
    "[data-testid='cueBoxRowTextCue']",
    "#overlay-root .RowContainer-Fuse-Web-Play__sc-1wvp621-1 .CaptionWindow-Fuse-Web-Play__sc-1wvp621-5",
    "#overlay-root [class*='RowContainer-Fuse-Web-Play'] [class*='CaptionWindow-Fuse-Web-Play']",
    "[class*='CaptionWindow-Fuse-Web-Play']"
  ];
  const BLOCKED_SUBTITLE_SELECTORS = [
    "[data-testid='player-ux-asset-subtitle']",
    "[class*='Subtitle-Fuse-Web-Play__sc-k9fw09-7']"
  ];

  if (window.__openStreamSubtitlesLoaded) {
    return;
  }

  window.__openStreamSubtitlesLoaded = true;

  let lastCaption = "";
  let overlay = null;
  let overlayCard = null;
  let originalLine = null;
  let translatedLine = null;
  let sourceObserver = null;
  let activeSubtitleNode = null;
  let hiddenSubtitleNode = null;
  let hiddenSubtitleOriginalVisibility = "";
  let detectScheduled = false;
  let overlayHost = null;
  let lastSubtitleNodeChangeAt = 0;
  let activeCaptionRequestId = 0;
  let activeTranslationAbortController = null;
  let lastTranslation = "";
  let needsReposition = false;
  let captionHistory = [];
  let captionDetectedAt = 0;
  let lastTranslationLatencyMs = 0;
  let isOverlayPinned = false;
  let isOverlayDragging = false;
  let statusOverlay = null;
  let statusOverlayTimer = null;
  let lastLocalServerWarningAt = 0;
  let dragPointerId = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let settings = { ...DEFAULT_SETTINGS };
  const translationCache = new Map();

  function normalizeText(text) {
    return text
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeTranslatedText(text) {
    return text
      .split(/\n+/)
      .map((line) => normalizeText(line))
      .filter(Boolean)
      .join("\n");
  }

  function clampNumber(value, min, max, fallback) {
    const nextValue = Number.isFinite(value) ? value : fallback;
    return Math.min(Math.max(nextValue, min), max);
  }

  function sanitizeSettings(rawSettings = {}) {
    const localTranslatorEnabled = "localTranslatorEnabled" in rawSettings
      ? rawSettings.localTranslatorEnabled
      : rawSettings[LEGACY_SETTINGS_KEYS.localTranslatorEnabled];
    const localTranslatorCtxSize = "localTranslatorCtxSize" in rawSettings
      ? rawSettings.localTranslatorCtxSize
      : rawSettings[LEGACY_SETTINGS_KEYS.localTranslatorCtxSize];

    return {
      translationEnabled: rawSettings.translationEnabled !== false,
      localTranslatorEnabled: localTranslatorEnabled !== false,
      hideNativeSubtitles: rawSettings.hideNativeSubtitles !== false,
      showPendingOriginalText: rawSettings.showPendingOriginalText !== false,
      showOriginalText: Boolean(rawSettings.showOriginalText),
      targetLanguage: typeof rawSettings.targetLanguage === "string" && rawSettings.targetLanguage
        ? rawSettings.targetLanguage
        : DEFAULT_SETTINGS.targetLanguage,
      fontSize: clampNumber(
        Number.parseInt(rawSettings.fontSize, 10),
        16,
        42,
        DEFAULT_SETTINGS.fontSize
      ),
      overlayBackgroundOpacity: clampNumber(
        Number.parseFloat(rawSettings.overlayBackgroundOpacity),
        0,
        0.95,
        DEFAULT_SETTINGS.overlayBackgroundOpacity
      ),
      translationContextWindow: clampNumber(
        Number.parseInt(rawSettings.translationContextWindow, 10),
        1,
        5,
        DEFAULT_SETTINGS.translationContextWindow
      ),
      localTranslatorCtxSize: clampNumber(
        Number.parseInt(localTranslatorCtxSize, 10),
        0,
        5,
        DEFAULT_SETTINGS.localTranslatorCtxSize
      ),
      translationCacheLimit: clampNumber(
        Number.parseInt(rawSettings.translationCacheLimit, 10),
        20,
        500,
        DEFAULT_SETTINGS.translationCacheLimit
      )
    };
  }

  function trimTranslationCache() {
    while (translationCache.size > settings.translationCacheLimit) {
      const oldestKey = translationCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      translationCache.delete(oldestKey);
    }
  }

  function isNonDialogueCaption(text) {
    const normalized = normalizeText(text);

    if (!normalized) {
      return true;
    }

    return (
      /^\[[^\]]+\]$/.test(normalized) ||
      /^\([^)]+\)$/.test(normalized) ||
      /^[♪♬][^♪♬]*[♪♬]?$/.test(normalized)
    );
  }

  function applyOverlayStyleSettings() {
    if (!overlayCard || !originalLine || !translatedLine) {
      return;
    }

    overlayCard.style.background = `rgba(0, 0, 0, ${settings.overlayBackgroundOpacity})`;
    originalLine.style.fontSize = `${Math.max(14, Math.round(settings.fontSize * 0.82))}px`;
    translatedLine.style.fontSize = `${settings.fontSize}px`;
  }

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

    if (
      previousSettings.targetLanguage !== settings.targetLanguage ||
      previousSettings.localTranslatorEnabled !== settings.localTranslatorEnabled ||
      previousSettings.hideNativeSubtitles !== settings.hideNativeSubtitles ||
      previousSettings.localTranslatorCtxSize !== settings.localTranslatorCtxSize ||
      previousSettings.showPendingOriginalText !== settings.showPendingOriginalText
    ) {
      translationCache.clear();
    }

    if (previousSettings.translationCacheLimit !== settings.translationCacheLimit) {
      trimTranslationCache();
    }

    if (previousSettings.translationContextWindow !== settings.translationContextWindow) {
      resetCaptionHistory();
    }

    applyOverlayStyleSettings();
    if (!settings.hideNativeSubtitles) {
      restoreHiddenNativeSubtitle();
    }

    if (lastCaption) {
      activeCaptionRequestId += 1;
      enterPendingCaptionState(lastCaption);
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

    const storedSettings = await chrome.storage.sync.get([
      ...Object.keys(DEFAULT_SETTINGS),
      LEGACY_SETTINGS_KEYS.localTranslatorEnabled,
      LEGACY_SETTINGS_KEYS.localTranslatorCtxSize
    ]);
    applySettings(storedSettings);
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "sync") {
      return;
    }

    const nextSettings = { ...settings };
    let hasRelevantChange = false;

    for (const [key, change] of Object.entries(changes)) {
      if (
        !(key in DEFAULT_SETTINGS) &&
        key !== LEGACY_SETTINGS_KEYS.localTranslatorEnabled &&
        key !== LEGACY_SETTINGS_KEYS.localTranslatorCtxSize
      ) {
        continue;
      }

      if (key === LEGACY_SETTINGS_KEYS.localTranslatorEnabled) {
        nextSettings.localTranslatorEnabled = change.newValue;
      } else if (key === LEGACY_SETTINGS_KEYS.localTranslatorCtxSize) {
        nextSettings.localTranslatorCtxSize = change.newValue;
      } else {
        nextSettings[key] = change.newValue;
      }
      hasRelevantChange = true;
    }

    if (hasRelevantChange) {
      applySettings(nextSettings);
    }
  }

  function getTranslationCacheKey(text, contextLines = []) {
    const backend = settings.localTranslatorEnabled
      ? `local:${settings.localTranslatorCtxSize}`
      : "browser";
    return `${backend}\n${settings.targetLanguage}\n${contextLines.join("\n")}\n---\n${text}`;
  }

  function rememberTranslation(text, contextLines, translatedText) {
    translationCache.set(getTranslationCacheKey(text, contextLines), translatedText);
    trimTranslationCache();
  }

  async function translateWithLocalTranslator(text, signal, contextLines = []) {
    if (!settings.localTranslatorEnabled) {
      return null;
    }

    try {
      if (signal?.aborted) {
        return null;
      }

      const payload = await chrome.runtime.sendMessage({
        type: "TRANSLATE_SUBTITLE",
        payload: {
          currentText: text,
          contextLines,
          sourceLanguage: TRANSLATION_SOURCE_LANGUAGE,
          targetLanguage: settings.targetLanguage
        }
      });

      if (signal?.aborted) {
        return null;
      }

      if (!payload?.ok) {
        const isLoading = payload?.error?.includes("model_loading");
        if (Date.now() - lastLocalServerWarningAt > (isLoading ? 8000 : 30000)) {
          lastLocalServerWarningAt = Date.now();
          showStatusMessage(isLoading
            ? "LocalSubs: loading model, please wait..."
            : (payload?.error || "Local translator returned an error."));
        }
        return null;
      }

      if (typeof payload.translation !== "string") {
        return null;
      }

      return normalizeTranslatedText(payload.translation);
    } catch (err) {
      if (err?.name === "AbortError") {
        return null;
      }
      if (Date.now() - lastLocalServerWarningAt > 30000) {
        lastLocalServerWarningAt = Date.now();
        showStatusMessage("Local translator is not running. Open setup to start the model service.");
      }
      return null;
    }
  }

  async function translateCaption(text, signal, contextLines = []) {
    if (!text) {
      return "";
    }

    if (!settings.translationEnabled) {
      return "";
    }

    const cacheKey = getTranslationCacheKey(text, contextLines);
    if (translationCache.has(cacheKey)) {
      return translationCache.get(cacheKey) || "";
    }

    const translatedText = await translateWithLocalTranslator(text, signal, contextLines);
    if (translatedText === null) {
      return "";
    }

    const finalText = translatedText === text ? "" : translatedText;
    rememberTranslation(text, contextLines, finalText);
    return finalText;
  }

  function updateCaptionHistory(caption) {
    if (!caption || isNonDialogueCaption(caption)) {
      return;
    }

    const nextHistory = captionHistory.filter((entry) => entry !== caption);
    nextHistory.push(caption);
    captionHistory = nextHistory.slice(-settings.translationContextWindow);
  }

  function resetCaptionHistory() {
    captionHistory = [];
  }

  function buildTranslationWindow(caption) {
    const contextCaptions = captionHistory
      .filter(Boolean)
      .slice(-settings.translationContextWindow);

    if (contextCaptions[contextCaptions.length - 1] === caption) {
      return {
        fullText: contextCaptions.join("\n"),
        prefixText: contextCaptions.slice(0, -1).join("\n")
      };
    }

    const fullCaptions = [...contextCaptions, caption];
    return {
      fullText: fullCaptions.join("\n"),
      prefixText: fullCaptions.slice(0, -1).join("\n")
    };
  }

  async function translateCaptionWithContext(caption, signal) {
    if (isNonDialogueCaption(caption)) {
      return translateCaption(caption, signal);
    }

    const captionLines = caption.split("\n");
    if (captionLines.length > 1) {
      const translatedLines = [];
      for (const line of captionLines) {
        if (signal?.aborted) {
          return "";
        }
        const normalizedLine = normalizeText(line);
        if (!normalizedLine) {
          continue;
        }
        const translatedLineText = await translateCaption(normalizedLine, signal, []);
        translatedLines.push(translatedLineText);
      }
      return translatedLines.filter(Boolean).join("\n");
    }

    const { fullText, prefixText } = buildTranslationWindow(caption);

    if (!fullText || fullText === caption) {
      return translateCaption(caption, signal);
    }

    const contextLines = prefixText
      .split(/\n+/)
      .map((line) => normalizeText(line))
      .filter(Boolean)
      .slice(-settings.localTranslatorCtxSize);

    return translateCaption(caption, signal, contextLines);
  }

  function isLikelyUiText(text) {
    const normalized = normalizeText(text);
    const words = normalized.split(/\s+/).filter(Boolean);

    if (!normalized) return true;
    if (normalized.length > 160) return true;
    if (/^S\d+\s*E\d+:/i.test(normalized)) return true;
    if (/^(episode|season)\b/i.test(normalized)) return true;
    if (/^(skip|play|pause|settings|audio|subtitle|continue watching|next episode)\b/i.test(normalized)) {
      return true;
    }
    if (
      words.length <= 3 &&
      !/[.!?,"'-]/u.test(normalized) &&
      words.every((word) => /^[A-Z][a-z]+$/.test(word))
    ) {
      return true;
    }

    return false;
  }

  function isBlockedSubtitleNode(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }

    return BLOCKED_SUBTITLE_SELECTORS.some((selector) => {
      return node.matches(selector) || Boolean(node.closest(selector));
    });
  }

  function ensureOverlay() {
    if (overlay?.isConnected && originalLine?.isConnected && translatedLine?.isConnected) {
      updateOverlayHost();
      return overlay;
    }

    overlay = document.getElementById(OVERLAY_ID);

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.setAttribute("aria-live", "polite");
      overlay.style.position = "absolute";
      overlay.style.left = "0";
      overlay.style.top = "0";
      overlay.style.zIndex = "2147483647";
      overlay.style.width = "auto";
      overlay.style.display = "none";
      overlay.style.pointerEvents = "auto";
      overlay.style.fontFamily = "\"Helvetica Neue\", Arial, sans-serif";
      overlay.style.textAlign = "center";
      overlay.style.color = "#ffffff";
      overlay.style.textShadow =
        "0 2px 6px rgba(0, 0, 0, 0.95), 0 0 18px rgba(0, 0, 0, 0.8)";

      overlayCard = document.createElement("div");
      overlayCard.style.display = "inline-flex";
      overlayCard.style.flexDirection = "column";
      overlayCard.style.alignItems = "center";
      overlayCard.style.gap = "0.3rem";
      overlayCard.style.width = "auto";
      overlayCard.style.maxWidth = "min(96vw, 100%)";
      overlayCard.style.boxSizing = "border-box";
      overlayCard.style.padding = "0.2rem 0.45rem";
      overlayCard.style.borderRadius = "14px";
      overlayCard.style.background = "rgba(0, 0, 0, 0.22)";
      overlayCard.style.backdropFilter = "blur(3px)";
      overlayCard.style.webkitBackdropFilter = "blur(3px)";
      overlayCard.style.pointerEvents = "auto";
      overlayCard.style.cursor = "grab";
      overlayCard.style.userSelect = "none";
      overlayCard.style.webkitUserSelect = "none";
      overlayCard.style.touchAction = "none";

      originalLine = document.createElement("div");
      originalLine.style.display = "none";
      originalLine.style.fontSize = "clamp(20px, 2vw, 30px)";
      originalLine.style.fontWeight = "700";
      originalLine.style.lineHeight = "1.2";
      originalLine.style.letterSpacing = "0.01em";

      translatedLine = document.createElement("div");
      translatedLine.style.display = "none";
      translatedLine.style.fontSize = "clamp(20px, 2vw, 30px)";
      translatedLine.style.fontWeight = "700";
      translatedLine.style.lineHeight = "1.2";
      translatedLine.style.letterSpacing = "0.01em";
      translatedLine.style.opacity = "1";
      translatedLine.style.whiteSpace = "pre-line";

      overlayCard.addEventListener("pointerdown", handleOverlayPointerDown);

      overlayCard.append(translatedLine, originalLine);
      overlay.appendChild(overlayCard);
    }

    applyOverlayStyleSettings();
    updateOverlayHost();

    return overlay;
  }

  function getOverlayHost() {
    const fullscreenElement = document.fullscreenElement;
    if (fullscreenElement instanceof HTMLElement) {
      return fullscreenElement;
    }

    const overlayRoot = document.getElementById("overlay-root");
    if (overlayRoot instanceof HTMLElement) {
      return overlayRoot;
    }

    const video = document.querySelector("video");
    if (video?.parentElement instanceof HTMLElement) {
      return video.parentElement;
    }

    return document.body || document.documentElement;
  }

  function ensureOverlayHostPosition(host) {
    if (!(host instanceof HTMLElement)) {
      return;
    }

    const computedStyle = window.getComputedStyle(host);
    if (computedStyle.position === "static") {
      host.dataset.openStreamSubtitlesOverlayHost = "true";
      host.style.position = "relative";
    }
  }

  function updateOverlayHost() {
    if (!overlay) {
      return;
    }

    const nextHost = getOverlayHost();
    if (!(nextHost instanceof HTMLElement)) {
      return;
    }

    ensureOverlayHostPosition(nextHost);

    if (overlayHost !== nextHost || !overlay.isConnected) {
      overlayHost = nextHost;
      overlayHost.appendChild(overlay);
      if (isOverlayPinned) {
        clampOverlayPosition();
      }
    }
  }

  function restoreHiddenNativeSubtitle() {
    if (hiddenSubtitleNode instanceof HTMLElement) {
      hiddenSubtitleNode.style.visibility = hiddenSubtitleOriginalVisibility;
      hiddenSubtitleNode.removeAttribute("data-open-stream-subtitles-hidden");
    }
    hiddenSubtitleNode = null;
    hiddenSubtitleOriginalVisibility = "";
  }

  function hideNativeSubtitleNode() {
    if (!settings.hideNativeSubtitles || !(activeSubtitleNode instanceof HTMLElement)) {
      restoreHiddenNativeSubtitle();
      return false;
    }

    const node = activeSubtitleNode;
    if (node === overlay || node.closest(`#${OVERLAY_ID}`)) {
      return false;
    }

    const rectBefore = node.getBoundingClientRect();
    if (!isCandidateVisible(rectBefore)) {
      return false;
    }

    if (hiddenSubtitleNode !== node) {
      restoreHiddenNativeSubtitle();
      hiddenSubtitleNode = node;
      hiddenSubtitleOriginalVisibility = node.style.visibility || "";
    }

    node.dataset.openStreamSubtitlesHidden = "true";
    node.style.visibility = "hidden";

    const rectAfter = node.getBoundingClientRect();
    return isCandidateVisible(rectAfter);
  }

  function applyNativeSubtitleSuppression() {
    if (!settings.hideNativeSubtitles) {
      restoreHiddenNativeSubtitle();
      return;
    }

    hideNativeSubtitleNode();
  }

  function clampOverlayPosition() {
    if (!overlay || !overlayHost) {
      return;
    }

    const overlayRect = overlay.getBoundingClientRect();
    const hostRect = overlayHost.getBoundingClientRect();
    const currentLeft = Number.parseFloat(overlay.style.left || "0");
    const currentTop = Number.parseFloat(overlay.style.top || "0");
    const minLeft = hostRect.width * 0.01;
    const minTop = 8;
    const maxLeft = Math.max(minLeft, hostRect.width - overlayRect.width - hostRect.width * 0.01);
    const maxTop = Math.max(minTop, hostRect.height - overlayRect.height - 8);

    overlay.style.left = `${Math.min(Math.max(currentLeft, minLeft), maxLeft)}px`;
    overlay.style.top = `${Math.min(Math.max(currentTop, minTop), maxTop)}px`;
  }

  function applyPinnedOverlayPosition(clientX, clientY) {
    if (!overlay || !overlayHost) {
      return;
    }

    overlay.style.width = "auto";
    overlay.style.maxWidth = `${overlayHost.getBoundingClientRect().width * 0.98}px`;

    const hostRect = overlayHost.getBoundingClientRect();
    overlay.style.left = `${clientX - hostRect.left - dragOffsetX}px`;
    overlay.style.top = `${clientY - hostRect.top - dragOffsetY}px`;
    clampOverlayPosition();
  }

  function handleOverlayPointerMove(event) {
    if (!isOverlayDragging || event.pointerId !== dragPointerId) {
      return;
    }

    event.preventDefault();
    applyPinnedOverlayPosition(event.clientX, event.clientY);
  }

  function finishOverlayDrag(event) {
    if (event.pointerId !== dragPointerId) {
      return;
    }

    isOverlayDragging = false;
    dragPointerId = null;
    if (overlayCard) {
      overlayCard.style.cursor = "grab";
    }
    window.removeEventListener("pointermove", handleOverlayPointerMove);
    window.removeEventListener("pointerup", finishOverlayDrag);
    window.removeEventListener("pointercancel", finishOverlayDrag);
  }

  function handleOverlayPointerDown(event) {
    if (!overlay || !overlayCard) {
      return;
    }

    event.preventDefault();
    updateOverlayHost();
    const overlayRect = overlay.getBoundingClientRect();
    dragPointerId = event.pointerId;
    dragOffsetX = event.clientX - overlayRect.left;
    dragOffsetY = event.clientY - overlayRect.top;
    isOverlayPinned = true;
    isOverlayDragging = true;
    overlayCard.style.cursor = "grabbing";
    window.addEventListener("pointermove", handleOverlayPointerMove);
    window.addEventListener("pointerup", finishOverlayDrag);
    window.addEventListener("pointercancel", finishOverlayDrag);
  }

  function positionOverlayAboveSubtitle() {
    if (!overlay || !overlayHost) {
      return;
    }

    if (isOverlayPinned) {
      clampOverlayPosition();
      return;
    }

    if (!(activeSubtitleNode instanceof HTMLElement)) {
      return;
    }

    const subtitleRect = activeSubtitleNode.getBoundingClientRect();
    const hostRect = overlayHost.getBoundingClientRect();

    if (!isCandidateVisible(subtitleRect)) {
      return;
    }

    const targetLeft = subtitleRect.left - hostRect.left;
    const targetTop = subtitleRect.top - hostRect.top;
    overlay.style.width = "auto";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.transform = "translate(0, 0)";
    overlay.style.maxWidth = `${hostRect.width * 0.98}px`;

    const overlayRect = overlay.getBoundingClientRect();
    const centeredLeft = targetLeft + subtitleRect.width / 2 - overlayRect.width / 2;
    const minLeft = hostRect.width * 0.01;
    const maxLeft = hostRect.width - overlayRect.width - hostRect.width * 0.01;
    const clampedLeft = Math.min(Math.max(centeredLeft, minLeft), Math.max(minLeft, maxLeft));
    let top = targetTop + subtitleRect.height / 2 - overlayRect.height / 2;

    if (!settings.hideNativeSubtitles) {
      const gap = 3;
      const subtitleCenterY = subtitleRect.top + subtitleRect.height / 2;
      const shouldPlaceBelow = subtitleCenterY <= window.innerHeight * 0.5;
      top = shouldPlaceBelow
        ? targetTop + subtitleRect.height + gap
        : targetTop - overlayRect.height - gap;
    }

    overlay.style.left = `${clampedLeft}px`;
    overlay.style.top = `${Math.min(
      Math.max(8, top),
      hostRect.height - overlayRect.height - 8
    )}px`;
  }

  function setOverlayVisible(visible) {
    if (!visible && !overlay) {
      return;
    }

    const overlayNode = overlay || ensureOverlay();
    overlayNode.style.display = visible ? "block" : "none";
  }


  function renderOverlayContent(originalText, translatedText = "", showOriginal = false) {
    ensureOverlay();
    const nextOriginalText = showOriginal && originalText ? originalText : "";
    const nextTranslatedText = translatedText || "";
    const shouldShowOverlay = Boolean(nextTranslatedText || nextOriginalText);

    if (overlayCard) {
      overlayCard.style.visibility = "hidden";
    }

    translatedLine.textContent = nextTranslatedText;
    translatedLine.style.display = nextTranslatedText ? "block" : "none";

    originalLine.textContent = nextOriginalText;
    originalLine.style.display = nextOriginalText ? "block" : "none";
    originalLine.style.opacity = nextTranslatedText ? "0.78" : "0.68";

    if (shouldShowOverlay) {
      positionOverlayAboveSubtitle();
      setOverlayVisible(true);
    } else {
      setOverlayVisible(false);
    }

    if (overlayCard) {
      overlayCard.style.visibility = "visible";
    }
  }

  function enterPendingCaptionState(caption) {
    ensureOverlay();
    if (settings.hideNativeSubtitles && caption) {
      applyNativeSubtitleSuppression();
      clearOverlayLines();
      setOverlayVisible(false);
      return;
    }
    restoreHiddenNativeSubtitle();
    renderOverlayContent(caption, "", settings.showPendingOriginalText);
  }

  function enterTranslatedCaptionState(caption, translatedText) {
    if (!translatedText) {
      enterFallbackCaptionState();
      return;
    }
    if (settings.hideNativeSubtitles && caption) {
      applyNativeSubtitleSuppression();
    } else {
      restoreHiddenNativeSubtitle();
    }
    renderOverlayContent(caption, translatedText, settings.hideNativeSubtitles || settings.showOriginalText);
  }

  function enterFallbackCaptionState() {
    restoreHiddenNativeSubtitle();
    clearOverlayLines();
    setOverlayVisible(false);
  }

  function clearOverlayLines() {
    ensureOverlay();
    if (overlayCard) {
      overlayCard.style.visibility = "hidden";
    }
    translatedLine.textContent = "";
    translatedLine.style.display = "none";
    originalLine.textContent = "";
    originalLine.style.display = "none";
    if (overlayCard) {
      overlayCard.style.visibility = "visible";
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

    const translatedText = await translateCaptionWithContext(caption, controller.signal);

    if (activeTranslationAbortController === controller) {
      activeTranslationAbortController = null;
    }

    if (requestId !== activeCaptionRequestId) {
      return;
    }

    if (caption !== lastCaption) {
      return;
    }

    if (translatedText && captionDetectedAt > 0) {
      lastTranslationLatencyMs = Date.now() - captionDetectedAt;
    }
    lastTranslation = translatedText;
    enterTranslatedCaptionState(caption, translatedText);
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

  function isCandidateVisible(rect) {
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight
    );
  }

  function isSubtitleLikeRect(rect) {
    const verticalCenter = rect.top + rect.height / 2;

    return (
      verticalCenter > window.innerHeight * 0.55 &&
      rect.bottom < window.innerHeight * 0.98 &&
      rect.height <= window.innerHeight * 0.2 &&
      rect.width <= window.innerWidth * 0.9
    );
  }

  function scoreCandidate(text, rect, selector) {
    const verticalCenter = rect.top + rect.height / 2;
    const selectorBonus =
      /subtitle|caption|cue/i.test(selector) ? 0.08 : 0;
    const lengthPenalty = Math.min(text.length, 120) / 1000;
    const widthBonus = Math.min(rect.width / window.innerWidth, 0.6) * 0.08;

    return verticalCenter / window.innerHeight + selectorBonus + widthBonus - lengthPenalty;
  }

  function resolveSubtitleContainer(node) {
    if (!(node instanceof HTMLElement)) {
      return null;
    }

    return (
      node.closest("[class*='CaptionWindow-Fuse-Web-Play']") ||
      node.closest("[class*='RowContainer-Fuse-Web-Play']") ||
      node
    );
  }

  function extractNodeText(node) {
    const container = resolveSubtitleContainer(node);

    if (!(container instanceof HTMLElement)) {
      return "";
    }

    const cueNodes = container.matches("[data-testid='cueBoxRowTextCue']")
      ? [container]
      : Array.from(container.querySelectorAll("[data-testid='cueBoxRowTextCue']"));

    if (cueNodes.length > 0) {
      return cueNodes
        .map((cueNode) => normalizeText(cueNode.textContent || ""))
        .filter(Boolean)
        .join("\n");
    }

    return normalizeText(container.innerText || container.textContent || "");
  }

  function getPreferredSubtitleNode() {
    for (const selector of PRIMARY_SUBTITLE_SELECTORS) {
      const nodes = Array.from(document.querySelectorAll(selector));

      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        if (isBlockedSubtitleNode(node)) {
          continue;
        }

        const text = extractNodeText(node);
        if (!text) continue;
        if (isLikelyUiText(text)) continue;

        const container = resolveSubtitleContainer(node);
        if (!(container instanceof HTMLElement)) {
          continue;
        }

        const rect = container.getBoundingClientRect();
        if (!isCandidateVisible(rect)) continue;
        if (!isSubtitleLikeRect(rect) && !selector.includes("cueBoxRowTextCue")) continue;

        return container;
      }
    }

    return null;
  }

  function collectCaptionCandidates() {
    const selectors = PRIMARY_SUBTITLE_SELECTORS;
    const candidates = [];

    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));

      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        if (isBlockedSubtitleNode(node)) {
          continue;
        }

        const text = extractNodeText(node);

        if (!text) continue;
        if (isLikelyUiText(text)) continue;

        const container = resolveSubtitleContainer(node);
        if (!(container instanceof HTMLElement)) {
          continue;
        }

        const rect = container.getBoundingClientRect();

        if (!isCandidateVisible(rect)) continue;
        if (!isSubtitleLikeRect(rect) && !selector.includes("cueBoxRowTextCue")) continue;

        candidates.push({
          node: container,
          text,
          rect,
          selector,
          score: scoreCandidate(text, rect, selector)
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  function getNodeCaptionText(node) {
    if (!(node instanceof HTMLElement) || !node.isConnected) {
      return "";
    }

    if (isBlockedSubtitleNode(node)) {
      return "";
    }

    const text = extractNodeText(node);

    if (!text) return "";
    if (isLikelyUiText(text)) return "";

    const container = resolveSubtitleContainer(node);
    if (!(container instanceof HTMLElement)) {
      return "";
    }

    const rect = container.getBoundingClientRect();

    if (!isCandidateVisible(rect)) return "";
    if (!isSubtitleLikeRect(rect) && !container.querySelector("[data-testid='cueBoxRowTextCue']")) {
      return "";
    }

    return text;
  }

  function observeSubtitleNode(node) {
    const container = resolveSubtitleContainer(node);

    if (!(container instanceof HTMLElement)) {
      return;
    }

    if (activeSubtitleNode === container && sourceObserver) {
      if (settings.hideNativeSubtitles) {
        applyNativeSubtitleSuppression();
      }
      return;
    }

    if (sourceObserver) {
      sourceObserver.disconnect();
    }

    if (activeSubtitleNode !== container) {
      restoreHiddenNativeSubtitle();
    }

    activeSubtitleNode = container;
    if (settings.hideNativeSubtitles) {
      applyNativeSubtitleSuppression();
    }
    sourceObserver = new MutationObserver(() => {
      lastSubtitleNodeChangeAt = Date.now();
      needsReposition = true;
      scheduleDetect();
    });
    sourceObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function getDomCaptions() {
    const preferredNode = getPreferredSubtitleNode();

    if (preferredNode) {
      observeSubtitleNode(preferredNode);
      const preferredText = getNodeCaptionText(preferredNode);

      if (preferredText) {
        if (settings.hideNativeSubtitles) {
          applyNativeSubtitleSuppression();
        }
        return preferredText;
      }

      return "";
    }

    const lockedText = getNodeCaptionText(activeSubtitleNode);

    if (lockedText) {
      if (settings.hideNativeSubtitles) {
        applyNativeSubtitleSuppression();
      }
      return lockedText;
    }

    if (activeSubtitleNode) {
      return "";
    }

    const candidates = collectCaptionCandidates();
    const bestCandidate = candidates[0];

    if (!bestCandidate) {
      restoreHiddenNativeSubtitle();
      activeSubtitleNode = null;
      if (sourceObserver) {
        sourceObserver.disconnect();
        sourceObserver = null;
      }
      return "";
    }

    observeSubtitleNode(bestCandidate.node);
    if (settings.hideNativeSubtitles) {
      applyNativeSubtitleSuppression();
    }
    return bestCandidate.text;
  }

  function normalizeCaption(text) {
    return text
      .split(/\n+/)
      .map((line) => normalizeText(line))
      .filter(Boolean)
      .join("\n");
  }

  function detectCaption() {
    const caption = normalizeCaption(getDomCaptions());

    if (!caption) {
      const nodeStillHasContent =
        activeSubtitleNode instanceof HTMLElement &&
        activeSubtitleNode.isConnected &&
        activeSubtitleNode.textContent?.trim();
      if (nodeStillHasContent) {
        return;
      }
      activeCaptionRequestId += 1;
      const compensationMs = Math.min(lastTranslationLatencyMs, 3000);
      if (Date.now() - lastSubtitleNodeChangeAt > HIDE_AFTER_MS + compensationMs) {
        resetCaptionHistory();
        enterFallbackCaptionState();
        lastCaption = "";
        lastTranslationLatencyMs = 0;
      }
      return;
    }
    if (caption === lastCaption) {
      if (overlay?.style.display !== "none") {
        if (needsReposition) {
          positionOverlayAboveSubtitle();
          needsReposition = false;
        }
      } else if (lastTranslation) {
        enterTranslatedCaptionState(caption, lastTranslation);
      }
      return;
    }

    lastCaption = caption;
    lastTranslation = "";
    captionDetectedAt = Date.now();
    lastTranslationLatencyMs = 0;
    needsReposition = true;
    activeCaptionRequestId += 1;
    updateCaptionHistory(caption);

    enterPendingCaptionState(caption);
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
    updateOverlayHost();
    needsReposition = true;
    scheduleDetect();
  });

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener(handleStorageChange);
  }

  let modelReadyShown = false;

  async function pollUntilModelReady() {
    try {
      const result = await chrome.runtime.sendMessage({
        type: "CHECK_LOCAL_TRANSLATOR",
        warmup: false
      });
      if (result?.ok) {
        if (!modelReadyShown) {
          modelReadyShown = true;
          showStatusMessage("LocalSubs: Model ready");
        }
      } else if (result?.loading) {
        showStatusMessage("LocalSubs: Loading model...", true);
        window.setTimeout(pollUntilModelReady, 4000);
      } else {
        clearStatusMessage();
      }
    } catch {
      clearStatusMessage();
    }
  }

  void loadSettings().finally(() => {
    if (settings.localTranslatorEnabled && settings.translationEnabled) {
      showStatusMessage("LocalSubs: Starting model...", true);
      void pollUntilModelReady();
    }
    startDetection();
  });
})();
