import { MODEL_CATALOG, MODEL_TIERS, normalizeModelTier } from "../core/model-catalog.js";

const ROOT_ID = "localsubs-player-panel";
const IDLE_HIDE_MS = 3000;
const RANGE_WRITE_DELAY_MS = 250;

const STRINGS = Object.freeze({
  "zh-Hant": {
    open: "LocalSubs 設定",
    close: "關閉",
    translation: "翻譯",
    fontSize: "字幕大小",
    opacity: "字幕背景透明度",
    mode: "翻譯模式",
    fast: "流暢",
    quality: "精準",
    allSettings: "全部設定",
    switching: "正在切換…",
    switched: "已切換，下一句字幕開始使用。",
    notDownloaded: "這個模式的模型還沒下載。",
    download: "到設定頁下載",
    failed: "切換失敗，請到設定頁查看。"
  },
  en: {
    open: "LocalSubs settings",
    close: "Close",
    translation: "Translation",
    fontSize: "Subtitle size",
    opacity: "Subtitle background opacity",
    mode: "Translation mode",
    fast: "Fast",
    quality: "Quality",
    allSettings: "All settings",
    switching: "Switching…",
    switched: "Switched. It applies from the next subtitle.",
    notDownloaded: "This mode's model is not downloaded yet.",
    download: "Download in settings",
    failed: "Could not switch. Check settings for details.",
  }
});

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap { position: relative; font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif; color: #fff; }
.toggle { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 13px 0 10px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; background: rgba(12,12,14,.72); color: #fff; font: inherit; font-weight: 700; cursor: pointer; backdrop-filter: blur(12px); opacity: 0; transform: translateY(-4px); transition: opacity .2s ease, transform .2s ease; pointer-events: none; }
.wrap.visible .toggle, .wrap.open .toggle { opacity: 1; transform: none; pointer-events: auto; }
.toggle:hover, .toggle:focus-visible, .wrap.open .toggle { background: rgba(28,28,32,.88); outline: none; border-color: rgba(217,255,102,.6); }
.toggle svg { width: 18px; height: 18px; }
.panel { position: absolute; top: 44px; right: 0; width: 280px; padding: 14px; border: 1px solid rgba(255,255,255,.12); border-radius: 14px; background: rgba(16,16,18,.94); box-shadow: 0 18px 44px rgba(0,0,0,.45); backdrop-filter: blur(16px); }
.panel[hidden] { display: none; }
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.head strong { font-size: 14px; }
.close { width: 28px; height: 28px; border: 0; border-radius: 8px; background: transparent; color: rgba(255,255,255,.7); font-size: 18px; cursor: pointer; }
.close:hover, .close:focus-visible { background: rgba(255,255,255,.1); color: #fff; outline: none; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 2px; border-top: 1px solid rgba(255,255,255,.08); }
.row.stack { flex-direction: column; align-items: stretch; gap: 8px; }
.row label, .row .label { color: rgba(255,255,255,.86); }
.switch { appearance: none; position: relative; width: 38px; height: 22px; margin: 0; border-radius: 999px; background: rgba(255,255,255,.22); cursor: pointer; transition: background .15s ease; }
.switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .15s ease; }
.switch:checked { background: #c8f04f; }
.switch:checked::after { transform: translateX(16px); background: #11120f; }
.switch:focus-visible, input[type=range]:focus-visible, .seg button:focus-visible, .link:focus-visible { outline: 2px solid #d9ff66; outline-offset: 2px; }
.range { display: flex; align-items: center; gap: 10px; }
input[type=range] { flex: 1; accent-color: #d9ff66; }
output { width: 38px; text-align: right; color: rgba(255,255,255,.6); font-variant-numeric: tabular-nums; }
.seg { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 3px; border-radius: 10px; background: rgba(255,255,255,.08); }
.seg button { height: 30px; border: 0; border-radius: 8px; background: transparent; color: rgba(255,255,255,.75); font: inherit; font-weight: 700; cursor: pointer; }
.seg button[aria-checked=true] { background: #d9ff66; color: #11120f; }
.seg button:disabled { cursor: progress; }
.note { margin: 2px 0 0; color: rgba(255,255,255,.62); font-size: 12px; }
.note[hidden] { display: none; }
.link { display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; padding: 0; border: 0; background: none; color: #d9ff66; font: inherit; font-weight: 700; cursor: pointer; }
.link[hidden] { display: none; }
.foot { padding-top: 10px; border-top: 1px solid rgba(255,255,255,.08); }
`;

const ICON = `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="1.5" y="3.5" width="17" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="5" y="9" width="10" height="1.8" rx=".9" fill="currentColor"/><rect x="6.5" y="12" width="7" height="1.8" rx=".9" fill="#d9ff66"/></svg>`;

export class PlayerPanel {
  constructor({ getSettings, getHost, storage, sendMessage, document: doc = document, window: win = window }) {
    this.getSettings = getSettings;
    this.getHost = getHost;
    this.storage = storage;
    this.sendMessage = sendMessage;
    this.document = doc;
    this.window = win;
    this.root = null;
    this.shadow = null;
    this.host = null;
    this.hideTimer = null;
    this.rangeTimers = new Map();
    this.switching = false;
    this.hovering = false;
    this.handleActivity = this.handleActivity.bind(this);
    this.handlePointerOut = this.handlePointerOut.bind(this);
    this.handleOutsidePointer = this.handleOutsidePointer.bind(this);
  }

  t(key) {
    const language = this.getSettings().optionsLanguage === "en" ? "en" : "zh-Hant";
    return STRINGS[language][key];
  }

  ensure() {
    if (this.root?.isConnected) {
      this.updateHost();
      return this.root;
    }
    if (!this.root) this.build();
    this.updateHost();
    this.document.addEventListener("pointermove", this.handleActivity, { passive: true });
    this.document.addEventListener("mouseout", this.handlePointerOut, { passive: true });
    this.document.addEventListener("pointerdown", this.handleOutsidePointer, true);
    return this.root;
  }

  build() {
    this.root = this.document.createElement("div");
    this.root.id = ROOT_ID;
    Object.assign(this.root.style, {
      position: "absolute",
      top: "16px",
      right: "16px",
      zIndex: "2147483647"
    });
    this.shadow = this.root.attachShadow({ mode: "closed" });
    this.shadow.innerHTML = `
      <style>${STYLE}</style>
      <div class="wrap">
        <button class="toggle" type="button" aria-expanded="false" aria-controls="panel">${ICON}<span>LocalSubs</span></button>
        <div class="panel" id="panel" role="dialog" hidden>
          <div class="head"><strong>LocalSubs</strong><button class="close" type="button">×</button></div>
          <div class="row"><label for="translation" data-text="translation"></label><input class="switch" id="translation" type="checkbox" data-key="translationEnabled"></div>
          <div class="row stack"><label for="font" data-text="fontSize"></label><div class="range"><input id="font" type="range" min="16" max="42" step="1" data-key="fontSize"><output data-for="fontSize"></output></div></div>
          <div class="row stack"><label for="opacity" data-text="opacity"></label><div class="range"><input id="opacity" type="range" min="0" max="0.95" step="0.05" data-key="overlayBackgroundOpacity"><output data-for="overlayBackgroundOpacity"></output></div></div>
          <div class="row stack">
            <span class="label" id="mode-label" data-text="mode"></span>
            <div class="seg" role="radiogroup" aria-labelledby="mode-label">
              ${MODEL_TIERS.map((tier) => `<button type="button" role="radio" data-tier="${tier}" data-text="${tier}"></button>`).join("")}
            </div>
            <p class="note" hidden></p>
            <button class="link download" type="button" data-text="download" hidden></button>
          </div>
          <div class="foot"><button class="link settings" type="button"><span data-text="allSettings"></span> ↗</button></div>
        </div>
      </div>`;

    const $ = (selector) => this.shadow.querySelector(selector);
    this.wrap = $(".wrap");
    this.toggleButton = $(".toggle");
    this.panel = $(".panel");
    this.note = $(".note");
    this.downloadLink = $(".download");

    this.toggleButton.addEventListener("click", () => this.setOpen(this.panel.hidden));
    $(".close").addEventListener("click", () => this.setOpen(false));
    $(".settings").addEventListener("click", () => this.openOptions());
    this.downloadLink.addEventListener("click", () => this.openOptions());

    for (const input of this.shadow.querySelectorAll(".switch")) {
      input.addEventListener("change", () => this.write({ [input.dataset.key]: input.checked }));
    }
    for (const input of this.shadow.querySelectorAll("input[type=range]")) {
      input.addEventListener("input", () => {
        this.renderOutput(input.dataset.key, Number(input.value));
        this.scheduleRangeWrite(input.dataset.key, Number(input.value));
      });
    }
    for (const button of this.shadow.querySelectorAll(".seg button")) {
      button.addEventListener("click", () => void this.switchTier(button.dataset.tier));
    }

    // Keep player shortcuts and click-to-pause away from the panel.
    for (const type of ["keydown", "keyup", "keypress"]) {
      this.root.addEventListener(type, (event) => {
        if (type === "keydown" && event.key === "Escape" && !this.panel.hidden) {
          this.setOpen(false);
        }
        event.stopPropagation();
      });
    }
    for (const type of ["click", "dblclick", "pointerdown", "pointerup", "mousedown", "mouseup", "wheel"]) {
      this.root.addEventListener(type, (event) => event.stopPropagation());
    }
    this.root.addEventListener("pointerenter", () => { this.hovering = true; });
    this.root.addEventListener("pointerleave", () => {
      this.hovering = false;
      this.handleActivity();
    });

    this.applySettings();
  }

  updateHost() {
    if (!this.root) return;
    const nextHost = this.document.fullscreenElement instanceof HTMLElement
      && !this.document.fullscreenElement.contains(this.getHost())
      ? this.document.fullscreenElement
      : this.getHost();
    if (!(nextHost instanceof HTMLElement)) return;
    if (this.host !== nextHost || !this.root.isConnected) {
      this.host = nextHost;
      this.host.appendChild(this.root);
    }
  }

  applySettings() {
    if (!this.shadow) return;
    const settings = this.getSettings();
    for (const node of this.shadow.querySelectorAll("[data-text]")) {
      node.textContent = this.t(node.dataset.text);
    }
    this.toggleButton.setAttribute("aria-label", this.t("open"));
    this.shadow.querySelector(".close").setAttribute("aria-label", this.t("close"));
    for (const input of this.shadow.querySelectorAll(".switch")) {
      input.checked = Boolean(settings[input.dataset.key]);
    }
    for (const input of this.shadow.querySelectorAll("input[type=range]")) {
      if (this.rangeTimers.has(input.dataset.key)) continue;
      input.value = String(settings[input.dataset.key]);
      this.renderOutput(input.dataset.key, settings[input.dataset.key]);
    }
    const tier = normalizeModelTier(settings.modelTier);
    for (const button of this.shadow.querySelectorAll(".seg button")) {
      button.setAttribute("aria-checked", String(button.dataset.tier === tier));
      button.disabled = this.switching;
    }
  }

  renderOutput(key, value) {
    const output = this.shadow.querySelector(`output[data-for="${key}"]`);
    if (!output) return;
    output.textContent = key === "overlayBackgroundOpacity" ? `${Math.round(value * 100)}%` : `${value}px`;
  }

  // Fade with the player controls: show on pointer movement, hide after the
  // pointer rests or leaves the page. Hovering the button or panel keeps it.
  handleActivity() {
    if (!this.wrap) return;
    this.updateHost();
    this.wrap.classList.add("visible");
    this.window.clearTimeout(this.hideTimer);
    this.hideTimer = this.window.setTimeout(() => {
      if (!this.hovering) this.hide();
    }, IDLE_HIDE_MS);
  }

  handlePointerOut(event) {
    if (event.relatedTarget === null && !this.isOpen()) this.hide();
  }

  handleOutsidePointer(event) {
    if (this.isOpen() && !event.composedPath().includes(this.root)) this.setOpen(false);
  }

  hide() {
    if (!this.wrap) return;
    this.window.clearTimeout(this.hideTimer);
    if (this.isOpen()) this.setOpen(false, { restartTimer: false });
    this.releaseFocus();
    this.wrap.classList.remove("visible");
  }

  // Give the keyboard back to the player so its shortcuts keep working.
  releaseFocus() {
    const focused = this.shadow?.activeElement;
    if (focused instanceof HTMLElement) focused.blur();
  }

  setOpen(open, { restartTimer = true } = {}) {
    if (!this.panel) return;
    this.panel.hidden = !open;
    this.wrap.classList.toggle("open", open);
    this.toggleButton.setAttribute("aria-expanded", String(open));
    if (open) {
      this.applySettings();
      this.showNote("");
      return;
    }
    this.releaseFocus();
    if (restartTimer) this.handleActivity();
  }

  isOpen() {
    return Boolean(this.panel && !this.panel.hidden);
  }

  scheduleRangeWrite(key, value) {
    this.window.clearTimeout(this.rangeTimers.get(key));
    this.rangeTimers.set(key, this.window.setTimeout(() => {
      this.rangeTimers.delete(key);
      void this.write({ [key]: value });
    }, RANGE_WRITE_DELAY_MS));
  }

  async write(values) {
    await this.storage.set(values);
  }

  openOptions() {
    void this.sendMessage({ type: "OPEN_OPTIONS" });
  }

  showNote(text, { download = false } = {}) {
    this.note.textContent = text;
    this.note.hidden = !text;
    this.downloadLink.hidden = !download;
  }

  async tierReady(tier) {
    if (this.getSettings().inferenceBackend === "native") {
      const result = await this.sendMessage({ type: "LIST_HELPER_MODELS" });
      const entry = result?.models?.find((model) => model.channel === MODEL_CATALOG[tier].helperChannel);
      return entry?.state === "downloaded";
    }
    const result = await this.sendMessage({ type: "LIST_WEBLLM_MODELS" });
    return Boolean(result?.models?.find((model) => model.tier === tier)?.cached);
  }

  async switchTier(tier) {
    const next = normalizeModelTier(tier);
    if (this.switching || next === normalizeModelTier(this.getSettings().modelTier)) return;
    this.switching = true;
    this.applySettings();
    this.showNote(this.t("switching"));
    try {
      if (!(await this.tierReady(next))) {
        this.showNote(this.t("notDownloaded"), { download: true });
        return;
      }
      await this.write({ modelTier: next });
      await this.sendMessage({ type: "SET_MODEL_TIER", tier: next });
      if (this.getSettings().inferenceBackend === "native") {
        const selected = await this.sendMessage({
          type: "SELECT_HELPER_MODEL",
          channel: MODEL_CATALOG[next].helperChannel
        });
        if (!selected?.ok) throw new Error(selected?.error?.message || "selection failed");
      }
      this.showNote(this.t("switched"));
    } catch {
      this.showNote(this.t("failed"));
    } finally {
      this.switching = false;
      this.applySettings();
    }
  }
}
