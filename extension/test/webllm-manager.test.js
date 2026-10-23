import { describe, expect, it, vi } from "vitest";
import { createWebLLMManager } from "../src/background/webllm-manager.js";

function fakeTranslator(name, cached = false) {
  return {
    name,
    checkTranslator: vi.fn().mockResolvedValue({ ok: true, transport: "webllm", model: name }),
    translateSubtitle: vi.fn().mockResolvedValue({ ok: true, translation: name }),
    isCached: vi.fn().mockResolvedValue(cached),
    unload: vi.fn().mockResolvedValue(undefined)
  };
}

describe("WebLLM manager", () => {
  it("routes to the selected tier and unloads the previous one when it changes", async () => {
    const translators = { fast: fakeTranslator("fast"), quality: fakeTranslator("quality") };
    let tier = "fast";
    const manager = createWebLLMManager({
      createTranslator: (entry) => translators[entry.tier],
      getTier: async () => tier
    });

    await expect(manager.translateSubtitle({})).resolves.toMatchObject({ translation: "fast" });
    tier = "quality";
    await expect(manager.checkTranslator()).resolves.toMatchObject({ model: "quality", tier: "quality" });
    expect(translators.fast.unload).toHaveBeenCalledOnce();
    expect(translators.quality.unload).not.toHaveBeenCalled();
  });

  it("reports cache state for every tier and marks the active one", async () => {
    const translators = { fast: fakeTranslator("fast", true), quality: fakeTranslator("quality", false) };
    const manager = createWebLLMManager({
      createTranslator: (entry) => translators[entry.tier],
      getTier: async () => "quality"
    });
    await expect(manager.listModels()).resolves.toEqual([
      { tier: "fast", cached: true, active: false, downloadMB: 290 },
      { tier: "quality", cached: false, active: true, downloadMB: 895 }
    ]);
  });
});
