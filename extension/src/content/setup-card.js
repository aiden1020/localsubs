const ROOT_ID = "localsubs-setup-card";

// What LocalSubs is doing or needs, in the player, in the settings language.
// {size} is the model download in MB; {detail} is an error message.
const STRINGS = Object.freeze({
  "zh-Hant": {
    close: "關閉",
    openSettings: "打開設定",
    showSetup: "查看安裝步驟",
    downloadingTitle: "正在下載翻譯模型",
    downloadingDetail: "只需要下載一次（約 {size} MB），完成後就會顯示雙語字幕。可以繼續看影片。",
    upgradingTitle: "正在下載新版翻譯模型",
    upgradingDetail: "約 {size} MB，完成後會移除舊版模型。可以繼續看影片。",
    preparingTitle: "正在載入翻譯模型",
    preparingDetail: "第一次載入需要一點時間，完成後就會顯示雙語字幕。",
    readyTitle: "雙語字幕準備好了",
    readyDetail: "",
    noGpuTitle: "這台電腦無法在瀏覽器中翻譯",
    noGpuDetail: "這個瀏覽器沒有可用的 WebGPU，需要安裝 LocalSubs 桌面元件。",
    nativePermissionTitle: "需要允許連接桌面元件",
    nativePermissionDetail: "到設定頁按「允許連接桌面元件」，就能用桌面元件翻譯。",
    unavailableTitle: "LocalSubs 目前無法翻譯",
    unavailableDetail: "{detail}",
    notEnglishTitle: "這部影片的字幕不是英文",
    notEnglishDetail: "LocalSubs 只翻譯英文字幕，這部影片會維持原本的字幕。",
    noCaptionsTitle: "這部影片沒有字幕",
    noCaptionsDetail: "LocalSubs 需要影片的英文字幕才能翻譯。"
  },
  en: {
    close: "Close",
    openSettings: "Open settings",
    showSetup: "See setup steps",
    downloadingTitle: "Downloading the translation model",
    downloadingDetail: "A one-time download of about {size} MB. Dual subtitles appear when it's done. Keep watching.",
    upgradingTitle: "Downloading the new translation model",
    upgradingDetail: "About {size} MB. The old model is removed when it's done. Keep watching.",
    preparingTitle: "Loading the translation model",
    preparingDetail: "The first load takes a moment. Dual subtitles appear when it's done.",
    readyTitle: "Dual subtitles are ready",
    readyDetail: "",
    noGpuTitle: "This computer can't translate in the browser",
    noGpuDetail: "This browser has no usable WebGPU. Install the LocalSubs desktop component.",
    nativePermissionTitle: "Allow the desktop component",
    nativePermissionDetail: "In settings, choose \"Allow desktop component\" to translate with it.",
    unavailableTitle: "LocalSubs can't translate right now",
    unavailableDetail: "{detail}",
    notEnglishTitle: "This video's captions aren't in English",
    notEnglishDetail: "LocalSubs only translates English captions, so this video keeps its own.",
    noCaptionsTitle: "This video has no captions",
    noCaptionsDetail: "LocalSubs needs the video's English captions to translate."
  }
});

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.card { width: min(340px, calc(100vw - 32px)); padding: 12px 14px; border: 1px solid rgba(255,255,255,.14); border-radius: 12px; background: rgba(16,16,18,.92); box-shadow: 0 14px 36px rgba(0,0,0,.42); backdrop-filter: blur(14px); color: #fff; font: 500 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif; }
.card[hidden] { display: none; }
.card.is-error { border-color: rgba(255,138,128,.55); }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.title { font-size: 14px; font-weight: 700; }
.percent { margin-left: 6px; color: #d9ff66; font-variant-numeric: tabular-nums; }
.close { flex: none; width: 24px; height: 24px; margin: -3px -6px 0 0; border: 0; border-radius: 6px; background: transparent; color: rgba(255,255,255,.7); font-size: 17px; line-height: 1; cursor: pointer; }
.close:hover, .close:focus-visible { background: rgba(255,255,255,.1); color: #fff; outline: none; }
.detail { margin: 4px 0 0; color: rgba(255,255,255,.72); }
.detail:empty { display: none; }
.bar { height: 6px; margin-top: 10px; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,.14); }
.bar[hidden] { display: none; }
.fill { height: 100%; width: 0; border-radius: inherit; background: #d9ff66; transition: width .4s ease; }
.bar.is-indeterminate .fill { width: 30%; animation: slide 1.4s ease-in-out infinite; }
@keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
@media (prefers-reduced-motion: reduce) { .bar.is-indeterminate .fill { animation: none; width: 100%; opacity: .45; } }
.action { margin-top: 10px; padding: 6px 12px; border: 0; border-radius: 8px; background: #d9ff66; color: #11120f; font: inherit; font-weight: 700; cursor: pointer; }
.action[hidden] { display: none; }
.action:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
`;

const ERROR_STATES = new Set(["noGpu", "nativePermission", "unavailable"]);

export class SetupCard {
  constructor({ getSettings, getHost, openOptions, document: doc = document, window: win = window }) {
    this.getSettings = getSettings;
    this.getHost = getHost;
    this.openOptions = openOptions;
    this.document = doc;
    this.window = win;
    this.root = null;
    this.host = null;
    this.state = null;
    this.options = {};
    this.dismissed = new Set();
    this.hideTimer = null;
  }

  t(key, vars = {}) {
    const language = this.getSettings().optionsLanguage === "en" ? "en" : "zh-Hant";
    return STRINGS[language][key].replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
  }

  build() {
    this.root = this.document.createElement("div");
    this.root.id = ROOT_ID;
    Object.assign(this.root.style, {
      position: "absolute",
      top: "16px",
      left: "16px",
      zIndex: "2147483647"
    });
    const shadow = this.root.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>${STYLE}</style>
      <div class="card" role="status" aria-live="polite" hidden>
        <div class="head">
          <div><span class="title"></span><span class="percent"></span></div>
          <button class="close" type="button">×</button>
        </div>
        <p class="detail"></p>
        <div class="bar" hidden><div class="fill"></div></div>
        <button class="action" type="button" hidden></button>
      </div>`;
    const $ = (selector) => shadow.querySelector(selector);
    this.card = $(".card");
    this.title = $(".title");
    this.percent = $(".percent");
    this.detail = $(".detail");
    this.bar = $(".bar");
    this.fill = $(".fill");
    this.action = $(".action");
    this.closeButton = $(".close");
    this.closeButton.addEventListener("click", () => {
      // Dismissed for this page: a later state (such as ready) still shows.
      if (this.state) this.dismissed.add(this.state);
      this.hide();
    });
    this.action.addEventListener("click", () => this.openOptions());
    // Keep player shortcuts and click-to-pause away from the card.
    for (const type of ["click", "dblclick", "pointerdown", "pointerup", "mousedown", "mouseup", "keydown", "keyup", "wheel"]) {
      this.root.addEventListener(type, (event) => event.stopPropagation());
    }
  }

  updateHost() {
    if (!this.root) return;
    const fullscreen = this.document.fullscreenElement;
    const nextHost = fullscreen instanceof HTMLElement && !fullscreen.contains(this.getHost())
      ? fullscreen
      : this.getHost();
    if (!(nextHost instanceof HTMLElement)) return;
    if (this.host !== nextHost || !this.root.isConnected) {
      this.host = nextHost;
      this.host.appendChild(this.root);
    }
  }

  // state: a key of STRINGS without its Title/Detail suffix. progress is 0-1,
  // or null for an indeterminate bar; leave it undefined for no bar.
  show(state, { progress, size, detail, autoHideMs = 0 } = {}) {
    if (this.window !== this.window.top || this.dismissed.has(state)) return;
    if (!this.root) this.build();
    this.updateHost();
    this.state = state;
    this.options = { progress, size, detail, autoHideMs };
    this.render();
    this.window.clearTimeout(this.hideTimer);
    if (autoHideMs > 0) {
      this.hideTimer = this.window.setTimeout(() => this.hide(), autoHideMs);
    }
  }

  render() {
    if (!this.card || !this.state) return;
    const { progress, size, detail } = this.options;
    const state = this.state;
    this.card.hidden = false;
    this.card.classList.toggle("is-error", ERROR_STATES.has(state));
    this.title.textContent = this.t(`${state}Title`);
    this.detail.textContent = this.t(`${state}Detail`, { size, detail });
    const hasBar = progress !== undefined;
    const known = Number.isFinite(progress);
    this.bar.hidden = !hasBar;
    this.bar.classList.toggle("is-indeterminate", hasBar && !known);
    this.fill.style.width = known ? `${Math.round(progress * 100)}%` : "";
    this.percent.textContent = known ? `${Math.round(progress * 100)}%` : "";
    const actionKey = state === "noGpu" ? "showSetup" : ERROR_STATES.has(state) ? "openSettings" : "";
    this.action.hidden = !actionKey;
    if (actionKey) this.action.textContent = this.t(actionKey);
    this.closeButton.setAttribute("aria-label", this.t("close"));
  }

  // Re-render in the current language after settings change.
  applySettings() {
    this.render();
  }

  isShowing(state) {
    return Boolean(this.card && !this.card.hidden && this.state === state);
  }

  hide() {
    this.window.clearTimeout(this.hideTimer);
    if (this.card) this.card.hidden = true;
    this.state = null;
  }
}
