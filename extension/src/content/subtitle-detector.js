import { isLikelyUiText } from "./captions.js";
import {
  extractNodeText,
  isBlockedSubtitleNode,
  PRIMARY_SUBTITLE_SELECTORS,
  resolveSubtitleContainer
} from "./max-adapter.js";

export class SubtitleDetector {
  constructor({ onNodeChange, onMutation }) {
    this.onNodeChange = onNodeChange;
    this.onMutation = onMutation;
    this.activeNode = null;
    this.observer = null;
  }

  isCandidateVisible(rect) {
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
  }

  isSubtitleLikeRect(rect) {
    const verticalCenter = rect.top + rect.height / 2;
    return (
      verticalCenter > window.innerHeight * 0.55 &&
      rect.bottom < window.innerHeight * 0.98 &&
      rect.height <= window.innerHeight * 0.2 &&
      rect.width <= window.innerWidth * 0.9
    );
  }

  scoreCandidate(text, rect, selector) {
    const verticalCenter = rect.top + rect.height / 2;
    const selectorBonus = /subtitle|caption|cue/i.test(selector) ? 0.08 : 0;
    const lengthPenalty = Math.min(text.length, 120) / 1000;
    const widthBonus = Math.min(rect.width / window.innerWidth, 0.6) * 0.08;
    return verticalCenter / window.innerHeight + selectorBonus + widthBonus - lengthPenalty;
  }

  getPreferredNode() {
    for (const selector of PRIMARY_SUBTITLE_SELECTORS) {
      for (const node of document.querySelectorAll(selector)) {
        if (!(node instanceof HTMLElement) || isBlockedSubtitleNode(node)) continue;
        const text = extractNodeText(node);
        if (!text || isLikelyUiText(text)) continue;
        const container = resolveSubtitleContainer(node);
        if (!(container instanceof HTMLElement)) continue;
        const rect = container.getBoundingClientRect();
        if (!this.isCandidateVisible(rect)) continue;
        if (!this.isSubtitleLikeRect(rect) && !selector.includes("cueBoxRowTextCue")) continue;
        return container;
      }
    }
    return null;
  }

  collectCandidates() {
    const candidates = [];
    for (const selector of PRIMARY_SUBTITLE_SELECTORS) {
      for (const node of document.querySelectorAll(selector)) {
        if (!(node instanceof HTMLElement) || isBlockedSubtitleNode(node)) continue;
        const text = extractNodeText(node);
        if (!text || isLikelyUiText(text)) continue;
        const container = resolveSubtitleContainer(node);
        if (!(container instanceof HTMLElement)) continue;
        const rect = container.getBoundingClientRect();
        if (!this.isCandidateVisible(rect)) continue;
        if (!this.isSubtitleLikeRect(rect) && !selector.includes("cueBoxRowTextCue")) continue;
        candidates.push({
          node: container,
          text,
          rect,
          selector,
          score: this.scoreCandidate(text, rect, selector)
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  getNodeText(node) {
    if (!(node instanceof HTMLElement) || !node.isConnected || isBlockedSubtitleNode(node)) return "";
    const text = extractNodeText(node);
    if (!text || isLikelyUiText(text)) return "";
    const container = resolveSubtitleContainer(node);
    if (!(container instanceof HTMLElement)) return "";
    const rect = container.getBoundingClientRect();
    if (!this.isCandidateVisible(rect)) return "";
    if (!this.isSubtitleLikeRect(rect) && !container.querySelector("[data-testid='cueBoxRowTextCue']")) {
      return "";
    }
    return text;
  }

  observe(node) {
    const container = resolveSubtitleContainer(node);
    if (!(container instanceof HTMLElement)) return;
    if (this.activeNode === container && this.observer) return;
    this.observer?.disconnect();
    this.activeNode = container;
    this.onNodeChange(container);
    this.observer = new MutationObserver(() => this.onMutation());
    this.observer.observe(container, { childList: true, subtree: true, characterData: true });
  }

  clear() {
    this.observer?.disconnect();
    this.observer = null;
    this.activeNode = null;
    this.onNodeChange(null);
  }

  hasActiveContent() {
    return Boolean(this.getNodeText(this.activeNode));
  }

  getCaption() {
    const preferredNode = this.getPreferredNode();
    if (preferredNode) {
      this.observe(preferredNode);
      return this.getNodeText(preferredNode);
    }
    const lockedText = this.getNodeText(this.activeNode);
    if (lockedText) return lockedText;
    if (this.activeNode?.isConnected) return "";
    if (this.activeNode) this.clear();

    const bestCandidate = this.collectCandidates()[0];
    if (!bestCandidate) {
      this.clear();
      return "";
    }
    this.observe(bestCandidate.node);
    return bestCandidate.text;
  }
}
