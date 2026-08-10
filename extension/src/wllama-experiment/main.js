import { Wllama } from "@wllama/wllama";
import { evaluateAcceptance, summarizeLatency } from "../webllm-experiment/metrics.js";

const MODEL_URL = "https://huggingface.co/Aiden1020/LocalSubs-EN-ZH-TW-0.6B/resolve/main/LocalSubs-EN-ZH-TW-0.6B-Q5_K_M.gguf";
const MODEL_SHA256 = "525351104440c210f235721d9290b459dac00392331c93008cac401c055c9a76";
const MODEL_SIZE = 367318176;
const WARMUP_CASES = 3;
const ACCEPTANCE_P95_MS = 300;
const NATIVE_EXACT_MATCH_PERCENT = 8;

const elements = {
  adapter: document.querySelector("#adapter-status"),
  initialize: document.querySelector("#initialize"),
  run: document.querySelector("#run"),
  download: document.querySelector("#download"),
  progress: document.querySelector("#load-progress"),
  status: document.querySelector("#status"),
  results: document.querySelector("#results")
};

let runtime;
let testCases = [];
let environment;
let loadMetrics;
let report;
const backendEvidence = [];

function assetURL(relativePath) {
  return new URL(relativePath, location.href).href;
}

function round(value, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function render(value) {
  elements.results.textContent = JSON.stringify(value, null, 2);
}

function setStatus(message, kind = "working") {
  elements.status.textContent = message;
  elements.status.dataset.kind = kind;
}

function stringifyLogValue(value) {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function captureLog(level, args) {
  const message = args.map(stringifyLogValue).join(" ");
  const isBackendEvidence = /webgpu|wgpu|gpu|offload|backend|device/i.test(message);
  if (isBackendEvidence) {
    backendEvidence.push({ level, message });
    console.log(`[wllama:${level}] ${message}`);
  }
  if (level === "error") {
    console.error(...args);
  } else if (level === "warn") {
    console.warn(...args);
  }
}

function buildPrompt(userContent) {
  return `<|im_start|>user\n${userContent.trim()}<|im_end|>\n<|im_start|>assistant\n`;
}

function cleanTranslation(text) {
  const withoutTags = text
    .replaceAll("<|im_start|>", "")
    .replaceAll("<|im_end|>", "")
    .replaceAll("assistant", "");
  return withoutTags
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== ""
      && line !== "CTX:"
      && line !== "CUR:"
      && !line.startsWith("CTX:")
      && !line.startsWith("CUR:"))
    .join("\n");
}

async function loadDataset() {
  const response = await fetch(assetURL("wllama-mini-test-set.jsonl"));
  if (!response.ok) {
    throw new Error(`Failed to load benchmark dataset: HTTP ${response.status}`);
  }
  const text = await response.text();
  const cases = text.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return { cases, sha256 };
}

async function inspectWebGPU() {
  if (!navigator.gpu) {
    throw new Error("WebGPU is not available. Use Chrome or Edge with hardware acceleration enabled.");
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) {
    throw new Error("No WebGPU adapter was returned.");
  }
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    webgpu: true,
    adapterFeatures: [...adapter.features].sort(),
    adapterLimits: {
      maxBufferSize: adapter.limits.maxBufferSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize
    }
  };
}

async function inspectBlobWorker() {
  const source = "self.postMessage({ started: true });";
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(url);
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error("Blob worker did not respond within 5 seconds."));
      }, 5000);
      worker.onmessage = (event) => {
        clearTimeout(timeout);
        worker.terminate();
        resolve(event.data);
      };
      worker.onerror = (event) => {
        clearTimeout(timeout);
        worker.terminate();
        reject(new Error(`Blob worker failed: ${event.message || "opaque error"}`));
      };
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function downloadModelBlob() {
  if (new URLSearchParams(location.search).has("worker-diagnostic")) {
    elements.progress.value = 100;
    setStatus("Worker diagnostic: loading a deliberately invalid tiny GGUF...");
    return new Blob([new TextEncoder().encode("GGUF-worker-diagnostic")], {
      type: "application/octet-stream"
    });
  }
  const response = await fetch(MODEL_URL);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download GGUF: HTTP ${response.status}`);
  }
  const total = Number.parseInt(response.headers.get("content-length") || "", 10) || MODEL_SIZE;
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    loaded += value.byteLength;
    const percent = Math.min(100, Math.round((loaded / total) * 100));
    elements.progress.value = percent;
    elements.progress.textContent = `${percent}%`;
    setStatus(`Downloading GGUF: ${Math.round(loaded / 1024 / 1024)} / ${Math.round(total / 1024 / 1024)} MB`);
  }
  return new Blob(chunks, { type: "application/octet-stream" });
}

async function initialize() {
  elements.initialize.disabled = true;
  elements.run.disabled = true;
  elements.download.disabled = true;
  setStatus("Checking WebGPU and dataset...");
  try {
    const [gpu, dataset] = await Promise.all([inspectWebGPU(), loadDataset()]);
    environment = gpu;
    testCases = dataset.cases;
    environment.datasetSHA256 = dataset.sha256;
    runtime = new Wllama(
      { default: assetURL("wllama.wasm") },
      {
        logger: {
          debug: (...args) => captureLog("debug", args),
          log: (...args) => captureLog("log", args),
          warn: (...args) => captureLog("warn", args),
          error: (...args) => captureLog("error", args)
        },
        suppressNativeLog: false,
        parallelDownloads: 1
      }
    );
    const standalone = new URLSearchParams(location.search).has("standalone");
    if (standalone) {
      runtime.setCompat(null);
    } else {
      const compatWorkerResponse = await fetch(assetURL("wllama-compat.js.txt"));
      if (!compatWorkerResponse.ok) {
        throw new Error(`Failed to load wllama compat worker: HTTP ${compatWorkerResponse.status}`);
      }
      runtime.setCompat({
        wasm: assetURL("wllama-compat.wasm"),
        worker: { code: await compatWorkerResponse.text() }
      });
    }
    if (!runtime.isSupportWebGPU()) {
      throw new Error("wllama reports that WebGPU is unavailable in this browser.");
    }
    elements.adapter.textContent = `WebGPU ready · ${testCases.length} benchmark cases`;
    const startedAt = performance.now();
    const downloadStartedAt = performance.now();
    const modelBlob = await downloadModelBlob();
    const downloadElapsedMs = performance.now() - downloadStartedAt;
    setStatus("Loading GGUF into llama.cpp WebGPU...");
    const modelLoadStartedAt = performance.now();
    await runtime.loadModel([modelBlob], {
      n_ctx: 512,
      n_batch: 512,
      n_gpu_layers: 99999,
      n_threads: 1,
      offload_kqv: true,
      flash_attn: true,
      warmup: true
    });
    const modelLoadElapsedMs = performance.now() - modelLoadStartedAt;
    const context = runtime.getLoadedContextInfo();
    loadMetrics = {
      model: "LocalSubs-EN-ZH-TW-0.6B-Q5_K_M.gguf",
      modelURL: MODEL_URL,
      modelSHA256: MODEL_SHA256,
      modelSizeBytes: MODEL_SIZE,
      elapsedMs: round(performance.now() - startedAt),
      downloadElapsedMs: round(downloadElapsedMs),
      modelLoadElapsedMs: round(modelLoadElapsedMs),
      cacheBackend: standalone ? "none-standalone-direct-blob" : "none-sandbox-direct-blob",
      runtime: "wllama",
      runtimeVersion: "3.5.1",
      runtimeMode: standalone ? "modern-jspi-memory64" : "compat-asyncify",
      llamaCppVersion: Wllama.getLibllamaVersion(),
      webgpuSupported: runtime.isSupportWebGPU(),
      requestedGPULayers: 99999,
      contextWindowSize: context.n_ctx,
      modelLayers: context.n_layer,
      threads: runtime.getNumThreads(),
      multithread: runtime.isMultithread(),
      backendEvidence
    };
    elements.progress.value = 100;
    setStatus(`GGUF ready in ${loadMetrics.elapsedMs} ms.`, "ready");
    elements.run.disabled = false;
    render({ environment, load: loadMetrics });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
    elements.initialize.disabled = false;
    await runtime?.exit().catch(() => {});
    runtime = undefined;
  }
}

async function infer(item, phase, index) {
  const userMessage = item.messages.find((message) => message.role === "user")?.content || "";
  const expected = item.messages.find((message) => message.role === "assistant")?.content?.trim() || "";
  const startedAt = performance.now();
  try {
    const completion = await runtime.createCompletion({
      prompt: buildPrompt(userMessage),
      max_tokens: 24,
      temperature: 0,
      temp: 0,
      stop: ["<|im_end|>"],
      seed: 0,
      cache_prompt: true,
      timings_per_token: true
    });
    const translation = cleanTranslation(completion.choices[0]?.text || "");
    return {
      phase,
      index,
      id: item.id,
      ok: true,
      expected,
      translation,
      exactMatch: translation === expected,
      latencyMs: round(performance.now() - startedAt),
      promptTokensPerSecond: round(completion.timings?.prompt_per_second),
      decodeTokensPerSecond: round(completion.timings?.predicted_per_second),
      outputTokens: completion.usage?.completion_tokens ?? completion.timings?.predicted_n ?? null,
      finishReason: completion.choices[0]?.finish_reason || null
    };
  } catch (error) {
    return {
      phase,
      index,
      id: item.id,
      ok: false,
      expected,
      latencyMs: round(performance.now() - startedAt),
      exactMatch: false,
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
      experiment: new URLSearchParams(location.search).has("standalone")
        ? "standalone-wllama-webgpu-gguf"
        : "extension-wllama-webgpu-gguf",
      environment,
      load: loadMetrics,
      warmup,
      samples,
      summary: {
        ...Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, typeof value === "number" ? round(value) : value])),
        exactMatches,
        exactMatchPercent: round(exactMatchPercent),
        acceptance
      }
    };
    render(report);
    setStatus(
      acceptance.passed
        ? `PASS · P95 ${report.summary.p95Ms} ms · exact ${report.summary.exactMatchPercent}%`
        : `NO-GO · P95 ${report.summary.p95Ms ?? "n/a"} ms · exact ${report.summary.exactMatchPercent}%`,
      acceptance.passed ? "ready" : "error"
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
  link.download = `wllama-latency-${new Date().toISOString().replaceAll(":", "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

elements.initialize.addEventListener("click", initialize);
elements.run.addEventListener("click", runBenchmark);
elements.download.addEventListener("click", downloadReport);

Promise.all([inspectWebGPU(), inspectBlobWorker()])
  .then(([, worker]) => {
    elements.adapter.textContent = `Browser WebGPU + Blob worker detected (started: ${worker.started})`;
  })
  .catch((error) => {
    elements.adapter.textContent = error instanceof Error ? error.message : String(error);
    elements.initialize.disabled = true;
  });
