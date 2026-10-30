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
  // Earlier subtitle lines sent with each line as translation context.
  translationContextLines: 1,
  translationCacheLimit: 120,
  optionsLanguage: "zh-Hant"
});

// Settings that translationContextLines replaced. They are still read so a
// stored choice carries over.
export const LEGACY_SETTING_KEYS = Object.freeze(["translationContextWindow", "localTranslatorCtxSize"]);

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
    translationContextLines: clampNumber(
      Number.parseInt(rawSettings.translationContextLines ?? legacyContextLines(rawSettings), 10),
      0,
      3,
      DEFAULT_SETTINGS.translationContextLines
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

// The old "context window" counted the line being translated, and "local
// context size" then capped the earlier lines, so the earlier lines sent were
// the smaller of window - 1 and that cap.
function legacyContextLines(rawSettings) {
  const { translationContextWindow, localTranslatorCtxSize } = rawSettings;
  if (translationContextWindow === undefined && localTranslatorCtxSize === undefined) return undefined;
  const window = Number.parseInt(translationContextWindow ?? 3, 10);
  const cap = Number.parseInt(localTranslatorCtxSize ?? 1, 10);
  if (!Number.isFinite(window) || !Number.isFinite(cap)) return undefined;
  return Math.min(window - 1, cap);
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
  if (stored.translationContextLines === undefined) {
    migrated.translationContextLines = legacyContextLines(stored) ?? DEFAULT_SETTINGS.translationContextLines;
  }
  return sanitizeSettings(migrated);
}
