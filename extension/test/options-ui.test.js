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
      },
      local: {
        get: vi.fn().mockResolvedValue({ helperModelChannel: "stable" }),
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

it("lists official helper models and exposes catalog download, use, and remove actions", async () => {
  document.documentElement.innerHTML = readFileSync(
    path.join(process.cwd(), "options.html"),
    "utf8"
  );
  let models = [
    {
      channel: "stable",
      name: "Official model",
      id: "official-id",
      sizeBytes: 1024,
      description: "Released model",
      state: "downloaded",
      selected: true,
      downloadable: true,
      canRemove: false
    },
    {
      channel: "alpha-local",
      name: "Internal alpha",
      id: "alpha-id",
      sizeBytes: 2048,
      description: "Local-only experiment",
      state: "downloaded",
      selected: false,
      downloadable: false,
      canRemove: true
    },
    {
      channel: "released-next",
      name: "Next official model",
      id: "next-id",
      sizeBytes: 4096,
      description: "Available from the official catalog",
      state: "missing",
      selected: false,
      downloadable: true,
      canRemove: false
    }
  ];
  const sendMessage = vi.fn(async (message) => {
    switch (message.type) {
      case "LIST_HELPER_MODELS":
        return { ok: true, models };
      case "SET_INFERENCE_BACKEND":
        return { ok: true, backend: message.backend };
      case "DOWNLOAD_HELPER_MODEL":
        models = models.map((model) => model.channel === message.channel
          ? { ...model, state: "downloaded", canRemove: true }
          : model);
        return { ok: true, channel: message.channel, restartRequired: false };
      case "SELECT_HELPER_MODEL":
        models = models.map((model) => ({ ...model, selected: model.channel === message.channel }));
        return { ok: true, channel: message.channel, restartRequired: true };
      case "REMOVE_HELPER_MODEL":
        models = models.filter((model) => model.channel !== message.channel);
        return { ok: true, channel: message.channel };
      case "CHECK_TRANSLATOR":
        return { ok: false, error: "not ready" };
      default:
        return { ok: true };
    }
  });
  globalThis.chrome = {
    runtime: {
      getPlatformInfo: vi.fn().mockResolvedValue({ os: "mac" }),
      sendMessage
    },
    storage: {
      sync: {
        get: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS }),
        set: vi.fn().mockResolvedValue(undefined)
      },
      local: {
        get: vi.fn().mockResolvedValue({ helperModelChannel: "stable" }),
        set: vi.fn().mockResolvedValue(undefined)
      }
    }
  };
  vi.spyOn(window, "open").mockImplementation(() => null);
  vi.spyOn(window, "confirm").mockReturnValue(true);

  vi.resetModules();
  await import("../src/options.js");
  const backend = document.getElementById("inference-backend");
  backend.value = "native";
  backend.dispatchEvent(new Event("change"));

  await vi.waitFor(() => {
    expect(document.querySelectorAll(".helper-model-card")).toHaveLength(3);
    expect(document.querySelector(".helper-model-card h3")?.textContent).toBe("Official model");
  });
  expect(document.querySelector(".helper-model-card button[data-model-action='remove'][data-model-channel='alpha-local']"))
    .not.toBeNull();

  document.querySelector("button[data-model-action='download'][data-model-channel='released-next']").click();
  await vi.waitFor(() => {
    expect(sendMessage).toHaveBeenCalledWith({ type: "DOWNLOAD_HELPER_MODEL", channel: "released-next" });
    expect(document.querySelector(".helper-model-card button[data-model-action='use'][data-model-channel='released-next']"))
      .not.toBeNull();
  });

  document.querySelector("button[data-model-action='use'][data-model-channel='released-next']").click();
  await vi.waitFor(() => {
    expect(sendMessage).toHaveBeenCalledWith({ type: "SELECT_HELPER_MODEL", channel: "released-next" });
    expect(document.querySelector(".helper-model-card[data-channel='released-next']")).not.toBeNull();
    expect(document.querySelectorAll(".helper-model-selected")).toHaveLength(1);
  });

  document.querySelector("button[data-model-action='remove'][data-model-channel='alpha-local']").click();
  await vi.waitFor(() => {
    expect(sendMessage).toHaveBeenCalledWith({ type: "REMOVE_HELPER_MODEL", channel: "alpha-local" });
    expect(document.querySelector(".helper-model-card[data-channel='alpha-local']")).toBeNull();
  });
});
