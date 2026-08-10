export function createInferenceRouter({ nativeTranslator, webllmTranslator, getBackend }) {
  async function selectedTranslator() {
    const backend = await getBackend();
    return backend === "native" ? nativeTranslator : webllmTranslator;
  }

  async function translateSubtitle(payload) {
    return (await selectedTranslator()).translateSubtitle(payload);
  }

  async function checkTranslator(warmup = false) {
    return (await selectedTranslator()).checkTranslator(warmup);
  }

  return { checkTranslator, translateSubtitle };
}
