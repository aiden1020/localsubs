// One entry per user-facing choice. A tier maps to a WebLLM model for browser
// inference and to a native helper channel for desktop inference.
export const MODEL_TIERS = Object.freeze(["fast", "quality"]);
export const DEFAULT_MODEL_TIER = "fast";

const HF_BASE = "https://huggingface.co/Aiden1020";

export const MODEL_CATALOG = Object.freeze({
  fast: Object.freeze({
    tier: "fast",
    name: "Sotto 0.6B",
    helperChannel: "stable",
    helperModelId: "sotto-en-zh-tw-0.6b",
    webllm: Object.freeze({
      modelId: "Sotto-EN-ZH-TW-0.6B-q4f16_1-MLC",
      modelURL: `${HF_BASE}/Sotto-EN-ZH-TW-0.6B/resolve/main/mlc-q4f16_1/`,
      libFile: "model-lib.wasm",
      vramMB: 550,
      downloadMB: 290
    })
  }),
  quality: Object.freeze({
    tier: "quality",
    name: "Sotto 1.7B",
    helperChannel: "1.7b",
    helperModelId: "sotto-en-zh-tw-1.7b",
    webllm: Object.freeze({
      modelId: "Sotto-EN-ZH-TW-1.7B-q4f16_1-MLC",
      modelURL: `${HF_BASE}/Sotto-EN-ZH-TW-1.7B/resolve/main/mlc-q4f16_1/`,
      libFile: "model-lib-quality.wasm",
      vramMB: 1400,
      downloadMB: 895
    })
  })
});

// Superseded browser models. Their cached weights are removed once a current
// model has loaded successfully.
export const LEGACY_WEBLLM_MODELS = Object.freeze([
  Object.freeze({
    modelId: "LocalSubs-EN-ZH-TW-0.6B-64k-q4f16_1-MLC-v1",
    modelURL: `${HF_BASE}/LocalSubs-EN-ZH-TW-0.6B/resolve/main/webllm-64k-q4f16_1-v1/`,
    libFile: "model-lib.wasm",
    vramMB: 550
  })
]);

export function normalizeModelTier(value) {
  return MODEL_TIERS.includes(value) ? value : DEFAULT_MODEL_TIER;
}

// Pre-tier installs stored the native helper channel instead. Anything that
// is not the 1.7B channel (stable and the retired alpha channels) is "fast".
export function tierForHelperChannel(channel) {
  return channel === MODEL_CATALOG.quality.helperChannel ? "quality" : "fast";
}

export function helperChannelForTier(tier) {
  return MODEL_CATALOG[normalizeModelTier(tier)].helperChannel;
}
