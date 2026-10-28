import { createCue } from "./platform.js";
import { createCueTimeline, normalizeTrackCues } from "./track-cues.js";
import {
  CONTENT_SOURCE,
  isEnglishTrack,
  isShortsPath,
  parseCaptureMessage,
  videoIdFromUrl
} from "./youtube-cues.js";

// YouTube: the vendored yt-dual-subs capture script (youtube-capture.js, MAIN
// world) posts the whole caption track; this adapter keeps it and answers with
// the cue at the video's current time. When no track can be captured it reads
// the player's own caption text instead. Player lookup, the DOM fallback,
// CC auto-enable and navigation handling are adapted from yt-dual-subs
// content.js (MIT, Copyright (c) 2026 Gythiro, commit 5657c8a).

const HIDE_NATIVE_CLASS = "localsubs-yt-hide-native";
const STYLE_ID = "localsubs-yt-style";
const NAV_POLL_MS = 500;
const RESTORE_NATIVE_DELAY_MS = 300;
const CC_RETRIES = 20;
const CC_RETRY_MS = 600;
const NON_ENGLISH_STATUS =
  "LocalSubs: this video's captions are not in English, so LocalSubs leaves them as they are.";

export function createYouTubePlatform({
  getSettings,
  document: doc = document,
  window: win = window
}) {
  let events = null;
  let videoId = "";
  let configNonce = 0;
  // "waiting" until the capture script answers, then "track" (whole track in
  // hand), "dom" (read the player's caption text), or "unsupported".
  let mode = "waiting";
  let lastSubtitleNode;
  let restoreTimer = null;
  let navTimer = null;
  const timeline = createCueTimeline({
    getTimeMs() {
      const video = getVideo();
      return !video || isAdShowing() ? null : video.currentTime * 1000;
    },
    onCueChange: () => events?.onChange({}),
    window: win
  });

  function isVideoPage() {
    return /^\/(watch|shorts\/|live\/)/.test(win.location.pathname || "");
  }

  // #movie_player on watch and live pages, #shorts-player on Shorts. A Shorts
  // page keeps a hidden #movie_player, and other pages' hover previews are
  // .html5-video-player too, so only the page's own player counts.
  function getPlayer() {
    if (!isVideoPage()) return null;
    const player = isShortsPath(win.location.pathname)
      ? doc.getElementById("shorts-player")
      : doc.getElementById("movie_player");
    return player || doc.querySelector(".html5-video-player");
  }

  function getVideo() {
    return getPlayer()?.querySelector("video") || null;
  }

  // Ads play through the same <video>, so currentTime is the ad's clock.
  function isAdShowing() {
    const player = getPlayer();
    return Boolean(player?.classList.contains("ad-showing") || player?.classList.contains("ad-interrupting"));
  }

  // Only .ytp-caption-segment: the combined window node would repeat the text.
  function readNativeCaption() {
    const player = getPlayer();
    if (!player) return "";
    return Array.from(player.querySelectorAll(".ytp-caption-segment"))
      .map((segment) => segment.textContent.trim())
      .filter(Boolean)
      .join(" ");
  }

  function ensureStyle() {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      `html.${HIDE_NATIVE_CLASS} .ytp-caption-window-container { opacity: 0 !important; }`;
    (doc.head || doc.documentElement).appendChild(style);
  }

  // Hide the whole caption layer with CSS: YouTube rebuilds caption windows
  // constantly, so hiding one node at a time flashes. Restoring waits a moment
  // so a short gap between two cues does not flash the native line back.
  const nativeSubtitles = {
    suppress() {
      win.clearTimeout(restoreTimer);
      restoreTimer = null;
      ensureStyle();
      doc.documentElement.classList.add(HIDE_NATIVE_CLASS);
      return true;
    },
    restore() {
      if (restoreTimer !== null || !doc.documentElement.classList.contains(HIDE_NATIVE_CLASS)) return;
      restoreTimer = win.setTimeout(() => {
        restoreTimer = null;
        doc.documentElement.classList.remove(HIDE_NATIVE_CLASS);
      }, RESTORE_NATIVE_DELAY_MS);
    }
  };

  function sendConfig() {
    configNonce += 1;
    win.postMessage({
      source: CONTENT_SOURCE,
      type: "config",
      targetLang: getSettings().targetLanguage,
      // "gtx" tells the capture script to fetch only the original track.
      mode: "gtx",
      nonce: configNonce
    }, "*");
  }

  // The player only requests captions while CC is on, so turn it on. On a
  // cold load the button stays disabled until the track list arrives.
  function ensureCaptionsOn(retries = CC_RETRIES) {
    if (!getSettings().translationEnabled || !isVideoPage()) return;
    const button = getPlayer()?.querySelector(".ytp-subtitles-button");
    if (!button || button.getAttribute("aria-pressed") === null || button.getAttribute("aria-disabled") === "true") {
      if (retries > 0) win.setTimeout(() => ensureCaptionsOn(retries - 1), CC_RETRY_MS);
      return;
    }
    if (button.getAttribute("aria-pressed") !== "true") button.click();
  }

  function setMode(nextMode, nextCues = []) {
    mode = nextMode;
    timeline.setCues(nextCues);
  }

  function handleNavigation() {
    const nextVideoId = isVideoPage() ? videoIdFromUrl(win.location.href) : "";
    if (nextVideoId === videoId) return;
    videoId = nextVideoId;
    setMode("waiting");
    events?.onReset();
    if (videoId) {
      sendConfig();
      ensureCaptionsOn();
    }
    events?.onChange({ reposition: true });
  }

  function handleMessage(event) {
    const message = parseCaptureMessage(event, { window: win });
    if (!message || !videoId) return;
    if (message.videoId !== videoId || message.nonce !== configNonce) return;
    if (message.type === "cues") {
      if (!isEnglishTrack(message.trackId)) {
        if (mode !== "unsupported") events?.showStatus(NON_ENGLISH_STATUS);
        setMode("unsupported");
      } else {
        const nextCues = normalizeTrackCues(message.cues, { trackKind: message.trackKind, idPrefix: videoId });
        setMode(nextCues.length > 0 ? "track" : "dom", nextCues);
      }
      events?.onChange({ reposition: true });
    } else if (message.type === "nocues" && mode !== "track") {
      setMode("dom");
      events?.onChange({ reposition: true });
    }
  }

  function updateSubtitleNode() {
    const node = getSettings().hideNativeSubtitles
      ? null
      : getPlayer()?.querySelector(".caption-window") || null;
    if (node !== lastSubtitleNode) {
      lastSubtitleNode = node;
      events?.onSubtitleNode(node);
    }
  }

  return {
    id: "youtube",
    nativeSubtitles,
    shouldRun() {
      return true;
    },
    start(nextEvents) {
      events = nextEvents;
      win.addEventListener("message", handleMessage, false);
      win.addEventListener("yt-navigate-finish", handleNavigation, true);
      navTimer = win.setInterval(handleNavigation, NAV_POLL_MS);
      timeline.start();
      handleNavigation();
    },
    stop() {
      win.removeEventListener("message", handleMessage, false);
      win.removeEventListener("yt-navigate-finish", handleNavigation, true);
      win.clearInterval(navTimer);
      navTimer = null;
      timeline.stop();
      events = null;
    },
    applySettings(previous, next) {
      if (next.translationEnabled && !previous.translationEnabled) ensureCaptionsOn();
      if (next.hideNativeSubtitles !== previous.hideNativeSubtitles) updateSubtitleNode();
    },
    getCurrentCue() {
      if (!videoId || !isVideoPage()) return null;
      updateSubtitleNode();
      if (mode === "track") return timeline.currentCue();
      if (mode === "dom" && !isAdShowing()) {
        return createCue({ id: `${videoId}:dom`, text: readNativeCaption(), source: "dom" });
      }
      return null;
    },
    // With the whole track in hand, the next lines can be translated before
    // they show.
    getUpcomingCues(count) {
      if (mode !== "track" || !videoId || !isVideoPage()) return [];
      return timeline.upcomingCues(count);
    },
    // Between two cues of a captured track the native captions stay hidden:
    // they run on their own timing and would flash up in every gap.
    keepsNativeHiddenBetweenCues() {
      return mode === "track";
    },
    hasActiveContent() {
      return false;
    },
    getHost() {
      return getPlayer();
    },
    getState() {
      return { videoId, mode, cueCount: timeline.size };
    }
  };
}
