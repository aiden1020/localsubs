import { NativeHostError } from "../core/errors.js";

export class NativeClient {
  constructor({
    hostName,
    timeoutMs,
    connectNative,
    getLastError = () => undefined,
    idFactory = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    setTimer = (...args) => globalThis.setTimeout(...args),
    clearTimer = (...args) => globalThis.clearTimeout(...args)
  }) {
    this.hostName = hostName;
    this.timeoutMs = timeoutMs;
    this.connectNative = connectNative;
    this.getLastError = getLastError;
    this.idFactory = idFactory;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.port = null;
    this.connectionGeneration = 0;
    this.pending = new Map();
  }

  send(type, payload) {
    return new Promise((resolve, reject) => {
      const id = this.idFactory();
      const timeout = this.setTimer(() => {
        this.pending.delete(id);
        reject(new NativeHostError("native_request_timeout", "Native host request timed out"));
        this.reset("native_host_disconnected", "Native host connection reset after request timeout");
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.getPort().postMessage({ id, type, payload });
      } catch (error) {
        this.takePending(id);
        this.reset("native_host_disconnected", "Native host connection reset after send failure");
        reject(new NativeHostError(
          "native_send_failed",
          error instanceof Error ? error.message : "Unable to send native message"
        ));
      }
    });
  }

  getPort() {
    if (this.port) {
      return this.port;
    }
    const port = this.connectNative(this.hostName);
    this.port = port;
    this.connectionGeneration += 1;
    port.onMessage.addListener((response) => this.handleResponse(response));
    port.onDisconnect.addListener(() => {
      if (this.port !== port) {
        return;
      }
      const message = this.getLastError()?.message || "Native host disconnected";
      this.port = null;
      this.connectionGeneration += 1;
      this.rejectAll("native_host_disconnected", message);
    });
    return port;
  }

  handleResponse(response) {
    const id = response?.id;
    const pending = id && this.takePending(id);
    if (!pending) return;
    if (!response.ok) {
      pending.reject(new NativeHostError(
        response.error?.code || "native_host_error",
        response.error?.message || "Native host returned an error"
      ));
      return;
    }
    pending.resolve(response.payload || {});
  }

  takePending(id) {
    const pending = this.pending.get(id);
    if (!pending) return null;
    this.pending.delete(id);
    this.clearTimer(pending.timeout);
    return pending;
  }

  reset(code, message) {
    const port = this.port;
    this.port = null;
    if (!port) return;
    this.connectionGeneration += 1;
    if (code) {
      this.rejectAll(code, message);
    }
    try {
      port.disconnect();
    } catch {
      // The port may already be disconnected.
    }
  }

  rejectAll(code, message) {
    for (const pending of this.pending.values()) {
      this.clearTimer(pending.timeout);
      pending.reject(new NativeHostError(code, message));
    }
    this.pending.clear();
  }
}
