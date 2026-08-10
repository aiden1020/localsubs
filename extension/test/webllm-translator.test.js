import { describe, expect, it, vi } from "vitest";
import {
  buildWebLLMPrompt,
  cleanWebLLMTranslation,
  createWebLLMTranslator,
  WEBLLM_CONTEXT_WINDOW_SIZE,
  WEBLLM_MAX_TOKENS
} from "../src/background/webllm-translator.js";

function testGPU() {
  return {
    requestAdapter: vi.fn().mockResolvedValue({
      features: new Set(["shader-f16"]),
      info: { vendor: "test-gpu" },
      limits: { maxStorageBufferBindingSize: 1_073_741_824 }
    })
  };
}

describe("WebLLM translator", () => {
  it("matches the native CTX/CUR prompt and cleaning rules", () => {
    expect(buildWebLLMPrompt("I'll be right back.", ["Wait here."])).toBe(
      "<|im_start|>user\nCTX:\nWait here.\n\nCUR:\nI'll be right back.<|im_end|>\n<|im_start|>assistant\n"
    );
    expect(cleanWebLLMTranslation("CTX:\nhello\nCUR:\nworld\n<|im_start|>assistant\n我馬上回來。<|im_end|>"))
      .toBe("hello\nworld\n我馬上回來。");
  });

  it("reports download state without initializing the engine", async () => {
    const createEngine = vi.fn();
    const translator = createWebLLMTranslator({
      createEngine,
      hasModelCached: vi.fn().mockResolvedValue(false),
      gpu: testGPU(),
      modelLibURL: "chrome-extension://test/model-lib.wasm"
    });
    await expect(translator.checkTranslator()).resolves.toMatchObject({
      ok: false,
      needsDownload: true,
      transport: "webllm",
      backend: "test-gpu"
    });
    expect(createEngine).not.toHaveBeenCalled();
  });

  it("initializes once and translates through the completions API", async () => {
    const unload = vi.fn().mockResolvedValue(undefined);
    const interruptGenerate = vi.fn().mockResolvedValue(undefined);
    const createEngine = vi.fn().mockResolvedValue({
      unload,
      interruptGenerate,
      completions: {
        create: vi.fn().mockResolvedValue({ choices: [{ text: "翻譯<|im_end|>" }] })
      }
    });
    const translator = createWebLLMTranslator({
      createEngine,
      hasModelCached: vi.fn().mockResolvedValue(true),
      gpu: testGPU(),
      modelLibURL: "chrome-extension://test/model-lib.wasm"
    });
    await expect(translator.translateSubtitle({ currentText: "Translate." })).resolves.toMatchObject({
      ok: true,
      translation: "翻譯",
      transport: "webllm"
    });
    await translator.translateSubtitle({ currentText: "Again." });
    expect(createEngine).toHaveBeenCalledOnce();
    expect(createEngine).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        appConfig: expect.objectContaining({ cacheBackend: "indexeddb" })
      }),
      { context_window_size: WEBLLM_CONTEXT_WINDOW_SIZE }
    );
    expect((await createEngine.mock.results[0].value).completions.create)
      .toHaveBeenCalledWith(expect.objectContaining({ max_tokens: WEBLLM_MAX_TOKENS }));
    await translator.unload();
    expect(unload).toHaveBeenCalledOnce();
  });

  it("interrupts stale inference and only returns the latest subtitle", async () => {
    let resolveFirst;
    const firstCompletion = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const createCompletion = vi.fn()
      .mockReturnValueOnce(firstCompletion)
      .mockResolvedValueOnce({ choices: [{ text: "最新翻譯" }] });
    const interruptGenerate = vi.fn().mockResolvedValue(undefined);
    const translator = createWebLLMTranslator({
      createEngine: vi.fn().mockResolvedValue({
        interruptGenerate,
        unload: vi.fn(),
        completions: { create: createCompletion }
      }),
      hasModelCached: vi.fn().mockResolvedValue(true),
      gpu: testGPU()
    });

    const stale = translator.translateSubtitle({ currentText: "Old subtitle." });
    await vi.waitFor(() => expect(createCompletion).toHaveBeenCalledOnce());
    const latest = translator.translateSubtitle({ currentText: "Latest subtitle." });
    await vi.waitFor(() => expect(interruptGenerate).toHaveBeenCalledOnce());
    resolveFirst({ choices: [{ text: "舊翻譯" }] });

    await expect(stale).resolves.toMatchObject({ ok: true, superseded: true });
    await expect(latest).resolves.toMatchObject({
      ok: true,
      superseded: false,
      translation: "最新翻譯"
    });
    expect(createCompletion).toHaveBeenCalledTimes(2);
  });

  it("keeps only the latest subtitle while the model is initializing", async () => {
    let resolveEngine;
    const engineReady = new Promise((resolve) => {
      resolveEngine = resolve;
    });
    const createCompletion = vi.fn().mockResolvedValue({ choices: [{ text: "第二句" }] });
    const translator = createWebLLMTranslator({
      createEngine: vi.fn().mockReturnValue(engineReady),
      hasModelCached: vi.fn().mockResolvedValue(true),
      gpu: testGPU()
    });

    const stale = translator.translateSubtitle({ currentText: "First." });
    const latest = translator.translateSubtitle({ currentText: "Second." });
    resolveEngine({
      interruptGenerate: vi.fn(),
      unload: vi.fn(),
      completions: { create: createCompletion }
    });

    await expect(stale).resolves.toMatchObject({ ok: true, superseded: true });
    await expect(latest).resolves.toMatchObject({
      ok: true,
      superseded: false,
      translation: "第二句"
    });
    expect(createCompletion).toHaveBeenCalledOnce();
  });

  it("returns a capability error when shader-f16 is unavailable", async () => {
    const translator = createWebLLMTranslator({
      createEngine: vi.fn(),
      hasModelCached: vi.fn(),
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue({
          features: new Set(),
          limits: {}
        })
      }
    });
    await expect(translator.checkTranslator()).resolves.toMatchObject({
      ok: false,
      error: { code: "webgpu_feature_missing" }
    });
  });
});
