export class NativeHostError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "NativeHostError";
    this.code = code;
  }
}

export function errorPayload(error, fallbackCode = "native_host_error") {
  return {
    code: typeof error?.code === "string" ? error.code : fallbackCode,
    message: error instanceof Error ? error.message : "Native helper failed"
  };
}

export function normalizeErrorPayload(error, fallbackCode = "translation_failed") {
  if (error && typeof error === "object") {
    return {
      code: typeof error.code === "string" ? error.code : fallbackCode,
      message: typeof error.message === "string" ? error.message : "Local translator returned an error."
    };
  }
  const message = typeof error === "string" && error
    ? error
    : "Local translator returned an error.";
  return {
    code: message.includes("model_loading") ? "model_loading" : fallbackCode,
    message
  };
}
