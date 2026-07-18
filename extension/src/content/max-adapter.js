import { normalizeText } from "./captions.js";

export const PRIMARY_SUBTITLE_SELECTORS = Object.freeze([
  "#overlay-root [data-testid='cueBoxRowTextCue']",
  "[data-testid='cueBoxRowTextCue']",
  "#overlay-root .RowContainer-Fuse-Web-Play__sc-1wvp621-1 .CaptionWindow-Fuse-Web-Play__sc-1wvp621-5",
  "#overlay-root [class*='RowContainer-Fuse-Web-Play'] [class*='CaptionWindow-Fuse-Web-Play']",
  "[class*='CaptionWindow-Fuse-Web-Play']"
]);

export const BLOCKED_SUBTITLE_SELECTORS = Object.freeze([
  "[data-testid='player-ux-asset-subtitle']",
  "[class*='Subtitle-Fuse-Web-Play__sc-k9fw09-7']"
]);

export function isBlockedSubtitleNode(node) {
  if (!(node instanceof HTMLElement)) {
    return false;
  }
  return BLOCKED_SUBTITLE_SELECTORS.some((selector) => node.matches(selector) || node.closest(selector));
}

export function resolveSubtitleContainer(node) {
  if (!(node instanceof HTMLElement)) {
    return null;
  }
  return (
    node.closest("[class*='CaptionWindow-Fuse-Web-Play']") ||
    node.closest("[class*='RowContainer-Fuse-Web-Play']") ||
    node
  );
}

export function extractNodeText(node) {
  const container = resolveSubtitleContainer(node);
  if (!(container instanceof HTMLElement)) {
    return "";
  }
  const cueNodes = container.matches("[data-testid='cueBoxRowTextCue']")
    ? [container]
    : Array.from(container.querySelectorAll("[data-testid='cueBoxRowTextCue']"));
  if (cueNodes.length > 0) {
    return cueNodes
      .map((cueNode) => normalizeText(cueNode.textContent || ""))
      .filter(Boolean)
      .join("\n");
  }
  return normalizeText(container.innerText || container.textContent || "");
}
