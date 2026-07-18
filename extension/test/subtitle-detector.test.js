// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SubtitleDetector } from "../src/content/subtitle-detector.js";

function fixture(name) {
  return readFileSync(path.join(process.cwd(), "extension", "fixtures", "max", name), "utf8");
}

function makeVisible() {
  for (const node of document.querySelectorAll("[class*='CaptionWindow'], [data-testid='cueBoxRowTextCue']")) {
    node.getBoundingClientRect = () => ({
      width: 400, height: 40, top: 600, bottom: 640, left: 200, right: 600
    });
  }
}

describe("SubtitleDetector", () => {
  it("detects a visible Max caption and reports its container", () => {
    document.body.innerHTML = fixture("single-line.html");
    makeVisible();
    const onNodeChange = vi.fn();
    const detector = new SubtitleDetector({ onNodeChange, onMutation: vi.fn() });
    expect(detector.getCaption()).toBe("I'll be right back.");
    expect(onNodeChange).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(detector.hasActiveContent()).toBe(true);
  });

  it("does not treat the subtitle menu as a playing caption", () => {
    document.body.innerHTML = fixture("blocked-ui.html");
    makeVisible();
    const detector = new SubtitleDetector({ onNodeChange: vi.fn(), onMutation: vi.fn() });
    expect(detector.getCaption()).toBe("");
    expect(detector.hasActiveContent()).toBe(false);
  });

  it("recovers after the player replaces a detached caption node", () => {
    document.body.innerHTML = fixture("single-line.html");
    makeVisible();
    const onNodeChange = vi.fn();
    const detector = new SubtitleDetector({ onNodeChange, onMutation: vi.fn() });
    expect(detector.getCaption()).toBe("I'll be right back.");
    document.body.innerHTML = fixture("multi-line.html");
    makeVisible();
    expect(detector.getCaption()).toBe("Wait here.\nI'll be right back.");
    expect(onNodeChange).toHaveBeenCalledTimes(2);
  });

  it("does not keep a connected but hidden caption active", () => {
    document.body.innerHTML = fixture("single-line.html");
    makeVisible();
    const detector = new SubtitleDetector({ onNodeChange: vi.fn(), onMutation: vi.fn() });
    expect(detector.getCaption()).toBe("I'll be right back.");
    detector.activeNode.getBoundingClientRect = () => ({
      width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0
    });
    expect(detector.hasActiveContent()).toBe(false);
  });
});
