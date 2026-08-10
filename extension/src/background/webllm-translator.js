import { CreateMLCEngine, hasModelInCache } from "@mlc-ai/web-llm";
import {
  WEBLLM_CONTEXT_WINDOW_SIZE,
  WEBLLM_MAX_TOKENS,
  WEBLLM_MODEL_ID
} from "../core/webllm-config.js";

export const WEBLLM_MODEL_URL = globalThis.__LOCALSUBS_WEBLLM_MODEL_URL__ ||
  "https://huggingface.co/Aiden1020/LocalSubs-EN-ZH-TW-0.6B/resolve/main/webllm-64k-q4f16_1-v1/";
export { WEBLLM_CONTEXT_WINDOW_SIZE, WEBLLM_MAX_TOKENS, WEBLLM_MODEL_ID };

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function buildWebLLMPrompt(currentText, contextLines = []) {
  const context = contextLines
    .map((line) => typeof line === "string" ? line.trim() : "")
    .filter(Boolean)
    .join("\n");
  const current = typeof currentText === "string" ? currentText.trim() : "";
  return `<|im_start|>user\nCTX:\n${context}\n\nCUR:\n${current}<|im_end|>\n<|im_start|>assistant\n`;
}

export function cleanWebLLMTranslation(text) {
  return String(text || "")
    .replaceAll("<|im_start|>", "")
    .replaceAll("<|im_end|>", "")
    .replace(/^assistant\s*/i, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line.toLowerCase() !== "assistant"
      && line !== "CTX:" && line !== "CUR:"
      && !line.startsWith("CTX:") && !line.startsWith("CUR:"))
    .join("\n");
}

export function createWebLLMTranslator({
  createEngine = CreateMLCEngine,
  hasModelCached = hasModelInCache,
  gpu = globalThis.navigator?.gpu,
  modelId = WEBLLM_MODEL_ID,
  modelURL = WEBLLM_MODEL_URL,
  modelLibURL = globalThis.chrome?.runtime?.getURL?.("model-lib.wasm") || "model-lib.wasm",
  now = () => performance.now()
} = {}) {
  let engine = null;
  let enginePromise = null;
  let progress = { progress: 0, text: "Model is not loaded" };
  let lastError = null;
  let capability = null;
  let engineGeneration = 0;
  let translationGeneration = 0;
  let activeCompletion = null;

  const appConfig = {
    model_list: [{
      model: modelURL,
      model_id: modelId,
      model_lib: modelLibURL,
      vram_required_MB: 550,
      low_resource_required: true,
      required_features: ["shader-f16"]
    }],
    cacheBackend: "cache"
  };

  async function inspectCapability() {
    if (capability) return capability;
    if (!gpu) {
      throw codedError("webgpu_unavailable", "WebGPU is not available in this browser");
    }
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) {
      throw codedError("webgpu_unavailable", "No compatible WebGPU adapter was found");
    }
    if (!adapter.features.has("shader-f16")) {
      throw codedError("webgpu_feature_missing", "This GPU does not support shader-f16");
    }
    capability = {
      vendor: adapter.info?.vendor || "webgpu",
      shaderF16: true,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize
    };
    return capability;
  }

  async function ensureEngine() {
    if (engine) return engine;
    if (enginePromise) return enginePromise;
    lastError = null;
    progress = { progress: 0, text: "Starting WebLLM" };
    const loadGeneration = ++engineGeneration;
    const pendingEngine = (async () => {
      await inspectCapability();
      const nextEngine = await createEngine(
        modelId,
        {
          appConfig,
          initProgressCallback(nextProgress) {
            progress = {
              progress: Number(nextProgress.progress) || 0,
              text: nextProgress.text || "Loading WebLLM model"
            };
          },
          logLevel: "WARN"
        },
        { context_window_size: WEBLLM_CONTEXT_WINDOW_SIZE }
      );
      if (loadGeneration !== engineGeneration) {
        await nextEngine.unload();
        throw codedError("backend_changed", "WebLLM was unloaded after the backend changed");
      }
      engine = nextEngine;
      progress = { progress: 1, text: "Model ready" };
      return engine;
    })()
      .catch((error) => {
        lastError = error instanceof Error ? error.message : String(error);
        throw codedError("webllm_init_failed", lastError);
      })
      .finally(() => {
        if (enginePromise === pendingEngine) {
          enginePromise = null;
        }
      });
    enginePromise = pendingEngine;
    return enginePromise;
  }

  async function runCompletion(activeEngine, payload) {
    const completion = await activeEngine.completions.create({
      prompt: buildWebLLMPrompt(payload.currentText || payload.text || "", payload.contextLines),
      temperature: 0,
      max_tokens: WEBLLM_MAX_TOKENS,
      seed: 0,
      stop: ["<|im_end|>"],
      stream: false
    });
    return cleanWebLLMTranslation(completion.choices[0]?.text || "");
  }

  async function settleActiveCompletion(activeEngine, interrupt = false) {
    while (activeCompletion) {
      const pendingCompletion = activeCompletion;
      if (interrupt) {
        await Promise.resolve(activeEngine.interruptGenerate?.()).catch(() => {});
      }
      await pendingCompletion.catch(() => {});
      if (activeCompletion === pendingCompletion) {
        activeCompletion = null;
      }
    }
  }

  async function trackCompletion(activeEngine, payload) {
    const pendingCompletion = runCompletion(activeEngine, payload);
    activeCompletion = pendingCompletion;
    try {
      return await pendingCompletion;
    } finally {
      if (activeCompletion === pendingCompletion) {
        activeCompletion = null;
      }
    }
  }

  function translationResult(translation, superseded = false) {
    return {
      ok: true,
      translation,
      cache: "none",
      superseded,
      model: modelId,
      transport: "webllm"
    };
  }

  async function translateSubtitle(payload) {
    const requestGeneration = ++translationGeneration;
    const activeEngine = await ensureEngine();
    if (requestGeneration !== translationGeneration) {
      return translationResult("", true);
    }

    await settleActiveCompletion(activeEngine, true);
    if (requestGeneration !== translationGeneration) {
      return translationResult("", true);
    }

    try {
      const translation = await trackCompletion(activeEngine, payload);
      if (requestGeneration !== translationGeneration) {
        return translationResult("", true);
      }
      return translationResult(translation);
    } catch (error) {
      if (requestGeneration !== translationGeneration) {
        return translationResult("", true);
      }
      throw error;
    }
  }

  async function checkTranslator(warmup = false) {
    const startedAt = now();
    try {
      const gpuInfo = await inspectCapability();
      const cached = engine ? true : await hasModelCached(modelId, appConfig);
      if (enginePromise && !engine) {
        return {
          ok: false,
          loading: true,
          progress: progress.progress,
          status: progress.text,
          cached,
          transport: "webllm",
          backend: gpuInfo.vendor,
          model: modelId
        };
      }
      if (!engine && !warmup) {
        return {
          ok: false,
          loading: false,
          needsDownload: !cached,
          needsInitialization: cached,
          cached,
          transport: "webllm",
          backend: gpuInfo.vendor,
          model: modelId
        };
      }
      let translation = "";
      if (warmup) {
        const activeEngine = await ensureEngine();
        await settleActiveCompletion(activeEngine);
        const warmupGeneration = translationGeneration;
        try {
          translation = await trackCompletion(activeEngine, {
            currentText: "Ready.",
            contextLines: ["Warm up."]
          });
        } catch (error) {
          if (translationGeneration === warmupGeneration) {
            throw error;
          }
        }
      }
      return {
        ok: true,
        loading: false,
        cached: true,
        latencyMs: Math.round(now() - startedAt),
        translation,
        transport: "webllm",
        backend: gpuInfo.vendor,
        model: modelId
      };
    } catch (error) {
      return {
        ok: false,
        loading: false,
        transport: "webllm",
        error: {
          code: typeof error?.code === "string" ? error.code : "webllm_unavailable",
          message: error instanceof Error ? error.message : "WebLLM is unavailable"
        },
        lastError
      };
    }
  }

  async function unload() {
    engineGeneration += 1;
    translationGeneration += 1;
    const activeEngine = engine;
    engine = null;
    enginePromise = null;
    progress = { progress: 0, text: "Model is not loaded" };
    if (activeEngine) {
      await Promise.resolve(activeEngine.interruptGenerate?.()).catch(() => {});
      await activeEngine.unload();
    }
  }

  return { checkTranslator, translateSubtitle, unload };
}
