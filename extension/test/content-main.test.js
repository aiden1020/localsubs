// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://play.max.com/"}

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/settings.js";

afterEach(() => {
  delete globalThis.chrome;
  delete window.__openStreamSubtitlesLoaded;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps native captions visible when translation is disabled", async () => {
  window.history.replaceState({}, "", "/video/watch/test");
  document.body.innerHTML =
    "<video src='movie.m3u8'></video>" +
    readFileSync(
      path.join(process.cwd(), "extension", "fixtures", "max", "single-line.html"),
      "utf8"
    );
  for (const node of document.querySelectorAll("[class*='CaptionWindow'], [data-testid='cueBoxRowTextCue']")) {
    node.getBoundingClientRect = () => ({
      width: 400, height: 40, top: 600, bottom: 640, left: 200, right: 600
    });
  }

  const sendMessage = vi.fn();
  globalThis.chrome = {
    runtime: { sendMessage },
    storage: {
      sync: {
        get: vi.fn().mockResolvedValue({
          ...DEFAULT_SETTINGS,
          translationEnabled: false,
          hideNativeSubtitles: true
        })
      },
      onChanged: { addListener: vi.fn() }
    }
  };
  window.requestAnimationFrame = vi.fn((callback) => {
    callback();
    return 1;
  });
  vi.stubGlobal("MutationObserver", class {
    observe() {}
    disconnect() {}
  });

  vi.resetModules();
  await import("../src/content/main.js");
  await vi.waitFor(() => {
    expect(document.getElementById("localsubs-overlay")).not.toBeNull();
  });

  const caption = document.querySelector("[class*='CaptionWindow']");
  expect(caption.style.visibility).toBe("");
  expect(caption.hasAttribute("data-localsubs-hidden")).toBe(false);
  expect(sendMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: "TRANSLATE_SUBTITLE" })
  );
});

it("stops an in-flight model poll when translation is disabled", async () => {
  window.history.replaceState({}, "", "/video/watch/test");
  document.body.innerHTML =
    "<video src='movie.m3u8'></video>" +
    readFileSync(
      path.join(process.cwd(), "extension", "fixtures", "max", "single-line.html"),
      "utf8"
    );
  for (const node of document.querySelectorAll("[class*='CaptionWindow'], [data-testid='cueBoxRowTextCue']")) {
    node.getBoundingClientRect = () => ({
      width: 400, height: 40, top: 600, bottom: 640, left: 200, right: 600
    });
  }

  let storageListener;
  let resolveHealth;
  const sendMessage = vi.fn((message) => {
    if (message.type === "CHECK_TRANSLATOR") {
      return new Promise((resolve) => {
        resolveHealth = resolve;
      });
    }
    return Promise.resolve({ ok: false, error: { code: "model_loading", message: "loading" } });
  });
  globalThis.chrome = {
    runtime: { sendMessage },
    storage: {
      sync: { get: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, translationEnabled: true }) },
      onChanged: {
        addListener: vi.fn((listener) => {
          storageListener = listener;
        })
      }
    }
  };
  window.requestAnimationFrame = vi.fn((callback) => {
    callback();
    return 1;
  });
  vi.stubGlobal("MutationObserver", class {
    observe() {}
    disconnect() {}
  });

  vi.resetModules();
  await import("../src/content/main.js");
  await vi.waitFor(() => {
    expect(resolveHealth).toBeTypeOf("function");
    expect(storageListener).toBeTypeOf("function");
  });

  storageListener({
    translationEnabled: { oldValue: true, newValue: false }
  }, "sync");
  resolveHealth({ ok: false, loading: true, apiVersion: "1" });
  await Promise.resolve();
  await Promise.resolve();

  const card = document.getElementById("localsubs-setup-card")?.shadowRoot.querySelector(".card");
  const caption = document.querySelector("[class*='CaptionWindow']");
  expect(!card || card.hidden).toBe(true);
  expect(caption.style.visibility).toBe("");
  expect(sendMessage.mock.calls.filter(([message]) =>
    message.type === "CHECK_TRANSLATOR"
  )).toHaveLength(1);
});

it("prewarms a cached WebLLM model before the first subtitle", async () => {
  window.history.replaceState({}, "", "/video/watch/test");
  document.body.innerHTML = "<video src='movie.m3u8'></video>";

  const sendMessage = vi.fn()
    .mockResolvedValueOnce({ ok: false, needsInitialization: true, cached: true })
    .mockResolvedValueOnce({ ok: true, cached: true, transport: "webllm" });
  globalThis.chrome = {
    runtime: { sendMessage },
    storage: {
      sync: { get: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, translationEnabled: true }) },
      onChanged: { addListener: vi.fn() }
    }
  };
  window.requestAnimationFrame = vi.fn((callback) => {
    callback();
    return 1;
  });
  vi.stubGlobal("MutationObserver", class {
    observe() {}
    disconnect() {}
  });

  vi.resetModules();
  await import("../src/content/main.js");
  await vi.waitFor(() => {
    expect(sendMessage).toHaveBeenCalledWith({ type: "CHECK_TRANSLATOR", warmup: true });
  });
  expect(sendMessage.mock.calls.filter(([message]) =>
    message.type === "CHECK_TRANSLATOR"
  )).toEqual([
    [{ type: "CHECK_TRANSLATOR", warmup: false }],
    [{ type: "CHECK_TRANSLATOR", warmup: true }]
  ]);
});

it("retries the visible subtitle when cached model warmup completes", async () => {
  window.history.replaceState({}, "", "/video/watch/test");
  document.body.innerHTML =
    "<video src='movie.m3u8'></video>" +
    readFileSync(
      path.join(process.cwd(), "extension", "fixtures", "max", "single-line.html"),
      "utf8"
    );
  for (const node of document.querySelectorAll("[class*='CaptionWindow'], [data-testid='cueBoxRowTextCue']")) {
    node.getBoundingClientRect = () => ({
      width: 400, height: 40, top: 600, bottom: 640, left: 200, right: 600
    });
  }

  let resolveWarmup;
  let translationRequests = 0;
  const sendMessage = vi.fn((message) => {
    if (message.type === "CHECK_TRANSLATOR" && !message.warmup) {
      return Promise.resolve({ ok: false, needsInitialization: true, cached: true });
    }
    if (message.type === "CHECK_TRANSLATOR" && message.warmup) {
      return new Promise((resolve) => {
        resolveWarmup = resolve;
      });
    }
    if (message.type === "TRANSLATE_SUBTITLE") {
      translationRequests += 1;
      return Promise.resolve(translationRequests === 1
        ? { ok: false, error: { code: "model_loading", message: "loading" } }
        : { ok: true, translation: "重試成功", superseded: false });
    }
    return Promise.resolve({ ok: false });
  });
  globalThis.chrome = {
    runtime: { sendMessage },
    storage: {
      sync: { get: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, translationEnabled: true }) },
      onChanged: { addListener: vi.fn() }
    }
  };
  window.requestAnimationFrame = vi.fn((callback) => {
    callback();
    return 1;
  });
  vi.stubGlobal("MutationObserver", class {
    observe() {}
    disconnect() {}
  });

  vi.resetModules();
  await import("../src/content/main.js");
  await vi.waitFor(() => {
    expect(translationRequests).toBe(1);
    expect(resolveWarmup).toBeTypeOf("function");
  });
  resolveWarmup({ ok: true, cached: true, transport: "webllm" });

  await vi.waitFor(() => expect(translationRequests).toBe(2));
  await vi.waitFor(() => {
    expect(document.getElementById("localsubs-overlay")?.textContent).toContain("重試成功");
  });
});

it("downloads an uncached model once a video plays and shows its progress", async () => {
  window.history.replaceState({}, "", "/video/watch/test");
  document.body.innerHTML = "<div class='player'><video src='movie.m3u8'></video></div>";

  let downloadStarted = false;
  let resolveWarmup;
  const sendMessage = vi.fn((message) => {
    if (message.type === "CHECK_TRANSLATOR" && message.warmup) {
      downloadStarted = true;
      return new Promise((resolve) => {
        resolveWarmup = resolve;
      });
    }
    if (message.type === "CHECK_TRANSLATOR") {
      return Promise.resolve(downloadStarted
        ? { ok: false, loading: true, progress: 0.42, cached: false, transport: "webllm" }
        : { ok: false, needsDownload: true, cached: false, transport: "webllm" });
    }
    return Promise.resolve({ ok: false });
  });
  globalThis.chrome = {
    runtime: { sendMessage },
    storage: {
      sync: { get: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, translationEnabled: true }) },
      onChanged: { addListener: vi.fn() }
    }
  };
  window.requestAnimationFrame = vi.fn((callback) => {
    callback();
    return 1;
  });
  vi.stubGlobal("MutationObserver", class {
    observe() {}
    disconnect() {}
  });

  vi.resetModules();
  await import("../src/content/main.js");
  await vi.waitFor(() => {
    expect(sendMessage).toHaveBeenCalledWith({ type: "CHECK_TRANSLATOR", warmup: false });
  });
  // Nothing downloads while no video is playing.
  expect(sendMessage).not.toHaveBeenCalledWith({ type: "CHECK_TRANSLATOR", warmup: true });

  const video = document.querySelector("video");
  Object.defineProperty(video, "paused", { configurable: true, value: false });
  video.dispatchEvent(new Event("playing"));
  expect(sendMessage).toHaveBeenCalledWith({ type: "CHECK_TRANSLATOR", warmup: true });

  const card = () => document.getElementById("localsubs-setup-card").shadowRoot;
  expect(card().querySelector(".title").textContent).toBe("正在下載翻譯模型");
  expect(card().querySelector(".detail").textContent).toContain("約 290 MB");
  // No shard has finished yet: a busy bar, not a stuck "0%".
  expect(card().querySelector(".percent").textContent).toBe("");
  expect(card().querySelector(".bar").classList.contains("is-indeterminate")).toBe(true);
  await vi.waitFor(() => {
    expect(card().querySelector(".percent").textContent).toBe("42%");
  }, { timeout: 3000 });

  resolveWarmup({ ok: true, cached: true, transport: "webllm" });
  await vi.waitFor(() => {
    expect(card().querySelector(".title").textContent).toBe("雙語字幕準備好了");
  });
});

it("tells people without WebGPU what to do, in the player", async () => {
  window.history.replaceState({}, "", "/video/watch/test");
  document.body.innerHTML = "<div class='player'><video src='movie.m3u8'></video></div>";

  const sendMessage = vi.fn().mockResolvedValue({
    ok: false,
    transport: "webllm",
    error: { code: "webgpu_unavailable", message: "WebGPU is not available in this browser" }
  });
  globalThis.chrome = {
    runtime: { sendMessage },
    storage: {
      sync: { get: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, translationEnabled: true }) },
      onChanged: { addListener: vi.fn() }
    }
  };
  window.requestAnimationFrame = vi.fn((callback) => {
    callback();
    return 1;
  });
  vi.stubGlobal("MutationObserver", class {
    observe() {}
    disconnect() {}
  });

  vi.resetModules();
  await import("../src/content/main.js");
  const card = () => document.getElementById("localsubs-setup-card")?.shadowRoot;
  await vi.waitFor(() => {
    expect(card()?.querySelector(".title").textContent).toBe("這台電腦無法在瀏覽器中翻譯");
  });
  const action = card().querySelector(".action");
  expect(action.hidden).toBe(false);
  action.click();
  expect(sendMessage).toHaveBeenCalledWith({ type: "OPEN_OPTIONS" });
});
