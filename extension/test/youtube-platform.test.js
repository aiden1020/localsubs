// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/settings.js";
import { CAPTURE_SOURCE, CONTENT_SOURCE } from "../src/content/youtube-cues.js";
import { createYouTubePlatform } from "../src/content/youtube-platform.js";

const TRACK = "https://www.youtube.com/api/timedtext?v=VIDEO_A_123&lang=en&kind=asr";

function capture(data) {
  window.dispatchEvent(new MessageEvent("message", {
    source: window,
    data: { source: CAPTURE_SOURCE, ...data }
  }));
}

function playerHtml(id = "movie_player", extra = "") {
  return `<div id="${id}" class="html5-video-player"><video></video>` +
    "<button class=\"ytp-subtitles-button\" aria-pressed=\"false\"></button>" +
    `<div class="ytp-caption-window-container">${extra}</div></div>`;
}

describe("YouTube platform adapter", () => {
  let settings;
  let platform;
  let events;
  let posted;

  beforeEach(() => {
    vi.useFakeTimers();
    settings = { ...DEFAULT_SETTINGS };
    posted = [];
    vi.spyOn(window, "postMessage").mockImplementation((message) => posted.push(message));
    events = {
      onChange: vi.fn(),
      onReset: vi.fn(),
      onSubtitleNode: vi.fn(),
      showStatus: vi.fn()
    };
    window.history.replaceState({}, "", "/watch?v=VIDEO_A_123");
    document.body.innerHTML = playerHtml();
    platform = createYouTubePlatform({ getSettings: () => settings });
  });

  afterEach(() => {
    platform.stop();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.documentElement.classList.remove("localsubs-yt-hide-native");
    document.getElementById("localsubs-yt-style")?.remove();
  });

  function configNonce() {
    return posted.filter((message) => message.type === "config").at(-1).nonce;
  }

  it("asks the capture script for the original track only and turns CC on", () => {
    const click = vi.spyOn(document.querySelector(".ytp-subtitles-button"), "click");
    platform.start(events);

    expect(posted).toEqual([expect.objectContaining({
      source: CONTENT_SOURCE,
      type: "config",
      mode: "gtx",
      nonce: 1
    })]);
    expect(click).toHaveBeenCalledTimes(1);
    expect(events.onReset).toHaveBeenCalledTimes(1);
    expect(platform.getHost()).toBe(document.getElementById("movie_player"));
  });

  it("does not touch CC when translation is off", () => {
    settings.translationEnabled = false;
    const click = vi.spyOn(document.querySelector(".ytp-subtitles-button"), "click");
    platform.start(events);
    vi.advanceTimersByTime(15000);
    expect(click).not.toHaveBeenCalled();
  });

  it("serves the cue at the video's current time once the track arrives", () => {
    platform.start(events);
    capture({
      type: "cues",
      videoId: "VIDEO_A_123",
      nonce: configNonce(),
      trackKind: "manual",
      trackId: TRACK,
      cues: [{ start: 1000, dur: 2000, text: "Hello there." }, { start: 4000, dur: 1000, text: "Bye." }]
    });

    const video = document.querySelector("video");
    video.currentTime = 1.5;
    expect(platform.getCurrentCue()).toMatchObject({ text: "Hello there.", source: "track", id: "VIDEO_A_123:0" });
    video.currentTime = 3.5;
    expect(platform.getCurrentCue()).toBeNull();
    expect(platform.getState()).toEqual({ videoId: "VIDEO_A_123", mode: "track", cueCount: 2 });
  });

  it("signals cue boundaries between timeupdate events", () => {
    platform.start(events);
    capture({
      type: "cues", videoId: "VIDEO_A_123", nonce: configNonce(), trackId: TRACK,
      cues: [{ start: 1000, dur: 500, text: "One." }]
    });
    events.onChange.mockClear();
    const video = document.querySelector("video");
    video.currentTime = 1.2;
    vi.advanceTimersByTime(100);
    expect(events.onChange).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
    expect(events.onChange).toHaveBeenCalledTimes(1);
    video.currentTime = 1.6;
    vi.advanceTimersByTime(100);
    expect(events.onChange).toHaveBeenCalledTimes(2);
  });

  it("ignores stale, foreign and mistagged capture messages", () => {
    platform.start(events);
    const cues = [{ start: 0, dur: 5000, text: "Stale." }];
    capture({ type: "cues", videoId: "OTHER_VIDEO", nonce: configNonce(), trackId: TRACK, cues });
    capture({ type: "cues", videoId: "VIDEO_A_123", nonce: configNonce() + 1, trackId: TRACK, cues });
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: { source: "ytds-inject", type: "cues", videoId: "VIDEO_A_123", nonce: configNonce(), cues }
    }));
    expect(platform.getState().mode).toBe("waiting");
    expect(platform.getCurrentCue()).toBeNull();
  });

  it("falls back to the player's caption text when no track is captured", () => {
    platform.start(events);
    capture({ type: "nocues", videoId: "VIDEO_A_123", nonce: configNonce() });
    document.querySelector(".ytp-caption-window-container").innerHTML =
      "<div class=\"caption-window\"><span class=\"ytp-caption-segment\">rolling </span>" +
      "<span class=\"ytp-caption-segment\"> words</span></div>";
    expect(platform.getCurrentCue()).toMatchObject({ text: "rolling words", source: "dom" });
  });

  it("leaves non-English tracks alone and says so once", () => {
    platform.start(events);
    const message = {
      type: "cues", videoId: "VIDEO_A_123", nonce: configNonce(),
      trackId: "https://www.youtube.com/api/timedtext?v=VIDEO_A_123&lang=ja",
      cues: [{ start: 0, dur: 5000, text: "こんにちは" }]
    };
    capture(message);
    capture(message);
    expect(platform.getCurrentCue()).toBeNull();
    expect(events.showStatus).toHaveBeenCalledTimes(1);
  });

  it("hides cues while an ad plays", () => {
    platform.start(events);
    capture({
      type: "cues", videoId: "VIDEO_A_123", nonce: configNonce(), trackId: TRACK,
      cues: [{ start: 0, dur: 5000, text: "Hello." }]
    });
    document.getElementById("movie_player").classList.add("ad-showing");
    expect(platform.getCurrentCue()).toBeNull();
  });

  it("resets and re-arms on SPA navigation between videos", () => {
    platform.start(events);
    capture({
      type: "cues", videoId: "VIDEO_A_123", nonce: configNonce(), trackId: TRACK,
      cues: [{ start: 0, dur: 5000, text: "Video A." }]
    });

    window.history.replaceState({}, "", "/watch?v=VIDEO_B_456");
    window.dispatchEvent(new Event("yt-navigate-finish"));

    expect(events.onReset).toHaveBeenCalledTimes(2);
    expect(posted.filter((message) => message.type === "config")).toHaveLength(2);
    expect(platform.getState()).toEqual({ videoId: "VIDEO_B_456", mode: "waiting", cueCount: 0 });
    expect(platform.getCurrentCue()).toBeNull();

    // The location poll is a backstop and does not reset the same video twice.
    vi.advanceTimersByTime(1000);
    expect(events.onReset).toHaveBeenCalledTimes(2);
  });

  it("notices Shorts swipes through the location poll and uses the Shorts player", () => {
    document.body.innerHTML = playerHtml() + playerHtml("shorts-player");
    platform.start(events);
    window.history.replaceState({}, "", "/shorts/SHORT_12345");
    vi.advanceTimersByTime(500);

    expect(platform.getState().videoId).toBe("SHORT_12345");
    expect(platform.getHost()).toBe(document.getElementById("shorts-player"));
  });

  it("goes quiet off video pages", () => {
    platform.start(events);
    window.history.replaceState({}, "", "/feed/subscriptions");
    vi.advanceTimersByTime(500);
    expect(platform.getState().videoId).toBe("");
    expect(platform.getHost()).toBeNull();
    expect(platform.getCurrentCue()).toBeNull();
  });

  it("hides the native caption layer with a class and restores it after a short gap", () => {
    platform.start(events);
    const root = document.documentElement;
    expect(platform.nativeSubtitles.suppress()).toBe(true);
    expect(root.classList.contains("localsubs-yt-hide-native")).toBe(true);
    expect(document.getElementById("localsubs-yt-style").textContent).toContain(".ytp-caption-window-container");

    platform.nativeSubtitles.restore();
    vi.advanceTimersByTime(100);
    platform.nativeSubtitles.suppress();
    vi.advanceTimersByTime(1000);
    expect(root.classList.contains("localsubs-yt-hide-native")).toBe(true);

    platform.nativeSubtitles.restore();
    vi.advanceTimersByTime(300);
    expect(root.classList.contains("localsubs-yt-hide-native")).toBe(false);
  });

  it("anchors to the native caption window only when native captions stay visible", () => {
    settings.hideNativeSubtitles = false;
    document.querySelector(".ytp-caption-window-container").innerHTML = "<div class=\"caption-window\"></div>";
    platform.start(events);
    platform.getCurrentCue();
    expect(events.onSubtitleNode).toHaveBeenLastCalledWith(document.querySelector(".caption-window"));

    const previous = settings;
    settings = { ...settings, hideNativeSubtitles: true };
    platform.applySettings(previous, settings);
    expect(events.onSubtitleNode).toHaveBeenLastCalledWith(null);
  });
});
