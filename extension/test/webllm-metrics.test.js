import { describe, expect, it } from "vitest";
import { evaluateAcceptance, percentile, summarizeLatency } from "../src/webllm-experiment/metrics.js";

describe("WebLLM experiment metrics", () => {
  it("uses nearest-rank percentiles", () => {
    expect(percentile([10, 50, 20, 40, 30], 0.5)).toBe(30);
    expect(percentile([10, 50, 20, 40, 30], 0.95)).toBe(50);
  });

  it("separates successful requests from failures", () => {
    expect(summarizeLatency([
      { ok: true, latencyMs: 100 },
      { ok: false, latencyMs: 50 },
      { ok: true, latencyMs: 200 }
    ])).toEqual({
      requested: 3,
      successful: 2,
      failed: 1,
      meanMs: 150,
      p50Ms: 100,
      p95Ms: 200,
      maxMs: 200
    });
  });

  it("requires zero errors and P95 within the threshold", () => {
    expect(evaluateAcceptance({ failed: 0, p95Ms: 300 }, 300).passed).toBe(true);
    expect(evaluateAcceptance({ failed: 1, p95Ms: 200 }, 300).passed).toBe(false);
    expect(evaluateAcceptance({ failed: 0, p95Ms: 301 }, 300).passed).toBe(false);
  });
});
