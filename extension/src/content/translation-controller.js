import { normalizeErrorPayload } from "../core/errors.js";
import {
  buildTranslationWindow,
  isNonDialogueCaption,
  normalizeText,
  normalizeTranslatedText,
  translationCacheKey
} from "./captions.js";
import { createTranslationRequest } from "./translation-request.js";

export class TranslationController {
  constructor({
    getSettings,
    sendMessage,
    showStatus,
    now = () => Date.now(),
    sessionId = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }) {
    this.getSettings = getSettings;
    this.sendMessage = sendMessage;
    this.showStatus = showStatus;
    this.now = now;
    this.sessionId = sessionId;
    this.cache = new Map();
    this.captionHistory = [];
    this.lastWarningAt = 0;
  }

  handleSettingsChange(previous, next) {
    if (
      previous.targetLanguage !== next.targetLanguage ||
      previous.hideNativeSubtitles !== next.hideNativeSubtitles ||
      previous.localTranslatorCtxSize !== next.localTranslatorCtxSize ||
      previous.showPendingOriginalText !== next.showPendingOriginalText
    ) {
      this.cache.clear();
    }
    if (previous.translationCacheLimit !== next.translationCacheLimit) {
      this.trimCache();
    }
    if (previous.translationContextWindow !== next.translationContextWindow) {
      this.resetHistory();
    }
  }

  cacheKey(text, contextLines = []) {
    const settings = this.getSettings();
    return translationCacheKey({
      text,
      contextLines,
      targetLanguage: settings.targetLanguage,
      contextSize: settings.localTranslatorCtxSize
    });
  }

  trimCache() {
    const limit = this.getSettings().translationCacheLimit;
    while (this.cache.size > limit) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
    }
  }

  remember(text, contextLines, translatedText) {
    this.cache.set(this.cacheKey(text, contextLines), translatedText);
    this.trimCache();
  }

  async translateWithLocal(text, signal, contextLines = [], cueId = "") {
    try {
      if (signal?.aborted) return null;
      const settings = this.getSettings();
      const payload = await this.sendMessage({
        type: "TRANSLATE_SUBTITLE",
        payload: createTranslationRequest({
          sessionId: this.sessionId,
          cueId,
          currentText: text,
          contextLines,
          sourceLanguage: "en",
          targetLanguage: settings.targetLanguage
        })
      });
      if (signal?.aborted) return null;
      if (!payload?.ok) {
        const error = normalizeErrorPayload(payload?.error);
        const isLoading = error.code === "model_loading";
        if (this.now() - this.lastWarningAt > (isLoading ? 8000 : 30000)) {
          this.lastWarningAt = this.now();
          this.showStatus(isLoading
            ? "LocalSubs: loading model, please wait..."
            : error.message);
        }
        return null;
      }
      if (typeof payload.translation !== "string" || payload.superseded) {
        return null;
      }
      return normalizeTranslatedText(payload.translation);
    } catch (error) {
      if (error?.name === "AbortError") return null;
      if (this.now() - this.lastWarningAt > 30000) {
        this.lastWarningAt = this.now();
        this.showStatus("Local translator is not running. Open setup to start the model service.");
      }
      return null;
    }
  }

  async translate(text, signal, contextLines = [], cueId = "") {
    const settings = this.getSettings();
    if (!text || !settings.translationEnabled) return "";
    const key = this.cacheKey(text, contextLines);
    if (this.cache.has(key)) return this.cache.get(key) || "";
    const translatedText = await this.translateWithLocal(text, signal, contextLines, cueId);
    if (translatedText === null) return "";
    const finalText = translatedText === text ? "" : translatedText;
    this.remember(text, contextLines, finalText);
    return finalText;
  }

  updateHistory(caption) {
    if (!caption || isNonDialogueCaption(caption)) return;
    const settings = this.getSettings();
    const nextHistory = this.captionHistory.filter((entry) => entry !== caption);
    nextHistory.push(caption);
    this.captionHistory = nextHistory.slice(-settings.translationContextWindow);
  }

  resetHistory() {
    this.captionHistory = [];
  }

  async translateWithContext(caption, signal, cueId) {
    if (isNonDialogueCaption(caption)) {
      return this.translate(caption, signal, [], cueId);
    }
    const captionLines = caption.split("\n");
    if (captionLines.length > 1) {
      return this.translate(normalizeText(captionLines.join(" ")), signal, [], cueId);
    }
    const settings = this.getSettings();
    const { fullText, prefixText } = buildTranslationWindow(
      this.captionHistory,
      caption,
      settings.translationContextWindow
    );
    if (!fullText || fullText === caption) {
      return this.translate(caption, signal, [], cueId);
    }
    const contextLines = prefixText
      .split(/\n+/)
      .map((line) => normalizeText(line))
      .filter(Boolean)
      .slice(-settings.localTranslatorCtxSize);
    return this.translate(caption, signal, contextLines, cueId);
  }
}
