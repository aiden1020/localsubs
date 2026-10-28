import { createCue } from "./platform.js";
import { SubtitleDetector } from "./subtitle-detector.js";

function hasPlayableVideo(doc) {
  return Array.from(doc.querySelectorAll("video")).some((video) => {
    return Boolean(video.currentSrc || video.src);
  });
}

// HBO Max: captions are read from the player's DOM, so a cue is whatever the
// subtitle detector sees right now.
export function createMaxPlatform({ document: doc = document, window: win = window } = {}) {
  let events = null;
  let cueSequence = 0;
  let lastText = "";
  const detector = new SubtitleDetector({
    onNodeChange: (node) => events?.onSubtitleNode(node),
    onMutation: () => events?.onChange({ reposition: true })
  });

  return {
    id: "max",
    shouldRun() {
      const path = win.location.pathname || "";
      const isPlaybackPage =
        path.includes("/video/watch/") ||
        path.includes("/play") ||
        path.includes("/watch");
      const isPlayerLikeFrame =
        path.includes("/player") ||
        win.location.hostname.startsWith("play.");
      return isPlaybackPage || isPlayerLikeFrame || hasPlayableVideo(doc);
    },
    start(nextEvents) {
      events = nextEvents;
      // main.js may detect before start(); hand over the node seen so far.
      if (detector.activeNode) events.onSubtitleNode(detector.activeNode);
    },
    getCurrentCue() {
      const cue = createCue({ text: detector.getCaption(), source: "dom" });
      if (cue && cue.text !== lastText) {
        lastText = cue.text;
        cueSequence += 1;
      }
      return cue ? { ...cue, id: String(cueSequence) } : null;
    },
    hasActiveContent() {
      return detector.hasActiveContent();
    },
    getHost() {
      const overlayRoot = doc.getElementById("overlay-root");
      if (overlayRoot instanceof HTMLElement) return overlayRoot;
      const video = doc.querySelector("video");
      if (video?.parentElement instanceof HTMLElement) return video.parentElement;
      return doc.body || doc.documentElement;
    },
    nativeSubtitles: null
  };
}
