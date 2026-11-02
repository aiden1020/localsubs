import {
  CreateMLCEngine,
  CreateWebWorkerMLCEngine
} from "@mlc-ai/web-llm";
import {
  WEBLLM_CONTEXT_WINDOW_SIZE,
  WEBLLM_DEFAULT_ENGINE_MODE,
  WEBLLM_MAX_TOKENS,
  WEBLLM_MODEL_ID
} from "../core/webllm-config.js";
import { DEFAULT_SETTINGS } from "../core/settings.js";
import { evaluateAcceptance, summarizeLatency } from "./metrics.js";

const WARMUP_CASES = 3;
const ACCEPTANCE_P95_MS = 300;
const NATIVE_EXACT_MATCH_PERCENT = 8;
const experimentParams = new URLSearchParams(location.search);
const MAX_TOKENS = Math.max(1, Math.min(24, Number.parseInt(
  experimentParams.get("maxTokens") || String(WEBLLM_MAX_TOKENS),
  10
)));
const CONTEXT_WINDOW_SIZE = Math.max(
  64,
  Math.min(512, Number.parseInt(
    experimentParams.get("contextWindow") || String(WEBLLM_CONTEXT_WINDOW_SIZE),
    10
  ))
);
const requestedEngineMode = experimentParams.get("engineMode") || WEBLLM_DEFAULT_ENGINE_MODE;
const ENGINE_MODE = requestedEngineMode === "worker" ? "worker" : "direct";
const ENABLE_LATENCY_BREAKDOWN = experimentParams.get("latencyBreakdown") !== "0";
const STREAM = experimentParams.get("stream") === "1";
const MAX_CONTEXT_LINES = Math.max(
  0,
  Math.min(5, Number.parseInt(
    experimentParams.get("contextLines") || String(DEFAULT_SETTINGS.translationContextLines),
    10
  ))
);

const elements = {
  adapter: document.querySelector("#adapter-status"),
  initialize: document.querySelector("#initialize"),
  run: document.querySelector("#run"),
  download: document.querySelector("#download"),
  progress: document.querySelector("#load-progress"),
  status: document.querySelector("#status"),
  results: document.querySelector("#results")
};

let engine;
let worker;
let testCases = [];
let environment;
let loadMetrics;
let report;

function round(value, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function assetURL(relativePath) {
  return new URL(relativePath, location.href).href;
}

function buildPrompt(userContent) {
  return `<|im_start|>user\n${userContent.trim()}<|im_end|>\n<|im_start|>assistant\n`;
}

function limitContextLines(userContent) {
  const match = /^CTX:\n([\s\S]*?)\n\nCUR:\n([\s\S]*)$/.exec(userContent.trim());
  if (!match) return userContent;
  const context = match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-MAX_CONTEXT_LINES)
    .join("\n");
  return `CTX:\n${context}\n\nCUR:\n${match[2]}`;
}

function cleanTranslation(text) {
  return text
    .replaceAll("<|im_start|>", "")
    .replaceAll("<|im_end|>", "")
    .replace(/^assistant\s*/i, "")
    .trim();
}

async function loadDataset() {
  const response = await fetch(assetURL("webllm-mini-test-set.jsonl"));
  if (!response.ok) {
    throw new Error(`Failed to load benchmark dataset: HTTP ${response.status}`);
  }
  const text = await response.text();
  const cases = text.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const sha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { cases, sha256 };
}

function render(value) {
  elements.results.textContent = JSON.stringify(value, null, 2);
}

function setStatus(message, kind = "working") {
  elements.status.textContent = message;
  elements.status.dataset.kind = kind;
}

async function inspectWebGPU() {
  if (!navigator.gpu) {
    throw new Error("WebGPU is not available. Use Chrome or Edge 124+ with hardware acceleration enabled.");
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) {
    throw new Error("No WebGPU adapter was returned. Check browser hardware acceleration and GPU blocklist status.");
  }
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    webgpu: true,
    adapterFeatures: [...adapter.features].sort(),
    adapterLimits: {
      maxBufferSize: adapter.limits.maxBufferSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize
    }
  };
}

async function initialize() {
  elements.initialize.disabled = true;
  elements.run.disabled = true;
  elements.download.disabled = true;
  setStatus("Checking WebGPU...");
  try {
    const [gpu, dataset] = await Promise.all([inspectWebGPU(), loadDataset()]);
    environment = { ...gpu, datasetSHA256: dataset.sha256 };
    testCases = dataset.cases;
    elements.adapter.textContent = `WebGPU ready · ${testCases.length} benchmark cases`;
    if (ENGINE_MODE === "worker") {
      worker = new Worker(assetURL("webllm-worker.js"));
    }
    const modelURL = assetURL("model/resolve/main/");
    const modelLibURL = assetURL("model-lib.wasm");
    const startedAt = performance.now();
    const engineConfig = {
        appConfig: {
          model_list: [{
            model: modelURL,
            model_id: WEBLLM_MODEL_ID,
            model_lib: modelLibURL,
            vram_required_MB: 550,
            low_resource_required: true,
            required_features: ["shader-f16"]
          }],
          cacheBackend: "cache"
        },
        initProgressCallback(progress) {
          const percent = Math.round(progress.progress * 100);
          elements.progress.value = percent;
          elements.progress.textContent = `${percent}%`;
          setStatus(progress.text || `Loading model: ${percent}%`);
        },
        logLevel: "WARN"
      };
    engine = ENGINE_MODE === "worker"
      ? await CreateWebWorkerMLCEngine(
        worker,
        WEBLLM_MODEL_ID,
        engineConfig,
        { context_window_size: CONTEXT_WINDOW_SIZE }
      )
      : await CreateMLCEngine(
        WEBLLM_MODEL_ID,
        engineConfig,
        { context_window_size: CONTEXT_WINDOW_SIZE }
      );
    loadMetrics = {
      model: WEBLLM_MODEL_ID,
      modelURL,
      modelLibURL,
      elapsedMs: round(performance.now() - startedAt),
      cacheBackend: "cache",
      contextWindowSize: CONTEXT_WINDOW_SIZE,
      engineMode: ENGINE_MODE,
      gpuVendor: await engine.getGPUVendor(),
      maxStorageBufferBindingSize: await engine.getMaxStorageBufferBindingSize()
    };
    elements.progress.value = 100;
    setStatus(`Model ready in ${loadMetrics.elapsedMs} ms.`, "ready");
    elements.run.disabled = false;
    render({ environment, load: loadMetrics });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
    elements.initialize.disabled = false;
    worker?.terminate();
    worker = undefined;
  }
}

async function infer(testCase, phase, index) {
  const userMessage = testCase.messages.find((message) => message.role === "user")?.content || "";
  const expected = testCase.messages.find((message) => message.role === "assistant")?.content?.trim() || "";
  const startedAt = performance.now();
  try {
    const request = {
      prompt: buildPrompt(limitContextLines(userMessage)),
      temperature: 0,
      max_tokens: MAX_TOKENS,
      seed: 0,
      stop: ["<|im_end|>"],
      stream: STREAM
    };
    if (ENABLE_LATENCY_BREAKDOWN) {
      request.extra_body = {
        enable_latency_breakdown: true
      };
    }
    if (STREAM) {
      request.stream_options = { include_usage: true };
    }
    const response = await engine.completions.create(request);
    let completion = response;
    let firstContentMs = null;
    if (STREAM) {
      let text = "";
      let usage = null;
      let finishReason = null;
      for await (const chunk of response) {
        const delta = chunk.choices[0]?.text || "";
        if (delta && firstContentMs === null) {
          firstContentMs = round(performance.now() - startedAt);
        }
        text += delta;
        usage = chunk.usage || usage;
        finishReason = chunk.choices[0]?.finish_reason || finishReason;
      }
      completion = {
        choices: [{ text, finish_reason: finishReason }],
        usage
      };
    }
    const extra = completion.usage?.extra || {};
    const translation = cleanTranslation(completion.choices[0]?.text || "");
    return {
      phase,
      index,
      id: testCase.id,
      ok: true,
      expected,
      translation,
      exactMatch: translation === expected,
      latencyMs: round(performance.now() - startedAt),
      firstContentMs,
      timeToFirstTokenMs: firstContentMs ?? round(extra.time_to_first_token_s * 1000),
      prefillTokensPerSecond: round(extra.prefill_tokens_per_s),
      decodeTokensPerSecond: round(extra.decode_tokens_per_s),
      inputTokens: completion.usage?.prompt_tokens ?? null,
      outputTokens: completion.usage?.completion_tokens ?? null,
      finishReason: completion.choices[0]?.finish_reason || null
    };
  } catch (error) {
    return {
      phase,
      index,
      id: testCase.id,
      ok: false,
      expected,
      exactMatch: false,
      latencyMs: round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function runBenchmark() {
  elements.run.disabled = true;
  elements.download.disabled = true;
  const warmup = [];
  const samples = [];
  try {
    for (let index = 0; index < WARMUP_CASES; index += 1) {
      setStatus(`Warmup ${index + 1}/${WARMUP_CASES}...`);
      warmup.push(await infer(testCases[index], "warmup", index));
    }
    for (let index = 0; index < testCases.length; index += 1) {
      setStatus(`Benchmark ${index + 1}/${testCases.length}...`);
      samples.push(await infer(testCases[index], "measurement", index));
      if (index % 10 === 0) {
        render({ environment, load: loadMetrics, warmup, completed: index + 1, samples });
      }
    }
    const summary = summarizeLatency(samples);
    const perceivedSummary = summarizeLatency(samples.map((sample) => ({
      ok: sample.ok && typeof sample.firstContentMs === "number",
      latencyMs: sample.firstContentMs
    })));
    const exactMatches = samples.filter((sample) => sample.exactMatch).length;
    const exactMatchPercent = samples.length === 0 ? 0 : (exactMatches / samples.length) * 100;
    const latencyAcceptance = evaluateAcceptance(summary, ACCEPTANCE_P95_MS);
    const acceptance = {
      ...latencyAcceptance,
      exactMatchAtLeastNative: exactMatchPercent >= NATIVE_EXACT_MATCH_PERCENT,
      nativeExactMatchPercent: NATIVE_EXACT_MATCH_PERCENT,
      passed: latencyAcceptance.passed && exactMatchPercent >= NATIVE_EXACT_MATCH_PERCENT
    };
    report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      experiment: "standalone-webllm-custom-checkpoint",
      webllmVersion: "0.2.84",
      parameters: {
        maxTokens: MAX_TOKENS,
        contextWindowSize: CONTEXT_WINDOW_SIZE,
        engineMode: ENGINE_MODE,
        latencyBreakdown: ENABLE_LATENCY_BREAKDOWN,
        stream: STREAM,
        maxContextLines: MAX_CONTEXT_LINES
      },
      environment,
      load: loadMetrics,
      warmup,
      samples,
      summary: {
        ...Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, typeof value === "number" ? round(value) : value])),
        perceivedFirstContent: Object.fromEntries(
          Object.entries(perceivedSummary).map(([key, value]) => [key, typeof value === "number" ? round(value) : value])
        ),
        exactMatches,
        exactMatchPercent: round(exactMatchPercent),
        acceptance
      }
    };
    render(report);
    const passed = acceptance.passed;
    setStatus(
      passed
        ? `PASS · P95 ${report.summary.p95Ms} ms · exact ${report.summary.exactMatchPercent}%`
        : `NO-GO · P95 ${report.summary.p95Ms ?? "n/a"} ms · exact ${report.summary.exactMatchPercent}%`,
      passed ? "ready" : "error"
    );
    elements.download.disabled = false;
  } finally {
    elements.run.disabled = false;
  }
}

function downloadReport() {
  if (!report) {
    return;
  }
  const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `webllm-latency-${new Date().toISOString().replaceAll(":", "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

elements.initialize.addEventListener("click", initialize);
elements.run.addEventListener("click", runBenchmark);
elements.download.addEventListener("click", downloadReport);

inspectWebGPU()
  .then((details) => {
    elements.adapter.textContent = `WebGPU detected · ${details.adapterFeatures.includes("shader-f16") ? "shader-f16" : "f32 fallback"}`;
  })
  .catch((error) => {
    elements.adapter.textContent = error instanceof Error ? error.message : String(error);
    elements.initialize.disabled = true;
  });
