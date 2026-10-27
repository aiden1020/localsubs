import { describe, expect, it, vi } from "vitest";
import {
  buildWebLLMPrompt,
  cleanWebLLMTranslation,
  createWebLLMTranslator,
  describeError,
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

  it("clears an interrupt left over from a generation that had already finished", async () => {
    // Mirrors MLCEngine: a non-streaming completion skips generation and
    // returns "" while interruptSignal is set, and only generation resets it.
    const engine = {
      interruptSignal: true,
      interruptGenerate: vi.fn(async () => { engine.interruptSignal = true; }),
      unload: vi.fn(),
      completions: {
        create: vi.fn(async () => {
          if (engine.interruptSignal) return { choices: [{ text: "" }] };
          return { choices: [{ text: "翻譯" }] };
        })
      }
    };
    const translator = createWebLLMTranslator({
      createEngine: vi.fn().mockResolvedValue(engine),
      hasModelCached: vi.fn().mockResolvedValue(true),
      gpu: testGPU()
    });
    await expect(translator.translateSubtitle({ currentText: "Hello." })).resolves.toMatchObject({
      translation: "翻譯",
      superseded: false
    });
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

  it("reports a retired cached model so settings can offer an upgrade", async () => {
    const hasModelCached = vi.fn(async (id) => id === "legacy-model");
    const translator = createWebLLMTranslator({
      createEngine: vi.fn(),
      hasModelCached,
      gpu: testGPU(),
      modelId: "current-model",
      legacyModels: [{ modelId: "legacy-model", modelURL: "https://example.invalid/legacy/", vramMB: 1 }],
      modelLibURL: "chrome-extension://test/model-lib.wasm"
    });
    await expect(translator.checkTranslator()).resolves.toMatchObject({
      needsDownload: true,
      legacyCached: true
    });
  });

  it("removes retired cached models only after the current model loads", async () => {
    const deleteModelCache = vi.fn().mockResolvedValue(undefined);
    const hasModelCached = vi.fn(async () => true);
    let finishLoad;
    const createEngine = vi.fn(() => new Promise((resolve) => {
      finishLoad = () => resolve({
        unload: vi.fn().mockResolvedValue(undefined),
        interruptGenerate: vi.fn().mockResolvedValue(undefined),
        completions: { create: vi.fn().mockResolvedValue({ choices: [{ text: "好" }] }) }
      });
    }));
    const translator = createWebLLMTranslator({
      createEngine,
      hasModelCached,
      deleteModelCache,
      gpu: testGPU(),
      modelId: "current-model",
      legacyModels: [{ modelId: "legacy-model", modelURL: "https://example.invalid/legacy/", vramMB: 1 }],
      modelLibURL: "chrome-extension://test/model-lib.wasm"
    });

    const pending = translator.translateSubtitle({ currentText: "Hi" });
    await vi.waitFor(() => expect(createEngine).toHaveBeenCalled());
    expect(deleteModelCache).not.toHaveBeenCalled();
    finishLoad();
    await pending;
    await vi.waitFor(() => {
      expect(deleteModelCache).toHaveBeenCalledWith("legacy-model", expect.any(Object));
    });
    expect(deleteModelCache).not.toHaveBeenCalledWith("current-model", expect.anything());
  });

  it("keeps retired models when the current model fails to load", async () => {
    const deleteModelCache = vi.fn().mockResolvedValue(undefined);
    const translator = createWebLLMTranslator({
      createEngine: vi.fn().mockRejectedValue(new Error("download failed")),
      hasModelCached: vi.fn(async () => true),
      deleteModelCache,
      gpu: testGPU(),
      modelId: "current-model",
      legacyModels: [{ modelId: "legacy-model", modelURL: "https://example.invalid/legacy/", vramMB: 1 }],
      modelLibURL: "chrome-extension://test/model-lib.wasm"
    });
    await expect(translator.translateSubtitle({ currentText: "Hi" })).rejects.toThrow();
    expect(deleteModelCache).not.toHaveBeenCalled();
  });

  it("keeps the detail of non-Error failures during the warmup completion", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const translator = createWebLLMTranslator({
      createEngine: vi.fn().mockResolvedValue({
        unload: vi.fn().mockResolvedValue(undefined),
        interruptGenerate: vi.fn().mockResolvedValue(undefined),
        completions: { create: vi.fn().mockRejectedValue({ reason: "device lost" }) }
      }),
      hasModelCached: vi.fn().mockResolvedValue(true),
      gpu: testGPU(),
      modelLibURL: "chrome-extension://test/model-lib.wasm"
    });
    await expect(translator.checkTranslator(true)).resolves.toMatchObject({
      ok: false,
      error: { code: "webllm_unavailable", message: '{"reason":"device lost"}' }
    });
  });
});

describe("describeError", () => {
  it("returns the most specific message available", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
    expect(describeError("plain string")).toBe("plain string");
    expect(describeError({ message: "from object" })).toBe("from object");
    expect(describeError({ code: 7 })).toBe('{"code":7}');
    expect(describeError(undefined)).toBe("WebLLM is unavailable");
    expect(describeError({})).toBe("WebLLM is unavailable");
  });
});
