export const siteUrl = "https://localsubs.aidenw.me";

// The store redirects the bare id to the listing, so the link survives a
// rename of the extension.
export const storeUrl = "https://chromewebstore.google.com/detail/dpacileladlkfgdjbdjdjhgnepicejjb";

// The streaming sites the extension supports, in the order its settings page
// lists them (extension/src/core/supported-sites.js).
// scripts/check-supported-sites.mjs checks that the two lists agree.
export const supportedSites = ["YouTube", "HBO Max"];
export const supportedSitesText = supportedSites.join("、");

export const siteTitle =
  `LocalSubs｜免費 ${supportedSitesText} 英文＋繁中雙字幕 Chrome 擴充功能`;

export const siteDescription =
  `免費在 ${supportedSitesText} 同步顯示英文原文與台灣繁中翻譯。針對台灣用語優化，不需帳號，支援 macOS 與 Windows 上的 Chrome、Chromium 和 Edge。`;
