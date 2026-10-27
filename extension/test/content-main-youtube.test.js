// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.youtube.com/watch?v=VIDEO_A_123"}

import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/settings.js";
import { CAPTURE_SOURCE, CONTENT_SOURCE } from "../src/content/youtube-cues.js";

afterEach(() => {
  delete globalThis.chrome;
  delete window.__openStreamSubtitlesLoaded;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("translates captured YouTube cues locally and renders Chinese above English", async () => {
  document.body.innerHTML =
    "<div id=\"movie_player\" class=\"html5-video-player\"><video src=\"blob:x\"></video>" +
    "<button class=\"ytp-subtitles-button\" aria-pressed=\"true\"></button>" +
    "<div class=\"ytp-caption-window-container\"></div></div>";
  const posted = [];
  let storageListener = null;
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
      onChanged: { addListener: vi.fn((listener) => { storageListener = listener; }) }
    }
  };
  window.requestAnimationFrame = vi.fn((callback) => {
    callback();
    return 1;
  });

  vi.resetModules();
  await import("../src/content/main.js");
  await vi.waitFor(() => expect(posted.some((message) => message.source === CONTENT_SOURCE)).toBe(true));
  const config = posted.find((message) => message.type === "config");
  expect(config.mode).toBe("gtx");

  document.querySelector("video").currentTime = 1.2;
  window.dispatchEvent(new MessageEvent("message", {
    source: window,
    data: {
      source: CAPTURE_SOURCE,
      type: "cues",
      videoId: "VIDEO_A_123",
      nonce: config.nonce,
      trackKind: "manual",
      trackId: "https://www.youtube.com/api/timedtext?v=VIDEO_A_123&lang=en",
      cues: [{ start: 1000, dur: 2000, text: "Good morning." }]
    }
  }));

  await vi.waitFor(() => {
    const overlay = document.getElementById("localsubs-overlay");
    expect(overlay?.style.display).toBe("block");
    const [chinese, english] = overlay.firstElementChild.children;
    expect(chinese.textContent).toBe("譯:Good morning.");
    expect(english.textContent).toBe("Good morning.");
  });

  expect(document.getElementById("localsubs-overlay").parentElement).toBe(document.getElementById("movie_player"));
  expect(document.documentElement.classList.contains("localsubs-yt-hide-native")).toBe(true);
  expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: "TRANSLATE_SUBTITLE",
    payload: expect.objectContaining({ currentText: "Good morning.", sourceLanguage: "en" })
  }));

  // Dragging the size and opacity sliders mid-playback restyles the overlay
  // without asking the model again or falling back to native captions.
  const requests = () => sendMessage.mock.calls.filter(([message]) => message.type === "TRANSLATE_SUBTITLE").length;
  const before = requests();
  const overlay = document.getElementById("localsubs-overlay");
  for (let size = 31; size <= 40; size += 1) {
    storageListener({ fontSize: { newValue: size }, overlayBackgroundOpacity: { newValue: size / 100 } }, "sync");
    expect(overlay.style.display).toBe("block");
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(requests()).toBe(before);
  expect(overlay.style.display).toBe("block");
  expect(overlay.firstElementChild.children[0].textContent).toBe("譯:Good morning.");
  expect(overlay.firstElementChild.children[0].style.fontSize).toBe("40px");
  expect(document.documentElement.classList.contains("localsubs-yt-hide-native")).toBe(true);
});
