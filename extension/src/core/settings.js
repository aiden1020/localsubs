import { DEFAULT_MODEL_TIER, normalizeModelTier, tierForHelperChannel } from "./model-catalog.js";

export const DEFAULT_SETTINGS = Object.freeze({
  inferenceBackend: "webllm",
  modelTier: DEFAULT_MODEL_TIER,
  helperModelChannel: "stable",
  translationEnabled: true,
  hideNativeSubtitles: true,
  showPendingOriginalText: true,
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

export function normalizeHelperModelChannel(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)
    ? value
    : "stable";
}

export function sanitizeSettings(rawSettings = {}) {
  return {
    inferenceBackend: rawSettings.inferenceBackend === "native" ? "native" : "webllm",
    modelTier: normalizeModelTier(rawSettings.modelTier),
    helperModelChannel: normalizeHelperModelChannel(rawSettings.helperModelChannel),
    translationEnabled: rawSettings.translationEnabled !== false,
    hideNativeSubtitles: rawSettings.hideNativeSubtitles !== false,
    showPendingOriginalText: rawSettings.showPendingOriginalText !== false,
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

export function inferenceBackendForInstall(reason, storedBackend) {
  if (storedBackend === "webllm" || storedBackend === "native") {
    return storedBackend;
  }
  return reason === "update" ? "native" : DEFAULT_SETTINGS.inferenceBackend;
}

export function migrateStoredSettings(stored = {}) {
  const migrated = { ...DEFAULT_SETTINGS, ...stored };
  if (!stored.modelTier && stored.helperModelChannel) {
    migrated.modelTier = tierForHelperChannel(stored.helperModelChannel);
  }
  return sanitizeSettings(migrated);
}
