// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractNodeText,
  isBlockedSubtitleNode,
  resolveSubtitleContainer
} from "../src/content/max-adapter.js";

function loadFixture(name) {
  document.body.innerHTML = readFileSync(
    path.join(process.cwd(), "extension", "fixtures", "max", name),
    "utf8"
  );
}

describe("Max subtitle adapter", () => {
  it("extracts a single cue from its caption container", () => {
    loadFixture("single-line.html");
    const cue = document.querySelector("[data-testid='cueBoxRowTextCue']");
    expect(resolveSubtitleContainer(cue).className).toContain("CaptionWindow");
    expect(extractNodeText(cue)).toBe("I'll be right back.");
  });

  it("preserves multiple cue rows", () => {
    loadFixture("multi-line.html");
    const container = document.querySelector("[class*='CaptionWindow']");
    expect(extractNodeText(container)).toBe("Wait here.\nI'll be right back.");
  });

  it("rejects player subtitle menu nodes", () => {
    loadFixture("blocked-ui.html");
    const cue = document.querySelector("[data-testid='cueBoxRowTextCue']");
    expect(isBlockedSubtitleNode(cue)).toBe(true);
  });
});
