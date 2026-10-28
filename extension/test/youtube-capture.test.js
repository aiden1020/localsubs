// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { CAPTURE_SOURCE, CONTENT_SOURCE } from "../src/content/youtube-cues.js";

const SOURCE = readFileSync(
  path.join(process.cwd(), "extension", "vendor", "yt-dual-subs", "inject.js"),
  "utf8"
);

// jsdom leaves event.source null; browsers set it to the posting window,
// which both sides of the bridge require.
function stubPostMessage() {
  vi.spyOn(window, "postMessage").mockImplementation((data) => {
    setTimeout(() => window.dispatchEvent(new MessageEvent("message", { data, source: window })), 0);
  });
}

afterEach(() => {
  delete window.__localsubsYtCaptureInjected;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("re-fetches the player's pot-bearing track as json3 and never asks for tlang", async () => {
  window.history.replaceState({}, "", "/watch?v=VIDEO_A_123");
  stubPostMessage();
  const requested = [];
  const json3 = {
    events: [
      { tStartMs: 0, dDurationMs: 1500, segs: [{ utf8: ">> Hello" }, { utf8: " there", tOffsetMs: 400 }] },
      { tStartMs: 1500, dDurationMs: 0, segs: [{ utf8: "\n" }] }
    ]
  };
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    requested.push(String(url));
    return { ok: true, status: 200, text: async () => JSON.stringify(json3) };
  }));
  const posted = [];
  window.addEventListener("message", (event) => {
    if (event.data?.source === CAPTURE_SOURCE) posted.push(event.data);
  });

  window.eval(SOURCE);
  window.postMessage({ source: CONTENT_SOURCE, type: "config", targetLang: "zh-Hant", mode: "gtx", nonce: 7 }, "*");
  await new Promise((resolve) => setTimeout(resolve, 0));
  // The player's own request, as the hooked fetch sees it.
  const playerUrl = "https://www.youtube.com/api/timedtext?v=VIDEO_A_123&lang=en&kind=asr&pot=TOKEN&tlang=fr";
  await window.fetch(playerUrl);
  await vi.waitFor(() => expect(posted.some((message) => message.type === "cues")).toBe(true));

  const ours = requested.filter((url) => url !== playerUrl);
  expect(ours).toHaveLength(1);
  const url = new URL(ours[0]);
  expect(url.searchParams.get("fmt")).toBe("json3");
  expect(url.searchParams.get("pot")).toBe("TOKEN");
  expect(url.searchParams.has("tlang")).toBe(false);

  const cues = posted.find((message) => message.type === "cues");
  expect(cues).toMatchObject({
    videoId: "VIDEO_A_123",
    nonce: 7,
    trackKind: "asr",
    tcues: null,
    cues: [{ start: 0, dur: 1500, text: "Hello there", lastOff: 400, words: [[0, ">> Hello"], [400, " there"]] }]
  });
  expect(cues.trackId).toContain("lang=en");
  expect(cues.trackId).not.toContain("pot=");
});

it("ignores yt-dual-subs message tags and dropped export requests", async () => {
  window.history.replaceState({}, "", "/watch?v=VIDEO_A_123");
  stubPostMessage();
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  window.eval(SOURCE);
  window.postMessage({ source: "ytds-content", type: "config", targetLang: "zh-Hant", nonce: 1 }, "*");
  window.postMessage({ source: CONTENT_SOURCE, type: "export-request", targetLang: "zh-Hant", exportId: 1 }, "*");
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("ships without YouTube translation, export or audio-ducking code", () => {
  expect(SOURCE).not.toMatch(/searchParams\.set\(\s*["']tlang["']/);
  expect(SOURCE).not.toMatch(/produceExport|ttsDuck|setVolume|setPlaybackRate/);
  expect(SOURCE).toContain("5657c8a18ca30c84b5d4662bca58e3e9214ffdff");
});
