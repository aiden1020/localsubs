import { createCue } from "./platform.js";

// Platform-independent handling of whole caption tracks: any adapter that can
// capture a full track (YouTube today; Netflix, Prime Video or Disney+ TTML or
// WebVTT later) turns it into cues here and serves them by playback time.
// computeCueEnds and findActiveCue are adapted from yt-dual-subs content.js
// (MIT, Copyright (c) 2026 Gythiro, commit 5657c8a); see
// extension/vendor/yt-dual-subs/UPSTREAM.md.

const ZERO_DUR_FLOOR_MS = 1000;
const OVERLAP_SCAN = 8;
const TIMELINE_TICK_MS = 100;

function sanitizeWords(words, start) {
  if (!Array.isArray(words)) return [];
  return words
    .filter((word) => Array.isArray(word) && Number.isFinite(Number(word[0])) && typeof word[1] === "string")
    .map(([time, text]) => [Math.max(start, Number(time)), text]);
}

function sanitizeRawCue(raw) {
  if (!raw || typeof raw.text !== "string") return null;
  const start = Number(raw.start);
  if (!Number.isFinite(start) || start < 0) return null;
  const dur = Number(raw.dur);
  return {
    start,
    dur: Number.isFinite(dur) && dur > 0 ? dur : 0,
    text: raw.text,
    words: sanitizeWords(raw.words, start)
  };
}

// Sorts cues and gives each an effective end. A zero-duration cue lasts until
// the next one starts, or a floor for the last cue.
export function computeCueEnds(list) {
  for (let i = 0; i < list.length; i += 1) {
    const cue = list[i];
    let end = cue.start + cue.dur;
    if (cue.dur <= 0) {
      end = i + 1 < list.length ? list[i + 1].start : cue.start + ZERO_DUR_FLOOR_MS;
      if (end <= cue.start) end = cue.start + ZERO_DUR_FLOOR_MS;
    }
    cue.end = end;
  }
  return list;
}

// ---- auto-generated (ASR) tracks ------------------------------------------
// ASR events (YouTube's, for one) are rolling windows of a few words, and a sentence end
// usually falls INSIDE an event ("...Roadster. And I mean"), so grouping whole
// events can only cut mid-sentence. Instead flatten the track into one timed
// word stream and re-segment it the way subtitle tools regroup word-timed ASR
// (stable-ts `regroup`: split on sentence punctuation, on gaps, on commas only
// when long, then by length), with the limits and line-break rules of
// professional subtitling (Netflix Timed Text Style Guide: two lines of 42
// characters, 20 characters per second, at least 20 frames on screen, gaps
// under half a second closed, break after punctuation or before conjunctions
// and prepositions, never inside a phrase).

const MAX_CUE_CHARS = 84;
const MIN_PART_WORDS = 3;
const PAUSE_BREAK_MS = 1200;
const WORD_DURATION_MS = 600;
const MIN_DURATION_MS = 800;
const MS_PER_CHAR = 50;
const CLOSE_GAP_MS = 500;
const SENTENCE_END_WORD_RE = /[.!?…]["'”’)\]]*$/;
const CLAUSE_END_WORD_RE = /[,;:—–]["'”’)\]]*$/;
const ABBREVIATION_RE = /^(?:mr|mrs|ms|dr|prof|st|vs|etc|e\.g|i\.e|u\.s|u\.k|[a-z])\.$/i;
// "so", "like" and "that" are left out: they are as often adverbs or
// pronouns, and a pause marks them better when they do start a clause.
const CONJUNCTIONS = new Set([
  "and", "but", "because", "which", "who", "when", "while", "if", "or",
  "then", "although", "though", "since", "unless", "until", "where", "whereas"
]);
const PREPOSITIONS = new Set([
  "about", "after", "against", "around", "at", "before", "between", "by", "during",
  "for", "from", "in", "into", "like", "of", "on", "over", "through", "to",
  "toward", "towards", "under", "with", "within", "without"
]);
// A line must not end on a word that binds to the next one: an article or
// determiner (to its noun), an auxiliary (to its verb), a subject pronoun (to
// its verb), a preposition (to its object), "to" and "not".
const NO_BREAK_AFTER = new Set([
  "a", "an", "the", "this", "these", "those", "my", "your", "his", "her", "its",
  "our", "their", "some", "any", "every", "each", "no",
  "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "can", "could", "shall", "should", "may",
  "might", "must", "i", "you", "he", "she", "we", "they", "it", "not", "very",
  ...PREPOSITIONS
]);

// Every word of the track with its start time. A segment holding several words
// (manual-style ASR, or a segment without per-word offsets) spreads its words
// evenly up to the next segment.
export function asrWordStream(list) {
  const segments = [];
  for (const cue of list) {
    const parts = cue.words.length > 0 ? cue.words : [[cue.start, cue.text]];
    for (const [time, text] of parts) segments.push({ time, text, cueEnd: cue.start + cue.dur });
  }
  segments.sort((a, b) => a.time - b.time);
  const words = [];
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const tokens = segment.text
      .replace(/(^|\s)>{2,}/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0) continue;
    const next = segments[i + 1]?.time;
    const until = Number.isFinite(next) ? next : Math.max(segment.cueEnd, segment.time + tokens.length * 300);
    const step = Math.max(0, until - segment.time) / tokens.length;
    tokens.forEach((text, k) => words.push({ text, time: Math.round(segment.time + step * k) }));
  }
  return words;
}

function endsSentence(word) {
  return SENTENCE_END_WORD_RE.test(word) && !ABBREVIATION_RE.test(word);
}

function bareWord(word) {
  return word.toLowerCase().replace(/[^a-z']/g, "");
}

function isCapitalized(word) {
  return /^[A-Z][a-z]/.test(word);
}

function runText(words, from, to) {
  return words.slice(from, to + 1).map((word) => word.text).join(" ");
}

// Scores a break before words[i]. Punctuation beats syntax, syntax beats
// pauses, and a balanced split wins only when nothing else decides.
function breakScore(words, from, to, i) {
  const before = words[i - 1].text;
  const after = words[i].text;
  let score = Math.min(words[i].time - words[i - 1].time, 2000) / 2000;
  if (CLAUSE_END_WORD_RE.test(before)) score += 3;
  if (CONJUNCTIONS.has(bareWord(after))) score += 1.5;
  else if (PREPOSITIONS.has(bareWord(after))) score += 1;
  if (!CLAUSE_END_WORD_RE.test(before) && NO_BREAK_AFTER.has(bareWord(before))) score -= 3;
  if (isCapitalized(before) && isCapitalized(after)) score -= 2;   // "Elon | Musk"
  const left = runText(words, from, i - 1).length;
  const right = runText(words, i, to).length;
  // As few cues as possible: a side that would need splitting again costs.
  if (left > MAX_CUE_CHARS) score -= 2;
  if (right > MAX_CUE_CHARS) score -= 2;
  score -= Math.abs(left - right) / (left + right);
  return score;
}

function splitLongRun(words, from, to, lines) {
  if (runText(words, from, to).length <= MAX_CUE_CHARS || to - from + 1 < MIN_PART_WORDS * 2) {
    lines.push([from, to]);
    return;
  }
  let cut = -1;
  let bestScore = -Infinity;
  for (let i = from + MIN_PART_WORDS; i <= to - MIN_PART_WORDS + 1; i += 1) {
    const score = breakScore(words, from, to, i);
    if (score > bestScore) {
      bestScore = score;
      cut = i;
    }
  }
  splitLongRun(words, from, cut - 1, lines);
  splitLongRun(words, cut, to, lines);
}

// Sentence boundaries first (end punctuation, or a long pause where ASR left
// none), then sentences longer than two subtitle lines are split.
export function segmentAsrWords(words) {
  const lines = [];
  let first = 0;
  for (let i = 0; i < words.length; i += 1) {
    const isLast = i === words.length - 1;
    const pause = isLast ? Infinity : words[i + 1].time - words[i].time;
    if (isLast || endsSentence(words[i].text) || pause > PAUSE_BREAK_MS) {
      splitLongRun(words, first, i, lines);
      first = i + 1;
    }
  }
  return lines.map(([from, to], index) => {
    const text = runText(words, from, to);
    const start = words[from].time;
    const nextStart = index + 1 < lines.length ? words[lines[index + 1][0]].time : Infinity;
    // Stay until the last word is spoken and long enough to read, but never
    // into the next cue; a gap too short to notice is closed.
    let end = Math.max(
      words[to].time + WORD_DURATION_MS,
      start + MIN_DURATION_MS,
      start + text.length * MS_PER_CHAR
    );
    if (nextStart - end < CLOSE_GAP_MS) end = nextStart;
    return { text, start, end: Math.max(start + 1, Math.min(end, nextStart)) };
  });
}

// Turns a captured caption track into LocalSubs cues, sorted by start. Raw
// cues are { start, dur, text, words? } in milliseconds, with words as
// [[startMs, text], ...]. Auto-generated ("asr") tracks are rebuilt from their
// words; other tracks keep their own cues. Cue ids are `${idPrefix}:${n}`.
export function normalizeTrackCues(rawCues, { trackKind = "manual", idPrefix = "" } = {}) {
  if (!Array.isArray(rawCues)) return [];
  const list = rawCues.map(sanitizeRawCue).filter(Boolean);
  list.sort((a, b) => a.start - b.start);
  computeCueEnds(list);
  const units = trackKind === "asr" ? segmentAsrWords(asrWordStream(list)) : list;
  const cues = [];
  for (const unit of units) {
    const cue = createCue({
      id: `${idPrefix}:${cues.length}`,
      text: unit.text,
      start: unit.start,
      end: unit.end,
      source: "track"
    });
    if (cue) cues.push(cue);
  }
  return cues;
}

// The cue on screen at timeMs: the latest-starting cue that has begun, or an
// earlier, longer cue that still covers timeMs. Null in a gap.
export function findActiveCue(cues, timeMs) {
  if (!Array.isArray(cues) || cues.length === 0 || !Number.isFinite(timeMs)) return null;
  let lo = 0;
  let hi = cues.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= timeMs) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  for (let i = idx; i >= 0 && idx - i <= OVERLAP_SCAN; i -= 1) {
    if (timeMs < cues[i].end) return cues[i];
  }
  return null;
}

// The next count cues that start after timeMs.
export function findUpcomingCues(cues, timeMs, count) {
  if (!Array.isArray(cues) || !Number.isFinite(timeMs) || count <= 0) return [];
  let lo = 0;
  let hi = cues.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= timeMs) lo = mid + 1;
    else hi = mid;
  }
  return cues.slice(lo, lo + count);
}

// Serves a track's cues by playback time and reports cue boundaries. Video
// timeupdate fires only about four times a second, so the timeline polls the
// clock itself while it has cues. getTimeMs returns null when no cue should
// show (no video, or an ad playing).
export function createCueTimeline({ getTimeMs, onCueChange, window: win = window, tickMs = TIMELINE_TICK_MS }) {
  let cues = [];
  let lastCueId = "";
  let timer = null;

  function currentCue() {
    const timeMs = getTimeMs();
    return timeMs === null ? null : findActiveCue(cues, timeMs);
  }

  function tick() {
    if (cues.length === 0) return;
    const cueId = currentCue()?.id || "";
    if (cueId !== lastCueId) {
      lastCueId = cueId;
      onCueChange();
    }
  }

  return {
    start() {
      if (timer === null) timer = win.setInterval(tick, tickMs);
    },
    stop() {
      win.clearInterval(timer);
      timer = null;
    },
    setCues(nextCues) {
      cues = Array.isArray(nextCues) ? nextCues : [];
      lastCueId = "";
    },
    currentCue,
    upcomingCues(count) {
      const timeMs = getTimeMs();
      return timeMs === null ? [] : findUpcomingCues(cues, timeMs, count);
    },
    get size() {
      return cues.length;
    }
  };
}
