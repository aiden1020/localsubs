// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/settings.js";

afterEach(() => {
  delete globalThis.chrome;
  document.documentElement.innerHTML = "";
  vi.restoreAllMocks();
});

it("shows model download progress with a clear primary action", async () => {
  document.documentElement.innerHTML = readFileSync(
    path.join(process.cwd(), "options.html"),
    "utf8"
  );

  const sendMessage = vi.fn((message) => {
    if (message.type === "CHECK_TRANSLATOR" && message.warmup) {
      return Promise.resolve({
        ok: true,
        cached: true,
        progress: 1,
        latencyMs: 48,
        transport: "webllm",
        translation: "可以使用"
      });
    }
    return Promise.resolve({
      ok: false,
      needsDownload: true,
      cached: false,
      transport: "webllm"
    });
  });
  globalThis.chrome = {
    runtime: {
      getPlatformInfo: vi.fn().mockResolvedValue({ os: "win" }),
      sendMessage
    },
    storage: {
      sync: {
        get: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS }),
        set: vi.fn().mockResolvedValue(undefined)
      }
    }
  };
  vi.spyOn(window, "open").mockImplementation(() => null);

  vi.resetModules();
  await import("../src/options.js");

  const action = document.getElementById("warmup-service");
  await vi.waitFor(() => {
    expect(document.querySelector("option[value='webllm']")?.textContent)
      .toBe("瀏覽器模式（僅 GPU，免安裝）");
    expect(document.querySelector("option[value='native']")?.textContent)
      .toBe("桌面模式（CPU／GPU，需安裝）");
    expect(document.getElementById("model-download-state")?.textContent).toBe("需要下載");
    expect(document.getElementById("model-download-percent")?.textContent).toBe("0%");
    expect(action.textContent).toBe("下載並準備");
    expect(action.classList.contains("primary-button")).toBe(true);
  });

  action.click();
  await vi.waitFor(() => {
    expect(document.getElementById("model-download-state")?.textContent).toBe("可使用");
    expect(document.getElementById("model-download-percent")?.textContent).toBe("100%");
    expect(action.textContent).toBe("預先載入");
    expect(action.classList.contains("secondary-button")).toBe(true);
  });
});
