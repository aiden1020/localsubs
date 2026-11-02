// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/settings.js";

afterEach(() => {
  delete globalThis.chrome;
  delete navigator.gpu;
  window.history.replaceState(null, "", "/");
  document.documentElement.innerHTML = "";
  vi.restoreAllMocks();
});

function mountOptions({
  settings = {},
  sendMessage,
  os = "mac",
  webgpu = true,
  nativePermission = true,
  grantNativePermission = true
}) {
  // jsdom has no WebGPU; most people's browsers do.
  if (webgpu) {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: { requestAdapter: async () => ({ features: new Set(["shader-f16"]) }) }
    });
  }
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
    permissions: {
      contains: vi.fn(async () => nativePermission),
      request: vi.fn(async () => {
        nativePermission = grantNativePermission;
        return grantNativePermission;
      }),
      onAdded: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() }
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

// Whether the desktop panel sits above the model panel, or at the bottom.
const desktopPanelOnTop = () => Boolean(
  document.getElementById("desktop-panel").compareDocumentPosition(document.querySelector(".model-panel"))
    & Node.DOCUMENT_POSITION_FOLLOWING
);

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

it("uninstalls a browser model, including the one in use", async () => {
  const cached = { fast: true, quality: true };
  const sendMessage = vi.fn(async (message) => {
    switch (message.type) {
      case "LIST_WEBLLM_MODELS":
        return {
          ok: true,
          models: [
            { tier: "fast", cached: cached.fast, active: true },
            { tier: "quality", cached: cached.quality, active: false }
          ]
        };
      case "REMOVE_WEBLLM_MODEL":
        cached[message.tier] = false;
        return { ok: true, removed: true };
      case "CHECK_TRANSLATOR":
        return { ok: false, needsDownload: !cached.fast, transport: "webllm" };
      default:
        return { ok: true };
    }
  });
  await mountOptions({ sendMessage });
  const uninstall = (tier) => [...tierCard(tier).querySelectorAll("button")].find((button) => button.textContent === "解除安裝");

  await vi.waitFor(() => {
    expect(uninstall("quality")).toBeDefined();
    expect(uninstall("fast")).toBeDefined();
  });

  uninstall("quality").click();
  expect(window.confirm).toHaveBeenCalledWith("解除安裝「品質優先」模型？之後仍可重新下載。");
  await vi.waitFor(() => {
    expect(sendMessage).toHaveBeenCalledWith({ type: "REMOVE_WEBLLM_MODEL", tier: "quality" });
    expect(cardButton("quality").textContent).toBe("下載並啟用");
  });

  uninstall("fast").click();
  expect(window.confirm).toHaveBeenLastCalledWith("解除安裝目前使用中的「速度優先」模型？下次播放字幕時會重新下載。");
  await vi.waitFor(() => {
    expect(sendMessage).toHaveBeenCalledWith({ type: "REMOVE_WEBLLM_MODEL", tier: "fast" });
    expect(tierCard("fast").textContent).toContain("尚未下載");
  });
});

it("does not uninstall when the confirmation is declined", async () => {
  const sendMessage = vi.fn(async (message) => message.type === "LIST_WEBLLM_MODELS"
    ? { ok: true, models: [{ tier: "fast", cached: true, active: true }, { tier: "quality", cached: true, active: false }] }
    : { ok: true });
  await mountOptions({ sendMessage });
  window.confirm.mockReturnValue(false);
  await vi.waitFor(() => expect(tierCard("quality").textContent).toContain("解除安裝"));

  [...tierCard("quality").querySelectorAll("button")].find((button) => button.textContent === "解除安裝").click();
  expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "REMOVE_WEBLLM_MODEL" }));
});

describe("right after install", () => {
  function browserModels(cached) {
    return vi.fn(async (message) => {
      switch (message.type) {
        case "LIST_WEBLLM_MODELS":
          return { ok: true, models: [{ tier: "fast", cached, active: true }, { tier: "quality", cached: false, active: false }] };
        case "CHECK_TRANSLATOR":
          return message.warmup
            ? { ok: true, transport: "webllm", latencyMs: 40, translation: "預備" }
            : { ok: false, needsDownload: !cached, needsInitialization: cached, cached, transport: "webllm" };
        default:
          return { ok: true };
      }
    });
  }
  const warmups = (sendMessage) => sendMessage.mock.calls.filter(([message]) =>
    message.type === "CHECK_TRANSLATOR" && message.warmup);

  it("starts downloading the default model", async () => {
    window.history.replaceState(null, "", "/options.html?installed");
    const sendMessage = browserModels(false);
    await mountOptions({ sendMessage });
    await vi.waitFor(() => expect(warmups(sendMessage)).toHaveLength(1));
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ modelTier: "fast" });
    // A reload doesn't start it again.
    expect(window.location.search).toBe("");
  });

  it("does nothing on later visits", async () => {
    window.history.replaceState(null, "", "/options.html");
    const sendMessage = browserModels(false);
    await mountOptions({ sendMessage });
    await vi.waitFor(() => expect(document.querySelectorAll(".tier-card")).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(warmups(sendMessage)).toHaveLength(0);
  });

  it("does not download when the browser can't run the model", async () => {
    window.history.replaceState(null, "", "/options.html?installed");
    const sendMessage = browserModels(false);
    await mountOptions({ sendMessage, webgpu: false });
    await vi.waitFor(() => expect(window.location.search).toBe(""));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(warmups(sendMessage)).toHaveLength(0);
  });

  it("does not download a model that is already there", async () => {
    window.history.replaceState(null, "", "/options.html?installed");
    const sendMessage = browserModels(true);
    await mountOptions({ sendMessage });
    await vi.waitFor(() => expect(window.location.search).toBe(""));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(warmups(sendMessage)).toHaveLength(0);
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

it("keeps the desktop component in a collapsed section when WebGPU works", async () => {
  {
    const sendMessage = vi.fn(async () => ({ ok: true, models: [] }));
    await mountOptions({ sendMessage });

    await vi.waitFor(() => {
      expect(document.querySelectorAll(".tier-card")).toHaveLength(2);
      expect(document.getElementById("desktop-title").textContent).toBe("使用桌面元件（進階）");
    });
    // Browser users never see the engine concept outside the collapsed panel.
    expect(desktopPanelOnTop()).toBe(false);
    expect(document.getElementById("desktop-settings").open).toBe(false);
    expect(document.getElementById("model-engine-note").hidden).toBe(true);
    expect(document.body.textContent).not.toContain("翻譯引擎");
    expect(document.getElementById("engine-webllm").getAttribute("aria-checked")).toBe("true");
    expect(document.getElementById("setup-grid").hidden).toBe(true);
    expect(document.getElementById("native-permission").hidden).toBe(true);
  }
});

it("opens the desktop section when this browser has no WebGPU", async () => {
  const sendMessage = vi.fn(async () => ({ ok: true, models: [] }));
  await mountOptions({ sendMessage, webgpu: false });

  await vi.waitFor(() => {
    expect(document.getElementById("desktop-title").textContent).toBe("這台電腦無法在瀏覽器中翻譯");
    expect(document.getElementById("setup-grid").hidden).toBe(false);
  });
  expect(document.getElementById("desktop-hint").textContent).toContain("需要安裝 LocalSubs 桌面元件");
  expect(document.getElementById("install-command").textContent).toContain("brew install localsubs");
  expect(desktopPanelOnTop()).toBe(true);
  expect(document.getElementById("desktop-settings").open).toBe(true);
  expect(document.getElementById("desktop-panel").classList.contains("is-required")).toBe(true);
  // Nothing suggests the browser model can work here.
  expect(document.getElementById("model-panel").hidden).toBe(true);
  expect(document.getElementById("engine-switch").hidden).toBe(true);
  await vi.waitFor(() => {
    expect(document.getElementById("service-status-title").textContent).toBe("這台電腦無法在瀏覽器中翻譯");
  });

  document.getElementById("use-desktop").click();
  await vi.waitFor(() => {
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ inferenceBackend: "native" });
  });
});

it("asks for the native messaging permission before switching to the desktop component", async () => {
  const sendMessage = vi.fn(async () => ({ ok: true, models: [] }));
  await mountOptions({ sendMessage, nativePermission: false });
  await vi.waitFor(() => expect(chrome.permissions.contains).toHaveBeenCalled());

  document.getElementById("engine-native").click();
  expect(chrome.permissions.request).toHaveBeenCalledWith({ permissions: ["nativeMessaging"] });
  await vi.waitFor(() => {
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ inferenceBackend: "native" });
    expect(sendMessage).toHaveBeenCalledWith({ type: "SET_INFERENCE_BACKEND", backend: "native" });
  });
});

it("stays on browser translation when the permission is declined", async () => {
  const sendMessage = vi.fn(async () => ({ ok: true, models: [] }));
  await mountOptions({ sendMessage, nativePermission: false, grantNativePermission: false });
  await vi.waitFor(() => expect(chrome.permissions.contains).toHaveBeenCalled());

  document.getElementById("engine-native").click();
  await vi.waitFor(() => {
    expect(document.getElementById("service-status-title").textContent).toBe("需要允許連接桌面元件");
  });
  expect(chrome.storage.sync.set).not.toHaveBeenCalledWith({ inferenceBackend: "native" });
  expect(document.getElementById("engine-webllm").getAttribute("aria-checked")).toBe("true");
});

it("asks desktop users to allow the permission again instead of showing setup steps", async () => {
  const sendMessage = vi.fn(async (message) => {
    if (message.type === "LIST_HELPER_MODELS" || message.type === "CHECK_TRANSLATOR") {
      return { ok: false, error: { code: "native_permission_required", message: "Allow LocalSubs" } };
    }
    return { ok: true };
  });
  await mountOptions({ settings: { inferenceBackend: "native" }, sendMessage, nativePermission: false });

  await vi.waitFor(() => {
    expect(document.getElementById("desktop-settings").open).toBe(true);
    expect(document.getElementById("native-permission").hidden).toBe(false);
    expect(document.getElementById("service-status-title").textContent).toBe("需要允許連接桌面元件");
  });
  // It never claims the desktop component is in use while it can't connect.
  expect(desktopPanelOnTop()).toBe(true);
  expect(document.getElementById("desktop-title").textContent).toBe("已選擇桌面元件，尚未連接");
  expect(document.getElementById("desktop-hint").textContent).not.toContain("目前使用");
  expect(document.getElementById("engine-native-badge").hidden).toBe(false);
  expect(document.getElementById("model-engine-note").textContent).toContain("桌面元件");
  expect(document.getElementById("setup-grid").hidden).toBe(true);

  document.getElementById("native-permission-grant").click();
  expect(chrome.permissions.request).toHaveBeenCalledWith({ permissions: ["nativeMessaging"] });
  await vi.waitFor(() => {
    expect(document.getElementById("native-permission").hidden).toBe(true);
    expect(document.getElementById("desktop-title").textContent).toBe("目前使用桌面元件");
    expect(document.getElementById("engine-native-badge").hidden).toBe(true);
  });
});

it("fills in this platform's setup commands for desktop users even while they're hidden", async () => {
  const sendMessage = vi.fn(async (message) => message.type === "LIST_HELPER_MODELS"
    ? { ok: true, models: [] }
    : { ok: true, transport: "native", latencyMs: 30 });
  await mountOptions({ settings: { inferenceBackend: "native" }, sendMessage, os: "win" });

  await vi.waitFor(() => {
    expect(document.getElementById("setup-command").textContent).toBe("localsubs setup --backend auto");
  });
  expect(document.getElementById("setup-grid").hidden).toBe(true);
});

it("offers one button per supported site, in the chosen language", async () => {
  const sendMessage = vi.fn(async () => ({ ok: true, models: [] }));
  await mountOptions({ sendMessage });
  const buttons = () => Array.from(document.querySelectorAll("#supported-sites button"));
  await vi.waitFor(() => {
    expect(buttons().map((button) => button.textContent)).toEqual(["開啟 YouTube", "開啟 HBO Max"]);
  });
  buttons()[1].click();
  expect(window.open).toHaveBeenCalledWith("https://www.hbomax.com/", "_blank", "noopener");

  document.getElementById("language-en").click();
  await vi.waitFor(() => {
    expect(buttons().map((button) => button.textContent)).toEqual(["Open YouTube", "Open HBO Max"]);
  });
});
