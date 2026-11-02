// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";
import { SetupCard } from "../src/content/setup-card.js";

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function mount(language = "zh-Hant") {
  document.body.innerHTML = "<div class='player'></div>";
  const openOptions = vi.fn();
  const card = new SetupCard({
    getSettings: () => ({ optionsLanguage: language }),
    getHost: () => document.querySelector(".player"),
    openOptions
  });
  const shadow = () => document.getElementById("localsubs-setup-card").shadowRoot;
  return { card, shadow, openOptions };
}

it("shows in the player, in the settings language", () => {
  const { card, shadow } = mount("en");
  card.show("downloading", { progress: 0.5, size: 290 });
  expect(document.querySelector(".player #localsubs-setup-card")).not.toBeNull();
  expect(shadow().querySelector(".title").textContent).toBe("Downloading the translation model");
  expect(shadow().querySelector(".detail").textContent).toContain("290 MB");
  expect(shadow().querySelector(".percent").textContent).toBe("50%");
  expect(shadow().querySelector(".action").hidden).toBe(true);
});

it("keeps a dismissed state hidden but still shows the next one", () => {
  const { card, shadow } = mount();
  card.show("downloading", { progress: 0.1, size: 290 });
  shadow().querySelector(".close").click();
  card.show("downloading", { progress: 0.2, size: 290 });
  expect(shadow().querySelector(".card").hidden).toBe(true);
  card.show("ready");
  expect(shadow().querySelector(".card").hidden).toBe(false);
  expect(shadow().querySelector(".title").textContent).toBe("雙語字幕準備好了");
});

it("hides short notices on their own", () => {
  vi.useFakeTimers();
  const { card, shadow } = mount();
  card.show("notEnglish", { autoHideMs: 8000 });
  expect(shadow().querySelector(".card").hidden).toBe(false);
  vi.advanceTimersByTime(8000);
  expect(shadow().querySelector(".card").hidden).toBe(true);
});

it("offers settings for problems the person can fix there", () => {
  const { card, shadow, openOptions } = mount();
  card.show("unavailable", { detail: "Native host not found" });
  expect(shadow().querySelector(".detail").textContent).toBe("Native host not found");
  const action = shadow().querySelector(".action");
  expect(action.textContent).toBe("打開設定");
  action.click();
  expect(openOptions).toHaveBeenCalledOnce();
});
