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
      translationContextLines: 20,
      translationCacheLimit: 1
    });
    expect(settings).toMatchObject({
      fontSize: 42,
      overlayBackgroundOpacity: 0,
      translationContextLines: 3,
      translationCacheLimit: 20
    });
  });

  it("carries the old context window and context size over to context lines", () => {
    // The old window counted the current line; the size capped earlier lines.
    expect(migrateStoredSettings({ translationContextWindow: 3, localTranslatorCtxSize: 1 }).translationContextLines).toBe(1);
    expect(migrateStoredSettings({ translationContextWindow: 5, localTranslatorCtxSize: 3 }).translationContextLines).toBe(3);
    expect(migrateStoredSettings({ translationContextWindow: 3, localTranslatorCtxSize: 5 }).translationContextLines).toBe(2);
    expect(migrateStoredSettings({ translationContextWindow: 1 }).translationContextLines).toBe(0);
    expect(migrateStoredSettings({ localTranslatorCtxSize: 0 }).translationContextLines).toBe(0);
    expect(sanitizeSettings({ translationContextWindow: 4, localTranslatorCtxSize: 2 }).translationContextLines).toBe(2);
    expect(migrateStoredSettings({ translationContextWindow: 5, localTranslatorCtxSize: 5 }).translationContextLines).toBe(3);
    expect(migrateStoredSettings({ translationContextLines: 2, translationContextWindow: 1 }).translationContextLines).toBe(2);
    const settings = migrateStoredSettings({ translationContextWindow: 3 });
    expect(settings).not.toHaveProperty("translationContextWindow");
    expect(settings).not.toHaveProperty("localTranslatorCtxSize");
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
