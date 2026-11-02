import { DEFAULT_SETTINGS, LEGACY_SETTING_KEYS, migrateStoredSettings } from "./core/settings.js";
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
import { SUPPORTED_SITES } from "./core/supported-sites.js";

const LEGACY_WEBLLM_APPROX_MB = 272;

const I18N = {
  "zh-Hant": {
    setupTitle: "設定",
    intro: "為串流影片加入英文＋台灣繁中雙字幕，支援 macOS 與 Windows。",
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
    tierRemove: "解除安裝",
    tierRemoveConfirm: "解除安裝「{name}」模型？之後仍可重新下載。",
    tierRemoveActiveConfirm: "解除安裝目前使用中的「{name}」模型？下次播放字幕時會重新下載。",
    tierRemoved: "已解除安裝",
    tierStateChecking: "正在確認狀態…",
    tierStateReady: "已下載",
    tierStateMissing: "尚未下載",
    tierStateCorrupt: "檔案不完整或不相符，請重新下載",
    tierStateDownloading: "下載並準備中",
    tierStateOutdated: "需要更新桌面元件才能使用此模型",
    tierStateUnavailable: "無法連接桌面元件",
    engineUsingDesktop: "目前使用桌面元件",
    engineDesktopNotConnected: "已選擇桌面元件，尚未連接",
    desktopAdvancedTitle: "使用桌面元件（進階）",
    desktopRequiredTitle: "這台電腦無法在瀏覽器中翻譯",
    desktopRequiredDetail: "這個瀏覽器沒有可用的 WebGPU，需要安裝 LocalSubs 桌面元件，改用 CPU 或顯示卡翻譯。照下面的步驟安裝後，選擇「桌面元件」並允許連接。",
    needsPermission: "需要授權",
    useDesktop: "安裝好了，改用桌面元件",
    desktopRequiredStatus: "請照下方步驟安裝 LocalSubs 桌面元件。",
    modelEngineDesktop: "以下模型由桌面元件執行，下載到這台電腦的 LocalSubs 資料夾。",
    engineBrowser: "瀏覽器",
    engineBrowserDetail: "免安裝，需要支援 WebGPU 的 GPU",
    engineDesktop: "桌面元件",
    engineDesktopDetail: "CPU 或 GPU 皆可，需另外安裝",
    hintDesktop: "翻譯在另外安裝的 LocalSubs 桌面元件中執行，可使用 CPU 或相容的 GPU。",
    hintDesktopNoPermission: "還沒允許 LocalSubs 與桌面元件連接，所以目前無法翻譯。",
    desktopIntro: "瀏覽器無法使用 WebGPU，或想用 NVIDIA 顯示卡加速時，可以改用桌面元件。需要另外安裝，並允許 LocalSubs 與它通訊。",
    nativePermissionTitle: "需要允許連接桌面元件",
    nativePermissionDetail: "LocalSubs 需要你允許它與桌面元件通訊，才能用桌面元件翻譯。",
    nativePermissionGrant: "允許連接桌面元件",
    nativePermissionDenied: "未允許連接桌面元件，繼續使用瀏覽器翻譯。",
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
    watchSetupVideo: "觀看安裝教學影片",
    installRuntimeTitle: "安裝 LocalSubs 桌面元件",
    installRuntimeTextWindows: "透過 WinGet 安裝。字幕文字不會送到雲端。",
    installRuntimeTextMacOS: "透過 Homebrew 安裝。字幕文字不會送到雲端。",
    oneTimeSetupTitle: "設定桌面模式",
    oneTimeSetupTextWindows: "自動選擇可用的加速方式並連接目前的瀏覽器。模型可在下方選擇下載。",
    oneTimeSetupTextMacOS: "連接目前的瀏覽器。模型可在下方選擇下載。",
    copy: "Copy",
    copied: "Copied",
    checkService: "重新檢查",
    openSite: "開啟 {site}",
    preferencesEyebrow: "偏好設定",
    preferencesTitle: "字幕行為",
    enableTranslation: "啟用翻譯",
    replaceNativeSubtitles: "以雙語字幕取代原生字幕",
    fontSize: "字幕大小",
    overlayOpacity: "字幕背景透明度",
    advanced: "字幕進階設定",
    showPendingOriginal: "翻譯時先顯示原文",
    translationContextLines: "參考前文句數",
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
    modelDownloadDetail: "在下方選擇模型並下載，或播放影片時自動下載。",
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
    intro: "English and Traditional Chinese dual subtitles for streaming video on macOS and Windows.",
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
    tierRemove: "Uninstall",
    tierRemoveConfirm: "Uninstall the \"{name}\" model? You can download it again later.",
    tierRemoveActiveConfirm: "Uninstall the \"{name}\" model you're using? It downloads again the next time subtitles play.",
    tierRemoved: "Uninstalled",
    tierStateChecking: "Checking status…",
    tierStateReady: "Downloaded",
    tierStateMissing: "Not downloaded",
    tierStateCorrupt: "The file is incomplete or invalid. Download it again.",
    tierStateDownloading: "Downloading and preparing",
    tierStateOutdated: "Update the desktop component to use this model",
    tierStateUnavailable: "Can't reach the desktop component",
    engineUsingDesktop: "Using the desktop component",
    engineDesktopNotConnected: "Desktop component selected, not connected",
    desktopAdvancedTitle: "Use the desktop component (advanced)",
    desktopRequiredTitle: "This computer can't translate in the browser",
    desktopRequiredDetail: "This browser has no usable WebGPU. Install the LocalSubs desktop component to translate on your CPU or graphics card. After the steps below, choose \"Desktop component\" and allow the connection.",
    needsPermission: "Needs permission",
    useDesktop: "Installed. Use the desktop component",
    desktopRequiredStatus: "Install the LocalSubs desktop component with the steps below.",
    modelEngineDesktop: "These models run in the desktop component and are stored in its LocalSubs folder on this computer.",
    engineBrowser: "Browser",
    engineBrowserDetail: "No install. Needs a WebGPU-capable GPU",
    engineDesktop: "Desktop component",
    engineDesktopDetail: "Works with a CPU or GPU. Install required",
    hintDesktop: "Translation runs in the separately installed LocalSubs desktop component, on a CPU or compatible GPU.",
    hintDesktopNoPermission: "LocalSubs isn't allowed to connect to the desktop component yet, so it can't translate.",
    desktopIntro: "Use the desktop component when this browser can't use WebGPU, or to use an NVIDIA GPU. It needs a separate install and your permission for LocalSubs to communicate with it.",
    nativePermissionTitle: "Allow the desktop component",
    nativePermissionDetail: "LocalSubs needs your permission to communicate with the desktop component before it can translate with it.",
    nativePermissionGrant: "Allow desktop component",
    nativePermissionDenied: "Permission not granted. Browser translation stays on.",
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
    watchSetupVideo: "Watch the setup video",
    installRuntimeTitle: "Install the LocalSubs desktop component",
    installRuntimeTextWindows: "Install with WinGet. Subtitle text is never sent to the cloud.",
    installRuntimeTextMacOS: "Install with Homebrew. Subtitle text is never sent to the cloud.",
    oneTimeSetupTitle: "Set up desktop mode",
    oneTimeSetupTextWindows: "Choose the best available acceleration and connect this browser. Choose models to download below.",
    oneTimeSetupTextMacOS: "Connect this browser. Choose models to download below.",
    copy: "Copy",
    copied: "Copied",
    checkService: "Check again",
    openSite: "Open {site}",
    preferencesEyebrow: "Preferences",
    preferencesTitle: "Subtitle behavior",
    enableTranslation: "Enable translation",
    replaceNativeSubtitles: "Replace native subtitles with bilingual overlay",
    fontSize: "Font size",
    overlayOpacity: "Overlay background opacity",
    advanced: "Advanced subtitle settings",
    showPendingOriginal: "Show original while translating",
    translationContextLines: "Earlier lines for context",
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
    modelDownloadDetail: "Choose and download a model below, or it downloads when a video plays.",
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
const supportedSiteButtons = document.getElementById("supported-sites");
const platformStatusText = document.getElementById("platform-status-text");
const platformStatus = document.getElementById("platform-status");
const setupGrid = document.getElementById("setup-grid");
const unsupportedPlatform = document.getElementById("unsupported-platform");
const installRuntimeText = document.getElementById("install-runtime-text");
const setupTutorial = document.getElementById("setup-tutorial");
const oneTimeSetupText = document.getElementById("one-time-setup-text");
const installShellLabel = document.getElementById("install-shell-label");
const setupShellLabel = document.getElementById("setup-shell-label");
const installCommand = document.getElementById("install-command");
const setupCommand = document.getElementById("setup-command");
const tierList = document.getElementById("tier-list");
const desktopPanel = document.getElementById("desktop-panel");
const desktopSlotTop = document.getElementById("desktop-slot-top");
const desktopTitle = document.getElementById("desktop-title");
const desktopHint = document.getElementById("desktop-hint");
const modelPanel = document.getElementById("model-panel");
const engineSwitch = document.getElementById("engine-switch");
const useDesktopRow = document.getElementById("use-desktop-row");
const useDesktopButton = document.getElementById("use-desktop");
const engineNativeBadge = document.getElementById("engine-native-badge");
const modelEngineNote = document.getElementById("model-engine-note");
const desktopSettings = document.getElementById("desktop-settings");
const nativePermissionBlock = document.getElementById("native-permission");
const nativePermissionGrant = document.getElementById("native-permission-grant");
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
  fontSize: document.getElementById("font-size"),
  overlayBackgroundOpacity: document.getElementById("overlay-background-opacity"),
  translationContextLines: document.getElementById("translation-context-lines"),
  translationCacheLimit: document.getElementById("translation-cache-limit")
};

const outputs = {
  fontSize: document.getElementById("font-size-value"),
  overlayBackgroundOpacity: document.getElementById("overlay-background-opacity-value"),
  translationContextLines: document.getElementById("translation-context-lines-value"),
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
// nativeMessaging is an optional permission: null until checked.
let nativePermission = null;
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
    if (nativeSelected()) {
      if (status.entry?.canRemove && !status.active) {
        actions.append(makeButton("tier-remove", t("tierRemove"), () => void removeNativeTier(tier), locked));
      }
    } else {
      actions.append(makeButton("tier-remove", t("tierRemove"), () => void removeWebllmTier(tier, status.active), locked));
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

// Most people translate in the browser and never need the desktop component,
// so its panel stays collapsed at the bottom of the page. It moves to the top
// for people who use it, and for people whose browser can't translate.
function renderEngine() {
  const native = nativeSelected();
  for (const button of engineButtons) {
    button.setAttribute("aria-checked", String(button.dataset.engine === (native ? "native" : "webllm")));
  }
  const permissionMissing = native && nativePermission === false;
  const required = !native && gpuSupport === false;
  const prominent = native || required;
  if (prominent && desktopPanel.previousElementSibling !== desktopSlotTop) {
    desktopSlotTop.after(desktopPanel);
  } else if (!prominent && desktopPanel.nextElementSibling !== null) {
    desktopPanel.parentElement.append(desktopPanel);
  }
  // Open it for people who use or need it; never close it on someone who
  // opened it.
  if (prominent) desktopSettings.open = true;
  desktopPanel.classList.toggle("is-required", required || permissionMissing);

  let titleKey = "desktopAdvancedTitle";
  let hintKey = "desktopIntro";
  if (permissionMissing) [titleKey, hintKey] = ["engineDesktopNotConnected", "hintDesktopNoPermission"];
  else if (native) [titleKey, hintKey] = ["engineUsingDesktop", "hintDesktop"];
  else if (required) [titleKey, hintKey] = ["desktopRequiredTitle", "desktopRequiredDetail"];
  desktopTitle.textContent = t(titleKey);
  desktopHint.textContent = t(hintKey);
  engineNativeBadge.hidden = nativePermission !== false;
  // Browser models can't run here, and the two-way switch would show the
  // browser as selected: offer the one step that helps instead.
  modelPanel.hidden = required;
  engineSwitch.hidden = required;
  useDesktopRow.hidden = !required;
  modelEngineNote.textContent = native ? t("modelEngineDesktop") : "";
  modelEngineNote.hidden = !native;
  nativePermissionBlock.hidden = !permissionMissing;

  // Setup commands are always filled in. They are shown when the helper can't
  // be reached, and to people who need the desktop component to translate.
  const helperUnreachable = native && !permissionMissing && helperInfo.loaded && helperInfo.error;
  const needsSetup = helperUnreachable || required;
  const supported = prominent && setupEnvironment ? applyPlatform(setupEnvironment) : false;
  platformStatus.hidden = !needsSetup;
  setupGrid.hidden = !(needsSetup && supported);
  unsupportedPlatform.hidden = !(needsSetup && setupEnvironment && !supported);
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
  renderSupportedSites();
  renderAll();
}

function applyPlatform({ platform, browser }) {
  const setup = getPlatformSetup(platform, browser);
  if (!setup) {
    platformStatusText.dataset.i18n = "platformUnsupported";
    platformStatusText.textContent = t("platformUnsupported");
    return false;
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
  setupTutorial.hidden = !setup.tutorialUrl;
  if (setup.tutorialUrl) setupTutorial.href = setup.tutorialUrl;
  return true;
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

function confirmRemove(tier, active = false) {
  return window.confirm(t(active ? "tierRemoveActiveConfirm" : "tierRemoveConfirm").replace("{name}", tierText(tier, "Name")));
}

async function removeWebllmTier(tier, active) {
  if (busy || !confirmRemove(tier, active)) return;
  try {
    const result = await chrome.runtime.sendMessage({ type: "REMOVE_WEBLLM_MODEL", tier });
    if (!result?.ok) throw new Error(result?.error?.message || t("modelOperationFailed"));
    flashSavedStatus(t("tierRemoved"));
  } catch (error) {
    setServiceStatus("error", t("modelOperationFailed"), error instanceof Error ? error.message : t("modelOperationFailed"));
  }
  await refreshModels();
  if (active) void checkService();
}

async function removeNativeTier(tier) {
  if (busy || !confirmRemove(tier)) return;
  try {
    const result = await chrome.runtime.sendMessage({
      type: "REMOVE_HELPER_MODEL",
      channel: MODEL_CATALOG[tier].helperChannel
    });
    if (!result?.ok) throw new Error(result?.error?.message || t("modelOperationFailed"));
    flashSavedStatus(t("tierRemoved"));
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
  outputs.translationContextLines.textContent = `${settings.translationContextLines}`;
  outputs.translationCacheLimit.textContent = `${settings.translationCacheLimit}`;
}

function readFormSettings() {
  return {
    translationEnabled: fields.translationEnabled.checked,
    hideNativeSubtitles: fields.hideNativeSubtitles.checked,
    showPendingOriginalText: fields.showPendingOriginalText.checked,
    targetLanguage: DEFAULT_SETTINGS.targetLanguage,
    fontSize: Number.parseInt(fields.fontSize.value, 10),
    overlayBackgroundOpacity: Number.parseFloat(fields.overlayBackgroundOpacity.value),
    translationContextLines: Number.parseInt(fields.translationContextLines.value, 10),
    translationCacheLimit: Number.parseInt(fields.translationCacheLimit.value, 10)
  };
}

function applySettingsToForm(settings) {
  fields.translationEnabled.checked = settings.translationEnabled;
  fields.hideNativeSubtitles.checked = settings.hideNativeSubtitles;
  fields.showPendingOriginalText.checked = settings.showPendingOriginalText;
  fields.fontSize.value = `${settings.fontSize}`;
  fields.overlayBackgroundOpacity.value = `${settings.overlayBackgroundOpacity}`;
  fields.translationContextLines.value = `${settings.translationContextLines}`;
  fields.translationCacheLimit.value = `${settings.translationCacheLimit}`;
  updateOutputs(settings);
  renderAll();
}

async function loadSettings() {
  const syncKeys = [...Object.keys(DEFAULT_SETTINGS), ...LEGACY_SETTING_KEYS]
    .filter((key) => key !== "helperModelChannel");
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

  if (!nativeSelected() && gpuSupport === false) {
    setServiceStatus("error", t("desktopRequiredTitle"), t("desktopRequiredStatus"));
    return Promise.resolve();
  }

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
                // Progress arrives per finished shard; until then the bar is busy.
                busy.progress = loading.progress > 0 ? loading.progress * 100 : null;
                renderTiers();
              }
              const percent = loading.progress > 0
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
        if (result?.error?.code === "native_permission_required") {
          setServiceStatus("error", t("nativePermissionTitle"), t("nativePermissionDetail"));
        } else {
          setServiceStatus("error", t("notRunningTitle"), errorMessage || t("startThenCheck"));
        }
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

const NATIVE_PERMISSION = { permissions: ["nativeMessaging"] };

async function refreshNativePermission() {
  try {
    nativePermission = await chrome.permissions.contains(NATIVE_PERMISSION);
  } catch {
    nativePermission = false;
  }
}

// The browser shows its permission dialog only during a click, so this runs
// first in the click handler, before anything is awaited.
async function requestNativePermission() {
  try {
    nativePermission = await chrome.permissions.request(NATIVE_PERMISSION);
  } catch {
    nativePermission = false;
  }
  renderEngine();
  return nativePermission;
}

function chooseEngine(engine) {
  if (engine !== "native" || nativePermission === true) {
    void selectEngine(engine);
    return;
  }
  void requestNativePermission().then((granted) => {
    if (granted) {
      void selectEngine("native");
    } else {
      setServiceStatus("idle", t("nativePermissionTitle"), t("nativePermissionDenied"));
    }
  });
}

for (const button of engineButtons) {
  button.addEventListener("click", () => chooseEngine(button.dataset.engine));
}
useDesktopButton.addEventListener("click", () => chooseEngine("native"));

nativePermissionGrant.addEventListener("click", () => {
  void requestNativePermission().then(async (granted) => {
    if (!granted) return;
    await refreshModels();
    void checkService();
  });
});

chrome.permissions?.onAdded?.addListener(() => {
  void refreshNativePermission().then(renderEngine);
});
chrome.permissions?.onRemoved?.addListener(() => {
  void refreshNativePermission().then(renderEngine);
});

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

// One button per supported site, in the order of SUPPORTED_SITES.
function renderSupportedSites() {
  supportedSiteButtons.replaceChildren(...SUPPORTED_SITES.map((site) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = t("openSite").replace("{site}", site.name);
    button.addEventListener("click", () => {
      window.open(site.homeUrl, "_blank", "noopener");
    });
    return button;
  }));
}

applyLanguage(DEFAULT_SETTINGS.optionsLanguage);

void resolveSetupEnvironment().then((environment) => {
  setupEnvironment = environment;
  renderAll();
});

const webgpuDetection = detectWebGPU().then((supported) => {
  gpuSupport = supported;
  renderEngine();
  if (!supported) void checkService();
  return supported;
});

// Right after install, start downloading the default model so it's usually
// ready by the time someone opens a video. Downloading with the first video
// remains the fallback if this page is closed early.
async function startDownloadAfterInstall() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("installed")) return;
  url.searchParams.delete("installed");
  window.history.replaceState(null, "", url);
  if (nativeSelected() || !(await webgpuDetection)) return;
  if (tierStatus(currentSettings.modelTier).kind !== "missing") return;
  await activateTier(currentSettings.modelTier);
}

void refreshNativePermission().then(renderEngine);

void loadSettings().then(async () => {
  await Promise.all([refreshModels(), checkService()]);
  await refreshModels();
  await startDownloadAfterInstall();
});
