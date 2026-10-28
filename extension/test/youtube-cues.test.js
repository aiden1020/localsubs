import { describe, expect, it } from "vitest";
import {
  CAPTURE_SOURCE,
  isEnglishTrack,
  parseCaptureMessage,
  trackLanguage,
  videoIdFromUrl
} from "../src/content/youtube-cues.js";

describe("YouTube video ids", () => {
  it("reads watch, Shorts and live URLs", () => {
    expect(videoIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3")).toBe("dQw4w9WgXcQ");
    expect(videoIdFromUrl("https://www.youtube.com/shorts/abcDEF_1234")).toBe("abcDEF_1234");
    expect(videoIdFromUrl("https://www.youtube.com/live/abcDEF-1234")).toBe("abcDEF-1234");
  });

  it("ignores pages that are not a single video", () => {
    expect(videoIdFromUrl("https://www.youtube.com/")).toBe("");
    expect(videoIdFromUrl("https://www.youtube.com/results?search_query=x&v=nope")).toBe("");
    expect(videoIdFromUrl("https://www.youtube.com/embed/videoseries?list=PL1")).toBe("");
    expect(videoIdFromUrl("not a url")).toBe("");
  });
});

describe("caption track language", () => {
  it("reads lang from the stable track id", () => {
    const trackId = "https://www.youtube.com/api/timedtext?v=abc&lang=en-GB&kind=asr";
    expect(trackLanguage(trackId)).toBe("en-GB");
    expect(isEnglishTrack(trackId)).toBe(true);
  });

  it("rejects non-English tracks and allows unknown ones", () => {
    expect(isEnglishTrack("/api/timedtext?v=abc&lang=ja")).toBe(false);
    expect(isEnglishTrack("/api/timedtext?v=abc&lang=eng")).toBe(false);
    expect(isEnglishTrack("")).toBe(true);
  });
});

describe("capture messages", () => {
  const win = {};

  it("accepts well-formed messages from this window only", () => {
    const event = {
      source: win,
      data: { source: CAPTURE_SOURCE, type: "cues", videoId: "v", nonce: 2, cues: [], trackKind: "asr", trackId: "t" }
    };
    expect(parseCaptureMessage(event, { window: win })).toEqual({
      type: "cues", videoId: "v", nonce: 2, cues: [], trackKind: "asr", trackId: "t"
    });
    expect(parseCaptureMessage({ ...event, source: {} }, { window: win })).toBeNull();
  });

  it("rejects other senders and coerces bad fields", () => {
    expect(parseCaptureMessage({ source: win, data: { source: "ytds-inject", type: "cues" } }, { window: win }))
      .toBeNull();
    expect(parseCaptureMessage({
      source: win,
      data: { source: CAPTURE_SOURCE, type: "cues", videoId: 5, nonce: "1", cues: "x", trackKind: "?" }
    }, { window: win })).toEqual({
      type: "cues", videoId: "", nonce: null, cues: [], trackKind: "manual", trackId: ""
    });
  });
});
