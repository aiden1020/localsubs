export const SETUP_PLATFORM = Object.freeze({
  WINDOWS: "windows",
  MACOS: "macos",
  UNSUPPORTED: "unsupported"
});

export const SETUP_BROWSER = Object.freeze({
  CHROME: "chrome",
  CHROMIUM: "chromium",
  EDGE: "edge"
});

export const PLATFORM_SETUP = Object.freeze({
  [SETUP_PLATFORM.WINDOWS]: Object.freeze({
    platformTextKey: "platformWindows",
    installTextKey: "installRuntimeTextWindows",
    setupTextKey: "oneTimeSetupTextWindows",
    shellLabel: "PowerShell",
    installCommand: "winget install --id Aiden1020.LocalSubs --exact",
    setupCommand: "localsubs setup --backend auto"
  }),
  [SETUP_PLATFORM.MACOS]: Object.freeze({
    platformTextKey: "platformMacOS",
    installTextKey: "installRuntimeTextMacOS",
    setupTextKey: "oneTimeSetupTextMacOS",
    shellLabel: "Terminal",
    installCommand: [
      "brew tap aiden1020/localsubs",
      "brew trust aiden1020/localsubs",
      "brew install localsubs"
    ].join("\n"),
    setupCommand: "localsubs setup"
  })
});

function isSupportedWindowsArchitecture(architecture) {
  const normalized = String(architecture || "").trim().toLowerCase();
  if (!normalized) return true;
  return ["x86-64", "x64", "amd64"].includes(normalized);
}

function platformFromValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (/^(win|win32|win64|windows)$/.test(normalized) || /\bwindows\b/.test(normalized)) {
    return SETUP_PLATFORM.WINDOWS;
  }
  if (/^(mac|macintel|macos|darwin)$/.test(normalized)
    || /\b(macintosh|mac os|darwin)\b/.test(normalized)) {
    return SETUP_PLATFORM.MACOS;
  }
  return "";
}

export function detectSetupPlatform(platformInfo = {}, navigatorLike = {}) {
  if (platformInfo.os) {
    const platform = platformFromValue(platformInfo.os);
    if (platform === SETUP_PLATFORM.WINDOWS
      && !isSupportedWindowsArchitecture(platformInfo.arch)) {
      return SETUP_PLATFORM.UNSUPPORTED;
    }
    return platform || SETUP_PLATFORM.UNSUPPORTED;
  }

  const candidates = [
    navigatorLike.userAgentData?.platform,
    navigatorLike.platform,
    navigatorLike.userAgent
  ];
  for (const candidate of candidates) {
    const detected = platformFromValue(candidate);
    if (detected) return detected;
  }
  return SETUP_PLATFORM.UNSUPPORTED;
}

export function detectSetupBrowser(navigatorLike = {}) {
  const userAgent = String(navigatorLike.userAgent || "");
  if (/\bEdg\//i.test(userAgent)) return SETUP_BROWSER.EDGE;
  if (/\bChromium\//i.test(userAgent)) return SETUP_BROWSER.CHROMIUM;
  return SETUP_BROWSER.CHROME;
}

export function getPlatformSetup(platform, browser = SETUP_BROWSER.CHROME) {
  const setup = PLATFORM_SETUP[platform];
  if (!setup) return undefined;

  const browserArgument = browser === SETUP_BROWSER.CHROME ? "" : ` --browser ${browser}`;
  const backendArgument = platform === SETUP_PLATFORM.WINDOWS ? " --backend auto" : "";
  return {
    ...setup,
    setupCommand: `localsubs setup${browserArgument}${backendArgument}`
  };
}
