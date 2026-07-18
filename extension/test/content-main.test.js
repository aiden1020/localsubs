// @vitest-environment jsdom

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
    if (message.type === "CHECK_LOCAL_TRANSLATOR") {
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

  const status = document.getElementById("localsubs-status");
  const caption = document.querySelector("[class*='CaptionWindow']");
  expect(status.style.display).toBe("none");
  expect(caption.style.visibility).toBe("");
  expect(sendMessage.mock.calls.filter(([message]) =>
    message.type === "CHECK_LOCAL_TRANSLATOR"
  )).toHaveLength(1);
});
