// YouTube-specific helpers: page and track identity, and the message bridge to
// the vendored capture script. videoIdFromUrl is adapted from yt-dual-subs
// content.js (MIT, Copyright (c) 2026 Gythiro, commit 5657c8a); see
// extension/vendor/yt-dual-subs/UPSTREAM.md. Track cue handling lives in
// track-cues.js.

export const CAPTURE_SOURCE = "localsubs-yt-capture";
export const CONTENT_SOURCE = "localsubs-yt-content";

// Shorts, /embed/ and /live/ carry the id in the path; /embed/videoseries and
// /embed/live_stream are not video ids.
export function videoIdFromUrl(href) {
  try {
    const url = new URL(href);
    const match = url.pathname.match(
      /^\/(?:shorts|embed|live)\/(?!videoseries\b|live_stream\b)([A-Za-z0-9_-]{6,})/
    );
    if (match) return match[1];
    return url.pathname === "/watch" ? url.searchParams.get("v") || "" : "";
  } catch {
    return "";
  }
}

export function isShortsPath(pathname = "") {
  return pathname.startsWith("/shorts/");
}

// The caption track's own language, from the stable track id the capture
// script posts (the timedtext URL without pot/fmt/tlang).
export function trackLanguage(trackId = "") {
  try {
    return new URL(trackId, "https://www.youtube.com").searchParams.get("lang") || "";
  } catch {
    return "";
  }
}

// LocalSubs' models translate English only. An unknown language is allowed
// through; the DOM fallback cannot tell either.
export function isEnglishTrack(trackId = "") {
  const language = trackLanguage(trackId).toLowerCase();
  return !language || language === "en" || language.startsWith("en-");
}

// Accepts only well-formed messages from the vendored capture script. The page
// can post anything on window, so every field is checked before use.
export function parseCaptureMessage(event, { window: win = window } = {}) {
  if (!event || event.source !== win) return null;
  const data = event.data;
  if (!data || data.source !== CAPTURE_SOURCE || typeof data.type !== "string") return null;
  return {
    type: data.type,
    videoId: typeof data.videoId === "string" ? data.videoId : "",
    nonce: Number.isInteger(data.nonce) ? data.nonce : null,
    cues: Array.isArray(data.cues) ? data.cues : [],
    trackKind: data.trackKind === "asr" ? "asr" : "manual",
    trackId: typeof data.trackId === "string" ? data.trackId : ""
  };
}
