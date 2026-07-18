import { describe, expect, it } from "vitest";
import {
  createTranslationRequest,
  shouldApplyTranslationResult
} from "../src/content/translation-request.js";

describe("translation request contract", () => {
  it("includes stable session and cue identifiers", () => {
    expect(createTranslationRequest({
      sessionId: "page-1",
      cueId: 42,
      currentText: "Ready?",
      contextLines: ["Wait."],
      targetLanguage: "zh-Hant"
    })).toEqual({
      sessionId: "page-1",
      cueId: "42",
      cueSequence: 42,
      currentText: "Ready?",
      contextLines: ["Wait."],
      sourceLanguage: "en",
      targetLanguage: "zh-Hant"
    });
  });

  it("prevents stale responses from replacing the current caption", () => {
    expect(shouldApplyTranslationResult({
      requestId: 1,
      activeRequestId: 2,
      caption: "Old.",
      currentCaption: "New."
    })).toBe(false);
    expect(shouldApplyTranslationResult({
      requestId: 2,
      activeRequestId: 2,
      caption: "New.",
      currentCaption: "New."
    })).toBe(true);
  });
});
