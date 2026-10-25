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

function mountOptions({ settings = {}, sendMessage, os = "mac" }) {
  document.documentElement.innerHTML = readFileSync(
    path.join(process.cwd(), "options.html"),
    "utf8"
  );
  const sync = { ...DEFAULT_SETTINGS, ...settings };
  globalThis.chrome = {
    runtime: {
      getPlatformInfo: vi.fn().mockResolvedValue({ os }),
      sendMessage
    },
    storage: {
      sync: {
        get: vi.fn().mockResolvedValue(sync),
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
  return import("../src/options.js");
}

const tierCard = (tier) => document.querySelector(`.tier-card[data-tier='${tier}']`);
const cardButton = (tier) => tierCard(tier)?.querySelector("button");

it("shows speed and quality tiers in browser mode and downloads the other tier", async () => {
  let qualityCached = false;
  const sendMessage = vi.fn(async (message) => {
    switch (message.type) {
      case "LIST_WEBLLM_MODELS":
        return {
          ok: true,
          models: [
            { tier: "fast", cached: true, active: true },
            { tier: "quality", cached: qualityCached, active: false }
          ]
        };
      case "CHECK_TRANSLATOR":
        if (message.warmup) {
          qualityCached = true;
          return { ok: true, transport: "webllm", latencyMs: 40, translation: "可以使用" };
        }
        return { ok: false, needsInitialization: true, cached: true, transport: "webllm" };
      default:
        return { ok: true };
    }
  });
  await mountOptions({ sendMessage });

  await vi.waitFor(() => {
    expect(document.querySelectorAll(".tier-card")).toHaveLength(2);
    expect(tierCard("fast").textContent).toContain("速度優先");
    expect(tierCard("fast").textContent).toContain("使用中");
    expect(tierCard("quality").textContent).toContain("品質優先");
    expect(cardButton("quality").textContent).toBe("下載並啟用");
    expect(cardButton("quality").classList.contains("primary-button")).toBe(true);
  });
  expect(document.getElementById("upgrade-banner").hidden).toBe(true);

  cardButton("quality").click();
  await vi.waitFor(() => {
    expect(sendMessage).toHaveBeenCalledWith({ type: "SET_MODEL_TIER", tier: "quality" });
    expect(sendMessage).toHaveBeenCalledWith({ type: "CHECK_TRANSLATOR", warmup: true });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ modelTier: "quality" });
    expect(tierCard("quality").textContent).toContain("使用中");
    expect(tierCard("fast").textContent).toContain("切換使用");
  });
});

it("offers a one-click upgrade when only the retired browser model is cached", async () => {
  let cached = false;
  const sendMessage = vi.fn(async (message) => {
    switch (message.type) {
      case "LIST_WEBLLM_MODELS":
        return {
          ok: true,
          models: [
            { tier: "fast", cached, active: true },
            { tier: "quality", cached: false, active: false }
          ]
        };
      case "CHECK_TRANSLATOR":
        if (message.warmup) {
          cached = true;
          return { ok: true, transport: "webllm", latencyMs: 30 };
        }
        return { ok: false, needsDownload: true, legacyCached: true, transport: "webllm" };
      default:
        return { ok: true };
    }
  });
  await mountOptions({ sendMessage });

  const banner = document.getElementById("upgrade-banner");
  await vi.waitFor(() => {
    expect(banner.hidden).toBe(false);
    expect(document.getElementById("upgrade-title").textContent).toContain("Sotto");
    expect(document.getElementById("upgrade-detail").textContent).toContain("移除舊版模型");
  });

  document.getElementById("upgrade-action").click();
  await vi.waitFor(() => {
    expect(sendMessage).toHaveBeenCalledWith({ type: "CHECK_TRANSLATOR", warmup: true });
    expect(banner.hidden).toBe(true);
    expect(tierCard("fast").textContent).toContain("使用中");
  });
});

function helperModels(overrides = {}) {
  return [
    {
      channel: "stable",
      id: "sotto-en-zh-tw-0.6b",
      name: "Sotto 0.6B",
      sizeBytes: 381332736,
      state: "downloaded",
      selected: true,
      downloadable: true,
      canRemove: false
    },
    {
      channel: "1.7b",
      id: "sotto-en-zh-tw-1.7b",
      name: "Sotto 1.7B",
      sizeBytes: 1134373600,
      state: "missing",
      selected: false,
      downloadable: true,
      canRemove: false,
      ...overrides
    }
  ];
}

it("downloads and selects the quality model through the desktop component", async () => {
  let models = helperModels();
  const sendMessage = vi.fn(async (message) => {
    switch (message.type) {
      case "LIST_HELPER_MODELS":
        return { ok: true, models, legacy: null };
      case "DOWNLOAD_HELPER_MODEL":
        models = helperModels({ state: "downloaded", canRemove: true });
        return { ok: true, channel: message.channel, restartRequired: false };
      case "SELECT_HELPER_MODEL":
        models = models.map((model) => ({ ...model, selected: model.channel === message.channel }));
        return { ok: true, channel: message.channel, restartRequired: true };
      case "CHECK_TRANSLATOR":
        return { ok: true, transport: "native", latencyMs: 20 };
      default:
        return { ok: true };
    }
  });
  await mountOptions({ settings: { inferenceBackend: "native" }, sendMessage });

  await vi.waitFor(() => {
    expect(tierCard("fast").textContent).toContain("使用中");
    expect(tierCard("quality").textContent).toContain("1.1 GB");
    expect(cardButton("quality").textContent).toBe("下載並啟用");
  });
  // Setup steps stay hidden while the helper works, but their commands are filled in.
  expect(document.getElementById("setup-grid").hidden).toBe(true);
  expect(document.getElementById("setup-command").textContent).toBe("localsubs setup");

  cardButton("quality").click();
  await vi.waitFor(() => {
    expect(sendMessage).toHaveBeenCalledWith({ type: "DOWNLOAD_HELPER_MODEL", channel: "1.7b" });
    expect(sendMessage).toHaveBeenCalledWith({ type: "SELECT_HELPER_MODEL", channel: "1.7b" });
    expect(tierCard("quality").textContent).toContain("使用中");
  });
  const calls = sendMessage.mock.calls.map(([message]) => message.type);
  expect(calls.indexOf("DOWNLOAD_HELPER_MODEL")).toBeLessThan(calls.indexOf("SELECT_HELPER_MODEL"));
});

it("asks to update an outdated desktop component and shows the platform command", async () => {
  const sendMessage = vi.fn(async (message) => {
    if (message.type === "LIST_HELPER_MODELS") {
      return {
        ok: true,
        models: [{
          channel: "stable",
          id: "localsubs-en-zh-tw-0.6b",
          name: "LocalSubs Standard 0.6B",
          sizeBytes: 367318176,
          state: "downloaded",
          selected: true,
          downloadable: true,
          canRemove: false
        }]
      };
    }
    return { ok: true, transport: "native", latencyMs: 10 };
  });
  await mountOptions({ settings: { inferenceBackend: "native" }, sendMessage });

  await vi.waitFor(() => {
    expect(document.getElementById("upgrade-banner").hidden).toBe(false);
    expect(document.getElementById("upgrade-title").textContent).toBe("需要更新桌面元件");
    expect(document.getElementById("upgrade-command").textContent).toContain("brew upgrade localsubs");
    expect(tierCard("quality").textContent).toContain("需要更新桌面元件");
  });
});

it("offers the native upgrade when the new model is missing but legacy files exist", async () => {
  let models = helperModels();
  models[0] = { ...models[0], state: "missing" };
  const sendMessage = vi.fn(async (message) => {
    switch (message.type) {
      case "LIST_HELPER_MODELS":
        return { ok: true, models, legacy: { files: 1, sizeBytes: 367318176 } };
      case "DOWNLOAD_HELPER_MODEL":
        models = helperModels();
        return { ok: true, channel: message.channel, restartRequired: false };
      default:
        return { ok: true, transport: "native", latencyMs: 10 };
    }
  });
  await mountOptions({ settings: { inferenceBackend: "native" }, sendMessage });

  await vi.waitFor(() => {
    expect(document.getElementById("upgrade-banner").hidden).toBe(false);
    expect(document.getElementById("upgrade-detail").textContent).toContain("350 MB");
  });
  document.getElementById("upgrade-action").click();
  await vi.waitFor(() => {
    expect(sendMessage).toHaveBeenCalledWith({ type: "DOWNLOAD_HELPER_MODEL", channel: "stable" });
  });
});

it("shows the desktop setup steps only when the helper cannot be reached", async () => {
  const sendMessage = vi.fn(async (message) => {
    if (message.type === "LIST_HELPER_MODELS") throw new Error("native host not found");
    return { ok: false, error: { message: "not installed" } };
  });
  await mountOptions({ settings: { inferenceBackend: "native" }, sendMessage });

  await vi.waitFor(() => {
    expect(document.getElementById("setup-grid").hidden).toBe(false);
    expect(document.getElementById("platform-status").hidden).toBe(false);
    expect(document.getElementById("install-command").textContent).toContain("brew install localsubs");
  });
  expect(document.getElementById("setup-tutorial").hidden).toBe(true);
});

it("links the Windows setup video in the desktop setup steps", async () => {
  const sendMessage = vi.fn(async (message) => {
    if (message.type === "LIST_HELPER_MODELS") throw new Error("native host not found");
    return { ok: false, error: { message: "not installed" } };
  });
  await mountOptions({ settings: { inferenceBackend: "native" }, sendMessage, os: "win" });

  await vi.waitFor(() => {
    expect(document.getElementById("setup-grid").hidden).toBe(false);
    expect(document.getElementById("install-command").textContent).toContain("winget install");
  });
  const tutorial = document.getElementById("setup-tutorial");
  expect(tutorial.hidden).toBe(false);
  expect(tutorial.href).toBe("https://youtu.be/GbVWTxgqePA");
  expect(tutorial.target).toBe("_blank");
});
