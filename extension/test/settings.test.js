import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  inferenceBackendForInstall,
  migrateStoredSettings,
  sanitizeSettings
} from "../src/core/settings.js";

describe("settings", () => {
  it("uses stable defaults for missing settings", () => {
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps numeric settings to supported ranges", () => {
    const settings = sanitizeSettings({
      fontSize: 100,
      overlayBackgroundOpacity: -1,
      translationContextWindow: 0,
      localTranslatorCtxSize: 20,
      translationCacheLimit: 1
    });
    expect(settings).toMatchObject({
      fontSize: 42,
      overlayBackgroundOpacity: 0,
      translationContextWindow: 1,
      localTranslatorCtxSize: 5,
      translationCacheLimit: 20
    });
  });

  it("migrates stored values without retaining removed fallback settings", () => {
    const settings = migrateStoredSettings({
      localTranslatorEnabled: false,
      optionsLanguage: "en",
      fontSize: 36
    });
    expect(settings.optionsLanguage).toBe("en");
    expect(settings.fontSize).toBe(36);
    expect(settings).not.toHaveProperty("localTranslatorEnabled");
  });

  it("uses WebLLM for new installs and preserves native for legacy upgrades", () => {
    expect(inferenceBackendForInstall("install", undefined)).toBe("webllm");
    expect(inferenceBackendForInstall("update", undefined)).toBe("native");
    expect(inferenceBackendForInstall("update", "webllm")).toBe("webllm");
    expect(inferenceBackendForInstall("install", "native")).toBe("native");
  });

  it("sanitizes unsupported inference backends to WebLLM", () => {
    expect(sanitizeSettings({ inferenceBackend: "cloud" }).inferenceBackend).toBe("webllm");
    expect(sanitizeSettings({ inferenceBackend: "native" }).inferenceBackend).toBe("native");
  });
});
