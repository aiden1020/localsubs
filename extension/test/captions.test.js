import { describe, expect, it } from "vitest";
import {
  buildTranslationWindow,
  isLikelyUiText,
  isNonDialogueCaption,
  normalizeCaption,
  normalizeTranslatedText,
  translationCacheKey
} from "../src/content/captions.js";

describe("caption utilities", () => {
  it("normalizes caption lines without collapsing cue boundaries", () => {
    expect(normalizeCaption("  Wait   here.\n\nI'll be  back. "))
      .toBe("Wait here.\nI'll be back.");
    expect(normalizeTranslatedText(" 第一行  \n 第二行 ")).toBe("第一行\n第二行");
  });

  it("recognizes non-dialogue captions", () => {
    expect(isNonDialogueCaption("[door closes]")).toBe(true);
    expect(isNonDialogueCaption("♪ Theme song ♪")).toBe(true);
    expect(isNonDialogueCaption("Where are you going?")).toBe(false);
  });

  it("filters common player UI labels", () => {
    expect(isLikelyUiText("Skip Intro")).toBe(true);
    expect(isLikelyUiText("S1 E2: The Return")).toBe(true);
    expect(isLikelyUiText("We have to go.")).toBe(false);
  });

  it("builds context without duplicating the current caption", () => {
    expect(buildTranslationWindow(["First.", "Second."], "Second.", 3)).toEqual({
      fullText: "First.\nSecond.",
      prefixText: "First."
    });
    expect(buildTranslationWindow(["First."], "Second.", 3)).toEqual({
      fullText: "First.\nSecond.",
      prefixText: "First."
    });
  });

  it("separates cache entries by context and target", () => {
    const base = {
      text: "Ready?",
      contextLines: ["Wait."],
      targetLanguage: "zh-Hant",
      contextSize: 1
    };
    expect(translationCacheKey(base)).not.toBe(translationCacheKey({
      ...base,
      contextLines: ["Go." ]
    }));
  });
});
