import { describe, expect, it } from "vitest";
import {
  LEGACY_WEBLLM_MODELS,
  MODEL_CATALOG,
  helperChannelForTier,
  normalizeModelTier,
  tierForHelperChannel
} from "../src/core/model-catalog.js";
import { migrateStoredSettings } from "../src/core/settings.js";

describe("model catalog", () => {
  it("maps each tier to a helper channel and a WebLLM model", () => {
    expect(helperChannelForTier("fast")).toBe("stable");
    expect(helperChannelForTier("quality")).toBe("1.7b");
    expect(MODEL_CATALOG.fast.webllm.libFile).not.toBe(MODEL_CATALOG.quality.webllm.libFile);
    expect(MODEL_CATALOG.quality.webllm.vramMB).toBeGreaterThan(MODEL_CATALOG.fast.webllm.vramMB);
  });

  it("never lists a current model as legacy", () => {
    const current = Object.values(MODEL_CATALOG).map((entry) => entry.webllm.modelId);
    for (const legacy of LEGACY_WEBLLM_MODELS) {
      expect(current).not.toContain(legacy.modelId);
    }
  });

  it("falls back to the fast tier for unknown values", () => {
    expect(normalizeModelTier("quality")).toBe("quality");
    expect(normalizeModelTier("ultra")).toBe("fast");
    expect(tierForHelperChannel("1.7b")).toBe("quality");
    expect(tierForHelperChannel("rowtune-dev")).toBe("fast");
  });

  it("migrates the stored helper channel to a model tier once", () => {
    expect(migrateStoredSettings({ helperModelChannel: "1.7b" }).modelTier).toBe("quality");
    expect(migrateStoredSettings({ helperModelChannel: "stable" }).modelTier).toBe("fast");
    expect(migrateStoredSettings({ helperModelChannel: "1.7b", modelTier: "fast" }).modelTier).toBe("fast");
    expect(migrateStoredSettings({}).modelTier).toBe("fast");
  });
});
