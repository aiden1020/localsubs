// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.youtube.com/watch?v=VIDEO_A_123"}

import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/settings.js";
import { CAPTURE_SOURCE } from "../src/content/youtube-cues.js";

afterEach(() => {
  delete globalThis.chrome;
  delete window.__openStreamSubtitlesLoaded;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("translates the next line ahead and shows it without a blank frame", async () => {
  document.body.innerHTML =
    "<div id=\"movie_player\" class=\"html5-video-player\"><video src=\"blob:x\"></video>" +
    "<button class=\"ytp-subtitles-button\" aria-pressed=\"true\"></button>" +
    "<div class=\"ytp-caption-window-container\"></div></div>";
  const posted = [];
  vi.spyOn(window, "postMessage").mockImplementation((message) => posted.push(message));
  const sendMessage = vi.fn(async (message) => {
    if (message.type === "TRANSLATE_SUBTITLE") {
      return { ok: true, translation: `譯:${message.payload.currentText}` };
    }
    return { ok: true };
  });
  globalThis.chrome = {
    runtime: { sendMessage },
    storage: {
      sync: { get: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS }), set: vi.fn() },
      onChanged: { addListener: vi.fn() }
    }
  };
  window.requestAnimationFrame = vi.fn((callback) => {
    callback();
    return 1;
  });

  vi.resetModules();
  await import("../src/content/main.js");
  await vi.waitFor(() => expect(posted.some((message) => message.type === "config")).toBe(true));
  const config = posted.find((message) => message.type === "config");

  const video = document.querySelector("video");
  video.currentTime = 1.2;
  window.dispatchEvent(new MessageEvent("message", {
    source: window,
    data: {
      source: CAPTURE_SOURCE,
      type: "cues",
      videoId: "VIDEO_A_123",
      nonce: config.nonce,
      trackKind: "manual",
      trackId: "https://www.youtube.com/api/timedtext?v=VIDEO_A_123&lang=en",
      cues: [
        { start: 1000, dur: 2000, text: "Good morning." },
        { start: 4000, dur: 2000, text: "How are you?" }
      ]
    }
  }));

  const overlay = () => document.getElementById("localsubs-overlay");
  const chinese = () => overlay().firstElementChild.children[0].textContent;
  const translated = (text) => sendMessage.mock.calls.some(([message]) =>
    message.type === "TRANSLATE_SUBTITLE" && message.payload.currentText === text);
  await vi.waitFor(() => expect(chinese()).toBe("譯:Good morning."));
  await vi.waitFor(() => expect(translated("How are you?")).toBe(true));

  // In the gap the overlay hides, but YouTube's own captions stay hidden.
  video.currentTime = 3.5;
  video.dispatchEvent(new Event("timeupdate"));
  await vi.waitFor(() => expect(overlay().style.display).toBe("none"));
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(document.documentElement.classList.contains("localsubs-yt-hide-native")).toBe(true);

  // The next line was translated ahead, so both lines show in the same tick.
  const requests = sendMessage.mock.calls.length;
  video.currentTime = 4.2;
  video.dispatchEvent(new Event("timeupdate"));
  expect(overlay().style.display).toBe("block");
  expect(chinese()).toBe("譯:How are you?");
  expect(sendMessage.mock.calls.length).toBe(requests);
});
