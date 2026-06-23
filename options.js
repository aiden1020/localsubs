const DEFAULT_SETTINGS = {
  translationEnabled: true,
  localTranslatorEnabled: true,
  hideNativeSubtitles: true,
  showPendingOriginalText: true,
  showOriginalText: false,
  targetLanguage: "zh-Hant",
  fontSize: 30,
  overlayBackgroundOpacity: 0.22,
  translationContextWindow: 3,
  localTranslatorCtxSize: 1,
  translationCacheLimit: 120,
  setupCompleted: false
};
const LEGACY_SETTINGS_KEYS = {
  localTranslatorEnabled: "localMlxEnabled",
  localTranslatorCtxSize: "localMlxCtxSize"
};

const form = document.getElementById("settings-form");
const saveStatus = document.getElementById("save-status");
const statusPanel = document.getElementById("service-status");
const statusTitle = document.getElementById("service-status-title");
const statusDetail = document.getElementById("service-status-detail");
const checkServiceButton = document.getElementById("check-service");
const warmupServiceButton = document.getElementById("warmup-service");
const markReadyButton = document.getElementById("mark-ready");
const openSupportedSiteButton = document.getElementById("open-supported-site");

const fields = {
  translationEnabled: document.getElementById("translation-enabled"),
  localTranslatorEnabled: document.getElementById("local-translator-enabled"),
  hideNativeSubtitles: document.getElementById("hide-native-subtitles"),
  showPendingOriginalText: document.getElementById("show-pending-original-text"),
  showOriginalText: document.getElementById("show-original-text"),
  targetLanguage: document.getElementById("target-language"),
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
let currentSettings = { ...DEFAULT_SETTINGS };

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
    localTranslatorEnabled: fields.localTranslatorEnabled.checked,
    hideNativeSubtitles: fields.hideNativeSubtitles.checked,
    showPendingOriginalText: fields.showPendingOriginalText.checked,
    showOriginalText: fields.showOriginalText.checked,
    targetLanguage: fields.targetLanguage.value,
    fontSize: Number.parseInt(fields.fontSize.value, 10),
    overlayBackgroundOpacity: Number.parseFloat(fields.overlayBackgroundOpacity.value),
    translationContextWindow: Number.parseInt(fields.translationContextWindow.value, 10),
    localTranslatorCtxSize: Number.parseInt(fields.localTranslatorCtxSize.value, 10),
    translationCacheLimit: Number.parseInt(fields.translationCacheLimit.value, 10)
  };
}

function applySettingsToForm(settings) {
  fields.translationEnabled.checked = settings.translationEnabled;
  fields.localTranslatorEnabled.checked = settings.localTranslatorEnabled;
  fields.hideNativeSubtitles.checked = settings.hideNativeSubtitles;
  fields.showPendingOriginalText.checked = settings.showPendingOriginalText;
  fields.showOriginalText.checked = settings.showOriginalText;
  fields.targetLanguage.value = settings.targetLanguage;
  fields.fontSize.value = `${settings.fontSize}`;
  fields.overlayBackgroundOpacity.value = `${settings.overlayBackgroundOpacity}`;
  fields.translationContextWindow.value = `${settings.translationContextWindow}`;
  fields.localTranslatorCtxSize.value = `${settings.localTranslatorCtxSize}`;
  fields.translationCacheLimit.value = `${settings.translationCacheLimit}`;
  updateOutputs(settings);
}

function migrateStoredSettings(stored) {
  const migrated = { ...DEFAULT_SETTINGS, ...stored };

  if (
    LEGACY_SETTINGS_KEYS.localTranslatorEnabled in stored &&
    !("localTranslatorEnabled" in stored)
  ) {
    migrated.localTranslatorEnabled = stored[LEGACY_SETTINGS_KEYS.localTranslatorEnabled];
  }

  if (
    LEGACY_SETTINGS_KEYS.localTranslatorCtxSize in stored &&
    !("localTranslatorCtxSize" in stored)
  ) {
    migrated.localTranslatorCtxSize = stored[LEGACY_SETTINGS_KEYS.localTranslatorCtxSize];
  }

  return migrated;
}

function setServiceStatus(state, title, detail) {
  statusPanel.classList.remove("is-ready", "is-error", "is-checking", "is-idle");
  statusPanel.classList.add(`is-${state}`);
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}

function flashSavedStatus(message = "Saved") {
  saveStatus.textContent = message;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveStatus.textContent = "";
  }, 1600);
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get([
    ...Object.keys(DEFAULT_SETTINGS),
    LEGACY_SETTINGS_KEYS.localTranslatorEnabled,
    LEGACY_SETTINGS_KEYS.localTranslatorCtxSize
  ]);
  currentSettings = migrateStoredSettings(stored);
  applySettingsToForm(currentSettings);
  if (currentSettings.setupCompleted) {
    markReadyButton.textContent = "Setup marked complete";
  }
  await loadHelperCommand();
}

async function loadHelperCommand() {
  try {
    const result = await chrome.runtime.sendMessage({
      type: "GET_LOCAL_HELPER_COMMAND"
    });
    if (result?.ok && result.command) {
      document.getElementById("start-command").textContent = result.command;
    }
  } catch (err) {
    document.getElementById("start-command").textContent = "open-stream-subtitles-helper install-native-host";
  }
}

async function saveSettings() {
  const settings = readFormSettings();
  currentSettings = { ...currentSettings, ...settings };
  updateOutputs(currentSettings);
  await chrome.storage.sync.set(settings);
  flashSavedStatus();
}

async function checkService({ warmup = false } = {}) {
  const button = warmup ? warmupServiceButton : checkServiceButton;
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = warmup ? "Warming up..." : "Checking...";
  setServiceStatus("checking", warmup ? "Warming up model" : "Checking local model", "Waiting for the native helper");

  try {
    const result = await chrome.runtime.sendMessage({
      type: "CHECK_LOCAL_TRANSLATOR",
      warmup
    });

    if (result?.ok) {
      const warmupText = result.translation ? ` Warmup: ${result.translation}` : "";
      const transportText = result.transport === "http" ? " via localhost fallback" : " via native helper";
      setServiceStatus(
        "ready",
        "Local model is ready",
        `Responded in ${result.latencyMs || 0} ms${transportText}.${warmupText}`
      );
      return true;
    }

    setServiceStatus(
      "error",
      "Local model is not running",
      result?.error || "Start the model service, then check again."
    );
    return false;
  } catch (err) {
    setServiceStatus(
      "error",
      "Local model is not running",
      err instanceof Error ? err.message : "Start the model service, then check again."
    );
    return false;
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function copyCommand(targetId, button) {
  const command = document.getElementById(targetId)?.textContent.trim();
  if (!command) {
    return;
  }

  await navigator.clipboard.writeText(command);
  const originalLabel = button.textContent;
  button.textContent = "Copied";
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

checkServiceButton.addEventListener("click", () => {
  void checkService();
});

warmupServiceButton.addEventListener("click", () => {
  void checkService({ warmup: true });
});

markReadyButton.addEventListener("click", async () => {
  currentSettings.setupCompleted = true;
  await chrome.storage.sync.set({ setupCompleted: true });
  markReadyButton.textContent = "Setup marked complete";
  flashSavedStatus("Setup complete");
});

openSupportedSiteButton.addEventListener("click", () => {
  window.open("https://www.max.com/", "_blank", "noopener");
});

void loadSettings().then(() => {
  void checkService();
});
