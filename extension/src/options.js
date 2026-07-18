import { DEFAULT_SETTINGS, migrateStoredSettings } from "./core/settings.js";

const I18N = {
  "zh-Hant": {
    setupTitle: "設定",
    intro: "即時、完全本機、免費且開源的串流字幕翻譯。",
    installRuntimeTitle: "安裝本機 runtime",
    installRuntimeText: "安裝 LocalSubs CLI。字幕文字不會送到雲端。",
    oneTimeSetupTitle: "完成一次性設定",
    oneTimeSetupText: "下載翻譯模型並連接 Chrome。這兩個指令只需要執行一次。",
    checkAndWatchTitle: "檢查並開始使用",
    checkAndWatchText: "確認本機模型可用，然後開啟支援的串流頁面並啟用英文字幕。",
    copy: "Copy",
    copied: "Copied",
    checkService: "檢查服務",
    warmupService: "預熱模型",
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
    checkingLocalModel: "正在檢查本機模型",
    lookingForHelper: "正在尋找 native helper",
    warmingUpModel: "正在預熱模型",
    waitingForHelper: "等待 native helper 回應",
    loadingModel: "正在載入翻譯模型，請稍候（首次啟動約需 20–60 秒）",
    checking: "檢查中...",
    warmingUp: "預熱中...",
    readyTitle: "本機模型已就緒",
    nativeTransport: "透過 native helper",
    respondedIn: "回應時間",
    warmupResult: "預熱",
    notRunningTitle: "本機模型尚未執行",
    startThenCheck: "請先安裝並連接 LocalSubs，再重新檢查。"
  },
  en: {
    setupTitle: "Setup",
    intro: "Real-time, fully local, free and open source subtitle translation for streaming video.",
    installRuntimeTitle: "Install the local runtime",
    installRuntimeText: "Install the LocalSubs CLI. Subtitle text is never sent to the cloud.",
    oneTimeSetupTitle: "Finish one-time setup",
    oneTimeSetupText: "Download the translation model and connect Chrome. These commands only need to run once.",
    checkAndWatchTitle: "Check and start watching",
    checkAndWatchText: "Confirm the local model is available, then open a supported streaming page with English subtitles enabled.",
    copy: "Copy",
    copied: "Copied",
    checkService: "Check service",
    warmupService: "Warm up model",
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
    checkingLocalModel: "Checking local model",
    lookingForHelper: "Looking for the native helper",
    warmingUpModel: "Warming up model",
    waitingForHelper: "Waiting for the native helper",
    loadingModel: "Loading translation model, please wait (first launch may take 20–60 s)",
    checking: "Checking...",
    warmingUp: "Warming up...",
    readyTitle: "Local model is ready",
    nativeTransport: "via native helper",
    respondedIn: "Responded in",
    warmupResult: "Warmup",
    notRunningTitle: "Local model is not running",
    startThenCheck: "Install and connect LocalSubs, then check again."
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

let saveTimer = null;
let currentLanguage = DEFAULT_SETTINGS.optionsLanguage;
let currentSettings = { ...DEFAULT_SETTINGS };

function t(key) {
  return I18N[currentLanguage]?.[key] || I18N.en[key] || key;
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
  const stored = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  currentSettings = migrateStoredSettings(stored);
  applyLanguage(currentSettings.optionsLanguage);
  applySettingsToForm(currentSettings);
  await chrome.storage.sync.set({ targetLanguage: DEFAULT_SETTINGS.targetLanguage });
}

async function saveSettings() {
  const settings = readFormSettings();
  currentSettings = { ...currentSettings, ...settings };
  updateOutputs(currentSettings);
  await chrome.storage.sync.set(settings);
  flashSavedStatus();
}

let activeCheckAbort = null;

async function checkService({ warmup = false } = {}) {
  if (activeCheckAbort) activeCheckAbort.abort();
  const abort = new AbortController();
  activeCheckAbort = abort;

  const button = warmup ? warmupServiceButton : checkServiceButton;
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = warmup ? t("warmingUp") : t("checking");
  setServiceStatus(
    "checking",
    warmup ? t("warmingUpModel") : t("checkingLocalModel"),
    t("waitingForHelper")
  );

  const finish = () => {
    if (activeCheckAbort === abort) activeCheckAbort = null;
    button.disabled = false;
    button.textContent = originalLabel;
  };

  const poll = async () => {
    if (abort.signal.aborted) { finish(); return; }

    let result;
    try {
      result = await chrome.runtime.sendMessage({ type: "CHECK_LOCAL_TRANSLATOR", warmup });
    } catch (err) {
      if (!abort.signal.aborted) {
        setServiceStatus("error", t("notRunningTitle"), err instanceof Error ? err.message : t("startThenCheck"));
      }
      finish();
      return;
    }

    if (abort.signal.aborted) { finish(); return; }

    if (result?.loading) {
      setServiceStatus("checking", t("checkingLocalModel"), t("loadingModel"));
      setTimeout(poll, 2000);
      return;
    }

    if (result?.ok) {
      const warmupText = result.translation ? ` ${t("warmupResult")}: ${result.translation}` : "";
      const transportText = t("nativeTransport");
      setServiceStatus("ready", t("readyTitle"), `${t("respondedIn")} ${result.latencyMs || 0} ms ${transportText}.${warmupText}`);
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

warmupServiceButton.addEventListener("click", () => {
  void checkService({ warmup: true });
});

openSupportedSiteButton.addEventListener("click", () => {
  window.open("https://www.max.com/", "_blank", "noopener");
});

applyLanguage(DEFAULT_SETTINGS.optionsLanguage);

void loadSettings().then(() => {
  void checkService();
});
