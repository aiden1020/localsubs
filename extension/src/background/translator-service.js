import { NativeHostError } from "../core/errors.js";

const EXPECTED_API_VERSION = "1";

export function createTranslatorService(nativeClient, now = () => performance.now()) {
  let compatibilityPromise = null;
  let compatibilityGeneration = -1;

  function connectionGeneration() {
    return Number.isSafeInteger(nativeClient.connectionGeneration)
      ? nativeClient.connectionGeneration
      : 0;
  }

  function verifyCompatibility(health) {
    if (health.apiVersion !== EXPECTED_API_VERSION) {
      throw new NativeHostError(
        "incompatible_api",
        `Helper API ${health.apiVersion || "unknown"} is incompatible with extension API ${EXPECTED_API_VERSION}`
      );
    }
    return health;
  }

  function ensureCompatibility() {
    if (!compatibilityPromise || compatibilityGeneration !== connectionGeneration()) {
      const healthRequest = nativeClient.send("health", {});
      compatibilityGeneration = connectionGeneration();
      compatibilityPromise = healthRequest
        .then((health) => {
          verifyCompatibility(health);
          compatibilityGeneration = connectionGeneration();
          return health;
        })
        .catch((error) => {
          compatibilityPromise = null;
          compatibilityGeneration = -1;
          throw error;
        });
    }
    return compatibilityPromise;
  }

  async function translateSubtitle(payload) {
    await ensureCompatibility();
    const result = await nativeClient.send("translate", payload);
    return {
      ok: true,
      translation: typeof result.translation === "string" ? result.translation : "",
      cache: typeof result.cache === "string" ? result.cache : "",
      superseded: Boolean(result.superseded),
      model: typeof result.model === "string" ? result.model : "",
      transport: "native"
    };
  }

  async function checkLocalTranslator(warmup = false) {
    const startedAt = now();
    const health = await nativeClient.send("health", {});
    if (health.apiVersion !== EXPECTED_API_VERSION) {
      compatibilityPromise = null;
      compatibilityGeneration = -1;
      return {
        ok: false,
        loading: false,
        transport: "native",
        apiVersion: health.apiVersion,
        helperVersion: health.helperVersion,
        error: {
          code: "incompatible_api",
          message: `Helper API ${health.apiVersion || "unknown"} is incompatible with extension API ${EXPECTED_API_VERSION}`
        }
      };
    }
    compatibilityPromise = Promise.resolve(health);
    compatibilityGeneration = connectionGeneration();
    if (health.loading) {
      return {
        ok: false,
        loading: true,
        transport: "native",
        apiVersion: health.apiVersion,
        helperVersion: health.helperVersion
      };
    }

    let translation = "";
    if (warmup && health.ok) {
      const warmupResult = await translateSubtitle({
        text: "Warm up.\nReady.",
        sourceLanguage: "en",
        targetLanguage: "zh-Hant",
        ctxSize: 1
      });
      translation = warmupResult.translation || "";
    }
    return {
      ok: Boolean(health.ok),
      error: health.ok ? undefined : {
        code: "helper_not_ready",
        message: health.lastError || "Native helper is not ready"
      },
      latencyMs: Math.round(now() - startedAt),
      translation,
      transport: "native",
      apiVersion: health.apiVersion,
      helperVersion: health.helperVersion,
      backend: health.backend,
      model: health.model
    };
  }

  return { checkLocalTranslator, translateSubtitle };
}
