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
    this.aheadSequence = 0;
  }

  handleSettingsChange(previous, next) {
    if (
      previous.targetLanguage !== next.targetLanguage ||
      previous.inferenceBackend !== next.inferenceBackend ||
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

  async translateWithLocal(text, signal, contextLines = [], cueId = "", { ahead = false } = {}) {
    try {
      if (signal?.aborted) return null;
      const settings = this.getSettings();
      const payload = await this.sendMessage({
        type: "TRANSLATE_SUBTITLE",
        payload: createTranslationRequest({
          // The helper drops a session's older cues once a newer one arrives,
          // so look-ahead requests use their own session.
          sessionId: ahead ? `${this.sessionId}:ahead` : this.sessionId,
          cueId,
          currentText: text,
          contextLines,
          contextLimit: settings.localTranslatorCtxSize,
          sourceLanguage: "en",
          targetLanguage: settings.targetLanguage
        })
      });
      if (signal?.aborted) return null;
      if (!payload?.ok) {
        if (ahead) return null;
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
      if (error?.name === "AbortError" || ahead) return null;
      if (this.now() - this.lastWarningAt > 30000) {
        this.lastWarningAt = this.now();
        this.showStatus("LocalSubs translator is unavailable. Open settings to check the selected backend.");
      }
      return null;
    }
  }

  async translate(text, signal, contextLines = [], cueId = "", options = {}) {
    const settings = this.getSettings();
    if (!text || !settings.translationEnabled) return "";
    const key = this.cacheKey(text, contextLines);
    if (this.cache.has(key)) return this.cache.get(key) || "";
    const translatedText = await this.translateWithLocal(text, signal, contextLines, cueId, options);
    if (translatedText === null || translatedText === "") return "";
    const finalText = translatedText === text ? "" : translatedText;
    this.remember(text, contextLines, finalText);
    return finalText;
  }

  historyWith(history, caption) {
    if (!caption || isNonDialogueCaption(caption)) return history;
    const nextHistory = history.filter((entry) => entry !== caption);
    nextHistory.push(caption);
    return nextHistory.slice(-this.getSettings().translationContextWindow);
  }

  updateHistory(caption) {
    this.captionHistory = this.historyWith(this.captionHistory, caption);
  }

  resetHistory() {
    this.captionHistory = [];
  }

  // The text and context lines a caption is translated with, given the
  // caption history at the time it shows.
  requestFor(caption, history = this.captionHistory) {
    if (isNonDialogueCaption(caption)) return { text: caption, contextLines: [] };
    const captionLines = caption.split("\n");
    if (captionLines.length > 1) {
      return { text: normalizeText(captionLines.join(" ")), contextLines: [] };
    }
    const settings = this.getSettings();
    const { fullText, prefixText } = buildTranslationWindow(
      history,
      caption,
      settings.translationContextWindow
    );
    if (!fullText || fullText === caption) return { text: caption, contextLines: [] };
    const contextLines = prefixText
      .split(/\n+/)
      .map((line) => normalizeText(line))
      .filter(Boolean)
      .slice(-settings.localTranslatorCtxSize);
    return { text: caption, contextLines };
  }

  async translateWithContext(caption, signal, cueId) {
    const { text, contextLines } = this.requestFor(caption);
    return this.translate(text, signal, contextLines, cueId);
  }

  // A translation already in the cache for the caption on screen, or "".
  cachedTranslation(caption) {
    if (!caption || !this.getSettings().translationEnabled) return "";
    const { text, contextLines } = this.requestFor(caption);
    return this.cache.get(this.cacheKey(text, contextLines)) || "";
  }

  // Translates upcoming captions one at a time, as they will be asked for when
  // they show, so each is in the cache by then. Stops when aborted or when a
  // request fails.
  async translateAhead(captions, signal) {
    let history = this.captionHistory;
    for (const caption of captions) {
      if (signal?.aborted || !caption) return;
      history = this.historyWith(history, caption);
      const { text, contextLines } = this.requestFor(caption, history);
      const key = this.cacheKey(text, contextLines);
      if (this.cache.has(key)) continue;
      this.aheadSequence += 1;
      await this.translate(text, signal, contextLines, String(this.aheadSequence), { ahead: true });
      if (!this.cache.has(key)) return;
    }
  }
}
