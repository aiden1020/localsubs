export const DEFAULT_SETTINGS = Object.freeze({
  translationEnabled: true,
  hideNativeSubtitles: true,
  showPendingOriginalText: true,
  showOriginalText: false,
  targetLanguage: "zh-Hant",
  fontSize: 30,
  overlayBackgroundOpacity: 0.22,
  translationContextWindow: 3,
  localTranslatorCtxSize: 1,
  translationCacheLimit: 120,
  optionsLanguage: "zh-Hant"
});

export function clampNumber(value, min, max, fallback) {
  const nextValue = Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(nextValue, min), max);
}

export function sanitizeSettings(rawSettings = {}) {
  return {
    translationEnabled: rawSettings.translationEnabled !== false,
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
      Number.parseInt(rawSettings.localTranslatorCtxSize, 10),
      0,
      5,
      DEFAULT_SETTINGS.localTranslatorCtxSize
    ),
    translationCacheLimit: clampNumber(
      Number.parseInt(rawSettings.translationCacheLimit, 10),
      20,
      500,
      DEFAULT_SETTINGS.translationCacheLimit
    ),
    optionsLanguage: rawSettings.optionsLanguage === "en" ? "en" : DEFAULT_SETTINGS.optionsLanguage
  };
}

export function migrateStoredSettings(stored = {}) {
  return sanitizeSettings({ ...DEFAULT_SETTINGS, ...stored });
}
