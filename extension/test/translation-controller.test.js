import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/settings.js";
import { TranslationController } from "../src/content/translation-controller.js";

function createController(overrides = {}) {
  let settings = { ...DEFAULT_SETTINGS };
  const sendMessage = overrides.sendMessage || vi.fn().mockResolvedValue({
    ok: true,
    translation: "譯文",
    superseded: false
  });
  const showStatus = vi.fn();
  const controller = new TranslationController({
    getSettings: () => settings,
    sendMessage,
    showStatus,
    now: overrides.now || (() => 60000),
    sessionId: "page-1"
  });
  return {
    controller,
    sendMessage,
    showStatus,
    setSettings(next) {
      const previous = settings;
      settings = { ...settings, ...next };
      controller.handleSettingsChange(previous, settings);
    }
  };
}

describe("TranslationController", () => {
  it("reuses cached translations for the same context", async () => {
    const { controller, sendMessage } = createController();
    await expect(controller.translate("Ready?", undefined, ["Wait."], "1")).resolves.toBe("譯文");
    await expect(controller.translate("Ready?", undefined, ["Wait."], "2")).resolves.toBe("譯文");
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("sends bounded caption history and cue metadata", async () => {
    const { controller, sendMessage } = createController();
    controller.updateHistory("First.");
    controller.updateHistory("Second.");
    await controller.translateWithContext("Second.", undefined, "2");
    expect(sendMessage).toHaveBeenCalledWith({
      type: "TRANSLATE_SUBTITLE",
      payload: expect.objectContaining({
        sessionId: "page-1",
        cueId: "2",
        cueSequence: 2,
        currentText: "Second.",
        contextLines: ["First."]
      })
    });
  });

  it("does not cache superseded responses", async () => {
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({ ok: true, translation: "舊譯文", superseded: true })
      .mockResolvedValueOnce({ ok: true, translation: "新譯文", superseded: false });
    const { controller } = createController({ sendMessage });
    await expect(controller.translate("Ready?", undefined, [], "1")).resolves.toBe("");
    await expect(controller.translate("Ready?", undefined, [], "2")).resolves.toBe("新譯文");
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("clears cache when translation context settings change", async () => {
    const state = createController();
    await state.controller.translate("Ready?", undefined, [], "1");
    state.setSettings({ localTranslatorCtxSize: 2 });
    await state.controller.translate("Ready?", undefined, [], "2");
    expect(state.sendMessage).toHaveBeenCalledTimes(2);
  });
});
