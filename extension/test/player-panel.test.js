// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/settings.js";
import { PlayerPanel } from "../src/content/player-panel.js";

describe("PlayerPanel", () => {
  let settings;
  let storage;
  let sendMessage;
  let panel;
  let player;

  function $(selector) {
    return panel.shadow.querySelector(selector);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "<div id='player'><video></video></div><div id='fullscreen'></div>";
    player = document.getElementById("player");
    settings = { ...DEFAULT_SETTINGS };
    storage = { set: vi.fn().mockResolvedValue(undefined) };
    sendMessage = vi.fn(async (message) => {
      if (message.type === "LIST_WEBLLM_MODELS") {
        return { ok: true, models: [{ tier: "fast", cached: true }, { tier: "quality", cached: true }] };
      }
      return { ok: true };
    });
    panel = new PlayerPanel({ getSettings: () => settings, getHost: () => player, storage, sendMessage });
    panel.ensure();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
  });

  it("mounts inside the player and shows the button only after pointer activity", () => {
    expect(panel.root.parentElement).toBe(player);
    expect($(".wrap").classList.contains("visible")).toBe(false);

    document.dispatchEvent(new Event("pointermove"));
    expect($(".wrap").classList.contains("visible")).toBe(true);

    vi.advanceTimersByTime(3000);
    expect($(".wrap").classList.contains("visible")).toBe(false);
  });

  it("opens the panel and writes the translation switch to storage", () => {
    $(".toggle").click();
    expect(panel.isOpen()).toBe(true);
    expect($(".toggle").getAttribute("aria-expanded")).toBe("true");

    const translation = $("#translation");
    expect(translation.checked).toBe(true);
    translation.click();
    expect(storage.set).toHaveBeenCalledWith({ translationEnabled: false });
  });

  it("debounces slider writes and keeps the typed value", () => {
    const font = $("#font");
    font.value = "36";
    font.dispatchEvent(new Event("input"));
    font.value = "38";
    font.dispatchEvent(new Event("input"));
    expect($("output[data-for='fontSize']").textContent).toBe("38px");
    expect(storage.set).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(storage.set).toHaveBeenCalledTimes(1);
    expect(storage.set).toHaveBeenCalledWith({ fontSize: 38 });

    const opacity = $("#opacity");
    opacity.value = "0.5";
    opacity.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(250);
    expect(storage.set).toHaveBeenCalledWith({ overlayBackgroundOpacity: 0.5 });
  });

  it("reflects settings changed elsewhere", () => {
    settings = { ...settings, translationEnabled: false, fontSize: 24, modelTier: "quality", optionsLanguage: "en" };
    panel.applySettings();
    expect($("#translation").checked).toBe(false);
    expect($("#font").value).toBe("24");
    expect($("[data-tier='quality']").getAttribute("aria-checked")).toBe("true");
    expect($("[data-tier='fast']").textContent).toBe("Fast");
  });

  it("switches to a downloaded browser model", async () => {
    $(".toggle").click();
    $("[data-tier='quality']").click();
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: "SET_MODEL_TIER", tier: "quality" });
    });
    expect(storage.set).toHaveBeenCalledWith({ modelTier: "quality" });
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SELECT_HELPER_MODEL" }));
    expect($(".note").textContent).toContain("已切換");
  });

  it("sends people to settings instead of downloading a missing model", async () => {
    sendMessage.mockImplementation(async (message) => {
      if (message.type === "LIST_WEBLLM_MODELS") {
        return { ok: true, models: [{ tier: "fast", cached: true }, { tier: "quality", cached: false }] };
      }
      return { ok: true };
    });
    $(".toggle").click();
    $("[data-tier='quality']").click();

    await vi.waitFor(() => expect($(".download").hidden).toBe(false));
    expect(storage.set).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SET_MODEL_TIER" }));

    $(".download").click();
    expect(sendMessage).toHaveBeenCalledWith({ type: "OPEN_OPTIONS" });
  });

  it("selects the helper channel when the desktop component is in use", async () => {
    settings = { ...settings, inferenceBackend: "native" };
    sendMessage.mockImplementation(async (message) => {
      if (message.type === "LIST_HELPER_MODELS") {
        return { ok: true, models: [{ channel: "stable", state: "downloaded" }, { channel: "1.7b", state: "downloaded" }] };
      }
      return { ok: true };
    });
    $(".toggle").click();
    $("[data-tier='quality']").click();

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: "SELECT_HELPER_MODEL", channel: "1.7b" });
    });
    expect(storage.set).toHaveBeenCalledWith({ modelTier: "quality" });
  });

  it("opens full settings", () => {
    $(".toggle").click();
    $(".settings").click();
    expect(sendMessage).toHaveBeenCalledWith({ type: "OPEN_OPTIONS" });
  });

  it("closes on Escape and keeps keys and clicks away from the player", () => {
    const playerKeys = vi.fn();
    const playerClicks = vi.fn();
    document.addEventListener("keydown", playerKeys);
    document.addEventListener("click", playerClicks);

    $(".toggle").click();
    expect(playerClicks).not.toHaveBeenCalled();

    $("#font").dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, composed: true }));
    expect(playerKeys).not.toHaveBeenCalled();
    expect(panel.isOpen()).toBe(true);

    $("#font").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
    expect(panel.isOpen()).toBe(false);
    expect(playerKeys).not.toHaveBeenCalled();

    document.removeEventListener("keydown", playerKeys);
    document.removeEventListener("click", playerClicks);
  });

  it("moves into the fullscreen element when the player host is outside it", () => {
    const fullscreen = document.getElementById("fullscreen");
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: fullscreen });
    panel.updateHost();
    expect(panel.root.parentElement).toBe(fullscreen);

    fullscreen.appendChild(player);
    panel.updateHost();
    expect(panel.root.parentElement).toBe(player);
  });
});
