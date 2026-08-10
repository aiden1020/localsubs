import { describe, expect, it, vi } from "vitest";
import { createInferenceRouter } from "../src/background/inference-router.js";

describe("inference router", () => {
  it("routes checks and translations to the selected backend", async () => {
    const nativeTranslator = {
      checkTranslator: vi.fn().mockResolvedValue({ transport: "native" }),
      translateSubtitle: vi.fn().mockResolvedValue({ transport: "native" })
    };
    const webllmTranslator = {
      checkTranslator: vi.fn().mockResolvedValue({ transport: "webllm" }),
      translateSubtitle: vi.fn().mockResolvedValue({ transport: "webllm" })
    };
    let backend = "webllm";
    const router = createInferenceRouter({
      nativeTranslator,
      webllmTranslator,
      getBackend: async () => backend
    });

    await expect(router.translateSubtitle({ currentText: "Hello" })).resolves.toMatchObject({
      transport: "webllm"
    });
    backend = "native";
    await expect(router.checkTranslator(true)).resolves.toMatchObject({ transport: "native" });
    expect(webllmTranslator.translateSubtitle).toHaveBeenCalledOnce();
    expect(nativeTranslator.checkTranslator).toHaveBeenCalledWith(true);
  });
});
