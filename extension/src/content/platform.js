import { normalizeCaption } from "./captions.js";

// The boundary between LocalSubs and a streaming site. Adapters are listed in
// platforms.js; sites that capture a whole caption track can build on
// track-cues.js. main.js owns
// translation, history, the overlay, and the player panel; an adapter only
// answers "what caption is on screen now" and says when that may have changed.
//
// A platform adapter is an object with:
//   id                    "max" | "youtube"
//   shouldRun()           true when this page can host a player at all
//   start(events)         begins watching the page; events are
//                           onChange()       the current cue may have changed
//                           onReset()        a new video: drop caption history
//                           onSubtitleNode(node | null)
//                                            native caption element, for
//                                            positioning and hiding
//                           showStatus(message)
//   getCurrentCue()       a cue (see createCue) or null
//   hasActiveContent()    true when a native caption is showing but has no
//                         usable text yet (keeps the overlay from flickering)
//   getHost()             element that hosts the overlay and player panel
//   nativeSubtitles       optional { suppress(): boolean, restore() } that
//                         replaces per-node hiding in the overlay renderer
//
// Cues from every platform use one shape, so translation and caching never
// depend on where the text came from.
export function createCue({ text, id = "", start = null, end = null, source = "dom" } = {}) {
  const normalized = normalizeCaption(typeof text === "string" ? text : "");
  if (!normalized) return null;
  return {
    id: String(id),
    text: normalized,
    start: Number.isFinite(start) ? start : null,
    end: Number.isFinite(end) ? end : null,
    source
  };
}
