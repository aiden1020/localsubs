// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/settings.js";
import { OverlayRenderer } from "../src/content/overlay-renderer.js";

function visibleRect() {
  return { width: 300, height: 40, top: 600, bottom: 640, left: 200, right: 500 };
}

describe("OverlayRenderer", () => {
  let settings;
  let renderer;
  let subtitle;

  beforeEach(() => {
    document.body.innerHTML = "<div id='player'><video></video><div id='subtitle'>Original</div></div>";
    settings = { ...DEFAULT_SETTINGS };
    renderer = new OverlayRenderer({
      getSettings: () => settings,
      getHost: () => document.getElementById("player")
    });
    subtitle = document.getElementById("subtitle");
    subtitle.getBoundingClientRect = visibleRect;
    document.getElementById("player").getBoundingClientRect = () => ({
      width: 1000, height: 700, top: 0, bottom: 700, left: 0, right: 1000
    });
    renderer.setSubtitleNode(subtitle);
  });

  it("hides native subtitles while a replacement is pending", () => {
    renderer.enterPending("Original");
    expect(subtitle.style.visibility).toBe("hidden");
    expect(subtitle.dataset.localsubsHidden).toBe("true");
    expect(renderer.isVisible()).toBe(false);
  });

  it("renders a translated replacement and restores native text on fallback", () => {
    renderer.enterTranslated("Original", "翻譯");
    expect(renderer.translatedLine.textContent).toBe("翻譯");
    expect(renderer.originalLine.textContent).toBe("Original");
    expect(renderer.isVisible()).toBe(true);
    renderer.enterFallback();
    expect(subtitle.style.visibility).toBe("");
    expect(subtitle.hasAttribute("data-localsubs-hidden")).toBe(false);
    expect(renderer.isVisible()).toBe(false);
  });

  it("shows pending original text when native subtitles are retained", () => {
    settings = { ...settings, hideNativeSubtitles: false, showPendingOriginalText: true };
    renderer.applySettings();
    renderer.enterPending("Original");
    expect(subtitle.style.visibility).toBe("");
    expect(renderer.originalLine.textContent).toBe("Original");
    expect(renderer.isVisible()).toBe(true);
  });
});

describe("OverlayRenderer with a platform's native caption controller", () => {
  it("delegates hiding, uses the platform host, and sits above the control bar without a node", () => {
    document.body.innerHTML = "<div id='player'></div><div id='subtitle'>Original</div>";
    const player = document.getElementById("player");
    player.getBoundingClientRect = () => ({ width: 1000, height: 500, top: 0, bottom: 500, left: 0, right: 1000 });
    const subtitle = document.getElementById("subtitle");
    const nativeSubtitles = { suppress: vi.fn(() => true), restore: vi.fn() };
    const settings = { ...DEFAULT_SETTINGS };
    const renderer = new OverlayRenderer({ getSettings: () => settings, getHost: () => player, nativeSubtitles });

    renderer.setSubtitleNode(null);
    expect(nativeSubtitles.suppress).not.toHaveBeenCalled();
    renderer.enterTranslated("Original", "翻譯");
    expect(nativeSubtitles.suppress).toHaveBeenCalled();
    expect(subtitle.style.visibility).toBe("");
    expect(renderer.overlay.parentElement).toBe(player);
    expect(renderer.translatedLine.nextElementSibling).toBe(renderer.originalLine);
    renderer.overlay.getBoundingClientRect = () => ({ width: 400, height: 80, top: 0, bottom: 80, left: 0, right: 400 });
    renderer.position();
    expect(renderer.overlay.style.left).toBe("300px");
    expect(renderer.overlay.style.top).toBe("356px");

    renderer.enterFallback();
    expect(nativeSubtitles.restore).toHaveBeenCalled();
  });
});
