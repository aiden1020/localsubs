import { MODEL_CATALOG, MODEL_TIERS, normalizeModelTier } from "../core/model-catalog.js";

// Owns one WebLLM translator per model tier and keeps at most one engine
// loaded: switching tiers unloads the previous model's GPU resources.
export function createWebLLMManager({ createTranslator, getTier }) {
  const translators = new Map();
  let loadedTier = null;

  function translatorFor(tier) {
    const key = normalizeModelTier(tier);
    if (!translators.has(key)) {
      translators.set(key, createTranslator(MODEL_CATALOG[key]));
    }
    return { key, translator: translators.get(key) };
  }

  async function activeTranslator() {
    const { key, translator } = translatorFor(await getTier());
    if (loadedTier && loadedTier !== key) {
      await translators.get(loadedTier)?.unload().catch(() => {});
    }
    loadedTier = key;
    return translator;
  }

  async function translateSubtitle(payload) {
    return (await activeTranslator()).translateSubtitle(payload);
  }

  async function checkTranslator(warmup = false) {
    const result = await (await activeTranslator()).checkTranslator(warmup);
    return { ...result, tier: loadedTier };
  }

  async function listModels() {
    const active = normalizeModelTier(await getTier());
    return Promise.all(MODEL_TIERS.map(async (tier) => ({
      tier,
      cached: await translatorFor(tier).translator.isCached(),
      active: tier === active,
      downloadMB: MODEL_CATALOG[tier].webllm.downloadMB
    })));
  }

  async function unload() {
    const pending = [...translators.values()].map((translator) => translator.unload().catch(() => {}));
    loadedTier = null;
    await Promise.all(pending);
  }

  return { checkTranslator, listModels, translateSubtitle, unload };
}
