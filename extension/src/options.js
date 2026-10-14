import { DEFAULT_SETTINGS, migrateStoredSettings, normalizeHelperModelChannel } from "./core/settings.js";
import {
  detectSetupBrowser,
  detectSetupPlatform,
  getPlatformSetup
} from "./core/platform-setup.js";

const I18N = {
  "zh-Hant": {
    setupTitle: "設定",
    intro: "免費為 HBO Max 加入英文＋台灣繁中雙字幕，支援 macOS 與 Windows。",
    inferenceEyebrow: "翻譯模式",
    inferenceTitle: "選擇適合你的翻譯方式",
    inferenceBackend: "翻譯方式",
    webllmOption: "瀏覽器模式（僅 GPU，免安裝）",
    nativeOption: "桌面模式（CPU／GPU，需安裝）",
    webllmDescription: "直接使用瀏覽器可用的 GPU 完成翻譯，不限定 GPU 品牌；沒有相容 GPU 時無法使用。首次使用會下載約 272 MB 的模型，之後可離線使用。",
    nativeDescription: "透過另行安裝的 LocalSubs 桌面元件完成翻譯，可使用 CPU 或相容的 GPU。你可以在下方管理官方模型。",
    localModelDetail: "從官方模型目錄選擇要下載的模型；模型只會儲存在這台裝置。",
    helperModelsLoading: "正在載入官方模型清單...",
    helperModelsUnavailable: "無法連接桌面元件。請先完成安裝，或稍後重試。",
    helperModelsEmpty: "目前沒有可管理的模型。",
    helperModelStateMissing: "尚未下載",
    helperModelStateDownloaded: "已下載",
    helperModelStatePartial: "下載未完成",
    helperModelStateCorrupt: "檔案不完整或不相符",
    helperModelStateUnavailable: "目前不提供下載",
    helperModelSelected: "使用中",
    helperModelDownload: "下載",
    helperModelDownloading: "下載中…請保持此頁開啟",
    helperModelUse: "使用此模型",
    helperModelRemove: "移除",
    helperModelRemoveActive: "切換至其他已下載模型後才能移除",
    helperModelOperationFailed: "模型操作失敗",
    helperModelRemoveConfirm: "移除此模型檔案？之後仍可重新下載。",
    helperModelSelectionRestart: "已切換模型，正在重新啟動桌面元件。",
    modelDownloadTitle: "離線翻譯模型",
    modelDownloadSize: "約 272 MB",
    modelPrivacy: "模型只會儲存在這台裝置，字幕不會上傳。",
    modelStateChecking: "檢查中",
    modelStateRequired: "需要下載",
    modelStateDownloading: "下載中",
    modelStatePreparing: "準備中",
    modelStateCached: "已下載",
    modelStateReady: "可使用",
    modelStateUnavailable: "無法使用",
    modelCheckingDetail: "正在確認下載狀態...",
    modelRequiredDetail: "按下「下載並準備」即可開始；下載期間可以留在這個頁面。",
    modelDownloadingDetail: "正在下載模型，請保持此頁面開啟。",
    modelPreparingDetail: "下載已完成，正在準備第一次翻譯。",
    modelCachedCardDetail: "模型已下載；播放影片時會自動準備。",
    modelReadyCardDetail: "模型已載入，可以開始翻譯字幕。",
    modelUnavailableDetail: "目前無法啟用瀏覽器模式。請確認瀏覽器硬體加速已開啟，或改用桌面模式。",
    detectingPlatform: "正在偵測作業系統...",
    platformWindows: "已偵測到 Windows。請在 PowerShell 執行以下指令。",
    platformMacOS: "已偵測到 macOS。請在 Terminal 執行以下指令。",
    platformUnsupported: "此平台尚未支援。LocalSubs 桌面元件目前支援 macOS 與 Windows 10/11 x64。",
    viewInstallGuide: "查看安裝說明",
    installRuntimeTitle: "安裝 LocalSubs 桌面元件",
    installRuntimeTextWindows: "透過 WinGet 安裝。字幕文字不會送到雲端。",
    installRuntimeTextMacOS: "透過 Homebrew 安裝。字幕文字不會送到雲端。",
    oneTimeSetupTitle: "設定桌面模式",
    oneTimeSetupTextWindows: "自動選擇可用的加速方式並連接目前的瀏覽器。模型可在設定頁選擇下載。",
    oneTimeSetupTextMacOS: "連接目前的瀏覽器。模型可在設定頁選擇下載。",
    checkAndWatchTitle: "檢查並開始使用",
    checkAndWatchText: "確認本機模型可用，然後開啟支援的串流頁面並啟用英文字幕。",
    copy: "Copy",
    copied: "Copied",
    checkService: "檢查是否可用",
    warmupService: "預先載入",
    downloadWarmup: "下載並準備",
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
    lookingForHelper: "正在尋找 LocalSubs 桌面元件",
    warmingUpModel: "正在準備翻譯",
    waitingForHelper: "等待 LocalSubs 桌面元件回應",
    loadingModel: "正在準備翻譯模型，請稍候（首次啟動約需 20–60 秒）",
    checking: "檢查中...",
    warmingUp: "準備中...",
    readyTitle: "可以開始使用",
    nativeTransport: "使用桌面模式",
    webllmTransport: "使用瀏覽器模式",
    modelDownloadRequired: "翻譯模型尚未下載",
    modelDownloadDetail: "第一次播放字幕時會自動下載；也可以現在下載並準備。",
    modelCachedTitle: "翻譯模型已下載",
    modelCachedDetail: "播放影片時會自動準備，也可以現在預先載入。",
    respondedIn: "回應時間",
    warmupResult: "測試結果",
    notRunningTitle: "翻譯服務尚未就緒",
    startThenCheck: "請完成模型下載或下方安裝步驟，再重新檢查。"
  },
  en: {
    setupTitle: "Setup",
    intro: "Free English and Traditional Chinese dual subtitles for HBO Max on macOS and Windows.",
    inferenceEyebrow: "Translation mode",
    inferenceTitle: "Choose how LocalSubs translates",
    inferenceBackend: "Translation mode",
    webllmOption: "Browser mode (GPU only, no install)",
    nativeOption: "Desktop mode (CPU/GPU, install required)",
    webllmDescription: "Uses any compatible GPU exposed by the browser, regardless of brand, and cannot run without one. The first use downloads an approximately 272 MB model for offline use.",
    nativeDescription: "Translates through the separately installed LocalSubs desktop component using a CPU or compatible GPU. Manage official models below.",
    localModelDetail: "Choose models from the official catalog to download. Models stay on this device.",
    helperModelsLoading: "Loading the official model catalog...",
    helperModelsUnavailable: "Unable to connect to the desktop component. Finish setup or try again later.",
    helperModelsEmpty: "There are no models to manage right now.",
    helperModelStateMissing: "Not downloaded",
    helperModelStateDownloaded: "Downloaded",
    helperModelStatePartial: "Incomplete download",
    helperModelStateCorrupt: "File is incomplete or invalid",
    helperModelStateUnavailable: "Download unavailable",
    helperModelSelected: "In use",
    helperModelDownload: "Download",
    helperModelDownloading: "Downloading… keep this page open",
    helperModelUse: "Use this model",
    helperModelRemove: "Remove",
    helperModelRemoveActive: "Switch to another downloaded model before removing",
    helperModelOperationFailed: "Model operation failed",
    helperModelRemoveConfirm: "Remove this model file? You can download it again later.",
    helperModelSelectionRestart: "Model changed. Restarting the desktop component.",
    modelDownloadTitle: "Offline translation model",
    modelDownloadSize: "About 272 MB",
    modelPrivacy: "The model stays on this device and subtitles are never uploaded.",
    modelStateChecking: "Checking",
    modelStateRequired: "Download needed",
    modelStateDownloading: "Downloading",
    modelStatePreparing: "Preparing",
    modelStateCached: "Downloaded",
    modelStateReady: "Ready",
    modelStateUnavailable: "Unavailable",
    modelCheckingDetail: "Checking the download status...",
    modelRequiredDetail: "Select “Download and prepare” to begin, and keep this page open during the download.",
    modelDownloadingDetail: "Downloading the model. Keep this page open.",
    modelPreparingDetail: "Download complete. Preparing the first translation.",
    modelCachedCardDetail: "The model is downloaded and prepares automatically when playback starts.",
    modelReadyCardDetail: "The model is loaded and ready to translate subtitles.",
    modelUnavailableDetail: "Browser mode is unavailable. Check browser hardware acceleration or switch to desktop mode.",
    detectingPlatform: "Detecting your operating system...",
    platformWindows: "Windows detected. Run these commands in PowerShell.",
    platformMacOS: "macOS detected. Run these commands in Terminal.",
    platformUnsupported: "This platform is not supported yet. The LocalSubs desktop component currently supports macOS and Windows 10/11 x64.",
    viewInstallGuide: "View installation guide",
    installRuntimeTitle: "Install the LocalSubs desktop component",
    installRuntimeTextWindows: "Install with WinGet. Subtitle text is never sent to the cloud.",
    installRuntimeTextMacOS: "Install with Homebrew. Subtitle text is never sent to the cloud.",
    oneTimeSetupTitle: "Set up desktop mode",
    oneTimeSetupTextWindows: "Choose the best available acceleration and connect this browser. Choose models to download in Options.",
    oneTimeSetupTextMacOS: "Connect this browser. Choose models to download in Options.",
    checkAndWatchTitle: "Check and start watching",
    checkAndWatchText: "Confirm the local model is available, then open a supported streaming page with English subtitles enabled.",
    copy: "Copy",
    copied: "Copied",
    checkService: "Check availability",
    warmupService: "Prepare now",
    downloadWarmup: "Download and prepare",
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
    lookingForHelper: "Looking for the LocalSubs desktop component",
    warmingUpModel: "Preparing translation",
    waitingForHelper: "Waiting for the LocalSubs desktop component",
    loadingModel: "Preparing the translation model, please wait (first launch may take 20–60 s)",
    checking: "Checking...",
    warmingUp: "Preparing...",
    readyTitle: "Ready to use",
    nativeTransport: "using desktop mode",
    webllmTransport: "using browser mode",
    modelDownloadRequired: "Translation model is not downloaded",
    modelDownloadDetail: "It downloads automatically with the first subtitle, or you can download and prepare it now.",
    modelCachedTitle: "Translation model is downloaded",
    modelCachedDetail: "It prepares automatically when playback starts, or you can prepare it now.",
    respondedIn: "Responded in",
    warmupResult: "Test result",
    notRunningTitle: "Translation service is not ready",
    startThenCheck: "Finish the model download or setup steps below, then check again."
  }
};

const form = document.getElementById("settings-form");
const saveStatus = document.getElementById("save-status");
const statusPanel = document.getElementById("service-status");
const statusTitle = document.getElementById("service-status-title");
const statusDetail = document.getElementById("service-status-detail");
const checkServiceButton = document.getElementById("check-service");
const warmupServiceButton = document.getElementById("warmup-service");
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
const modelDownload = document.getElementById("model-download");
const modelDownloadDetail = document.getElementById("model-download-detail");
const modelDownloadState = document.getElementById("model-download-state");
const modelDownloadProgress = document.getElementById("model-download-progress");
const modelDownloadPercent = document.getElementById("model-download-percent");
const helperModelSetting = document.getElementById("helper-model-setting");
const helperModelDetail = document.getElementById("helper-model-detail");
const helperModelList = document.getElementById("helper-model-list");

const fields = {
  inferenceBackend: document.getElementById("inference-backend"),
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

let saveTimer = null;
let currentLanguage = DEFAULT_SETTINGS.optionsLanguage;
let currentSettings = { ...DEFAULT_SETTINGS };
let setupEnvironment = null;
let modelDownloadView = { kind: "checking", progress: null };
let helperModels = [];
let helperModelsLoaded = false;
let helperModelsError = false;
let helperModelOperation = null;
let warmupActionKey = "warmupService";

function t(key) {
  return I18N[currentLanguage]?.[key] || I18N.en[key] || key;
}

function setWarmupAction(key, emphasized = false) {
  warmupActionKey = key;
  warmupServiceButton.classList.toggle("primary-button", emphasized);
  warmupServiceButton.classList.toggle("secondary-button", !emphasized);
  if (!warmupServiceButton.disabled) {
    warmupServiceButton.textContent = t(key);
  }
}

function renderModelDownload() {
  modelDownload.hidden = currentSettings.inferenceBackend !== "webllm";
  if (modelDownload.hidden) {
    setWarmupAction("warmupService");
    return;
  }

  const { kind, progress } = modelDownloadView;
  const labels = {
    checking: "modelStateChecking",
    required: "modelStateRequired",
    downloading: "modelStateDownloading",
    preparing: "modelStatePreparing",
    cached: "modelStateCached",
    ready: "modelStateReady",
    error: "modelStateUnavailable"
  };
  const details = {
    checking: "modelCheckingDetail",
    required: "modelRequiredDetail",
    downloading: "modelDownloadingDetail",
    preparing: "modelPreparingDetail",
    cached: "modelCachedCardDetail",
    ready: "modelReadyCardDetail",
    error: "modelUnavailableDetail"
  };

  modelDownload.className = `model-download is-${kind}`;
  modelDownloadState.textContent = t(labels[kind]);
  modelDownloadDetail.textContent = t(details[kind]);
  if (Number.isFinite(progress)) {
    const percent = Math.max(0, Math.min(100, Math.round(progress)));
    modelDownloadProgress.value = percent;
    modelDownloadPercent.textContent = `${percent}%`;
  } else {
    modelDownloadProgress.removeAttribute("value");
    modelDownloadPercent.textContent = "—";
  }
  setWarmupAction(kind === "required" ? "downloadWarmup" : "warmupService", kind === "required");
}

function updateModelDownload(result) {
  if (currentSettings.inferenceBackend !== "webllm") return;
  if (result?.ok) {
    modelDownloadView = { kind: "ready", progress: 100 };
  } else if (result?.needsDownload) {
    modelDownloadView = { kind: "required", progress: 0 };
  } else if (result?.needsInitialization) {
    modelDownloadView = { kind: "cached", progress: 100 };
  } else if (result?.loading) {
    modelDownloadView = {
      kind: result.cached ? "preparing" : "downloading",
      progress: Number.isFinite(result.progress) ? result.progress * 100 : null
    };
  } else if (result?.error) {
    modelDownloadView = { kind: "error", progress: null };
  }
  renderModelDownload();
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
  renderHelperModels();
  renderModelDownload();
}

function applyPlatform({ platform, browser }) {
  const setup = getPlatformSetup(platform, browser);
  if (!setup) {
    platformStatusText.dataset.i18n = "platformUnsupported";
    setupGrid.hidden = true;
    unsupportedPlatform.hidden = false;
    applyLanguage(currentLanguage);
    return;
  }

  platformStatusText.dataset.i18n = setup.platformTextKey;
  installRuntimeText.dataset.i18n = setup.installTextKey;
  oneTimeSetupText.dataset.i18n = setup.setupTextKey;
  installShellLabel.textContent = setup.shellLabel;
  setupShellLabel.textContent = setup.shellLabel;
  installCommand.textContent = setup.installCommand;
  setupCommand.textContent = setup.setupCommand;
  unsupportedPlatform.hidden = true;
  setupGrid.hidden = false;
  applyLanguage(currentLanguage);
}

function applyBackendUI() {
  const nativeSelected = currentSettings.inferenceBackend === "native";
  platformStatus.hidden = !nativeSelected;
  helperModelSetting.hidden = !nativeSelected;
  helperModelDetail.hidden = false;
  document.getElementById("backend-description").textContent = nativeSelected
    ? t("nativeDescription")
    : t("webllmDescription");
  renderModelDownload();
  if (!nativeSelected) {
    setupGrid.hidden = true;
    unsupportedPlatform.hidden = true;
    return;
  }
  if (setupEnvironment) {
    applyPlatform(setupEnvironment);
  }
}

function formatModelSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "";
  if (sizeBytes >= 1024 ** 3) return `${(sizeBytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(sizeBytes / 1024 ** 2)} MB`;
}

function renderHelperModels() {
  helperModelList.replaceChildren();
  if (!helperModelsLoaded) {
    const state = document.createElement("p");
    state.className = "backend-description";
    state.textContent = t(helperModelsError ? "helperModelsUnavailable" : "helperModelsLoading");
    helperModelList.append(state);
    return;
  }
  if (helperModels.length === 0) {
    const state = document.createElement("p");
    state.className = "backend-description";
    state.textContent = t("helperModelsEmpty");
    helperModelList.append(state);
    return;
  }

  for (const model of helperModels) {
    const card = document.createElement("article");
    card.className = "helper-model-card";
    card.dataset.channel = model.channel;
    const content = document.createElement("div");
    content.className = "helper-model-content";
    const title = document.createElement("h3");
    title.textContent = model.name || model.id || model.channel;
    const description = document.createElement("p");
    description.textContent = model.description || "";
    const metadata = document.createElement("p");
    metadata.className = "helper-model-meta";
    const stateKey = model.state === "downloaded"
      ? "helperModelStateDownloaded"
      : model.state === "corrupt"
        ? "helperModelStateCorrupt"
        : model.state === "partial"
          ? "helperModelStatePartial"
        : model.downloadable
          ? "helperModelStateMissing"
          : "helperModelStateUnavailable";
    metadata.textContent = [formatModelSize(model.sizeBytes), t(stateKey), model.selected ? t("helperModelSelected") : ""]
      .filter(Boolean)
      .join(" · ");
    content.append(title, description, metadata);

    const actions = document.createElement("div");
    actions.className = "helper-model-actions";
    const operation = helperModelOperation?.channel === model.channel ? helperModelOperation.action : "";
    if (model.state === "downloaded") {
      if (model.selected) {
        const selected = document.createElement("span");
        selected.className = "helper-model-selected";
        selected.textContent = t("helperModelSelected");
        actions.append(selected);
      } else {
        actions.append(makeModelAction(model, "use", t("helperModelUse"), operation !== ""));
      }
      if (!model.canRemove && model.selected) {
        const locked = document.createElement("span");
        locked.className = "helper-model-action-hint";
        locked.textContent = t("helperModelRemoveActive");
        actions.append(locked);
      }
    } else if (model.downloadable) {
      const label = operation === "download" ? t("helperModelDownloading") : t("helperModelDownload");
      actions.append(makeModelAction(model, "download", label, Boolean(operation)));
    } else if (model.state === "missing") {
      const unavailable = document.createElement("span");
      unavailable.className = "helper-model-action-hint";
      unavailable.textContent = t("helperModelStateUnavailable");
      actions.append(unavailable);
    }
    if (model.canRemove) actions.append(makeModelAction(model, "remove", t("helperModelRemove"), Boolean(operation)));

    card.append(content, actions);
    helperModelList.append(card);
  }
}

function makeModelAction(model, action, label, disabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = action === "use" ? "secondary-button" : "model-action-button";
  button.dataset.modelAction = action;
  button.dataset.modelChannel = model.channel;
  button.textContent = label;
  button.disabled = disabled;
  return button;
}

async function refreshHelperModels() {
  if (currentSettings.inferenceBackend !== "native") return;
  helperModelsLoaded = false;
  helperModelsError = false;
  renderHelperModels();
  try {
    const result = await chrome.runtime.sendMessage({ type: "LIST_HELPER_MODELS" });
    if (!result?.ok || !Array.isArray(result.models)) {
      throw new Error(result?.error?.message || t("helperModelsUnavailable"));
    }
    helperModels = result.models;
    helperModelsLoaded = true;
    const selected = helperModels.find((model) => model.selected);
    if (selected) {
      currentSettings.helperModelChannel = normalizeHelperModelChannel(selected.channel);
      await chrome.storage.local.set({ helperModelChannel: currentSettings.helperModelChannel });
    }
  } catch (error) {
    helperModels = [];
    helperModelsError = true;
    helperModelsLoaded = true;
    setServiceStatus("error", t("helperModelOperationFailed"), error instanceof Error ? error.message : t("helperModelsUnavailable"));
  }
  renderHelperModels();
}

async function handleHelperModelAction(action, channel) {
  if (action === "remove" && !window.confirm(t("helperModelRemoveConfirm"))) return;
  helperModelOperation = { action, channel };
  renderHelperModels();
  try {
    let result;
    if (action === "use") {
      result = await chrome.runtime.sendMessage({ type: "SELECT_HELPER_MODEL", channel });
    } else if (action === "download") {
      result = await chrome.runtime.sendMessage({ type: "DOWNLOAD_HELPER_MODEL", channel });
    } else {
      result = await chrome.runtime.sendMessage({ type: "REMOVE_HELPER_MODEL", channel });
    }
    if (!result?.ok) throw new Error(result?.error?.message || t("helperModelOperationFailed"));
    if (action === "use") {
      currentSettings.helperModelChannel = normalizeHelperModelChannel(channel);
      await chrome.storage.local.set({ helperModelChannel: currentSettings.helperModelChannel });
      if (result.restartRequired) {
        setServiceStatus("checking", t("modelStateChecking"), t("helperModelSelectionRestart"));
      }
    }
    await refreshHelperModels();
    flashSavedStatus();
    if (action === "use" || result.restartRequired) void checkService();
  } catch (error) {
    setServiceStatus("error", t("helperModelOperationFailed"), error instanceof Error ? error.message : t("helperModelOperationFailed"));
  } finally {
    helperModelOperation = null;
    renderHelperModels();
  }
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

function updateOutputs(settings) {
  outputs.fontSize.textContent = `${settings.fontSize}px`;
  outputs.overlayBackgroundOpacity.textContent = `${Math.round(settings.overlayBackgroundOpacity * 100)}%`;
  outputs.translationContextWindow.textContent = `${settings.translationContextWindow}`;
  outputs.localTranslatorCtxSize.textContent = `${settings.localTranslatorCtxSize}`;
  outputs.translationCacheLimit.textContent = `${settings.translationCacheLimit}`;
}

function readFormSettings() {
  return {
    inferenceBackend: fields.inferenceBackend.value === "native" ? "native" : "webllm",
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
  fields.inferenceBackend.value = settings.inferenceBackend;
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
  applyBackendUI();
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

async function loadSettings() {
  const syncKeys = Object.keys(DEFAULT_SETTINGS).filter((key) => key !== "helperModelChannel");
  const [stored, localSettings] = await Promise.all([
    chrome.storage.sync.get(syncKeys),
    chrome.storage.local.get({ helperModelChannel: "stable" })
  ]);
  currentSettings = migrateStoredSettings({ ...stored, ...localSettings });
  applyLanguage(currentSettings.optionsLanguage);
  applySettingsToForm(currentSettings);
  await chrome.storage.sync.set({ targetLanguage: DEFAULT_SETTINGS.targetLanguage });
  if (currentSettings.inferenceBackend === "native") await refreshHelperModels();
}

async function saveSettings() {
  const settings = readFormSettings();
  currentSettings = { ...currentSettings, ...settings };
  updateOutputs(currentSettings);
  const { helperModelChannel, ...syncSettings } = settings;
  await chrome.storage.sync.set(syncSettings);
  flashSavedStatus();
}

let activeCheckAbort = null;

async function checkService({ warmup = false } = {}) {
  if (activeCheckAbort) activeCheckAbort.abort();
  const abort = new AbortController();
  activeCheckAbort = abort;

  const button = warmup ? warmupServiceButton : checkServiceButton;
  button.disabled = true;
  button.textContent = warmup ? t("warmingUp") : t("checking");
  if (currentSettings.inferenceBackend === "webllm") {
    if (warmup) {
      const kind = modelDownloadView.kind === "required" ? "downloading" : "preparing";
      modelDownloadView = { kind, progress: kind === "downloading" ? 0 : null };
    } else {
      modelDownloadView = { kind: "checking", progress: null };
    }
    renderModelDownload();
  }
  setServiceStatus(
    "checking",
    warmup ? t("warmingUpModel") : t("checkingLocalModel"),
    currentSettings.inferenceBackend === "native" ? t("waitingForHelper") : t("checking")
  );

  const finish = () => {
    if (activeCheckAbort === abort) activeCheckAbort = null;
    button.disabled = false;
    button.textContent = warmup ? t(warmupActionKey) : t("checkService");
  };

  const poll = async () => {
    if (abort.signal.aborted) { finish(); return; }

    let result;
    let progressTimer;
    try {
      const request = chrome.runtime.sendMessage({ type: "CHECK_TRANSLATOR", warmup });
      if (warmup && currentSettings.inferenceBackend === "webllm") {
        progressTimer = window.setInterval(async () => {
          const loading = await chrome.runtime.sendMessage({
            type: "CHECK_TRANSLATOR",
            warmup: false
          }).catch(() => null);
          if (!abort.signal.aborted && loading?.loading) {
            updateModelDownload(loading);
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
        updateModelDownload({ error: true });
        setServiceStatus("error", t("notRunningTitle"), err instanceof Error ? err.message : t("startThenCheck"));
      }
      finish();
      return;
    } finally {
      window.clearInterval(progressTimer);
    }

    if (abort.signal.aborted) { finish(); return; }

    updateModelDownload(result);

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
    finish();
  };

  poll();
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

fields.inferenceBackend.addEventListener("change", async () => {
  currentSettings.inferenceBackend = fields.inferenceBackend.value === "native" ? "native" : "webllm";
  await chrome.storage.sync.set({ inferenceBackend: currentSettings.inferenceBackend });
  await chrome.runtime.sendMessage({
    type: "SET_INFERENCE_BACKEND",
    backend: currentSettings.inferenceBackend
  });
  applyBackendUI();
  if (currentSettings.inferenceBackend === "native") await refreshHelperModels();
  flashSavedStatus();
  void checkService();
});

helperModelList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-model-action]");
  if (!button || button.disabled) return;
  void handleHelperModelAction(button.dataset.modelAction, button.dataset.modelChannel);
});

document.querySelectorAll("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", () => {
    void copyCommand(button.dataset.copyTarget, button);
  });
});

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", async () => {
    applyLanguage(button.dataset.language);
    applyBackendUI();
    currentSettings.optionsLanguage = currentLanguage;
    await chrome.storage.sync.set({ optionsLanguage: currentLanguage });
  });
});

checkServiceButton.addEventListener("click", () => {
  void checkService();
});

warmupServiceButton.addEventListener("click", () => {
  void checkService({ warmup: true });
});

openSupportedSiteButton.addEventListener("click", () => {
  window.open("https://www.hbomax.com/", "_blank", "noopener");
});

applyLanguage(DEFAULT_SETTINGS.optionsLanguage);

void resolveSetupEnvironment().then((environment) => {
  setupEnvironment = environment;
  applyBackendUI();
});

void loadSettings().then(() => {
  void checkService();
});
