import { DEFAULT_SETTINGS, migrateStoredSettings } from "./core/settings.js";
import {
  MODEL_CATALOG,
  MODEL_TIERS,
  normalizeModelTier,
  tierForHelperChannel
} from "./core/model-catalog.js";
import {
  SETUP_PLATFORM,
  detectSetupBrowser,
  detectSetupPlatform,
  getPlatformSetup
} from "./core/platform-setup.js";

const LEGACY_WEBLLM_APPROX_MB = 272;

const I18N = {
  "zh-Hant": {
    setupTitle: "設定",
    intro: "免費為 HBO Max 加入英文＋台灣繁中雙字幕，支援 macOS 與 Windows。",
    modelEyebrow: "翻譯模型",
    modelTitle: "選擇翻譯取向",
    modelPrivacy: "模型只會儲存在這台裝置，字幕不會上傳。",
    tierFastName: "速度優先",
    tierFastDesc: "反應快、佔用資源少，適合大多數裝置。",
    tierQualityName: "品質優先",
    tierQualityDesc: "翻譯更自然，建議搭配效能較強的 GPU 或 Apple Silicon Mac。",
    tierDefaultBadge: "預設",
    tierActive: "使用中",
    tierDownloadActivate: "下載並啟用",
    tierUse: "切換使用",
    tierRedownload: "重新下載",
    tierDownloading: "下載中…請保持此頁開啟",
    tierRemove: "移除",
    tierRemoveConfirm: "移除此模型檔案？之後仍可重新下載。",
    tierStateChecking: "正在確認狀態…",
    tierStateReady: "已下載",
    tierStateMissing: "尚未下載",
    tierStateCorrupt: "檔案不完整或不相符，請重新下載",
    tierStateDownloading: "下載並準備中",
    tierStateOutdated: "需要更新桌面元件才能使用此模型",
    tierStateUnavailable: "無法連接桌面元件",
    engineEyebrow: "執行位置",
    engineTitle: "在哪裡執行翻譯",
    engineBrowser: "瀏覽器",
    engineBrowserDetail: "免安裝，需要支援 WebGPU 的 GPU",
    engineDesktop: "桌面元件",
    engineDesktopDetail: "CPU 或 GPU 皆可，需另外安裝",
    hintGpuOk: "偵測到可用的 GPU，建議使用瀏覽器模式。",
    hintNoGpu: "這個瀏覽器沒有可用的 WebGPU，建議使用桌面元件。",
    hintDesktop: "桌面元件透過另行安裝的 LocalSubs 執行，可使用 CPU 或相容的 GPU。",
    upgradeModelTitle: "新版翻譯模型 Sotto 已推出",
    upgradeModelDetail: "升級後會移除舊版模型，釋放約 {size}。下載期間請保持此頁開啟。",
    upgradeModelDetailNoSize: "升級後會移除舊版模型。下載期間請保持此頁開啟。",
    upgradeAction: "升級模型",
    upgradeWorking: "升級中…",
    upgradeHelperTitle: "需要更新桌面元件",
    upgradeHelperDetail: "目前的桌面元件不支援新版模型。更新後回到這裡重新檢查。",
    recheck: "重新檢查",
    modelOperationFailed: "模型操作失敗",
    helperModelSelectionRestart: "已切換模型，正在重新啟動桌面元件。",
    detectingPlatform: "正在偵測作業系統...",
    platformWindows: "已偵測到 Windows。請在 PowerShell 執行以下指令。",
    platformMacOS: "已偵測到 macOS。請在 Terminal 執行以下指令。",
    platformUnsupported: "此平台尚未支援。LocalSubs 桌面元件目前支援 macOS 與 Windows 10/11 x64。",
    viewInstallGuide: "查看安裝說明",
    installRuntimeTitle: "安裝 LocalSubs 桌面元件",
    installRuntimeTextWindows: "透過 WinGet 安裝。字幕文字不會送到雲端。",
    installRuntimeTextMacOS: "透過 Homebrew 安裝。字幕文字不會送到雲端。",
    oneTimeSetupTitle: "設定桌面模式",
    oneTimeSetupTextWindows: "自動選擇可用的加速方式並連接目前的瀏覽器。模型可在上方選擇下載。",
    oneTimeSetupTextMacOS: "連接目前的瀏覽器。模型可在上方選擇下載。",
    copy: "Copy",
    copied: "Copied",
    checkService: "檢查是否可用",
    openSupportedSite: "開啟支援網站",
    preferencesEyebrow: "偏好設定",
    preferencesTitle: "字幕行為",
    enableTranslation: "啟用翻譯",
    replaceNativeSubtitles: "以雙語字幕取代原生字幕",
    fontSize: "字幕大小",
    overlayOpacity: "字幕背景透明度",
    showOriginalText: "顯示原文",
    advanced: "進階設定",
    showPendingOriginal: "翻譯時先顯示原文",
    translationContextWindow: "字幕上下文視窗",
    localContextSize: "本機上下文大小",
    translationCacheSize: "翻譯快取大小",
    saved: "已儲存",
    checkingLocalModel: "正在確認翻譯服務",
    warmingUpModel: "正在準備翻譯",
    waitingForHelper: "等待 LocalSubs 桌面元件回應",
    checking: "檢查中...",
    readyTitle: "可以開始使用",
    nativeTransport: "使用桌面模式",
    webllmTransport: "使用瀏覽器模式",
    modelDownloadRequired: "翻譯模型尚未下載",
    modelDownloadDetail: "在上方選擇模型並下載，或第一次播放字幕時自動下載。",
    modelCachedTitle: "翻譯模型已下載",
    modelCachedDetail: "播放影片時會自動準備。",
    modelDownloadingDetail: "正在下載模型，請保持此頁面開啟。",
    modelPreparingDetail: "下載已完成，正在準備第一次翻譯。",
    respondedIn: "回應時間",
    warmupResult: "測試結果",
    notRunningTitle: "翻譯服務尚未就緒",
    startThenCheck: "請完成模型下載或安裝步驟，再重新檢查。"
  },
  en: {
    setupTitle: "Setup",
    intro: "Free English and Traditional Chinese dual subtitles for HBO Max on macOS and Windows.",
    modelEyebrow: "Translation model",
    modelTitle: "Choose what matters most",
    modelPrivacy: "The model stays on this device and subtitles are never uploaded.",
    tierFastName: "Fast",
    tierFastDesc: "Quick responses and light on resources. Works on most devices.",
    tierQualityName: "Quality",
    tierQualityDesc: "More natural translations. Best with a capable GPU or an Apple Silicon Mac.",
    tierDefaultBadge: "Default",
    tierActive: "In use",
    tierDownloadActivate: "Download and use",
    tierUse: "Switch to this",
    tierRedownload: "Download again",
    tierDownloading: "Downloading… keep this page open",
    tierRemove: "Remove",
    tierRemoveConfirm: "Remove this model file? You can download it again later.",
    tierStateChecking: "Checking status…",
    tierStateReady: "Downloaded",
    tierStateMissing: "Not downloaded",
    tierStateCorrupt: "The file is incomplete or invalid. Download it again.",
    tierStateDownloading: "Downloading and preparing",
    tierStateOutdated: "Update the desktop component to use this model",
    tierStateUnavailable: "Can't reach the desktop component",
    engineEyebrow: "Where it runs",
    engineTitle: "Where to run translation",
    engineBrowser: "Browser",
    engineBrowserDetail: "No install. Needs a WebGPU-capable GPU",
    engineDesktop: "Desktop component",
    engineDesktopDetail: "Works with a CPU or GPU. Install required",
    hintGpuOk: "A compatible GPU was found. Browser mode is recommended.",
    hintNoGpu: "This browser has no usable WebGPU. The desktop component is recommended.",
    hintDesktop: "The separately installed LocalSubs component runs translation on a CPU or compatible GPU.",
    upgradeModelTitle: "New Sotto translation model available",
    upgradeModelDetail: "Upgrading removes the old model and frees about {size}. Keep this page open while it downloads.",
    upgradeModelDetailNoSize: "Upgrading removes the old model. Keep this page open while it downloads.",
    upgradeAction: "Upgrade model",
    upgradeWorking: "Upgrading…",
    upgradeHelperTitle: "Update the desktop component",
    upgradeHelperDetail: "The installed desktop component doesn't support the new models. Update it, then check again here.",
    recheck: "Check again",
    modelOperationFailed: "Model operation failed",
    helperModelSelectionRestart: "Model changed. Restarting the desktop component.",
    detectingPlatform: "Detecting your operating system...",
    platformWindows: "Windows detected. Run these commands in PowerShell.",
    platformMacOS: "macOS detected. Run these commands in Terminal.",
    platformUnsupported: "This platform is not supported yet. The LocalSubs desktop component currently supports macOS and Windows 10/11 x64.",
    viewInstallGuide: "View installation guide",
    installRuntimeTitle: "Install the LocalSubs desktop component",
    installRuntimeTextWindows: "Install with WinGet. Subtitle text is never sent to the cloud.",
    installRuntimeTextMacOS: "Install with Homebrew. Subtitle text is never sent to the cloud.",
    oneTimeSetupTitle: "Set up desktop mode",
    oneTimeSetupTextWindows: "Choose the best available acceleration and connect this browser. Choose models to download above.",
    oneTimeSetupTextMacOS: "Connect this browser. Choose models to download above.",
    copy: "Copy",
    copied: "Copied",
    checkService: "Check availability",
    openSupportedSite: "Open supported site",
    preferencesEyebrow: "Preferences",
    preferencesTitle: "Subtitle behavior",
    enableTranslation: "Enable translation",
    replaceNativeSubtitles: "Replace native subtitles with bilingual overlay",
    fontSize: "Font size",
    overlayOpacity: "Overlay background opacity",
    showOriginalText: "Show original text",
    advanced: "Advanced",
    showPendingOriginal: "Show original while translating",
    translationContextWindow: "Translation context window",
    localContextSize: "Local context size",
    translationCacheSize: "Translation cache size",
    saved: "Saved",
    checkingLocalModel: "Checking translation service",
    warmingUpModel: "Preparing translation",
    waitingForHelper: "Waiting for the LocalSubs desktop component",
    checking: "Checking...",
    readyTitle: "Ready to use",
    nativeTransport: "using desktop mode",
    webllmTransport: "using browser mode",
    modelDownloadRequired: "Translation model is not downloaded",
    modelDownloadDetail: "Choose and download a model above, or it downloads with the first subtitle.",
    modelCachedTitle: "Translation model is downloaded",
    modelCachedDetail: "It prepares automatically when playback starts.",
    modelDownloadingDetail: "Downloading the model. Keep this page open.",
    modelPreparingDetail: "Download complete. Preparing the first translation.",
    respondedIn: "Responded in",
    warmupResult: "Test result",
    notRunningTitle: "Translation service is not ready",
    startThenCheck: "Finish the model download or setup steps, then check again."
  }
};

const form = document.getElementById("settings-form");
const saveStatus = document.getElementById("save-status");
const statusPanel = document.getElementById("service-status");
const statusTitle = document.getElementById("service-status-title");
const statusDetail = document.getElementById("service-status-detail");
const checkServiceButton = document.getElementById("check-service");
const openSupportedSiteButton = document.getElementById("open-supported-site");
const platformStatusText = document.getElementById("platform-status-text");
const platformStatus = document.getElementById("platform-status");
const setupGrid = document.getElementById("setup-grid");
const unsupportedPlatform = document.getElementById("unsupported-platform");
const installRuntimeText = document.getElementById("install-runtime-text");
const oneTimeSetupText = document.getElementById("one-time-setup-text");
const installShellLabel = document.getElementById("install-shell-label");
const setupShellLabel = document.getElementById("setup-shell-label");
const installCommand = document.getElementById("install-command");
const setupCommand = document.getElementById("setup-command");
const tierList = document.getElementById("tier-list");
const engineHint = document.getElementById("engine-hint");
const engineButtons = [...document.querySelectorAll("[data-engine]")];
const upgradeBanner = document.getElementById("upgrade-banner");
const upgradeTitle = document.getElementById("upgrade-title");
const upgradeDetail = document.getElementById("upgrade-detail");
const upgradeAction = document.getElementById("upgrade-action");
const upgradeCommandBlock = document.getElementById("upgrade-command-block");
const upgradeCommand = document.getElementById("upgrade-command");
const upgradeShellLabel = document.getElementById("upgrade-shell-label");

const fields = {
  translationEnabled: document.getElementById("translation-enabled"),
  hideNativeSubtitles: document.getElementById("hide-native-subtitles"),
  showPendingOriginalText: document.getElementById("show-pending-original-text"),
  showOriginalText: document.getElementById("show-original-text"),
  fontSize: document.getElementById("font-size"),
  overlayBackgroundOpacity: document.getElementById("overlay-background-opacity"),
  translationContextWindow: document.getElementById("translation-context-window"),
  localTranslatorCtxSize: document.getElementById("local-translator-ctx-size"),
  translationCacheLimit: document.getElementById("translation-cache-limit")
};

const outputs = {
  fontSize: document.getElementById("font-size-value"),
  overlayBackgroundOpacity: document.getElementById("overlay-background-opacity-value"),
  translationContextWindow: document.getElementById("translation-context-window-value"),
  localTranslatorCtxSize: document.getElementById("local-translator-ctx-size-value"),
  translationCacheLimit: document.getElementById("translation-cache-limit-value")
};

const UPGRADE_COMMANDS = {
  [SETUP_PLATFORM.MACOS]: { shell: "Terminal", command: "brew update && brew upgrade localsubs" },
  [SETUP_PLATFORM.WINDOWS]: {
    shell: "PowerShell",
    command: "winget upgrade --id Aiden1020.LocalSubs --exact"
  }
};

let saveTimer = null;
let currentLanguage = DEFAULT_SETTINGS.optionsLanguage;
let currentSettings = { ...DEFAULT_SETTINGS };
let setupEnvironment = null;
let gpuSupport = null;
let helperInfo = { loaded: false, error: false, models: [], legacy: null };
let webllmInfo = { loaded: false, models: [], legacyCached: false };
let busy = null; // { tier, progress }
let refreshToken = 0;

function t(key) {
  return I18N[currentLanguage]?.[key] || I18N.en[key] || key;
}

function tierText(tier, part) {
  return t(`tier${tier === "quality" ? "Quality" : "Fast"}${part}`);
}

function formatModelSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "";
  if (sizeBytes >= 1024 ** 3) return `${(sizeBytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(sizeBytes / 1024 ** 2)} MB`;
}

function nativeSelected() {
  return currentSettings.inferenceBackend === "native";
}

// A helper that predates a catalog tier cannot serve it at all (`missing`). One
// that still serves a retired model under the same channel works but should be
// updated (`stale`).
function helperEntryFor(tier) {
  const catalog = MODEL_CATALOG[tier];
  const entry = helperInfo.models.find((model) => model.channel === catalog.helperChannel);
  if (!entry) return { entry: null, missing: true, stale: false };
  return { entry, missing: false, stale: Boolean(entry.id) && entry.id !== catalog.helperModelId };
}

function tierStatus(tier) {
  const active = currentSettings.modelTier === tier;
  const base = { tier, active, sizeText: "", entry: null };
  if (busy?.tier === tier) return { ...base, kind: "downloading", sizeText: sizeLabel(tier) };

  if (nativeSelected()) {
    if (!helperInfo.loaded) return { ...base, kind: "checking" };
    if (helperInfo.error) return { ...base, kind: "unavailable" };
    const { entry, missing } = helperEntryFor(tier);
    if (missing) return { ...base, kind: "outdated" };
    const sizeText = formatModelSize(entry.sizeBytes);
    if (entry.state === "downloaded") return { ...base, kind: "downloaded", entry, sizeText };
    if (entry.state === "corrupt") return { ...base, kind: "corrupt", entry, sizeText };
    return { ...base, kind: "missing", entry, sizeText };
  }

  if (!webllmInfo.loaded) return { ...base, kind: "checking" };
  const model = webllmInfo.models.find((item) => item.tier === tier);
  const sizeText = `${MODEL_CATALOG[tier].webllm.downloadMB} MB`;
  return { ...base, kind: model?.cached ? "downloaded" : "missing", sizeText };
}

function sizeLabel(tier) {
  if (nativeSelected()) {
    return formatModelSize(helperInfo.models.find((m) => m.channel === MODEL_CATALOG[tier].helperChannel)?.sizeBytes);
  }
  return `${MODEL_CATALOG[tier].webllm.downloadMB} MB`;
}

function makeButton(className, label, onClick, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", onClick);
  return button;
}

function renderTierCard(tier) {
  const status = tierStatus(tier);
  const catalog = MODEL_CATALOG[tier];
  const card = document.createElement("article");
  card.className = "tier-card";
  card.dataset.tier = tier;
  card.classList.toggle("is-active", status.active && status.kind === "downloaded");

  const header = document.createElement("div");
  header.className = "tier-card-header";
  const title = document.createElement("h3");
  title.textContent = tierText(tier, "Name");
  header.append(title);
  if (tier === "fast") {
    const badge = document.createElement("span");
    badge.className = "tier-badge";
    badge.textContent = t("tierDefaultBadge");
    header.append(badge);
  }

  const description = document.createElement("p");
  description.textContent = tierText(tier, "Desc");
  const meta = document.createElement("p");
  meta.className = "tier-meta";
  meta.textContent = [catalog.name, status.sizeText].filter(Boolean).join(" · ");

  const state = document.createElement("p");
  state.className = "tier-state";
  const stateKeys = {
    checking: "tierStateChecking",
    downloaded: "tierStateReady",
    missing: "tierStateMissing",
    corrupt: "tierStateCorrupt",
    downloading: "tierStateDownloading",
    outdated: "tierStateOutdated",
    unavailable: "tierStateUnavailable"
  };
  state.textContent = t(stateKeys[status.kind]);
  state.classList.toggle("is-ready", status.kind === "downloaded");
  state.classList.toggle("is-error", ["corrupt", "unavailable", "outdated"].includes(status.kind));

  card.append(header, description, meta, state);

  if (status.kind === "downloading") {
    const progress = document.createElement("progress");
    progress.className = "tier-progress";
    progress.max = 100;
    if (Number.isFinite(busy?.progress)) progress.value = Math.round(busy.progress);
    card.append(progress);
  }

  const actions = document.createElement("div");
  actions.className = "tier-actions";
  const locked = busy !== null;
  if (status.kind === "downloaded") {
    if (status.active) {
      const current = document.createElement("span");
      current.className = "tier-state is-ready";
      current.textContent = t("tierActive");
      actions.append(current);
    } else {
      actions.append(makeButton("secondary-button", t("tierUse"), () => void activateTier(tier), locked));
    }
    if (nativeSelected() && status.entry?.canRemove && !status.active) {
      actions.append(makeButton("tier-remove", t("tierRemove"), () => void removeNativeTier(tier), locked));
    }
  } else if (status.kind === "missing" || status.kind === "corrupt") {
    const label = status.kind === "corrupt" ? t("tierRedownload") : t("tierDownloadActivate");
    actions.append(makeButton("primary-button", label, () => void activateTier(tier), locked));
  } else if (status.kind === "downloading") {
    actions.append(makeButton("secondary-button", t("tierDownloading"), () => {}, true));
  }
  if (actions.childElementCount > 0) card.append(actions);
  return card;
}

function renderTiers() {
  tierList.replaceChildren(...MODEL_TIERS.map(renderTierCard));
}

function renderEngine() {
  const native = nativeSelected();
  for (const button of engineButtons) {
    button.setAttribute("aria-checked", String(button.dataset.engine === (native ? "native" : "webllm")));
  }
  if (native) {
    engineHint.textContent = t("hintDesktop");
  } else if (gpuSupport === false) {
    engineHint.textContent = t("hintNoGpu");
  } else if (gpuSupport === true) {
    engineHint.textContent = t("hintGpuOk");
  } else {
    engineHint.textContent = "";
  }
  const needsSetup = native && helperInfo.loaded && helperInfo.error;
  platformStatus.hidden = !needsSetup;
  if (!needsSetup) {
    setupGrid.hidden = true;
    unsupportedPlatform.hidden = true;
  } else if (setupEnvironment) {
    applyPlatform(setupEnvironment);
  }
}

function currentUpgrade() {
  const status = tierStatus(currentSettings.modelTier);
  if (nativeSelected()) {
    if (!helperInfo.loaded || helperInfo.error) return null;
    if (MODEL_TIERS.some((tier) => {
      const { missing, stale } = helperEntryFor(tier);
      return missing || stale;
    })) return { kind: "helper" };
    if (helperInfo.legacy && ["missing", "corrupt", "downloading"].includes(status.kind)) {
      return { kind: "model", sizeBytes: helperInfo.legacy.sizeBytes };
    }
    return null;
  }
  if (webllmInfo.loaded && webllmInfo.legacyCached && ["missing", "downloading"].includes(status.kind)) {
    return { kind: "model", sizeBytes: LEGACY_WEBLLM_APPROX_MB * 1024 ** 2 };
  }
  return null;
}

function renderUpgrade() {
  const upgrade = currentUpgrade();
  upgradeBanner.hidden = upgrade === null;
  if (!upgrade) return;
  const isHelper = upgrade.kind === "helper";
  upgradeTitle.textContent = t(isHelper ? "upgradeHelperTitle" : "upgradeModelTitle");
  const size = formatModelSize(upgrade.sizeBytes);
  upgradeDetail.textContent = isHelper
    ? t("upgradeHelperDetail")
    : size
      ? t("upgradeModelDetail").replace("{size}", size)
      : t("upgradeModelDetailNoSize");
  const commandInfo = UPGRADE_COMMANDS[setupEnvironment?.platform];
  upgradeCommandBlock.hidden = !(isHelper && commandInfo);
  if (isHelper && commandInfo) {
    upgradeShellLabel.textContent = commandInfo.shell;
    upgradeCommand.textContent = commandInfo.command;
  }
  upgradeAction.textContent = busy ? t("upgradeWorking") : t(isHelper ? "recheck" : "upgradeAction");
  upgradeAction.disabled = busy !== null;
  upgradeAction.onclick = isHelper
    ? () => void refreshModels()
    : () => void activateTier(currentSettings.modelTier);
}

function renderAll() {
  renderUpgrade();
  renderTiers();
  renderEngine();
}

function applyLanguage(language) {
  currentLanguage = language in I18N ? language : DEFAULT_SETTINGS.optionsLanguage;
  document.documentElement.lang = currentLanguage;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.language === currentLanguage);
  });
  renderAll();
}

function applyPlatform({ platform, browser }) {
  const setup = getPlatformSetup(platform, browser);
  if (!setup) {
    platformStatusText.dataset.i18n = "platformUnsupported";
    setupGrid.hidden = true;
    unsupportedPlatform.hidden = false;
    platformStatusText.textContent = t("platformUnsupported");
    return;
  }

  platformStatusText.dataset.i18n = setup.platformTextKey;
  installRuntimeText.dataset.i18n = setup.installTextKey;
  oneTimeSetupText.dataset.i18n = setup.setupTextKey;
  platformStatusText.textContent = t(setup.platformTextKey);
  installRuntimeText.textContent = t(setup.installTextKey);
  oneTimeSetupText.textContent = t(setup.setupTextKey);
  installShellLabel.textContent = setup.shellLabel;
  setupShellLabel.textContent = setup.shellLabel;
  installCommand.textContent = setup.installCommand;
  setupCommand.textContent = setup.setupCommand;
  unsupportedPlatform.hidden = true;
  setupGrid.hidden = false;
}

async function resolveSetupEnvironment() {
  try {
    const platformInfo = await chrome.runtime.getPlatformInfo();
    return {
      platform: detectSetupPlatform(platformInfo, navigator),
      browser: detectSetupBrowser(navigator)
    };
  } catch {
    return {
      platform: detectSetupPlatform({}, navigator),
      browser: detectSetupBrowser(navigator)
    };
  }
}

async function detectWebGPU() {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    return Boolean(adapter?.features?.has("shader-f16"));
  } catch {
    return false;
  }
}

function setServiceStatus(state, title, detail) {
  statusPanel.classList.remove("is-ready", "is-error", "is-checking", "is-idle");
  statusPanel.classList.add(`is-${state}`);
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}

function flashSavedStatus(message = t("saved")) {
  saveStatus.textContent = message;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveStatus.textContent = "";
  }, 1600);
}

async function persistTier(tier) {
  currentSettings.modelTier = normalizeModelTier(tier);
  await chrome.storage.sync.set({ modelTier: currentSettings.modelTier });
  await chrome.runtime.sendMessage({ type: "SET_MODEL_TIER", tier: currentSettings.modelTier });
}

async function refreshHelperModels(token) {
  let next;
  try {
    const result = await chrome.runtime.sendMessage({ type: "LIST_HELPER_MODELS" });
    if (!result?.ok || !Array.isArray(result.models)) throw new Error("unavailable");
    next = { loaded: true, error: false, models: result.models, legacy: result.legacy || null };
  } catch {
    next = { loaded: true, error: true, models: [], legacy: null };
  }
  if (token !== refreshToken) return;
  helperInfo = next;
  const selected = next.models.find((model) => model.selected);
  if (selected) {
    const tier = tierForHelperChannel(selected.channel);
    if (tier !== currentSettings.modelTier) await persistTier(tier);
  }
}

async function refreshWebllmModels(token) {
  let next;
  try {
    const result = await chrome.runtime.sendMessage({ type: "LIST_WEBLLM_MODELS" });
    if (!result?.ok || !Array.isArray(result.models)) throw new Error("unavailable");
    next = { loaded: true, models: result.models, legacyCached: webllmInfo.legacyCached };
  } catch {
    next = { loaded: true, models: [], legacyCached: false };
  }
  if (token !== refreshToken) return;
  webllmInfo = next;
}

async function refreshModels() {
  const token = ++refreshToken;
  if (nativeSelected()) {
    helperInfo = { ...helperInfo, loaded: false };
  } else {
    webllmInfo = { ...webllmInfo, loaded: false };
  }
  renderAll();
  await (nativeSelected() ? refreshHelperModels(token) : refreshWebllmModels(token));
  if (token === refreshToken) renderAll();
}

async function removeNativeTier(tier) {
  if (busy || !window.confirm(t("tierRemoveConfirm"))) return;
  try {
    const result = await chrome.runtime.sendMessage({
      type: "REMOVE_HELPER_MODEL",
      channel: MODEL_CATALOG[tier].helperChannel
    });
    if (!result?.ok) throw new Error(result?.error?.message || t("modelOperationFailed"));
    flashSavedStatus();
  } catch (error) {
    setServiceStatus("error", t("modelOperationFailed"), error instanceof Error ? error.message : t("modelOperationFailed"));
  }
  await refreshModels();
}

async function activateNativeTier(tier) {
  const channel = MODEL_CATALOG[tier].helperChannel;
  const { entry } = helperEntryFor(tier);
  if (entry?.state !== "downloaded") {
    const downloaded = await chrome.runtime.sendMessage({ type: "DOWNLOAD_HELPER_MODEL", channel });
    if (!downloaded?.ok) throw new Error(downloaded?.error?.message || t("modelOperationFailed"));
  }
  const selected = await chrome.runtime.sendMessage({ type: "SELECT_HELPER_MODEL", channel });
  if (!selected?.ok) throw new Error(selected?.error?.message || t("modelOperationFailed"));
  if (selected.restartRequired) {
    setServiceStatus("checking", t("checkingLocalModel"), t("helperModelSelectionRestart"));
  }
}

async function activateTier(tier) {
  if (busy) return;
  busy = { tier, progress: null };
  renderAll();
  try {
    await persistTier(tier);
    if (nativeSelected()) {
      await activateNativeTier(tier);
      await checkService();
    } else {
      await checkService({ warmup: true });
    }
    flashSavedStatus();
  } catch (error) {
    setServiceStatus("error", t("modelOperationFailed"), error instanceof Error ? error.message : t("modelOperationFailed"));
  } finally {
    busy = null;
    await refreshModels();
  }
}

async function selectEngine(engine) {
  const next = engine === "native" ? "native" : "webllm";
  if (next === currentSettings.inferenceBackend || busy) return;
  currentSettings.inferenceBackend = next;
  webllmInfo = { ...webllmInfo, legacyCached: false };
  await chrome.storage.sync.set({ inferenceBackend: next });
  await chrome.runtime.sendMessage({ type: "SET_INFERENCE_BACKEND", backend: next });
  flashSavedStatus();
  renderAll();
  await refreshModels();
  void checkService();
}

function updateOutputs(settings) {
  outputs.fontSize.textContent = `${settings.fontSize}px`;
  outputs.overlayBackgroundOpacity.textContent = `${Math.round(settings.overlayBackgroundOpacity * 100)}%`;
  outputs.translationContextWindow.textContent = `${settings.translationContextWindow}`;
  outputs.localTranslatorCtxSize.textContent = `${settings.localTranslatorCtxSize}`;
  outputs.translationCacheLimit.textContent = `${settings.translationCacheLimit}`;
}

function readFormSettings() {
  return {
    translationEnabled: fields.translationEnabled.checked,
    hideNativeSubtitles: fields.hideNativeSubtitles.checked,
    showPendingOriginalText: fields.showPendingOriginalText.checked,
    showOriginalText: fields.showOriginalText.checked,
    targetLanguage: DEFAULT_SETTINGS.targetLanguage,
    fontSize: Number.parseInt(fields.fontSize.value, 10),
    overlayBackgroundOpacity: Number.parseFloat(fields.overlayBackgroundOpacity.value),
    translationContextWindow: Number.parseInt(fields.translationContextWindow.value, 10),
    localTranslatorCtxSize: Number.parseInt(fields.localTranslatorCtxSize.value, 10),
    translationCacheLimit: Number.parseInt(fields.translationCacheLimit.value, 10)
  };
}

function applySettingsToForm(settings) {
  fields.translationEnabled.checked = settings.translationEnabled;
  fields.hideNativeSubtitles.checked = settings.hideNativeSubtitles;
  fields.showPendingOriginalText.checked = settings.showPendingOriginalText;
  fields.showOriginalText.checked = settings.showOriginalText;
  fields.fontSize.value = `${settings.fontSize}`;
  fields.overlayBackgroundOpacity.value = `${settings.overlayBackgroundOpacity}`;
  fields.translationContextWindow.value = `${settings.translationContextWindow}`;
  fields.localTranslatorCtxSize.value = `${settings.localTranslatorCtxSize}`;
  fields.translationCacheLimit.value = `${settings.translationCacheLimit}`;
  updateOutputs(settings);
  renderAll();
}

async function loadSettings() {
  const syncKeys = Object.keys(DEFAULT_SETTINGS).filter((key) => key !== "helperModelChannel");
  const [stored, localSettings] = await Promise.all([
    chrome.storage.sync.get(syncKeys),
    chrome.storage.local.get({ helperModelChannel: "stable" })
  ]);
  currentSettings = migrateStoredSettings({ ...stored, ...localSettings });
  applyLanguage(currentSettings.optionsLanguage);
  applySettingsToForm(currentSettings);
  await chrome.storage.sync.set({
    targetLanguage: DEFAULT_SETTINGS.targetLanguage,
    modelTier: currentSettings.modelTier
  });
}

async function saveSettings() {
  const settings = readFormSettings();
  currentSettings = { ...currentSettings, ...settings };
  updateOutputs(currentSettings);
  await chrome.storage.sync.set(settings);
  flashSavedStatus();
}

let activeCheckAbort = null;

function noteCheckResult(result) {
  if (result?.transport !== "webllm") return;
  if (typeof result.legacyCached === "boolean") {
    webllmInfo = { ...webllmInfo, legacyCached: result.legacyCached };
  }
}

// Resolves when the check (including model loading) finishes or is superseded.
function checkService({ warmup = false } = {}) {
  if (activeCheckAbort) activeCheckAbort.abort();
  const abort = new AbortController();
  activeCheckAbort = abort;

  checkServiceButton.disabled = true;
  checkServiceButton.textContent = t("checking");
  setServiceStatus(
    "checking",
    warmup ? t("warmingUpModel") : t("checkingLocalModel"),
    nativeSelected() ? t("waitingForHelper") : t("checking")
  );

  return new Promise((resolve) => {
    const finish = () => {
      if (activeCheckAbort === abort) activeCheckAbort = null;
      checkServiceButton.disabled = false;
      checkServiceButton.textContent = t("checkService");
      resolve();
    };

    const poll = async () => {
      if (abort.signal.aborted) { finish(); return; }

      let result;
      let progressTimer;
      try {
        const request = chrome.runtime.sendMessage({ type: "CHECK_TRANSLATOR", warmup });
        if (warmup && !nativeSelected()) {
          progressTimer = window.setInterval(async () => {
            const loading = await chrome.runtime.sendMessage({
              type: "CHECK_TRANSLATOR",
              warmup: false
            }).catch(() => null);
            if (!abort.signal.aborted && loading?.loading) {
              if (busy) {
                busy.progress = Number.isFinite(loading.progress) ? loading.progress * 100 : null;
                renderTiers();
              }
              const percent = Number.isFinite(loading.progress)
                ? ` ${Math.round(loading.progress * 100)}%`
                : "";
              setServiceStatus(
                "checking",
                t("warmingUpModel"),
                `${t(loading.cached ? "modelPreparingDetail" : "modelDownloadingDetail")}${percent}`
              );
            }
          }, 1000);
        }
        result = await request;
      } catch (err) {
        if (!abort.signal.aborted) {
          setServiceStatus("error", t("notRunningTitle"), err instanceof Error ? err.message : t("startThenCheck"));
        }
        finish();
        return;
      } finally {
        window.clearInterval(progressTimer);
      }

      if (abort.signal.aborted) { finish(); return; }

      noteCheckResult(result);

      if (result?.loading) {
        const percent = Number.isFinite(result.progress) ? ` ${Math.round(result.progress * 100)}%` : "";
        const loadingDetail = result.cached ? t("modelPreparingDetail") : t("modelDownloadingDetail");
        setServiceStatus("checking", t("checkingLocalModel"), `${loadingDetail}${percent}`);
        setTimeout(poll, 2000);
        return;
      }

      if (result?.ok) {
        const warmupText = result.translation ? ` ${t("warmupResult")}: ${result.translation}` : "";
        const transportText = result.transport === "webllm" ? t("webllmTransport") : t("nativeTransport");
        setServiceStatus("ready", t("readyTitle"), `${t("respondedIn")} ${result.latencyMs || 0} ms ${transportText}.${warmupText}`);
      } else if (result?.needsDownload) {
        setServiceStatus("idle", t("modelDownloadRequired"), t("modelDownloadDetail"));
      } else if (result?.needsInitialization) {
        setServiceStatus("idle", t("modelCachedTitle"), t("modelCachedDetail"));
      } else {
        const errorMessage = typeof result?.error === "object" ? result.error.message : result?.error;
        setServiceStatus("error", t("notRunningTitle"), errorMessage || t("startThenCheck"));
      }
      renderUpgrade();
      finish();
    };

    poll();
  });
}

async function copyCommand(targetId, button) {
  const command = document.getElementById(targetId)?.textContent.trim();
  if (!command) {
    return;
  }

  await navigator.clipboard.writeText(command);
  const originalLabel = button.textContent;
  button.textContent = t("copied");
  window.setTimeout(() => {
    button.textContent = originalLabel;
  }, 1200);
}

form.addEventListener("input", () => {
  void saveSettings();
});

for (const button of engineButtons) {
  button.addEventListener("click", () => {
    void selectEngine(button.dataset.engine);
  });
}

document.querySelectorAll("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", () => {
    void copyCommand(button.dataset.copyTarget, button);
  });
});

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", async () => {
    applyLanguage(button.dataset.language);
    currentSettings.optionsLanguage = currentLanguage;
    await chrome.storage.sync.set({ optionsLanguage: currentLanguage });
  });
});

checkServiceButton.addEventListener("click", () => {
  void checkService();
});

openSupportedSiteButton.addEventListener("click", () => {
  window.open("https://www.hbomax.com/", "_blank", "noopener");
});

applyLanguage(DEFAULT_SETTINGS.optionsLanguage);

void resolveSetupEnvironment().then((environment) => {
  setupEnvironment = environment;
  renderAll();
});

void detectWebGPU().then((supported) => {
  gpuSupport = supported;
  renderEngine();
});

void loadSettings().then(async () => {
  await Promise.all([refreshModels(), checkService()]);
  await refreshModels();
});
