import { describe, expect, it, vi } from "vitest";
import { NativeClient } from "../src/background/native-client.js";

function event() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    emit(value) {
      for (const listener of listeners) listener(value);
    }
  };
}

function fakePort() {
  return {
    onMessage: event(),
    onDisconnect: event(),
    postMessage: vi.fn(),
    disconnect: vi.fn()
  };
}

function createClient(port, options = {}) {
  return new NativeClient({
    hostName: "localsubs_helper",
    timeoutMs: 1000,
    connectNative: vi.fn(() => port),
    idFactory: () => "request-1",
    ...options
  });
}

describe("NativeClient", () => {
  it("correlates responses and clears pending state", async () => {
    const port = fakePort();
    const client = createClient(port);
    const result = client.send("health", {});
    expect(port.postMessage).toHaveBeenCalledWith({ id: "request-1", type: "health", payload: {} });
    port.onMessage.emit({ id: "request-1", ok: true, payload: { ok: true } });
    await expect(result).resolves.toEqual({ ok: true });
    expect(client.pending.size).toBe(0);
  });

  it("preserves structured native host errors", async () => {
    const port = fakePort();
    const client = createClient(port);
    const result = client.send("translate", {});
    port.onMessage.emit({
      id: "request-1",
      ok: false,
      error: { code: "model_loading", message: "Loading" }
    });
    await expect(result).rejects.toMatchObject({ code: "model_loading", message: "Loading" });
  });

  it("rejects pending requests when the host disconnects", async () => {
    const port = fakePort();
    const client = createClient(port, {
      getLastError: () => ({ message: "Host exited" })
    });
    const result = client.send("health", {});
    port.onDisconnect.emit();
    await expect(result).rejects.toMatchObject({
      code: "native_host_disconnected",
      message: "Host exited"
    });
    expect(client.pending.size).toBe(0);
  });

  it("times out, disconnects, and allows a fresh port", async () => {
    vi.useFakeTimers();
    const first = fakePort();
    const second = fakePort();
    const connectNative = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    let requestNumber = 0;
    const client = new NativeClient({
      hostName: "localsubs_helper",
      timeoutMs: 1000,
      connectNative,
      idFactory: () => `request-${++requestNumber}`
    });
    const timedOut = client.send("health", {});
    const rejection = expect(timedOut).rejects.toMatchObject({ code: "native_request_timeout" });
    await vi.advanceTimersByTimeAsync(1000);
    await rejection;
    expect(first.disconnect).toHaveBeenCalledOnce();

    const next = client.send("health", {});
    first.onDisconnect.emit();
    expect(client.pending.size).toBe(1);
    second.onMessage.emit({ id: "request-2", ok: true, payload: { ok: true } });
    await expect(next).resolves.toEqual({ ok: true });
    expect(connectNative).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
