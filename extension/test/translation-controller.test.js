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

  it("sends as many earlier lines as the context setting, and none at 0", () => {
    const state = createController();
    for (const line of ["One.", "Two.", "Three.", "Four."]) state.controller.updateHistory(line);
    expect(state.controller.requestFor("Four.").contextLines).toEqual(["Three."]);

    state.setSettings({ translationContextLines: 3 });
    for (const line of ["One.", "Two.", "Three.", "Four."]) state.controller.updateHistory(line);
    expect(state.controller.requestFor("Four.").contextLines).toEqual(["One.", "Two.", "Three."]);

    state.setSettings({ translationContextLines: 0 });
    for (const line of ["One.", "Two.", "Three.", "Four."]) state.controller.updateHistory(line);
    expect(state.controller.requestFor("Four.").contextLines).toEqual([]);
  });

  it("does not cache an empty translation", async () => {
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({ ok: true, translation: "", superseded: false })
      .mockResolvedValueOnce({ ok: true, translation: "譯文", superseded: false });
    const { controller } = createController({ sendMessage });
    await expect(controller.translate("Ready?", undefined, [], "1")).resolves.toBe("");
    await expect(controller.translate("Ready?", undefined, [], "2")).resolves.toBe("譯文");
    expect(sendMessage).toHaveBeenCalledTimes(2);
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

  it("translates upcoming lines with the context they will show with", async () => {
    const sendMessage = vi.fn(async ({ payload }) => ({ ok: true, translation: `譯:${payload.currentText}` }));
    const { controller, showStatus } = createController({ sendMessage });
    controller.updateHistory("First.");
    await controller.translateAhead(["Second.", "Third."]);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[1][0].payload).toEqual(expect.objectContaining({
      sessionId: "page-1:ahead",
      currentText: "Third.",
      contextLines: ["Second."]
    }));

    // Played in order, both lines come straight from the cache.
    controller.updateHistory("Second.");
    expect(controller.cachedTranslation("Second.")).toBe("譯:Second.");
    controller.updateHistory("Third.");
    expect(controller.cachedTranslation("Third.")).toBe("譯:Third.");
    await controller.translateAhead(["Third."]);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(showStatus).not.toHaveBeenCalled();
  });

  it("stops looking ahead quietly when a request fails or is superseded", async () => {
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({ ok: true, translation: "", superseded: true })
      .mockResolvedValueOnce({ ok: false, error: { code: "model_loading", message: "loading" } });
    const { controller, showStatus } = createController({ sendMessage });
    await controller.translateAhead(["One.", "Two."]);
    await controller.translateAhead(["Three.", "Four."]);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(controller.cachedTranslation("One.")).toBe("");
    expect(showStatus).not.toHaveBeenCalled();
  });

  it("clears cache when translation context settings change", async () => {
    const state = createController();
    await state.controller.translate("Ready?", undefined, [], "1");
    state.setSettings({ translationContextLines: 2 });
    await state.controller.translate("Ready?", undefined, [], "2");
    expect(state.sendMessage).toHaveBeenCalledTimes(2);
  });
});
