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
        helperVersion: "0.3.2",
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
        .mockResolvedValueOnce({ apiVersion: "1", helperVersion: "0.3.2", ok: true })
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
});
