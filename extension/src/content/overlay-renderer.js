const OVERLAY_ID = "localsubs-overlay";

function isVisibleRect(rect) {
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
}

export class OverlayRenderer {
  constructor({ getSettings }) {
    this.getSettings = getSettings;
    this.overlay = null;
    this.card = null;
    this.originalLine = null;
    this.translatedLine = null;
    this.host = null;
    this.subtitleNode = null;
    this.hiddenSubtitleNode = null;
    this.hiddenSubtitleOriginalVisibility = "";
    this.pinned = false;
    this.dragging = false;
    this.dragPointerId = null;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.finishDrag = this.finishDrag.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
  }

  setSubtitleNode(node) {
    if (this.subtitleNode !== node) {
      this.restoreNativeSubtitle();
      this.subtitleNode = node;
    }
    if (this.getSettings().hideNativeSubtitles) {
      this.suppressNativeSubtitle();
    }
  }

  applySettings() {
    this.applyStyleSettings();
    if (!this.getSettings().hideNativeSubtitles) {
      this.restoreNativeSubtitle();
    }
  }

  applyStyleSettings() {
    if (!this.card || !this.originalLine || !this.translatedLine) return;
    const settings = this.getSettings();
    this.card.style.background = `rgba(0, 0, 0, ${settings.overlayBackgroundOpacity})`;
    this.originalLine.style.fontSize = `${Math.max(14, Math.round(settings.fontSize * 0.82))}px`;
    this.translatedLine.style.fontSize = `${settings.fontSize}px`;
  }

  ensure() {
    if (this.overlay?.isConnected && this.originalLine?.isConnected && this.translatedLine?.isConnected) {
      this.updateHost();
      return this.overlay;
    }
    this.overlay = document.getElementById(OVERLAY_ID);
    if (!this.overlay) {
      this.overlay = document.createElement("div");
      this.overlay.id = OVERLAY_ID;
      this.overlay.setAttribute("aria-live", "polite");
      Object.assign(this.overlay.style, {
        position: "absolute",
        left: "0",
        top: "0",
        zIndex: "2147483647",
        width: "auto",
        display: "none",
        pointerEvents: "auto",
        fontFamily: "\"Helvetica Neue\", Arial, sans-serif",
        textAlign: "center",
        color: "#ffffff",
        textShadow: "0 2px 6px rgba(0, 0, 0, 0.95), 0 0 18px rgba(0, 0, 0, 0.8)"
      });

      this.card = document.createElement("div");
      Object.assign(this.card.style, {
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.3rem",
        width: "auto",
        maxWidth: "min(96vw, 100%)",
        boxSizing: "border-box",
        padding: "0.2rem 0.45rem",
        borderRadius: "14px",
        background: "rgba(0, 0, 0, 0.22)",
        pointerEvents: "auto",
        cursor: "grab",
        userSelect: "none",
        webkitUserSelect: "none",
        touchAction: "none"
      });

      this.originalLine = document.createElement("div");
      Object.assign(this.originalLine.style, {
        display: "none",
        fontSize: "clamp(20px, 2vw, 30px)",
        fontWeight: "700",
        lineHeight: "1.2",
        letterSpacing: "0.01em"
      });
      this.translatedLine = document.createElement("div");
      Object.assign(this.translatedLine.style, {
        display: "none",
        fontSize: "clamp(20px, 2vw, 30px)",
        fontWeight: "700",
        lineHeight: "1.2",
        letterSpacing: "0.01em",
        opacity: "1",
        whiteSpace: "pre-line"
      });
      this.card.addEventListener("pointerdown", this.handlePointerDown);
      this.card.append(this.translatedLine, this.originalLine);
      this.overlay.appendChild(this.card);
    } else {
      this.card = this.overlay.firstElementChild;
      this.translatedLine = this.card?.children[0] || null;
      this.originalLine = this.card?.children[1] || null;
    }
    this.applyStyleSettings();
    this.updateHost();
    return this.overlay;
  }

  getHost() {
    const overlayRoot = document.getElementById("overlay-root");
    if (overlayRoot instanceof HTMLElement) return overlayRoot;
    const video = document.querySelector("video");
    if (video?.parentElement instanceof HTMLElement) return video.parentElement;
    return document.body || document.documentElement;
  }

  ensureHostPosition(host) {
    if (!(host instanceof HTMLElement)) return;
    if (window.getComputedStyle(host).position === "static") {
      host.dataset.openStreamSubtitlesOverlayHost = "true";
      host.style.position = "relative";
    }
  }

  restoreHostPosition(host) {
    if (host instanceof HTMLElement && host.dataset.openStreamSubtitlesOverlayHost === "true") {
      host.style.position = "";
      delete host.dataset.openStreamSubtitlesOverlayHost;
    }
  }

  updateHost() {
    if (!this.overlay) return;
    const nextHost = this.getHost();
    if (!(nextHost instanceof HTMLElement)) return;
    this.ensureHostPosition(nextHost);
    if (this.host !== nextHost || !this.overlay.isConnected) {
      const previousHost = this.host;
      this.host = nextHost;
      this.host.appendChild(this.overlay);
      if (previousHost !== this.host) this.restoreHostPosition(previousHost);
      if (this.pinned) this.clampPosition();
    }
  }

  restoreNativeSubtitle() {
    if (this.hiddenSubtitleNode instanceof HTMLElement) {
      this.hiddenSubtitleNode.style.visibility = this.hiddenSubtitleOriginalVisibility;
      this.hiddenSubtitleNode.removeAttribute("data-localsubs-hidden");
    }
    this.hiddenSubtitleNode = null;
    this.hiddenSubtitleOriginalVisibility = "";
  }

  suppressNativeSubtitle() {
    const settings = this.getSettings();
    if (!settings.hideNativeSubtitles || !(this.subtitleNode instanceof HTMLElement)) {
      this.restoreNativeSubtitle();
      return false;
    }
    const node = this.subtitleNode;
    if (node === this.overlay || node.closest(`#${OVERLAY_ID}`)) return false;
    if (!isVisibleRect(node.getBoundingClientRect())) return false;
    if (this.hiddenSubtitleNode !== node) {
      this.restoreNativeSubtitle();
      this.hiddenSubtitleNode = node;
      this.hiddenSubtitleOriginalVisibility = node.style.visibility || "";
    }
    node.dataset.localsubsHidden = "true";
    node.style.visibility = "hidden";
    return isVisibleRect(node.getBoundingClientRect());
  }

  clampPosition() {
    if (!this.overlay || !this.host) return;
    const overlayRect = this.overlay.getBoundingClientRect();
    const hostRect = this.host.getBoundingClientRect();
    const minLeft = hostRect.width * 0.01;
    const minTop = 8;
    const maxLeft = Math.max(minLeft, hostRect.width - overlayRect.width - minLeft);
    const maxTop = Math.max(minTop, hostRect.height - overlayRect.height - 8);
    const left = Number.parseFloat(this.overlay.style.left || "0");
    const top = Number.parseFloat(this.overlay.style.top || "0");
    this.overlay.style.left = `${Math.min(Math.max(left, minLeft), maxLeft)}px`;
    this.overlay.style.top = `${Math.min(Math.max(top, minTop), maxTop)}px`;
  }

  applyPinnedPosition(clientX, clientY) {
    if (!this.overlay || !this.host) return;
    this.overlay.style.width = "auto";
    this.overlay.style.maxWidth = `${this.host.getBoundingClientRect().width * 0.98}px`;
    const hostRect = this.host.getBoundingClientRect();
    this.overlay.style.left = `${clientX - hostRect.left - this.dragOffsetX}px`;
    this.overlay.style.top = `${clientY - hostRect.top - this.dragOffsetY}px`;
    this.clampPosition();
  }

  handlePointerMove(event) {
    if (!this.dragging || event.pointerId !== this.dragPointerId) return;
    event.preventDefault();
    this.applyPinnedPosition(event.clientX, event.clientY);
  }

  finishDrag(event) {
    if (event.pointerId !== this.dragPointerId) return;
    this.dragging = false;
    this.dragPointerId = null;
    if (this.card) this.card.style.cursor = "grab";
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.finishDrag);
    window.removeEventListener("pointercancel", this.finishDrag);
  }

  handlePointerDown(event) {
    if (!this.overlay || !this.card) return;
    event.preventDefault();
    this.updateHost();
    const rect = this.overlay.getBoundingClientRect();
    this.dragPointerId = event.pointerId;
    this.dragOffsetX = event.clientX - rect.left;
    this.dragOffsetY = event.clientY - rect.top;
    this.pinned = true;
    this.dragging = true;
    this.card.style.cursor = "grabbing";
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.finishDrag);
    window.addEventListener("pointercancel", this.finishDrag);
  }

  position() {
    if (!this.overlay || !this.host) return;
    if (this.pinned) {
      this.clampPosition();
      return;
    }
    if (!(this.subtitleNode instanceof HTMLElement)) return;
    const subtitleRect = this.subtitleNode.getBoundingClientRect();
    const hostRect = this.host.getBoundingClientRect();
    if (!isVisibleRect(subtitleRect)) return;
    const targetLeft = subtitleRect.left - hostRect.left;
    const targetTop = subtitleRect.top - hostRect.top;
    Object.assign(this.overlay.style, {
      width: "auto",
      left: "0",
      top: "0",
      transform: "translate(0, 0)",
      maxWidth: `${hostRect.width * 0.98}px`
    });
    const overlayRect = this.overlay.getBoundingClientRect();
    const centeredLeft = targetLeft + subtitleRect.width / 2 - overlayRect.width / 2;
    const minLeft = hostRect.width * 0.01;
    const maxLeft = hostRect.width - overlayRect.width - minLeft;
    let top = targetTop + subtitleRect.height / 2 - overlayRect.height / 2;
    if (!this.getSettings().hideNativeSubtitles) {
      const shouldPlaceBelow = subtitleRect.top + subtitleRect.height / 2 <= window.innerHeight * 0.5;
      top = shouldPlaceBelow
        ? targetTop + subtitleRect.height + 3
        : targetTop - overlayRect.height - 3;
    }
    this.overlay.style.left = `${Math.min(Math.max(centeredLeft, minLeft), Math.max(minLeft, maxLeft))}px`;
    this.overlay.style.top = `${Math.min(Math.max(8, top), hostRect.height - overlayRect.height - 8)}px`;
  }

  setVisible(visible) {
    if (!visible && !this.overlay) return;
    (this.overlay || this.ensure()).style.display = visible ? "block" : "none";
  }

  isVisible() {
    return Boolean(this.overlay && this.overlay.style.display !== "none");
  }

  render(originalText, translatedText = "", showOriginal = false) {
    this.ensure();
    const original = showOriginal && originalText ? originalText : "";
    const translated = translatedText || "";
    this.card.style.visibility = "hidden";
    this.translatedLine.textContent = translated;
    this.translatedLine.style.display = translated ? "block" : "none";
    this.originalLine.textContent = original;
    this.originalLine.style.display = original ? "block" : "none";
    this.originalLine.style.opacity = translated ? "0.78" : "0.68";
    if (translated || original) {
      this.position();
      this.setVisible(true);
    } else {
      this.setVisible(false);
    }
    this.card.style.visibility = "visible";
  }

  clearLines() {
    this.ensure();
    this.card.style.visibility = "hidden";
    this.translatedLine.textContent = "";
    this.translatedLine.style.display = "none";
    this.originalLine.textContent = "";
    this.originalLine.style.display = "none";
    this.card.style.visibility = "visible";
  }

  enterPending(caption) {
    this.ensure();
    const settings = this.getSettings();
    if (settings.hideNativeSubtitles && caption) {
      this.suppressNativeSubtitle();
      this.clearLines();
      this.setVisible(false);
      return;
    }
    this.restoreNativeSubtitle();
    this.render(caption, "", settings.showPendingOriginalText);
  }

  enterTranslated(caption, translatedText) {
    if (!translatedText) {
      this.enterFallback();
      return;
    }
    const settings = this.getSettings();
    if (settings.hideNativeSubtitles && caption) this.suppressNativeSubtitle();
    else this.restoreNativeSubtitle();
    this.render(caption, translatedText, settings.hideNativeSubtitles || settings.showOriginalText);
  }

  enterFallback() {
    this.restoreNativeSubtitle();
    this.clearLines();
    this.setVisible(false);
  }
}
