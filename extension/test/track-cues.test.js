import { describe, expect, it, vi } from "vitest";
import { createCue } from "../src/content/platform.js";
import {
  asrWordStream,
  createCueTimeline,
  findActiveCue,
  findUpcomingCues,
  normalizeTrackCues,
  segmentAsrWords
} from "../src/content/track-cues.js";

describe("unified cue format", () => {
  it("normalizes text and timing", () => {
    expect(createCue({ text: "  Hello \n  there ", id: 3, start: 10, end: "x", source: "track" })).toEqual({
      id: "3",
      text: "Hello\nthere",
      start: 10,
      end: null,
      source: "track"
    });
  });

  it("drops empty cues", () => {
    expect(createCue({ text: " \n " })).toBeNull();
    expect(createCue({ text: 42 })).toBeNull();
  });
});

describe("track cue normalization", () => {
  it("sorts manual cues, keeps them whole, and fills zero durations", () => {
    const cues = normalizeTrackCues([
      { start: 4000, dur: 0, text: "Second line." },
      { start: 1000, dur: 2000, text: "First   line." },
      { start: 9000, dur: 0, text: "Last." },
      { start: "bad", dur: 1, text: "skip" },
      { start: 5000, dur: 1, text: "   " }
    ], { trackKind: "manual", idPrefix: "vid" });

    expect(cues.map(({ id, text, start, end }) => ({ id, text, start, end }))).toEqual([
      { id: "vid:0", text: "First line.", start: 1000, end: 3000 },
      { id: "vid:1", text: "Second line.", start: 4000, end: 5000 },
      { id: "vid:2", text: "Last.", start: 9000, end: 10000 }
    ]);
    expect(cues.every((cue) => cue.source === "track")).toBe(true);
  });

  it("returns no cues for malformed input", () => {
    expect(normalizeTrackCues(null)).toEqual([]);
    expect(normalizeTrackCues([null, { text: 1 }])).toEqual([]);
  });
});

describe("timeline sync", () => {
  const cues = normalizeTrackCues([
    { start: 1000, dur: 5000, text: "long" },
    { start: 2000, dur: 500, text: "short" },
    { start: 8000, dur: 1000, text: "later" }
  ], { idPrefix: "v" });

  it("prefers the latest cue that has started", () => {
    expect(findActiveCue(cues, 2100)?.text).toBe("short");
  });

  it("falls back to an earlier cue that still covers the time", () => {
    expect(findActiveCue(cues, 3000)?.text).toBe("long");
  });

  it("returns null in gaps and before the first cue", () => {
    expect(findActiveCue(cues, 500)).toBeNull();
    expect(findActiveCue(cues, 7000)).toBeNull();
    expect(findActiveCue(cues, 9500)).toBeNull();
    expect(findActiveCue([], 100)).toBeNull();
  });

  it("lists the cues that start after the current time", () => {
    expect(findUpcomingCues(cues, 1500, 3).map((cue) => cue.text)).toEqual(["short", "later"]);
    expect(findUpcomingCues(cues, 2000, 1).map((cue) => cue.text)).toEqual(["later"]);
    expect(findUpcomingCues(cues, 9000, 3)).toEqual([]);
    expect(findUpcomingCues(cues, Number.NaN, 3)).toEqual([]);
  });
});

// Rolling ASR events as YouTube sends them: a few words per event, one segment
// per word with its own offset, sentence ends falling inside events.

function asrEvents(transcript, { wordMs = 300, perEvent = 4, startMs = 0 } = {}) {
  const words = transcript.split(" ");
  const events = [];
  for (let i = 0; i < words.length; i += perEvent) {
    const start = startMs + i * wordMs;
    const chunk = words.slice(i, i + perEvent);
    events.push({
      start,
      dur: perEvent * wordMs * 2,
      text: chunk.join(" "),
      words: chunk.map((word, k) => [start + k * wordMs, k === 0 ? word : ` ${word}`])
    });
  }
  return events;
}

describe("auto-generated caption segmentation", () => {
  const transcript =
    "It's been 9 long years, but Elon Musk has finally launched the updated Tesla Roadster. " +
    "And I mean that literally, because the car can actually fly. " +
    "And incredibly, that's just the start, because it can also push 2,000 kg of air through " +
    "these nozzles at the speed of sound. This delivers the same amount of thrust as the jet " +
    "engine in an F-18 Hornet fighter.";

  it("cuts at sentence ends inside rolling events, not at event edges", () => {
    const cues = normalizeTrackCues(asrEvents(transcript), { trackKind: "asr", idPrefix: "v" });
    const texts = cues.map((cue) => cue.text);
    expect(texts).toContain("And I mean that literally, because the car can actually fly.");
    expect(texts).toContain("This delivers the same amount of thrust as the jet engine in an F-18 Hornet fighter.");
    expect(texts.every((text) => text.length <= 84)).toBe(true);
    expect(texts.some((text) => text.startsWith("kg of air"))).toBe(false);
    expect(texts.join(" ")).toBe(transcript);
  });

  it("splits sentences longer than two subtitle lines at clause and phrase boundaries", () => {
    const cues = normalizeTrackCues(asrEvents(transcript), { trackKind: "asr" });
    const texts = cues.map((cue) => cue.text);
    expect(texts.slice(0, 2)).toEqual([
      "It's been 9 long years,",
      "but Elon Musk has finally launched the updated Tesla Roadster."
    ]);
    expect(texts).toEqual(expect.arrayContaining([
      "And incredibly, that's just the start,",
      "because it can also push 2,000 kg of air",
      "through these nozzles at the speed of sound."
    ]));
  });

  it("never breaks inside a name or after an article, auxiliary or preposition", () => {
    const sentence = "Yesterday afternoon the engineers at the factory showed Elon Musk a prototype that " +
      "will probably change the way we think about electric cars forever";
    const texts = normalizeTrackCues(asrEvents(sentence), { trackKind: "asr" }).map((cue) => cue.text);
    expect(texts.length).toBeGreaterThan(1);
    for (const text of texts.slice(0, -1)) {
      const last = text.split(" ").at(-1).toLowerCase();
      expect(["a", "an", "the", "will", "at", "about", "elon", "we"]).not.toContain(last);
    }
  });

  it("keeps each line up long enough to read and closes short gaps", () => {
    const cues = normalizeTrackCues(asrEvents(transcript), { trackKind: "asr" });
    expect(cues[0].start).toBe(0);
    expect(cues[1].start).toBe(5 * 300);
    for (let i = 0; i + 1 < cues.length; i += 1) {
      expect(cues[i].end).toBeLessThanOrEqual(cues[i + 1].start);
    }
    expect(cues[0].end).toBe(cues[1].start);
    const last = cues.at(-1);
    expect(last.end - last.start).toBeGreaterThanOrEqual(last.text.length * 50);

    const spaced = normalizeTrackCues([
      ...asrEvents("Hi."),
      ...asrEvents("Much later.", { startMs: 10000 })
    ], { trackKind: "asr" });
    expect(spaced[0]).toMatchObject({ text: "Hi.", start: 0, end: 800 });
  });

  it("falls back to pauses and line length when ASR has no punctuation", () => {
    const first = asrEvents("so today we are going to talk about local translation");
    const second = asrEvents("it runs on your laptop", { startMs: 6000 });
    const cues = normalizeTrackCues([...first, ...second], { trackKind: "asr" });
    expect(cues.map((cue) => cue.text)).toEqual([
      "so today we are going to talk about local translation",
      "it runs on your laptop"
    ]);

    const runOn = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ");
    const lines = normalizeTrackCues(asrEvents(runOn), { trackKind: "asr" });
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((cue) => cue.text.length <= 84)).toBe(true);
  });

  it("does not end sentences at common abbreviations", () => {
    const words = asrWordStream([{ start: 0, dur: 3000, text: "", words: [[0, "Mr."], [300, " Smith"], [600, " went."]] }]);
    expect(segmentAsrWords(words).map((line) => line.text)).toEqual(["Mr. Smith went."]);
  });

  it("strips speaker chevrons and sound tags and spreads multi-word segments", () => {
    const words = asrWordStream([
      { start: 1000, dur: 2000, text: "", words: [[1000, ">> hello there"], [2000, " [Music] friend"]] }
    ]);
    expect(words).toEqual([
      { text: "hello", time: 1000 },
      { text: "there", time: 1500 },
      { text: "friend", time: 2000 }
    ]);
  });

  it("uses the event text when a segment list is missing", () => {
    const cues = normalizeTrackCues([{ start: 500, dur: 1000, text: "Hi there." }], { trackKind: "asr" });
    expect(cues).toMatchObject([{ text: "Hi there.", start: 500 }]);
  });
});

describe("cue timeline", () => {
  function setup() {
    let timeMs = 0;
    const timers = [];
    const win = {
      setInterval: vi.fn((callback) => { timers.push(callback); return timers.length; }),
      clearInterval: vi.fn()
    };
    const onCueChange = vi.fn();
    const timeline = createCueTimeline({
      getTimeMs: () => timeMs,
      onCueChange,
      window: win
    });
    return {
      timeline,
      onCueChange,
      win,
      tick: () => timers.forEach((callback) => callback()),
      setTime: (next) => { timeMs = next; }
    };
  }

  const cues = normalizeTrackCues([
    { start: 1000, dur: 500, text: "One." },
    { start: 3000, dur: 500, text: "Two." }
  ], { idPrefix: "t" });

  it("reports only cue boundaries", () => {
    const { timeline, onCueChange, tick, setTime } = setup();
    timeline.setCues(cues);
    timeline.start();
    setTime(1100);
    tick();
    tick();
    expect(onCueChange).toHaveBeenCalledTimes(1);
    expect(timeline.currentCue()?.text).toBe("One.");
    setTime(2000);
    tick();
    expect(onCueChange).toHaveBeenCalledTimes(2);
    expect(timeline.currentCue()).toBeNull();
  });

  it("stays quiet without cues and when the clock is unavailable", () => {
    const { timeline, onCueChange, tick, setTime } = setup();
    timeline.start();
    setTime(1100);
    tick();
    expect(onCueChange).not.toHaveBeenCalled();
    timeline.setCues(cues);
    setTime(null);
    expect(timeline.currentCue()).toBeNull();
    expect(timeline.size).toBe(2);
  });

  it("starts one interval and stops it", () => {
    const { timeline, win } = setup();
    timeline.start();
    timeline.start();
    expect(win.setInterval).toHaveBeenCalledTimes(1);
    timeline.stop();
    expect(win.clearInterval).toHaveBeenCalledWith(1);
  });
});
