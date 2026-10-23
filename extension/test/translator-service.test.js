import { describe, expect, it, vi } from "vitest";
import { createTranslatorService } from "../src/background/translator-service.js";

describe("translator service", () => {
  it("rejects an incompatible helper API without warming up", async () => {
    const client = {
      send: vi.fn().mockResolvedValue({ apiVersion: "2", helperVersion: "9.0.0", ok: true })
    };
    const service = createTranslatorService(client, () => 0);
    await expect(service.checkLocalTranslator(true)).resolves.toMatchObject({
      ok: false,
      error: { code: "incompatible_api" }
    });
    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it("reports loading as a structured state", async () => {
    const client = {
      send: vi.fn().mockResolvedValue({
        apiVersion: "1",
        helperVersion: "test",
        loading: true,
        ok: false
      })
    };
    const service = createTranslatorService(client, () => 0);
    await expect(service.checkLocalTranslator()).resolves.toMatchObject({
      ok: false,
      loading: true,
      apiVersion: "1"
    });
  });

  it("preserves superseded translation metadata", async () => {
    const client = {
      send: vi.fn()
        .mockResolvedValueOnce({ apiVersion: "1", helperVersion: "test", ok: true })
        .mockResolvedValueOnce({
          translation: "譯文",
          cache: "miss",
          superseded: true,
          model: "localsubs"
        })
    };
    const service = createTranslatorService(client);
    await expect(service.translateSubtitle({ currentText: "Text" })).resolves.toMatchObject({
      ok: true,
      translation: "譯文",
      superseded: true
    });
    expect(client.send.mock.calls.map(([type]) => type)).toEqual(["health", "translate"]);
  });

  it("does not send translations to an incompatible helper", async () => {
    const client = {
      send: vi.fn().mockResolvedValue({ apiVersion: "2", helperVersion: "9.0.0", ok: true })
    };
    const service = createTranslatorService(client);
    await expect(service.translateSubtitle({ currentText: "Text" })).rejects.toMatchObject({
      code: "incompatible_api"
    });
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send).toHaveBeenCalledWith("health", {});
  });

  it("rechecks compatibility after the native connection changes", async () => {
    const client = {
      connectionGeneration: 1,
      send: vi.fn()
        .mockResolvedValueOnce({ apiVersion: "1", ok: true })
        .mockResolvedValueOnce({ translation: "一" })
        .mockResolvedValueOnce({ apiVersion: "1", ok: true })
        .mockResolvedValueOnce({ translation: "二" })
    };
    const service = createTranslatorService(client);
    await service.translateSubtitle({ currentText: "One" });
    client.connectionGeneration = 2;
    await service.translateSubtitle({ currentText: "Two" });
    expect(client.send.mock.calls.map(([type]) => type)).toEqual([
      "health", "translate", "health", "translate"
    ]);
  });

  it("prunes legacy models once, only after the helper reports ready", async () => {
    const client = {
      send: vi.fn(async (type) => {
        if (type === "health") return { apiVersion: "1", helperVersion: "test", ok: true };
        if (type === "prune_legacy_models") return { removed: { files: 1, sizeBytes: 10 } };
        return {};
      })
    };
    const service = createTranslatorService(client, () => 0);
    await service.checkLocalTranslator();
    await service.checkLocalTranslator();
    const prunes = client.send.mock.calls.filter(([type]) => type === "prune_legacy_models");
    expect(prunes).toHaveLength(1);

    const loadingClient = {
      send: vi.fn().mockResolvedValue({ apiVersion: "1", helperVersion: "test", loading: true, ok: false })
    };
    await createTranslatorService(loadingClient, () => 0).checkLocalTranslator();
    expect(loadingClient.send).toHaveBeenCalledTimes(1);
  });

  it("treats a helper without legacy cleanup as having nothing to prune", async () => {
    const client = { send: vi.fn().mockRejectedValue(new Error("unsupported_message")) };
    const service = createTranslatorService(client, () => 0);
    await expect(service.pruneLegacyModels()).resolves.toEqual({ files: 0, sizeBytes: 0 });
  });

  it("returns legacy file totals with the model list", async () => {
    const client = {
      send: vi.fn().mockResolvedValue({ models: [{ channel: "stable" }], legacy: { files: 2, sizeBytes: 5 } })
    };
    const service = createTranslatorService(client, () => 0);
    await expect(service.listModels()).resolves.toEqual({
      ok: true,
      models: [{ channel: "stable" }],
      legacy: { files: 2, sizeBytes: 5 }
    });
  });
});
