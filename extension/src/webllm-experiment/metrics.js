export function percentile(values, quantile) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(quantile * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function summarizeLatency(samples) {
  const successful = samples.filter((sample) => sample.ok);
  const latencyValues = successful.map((sample) => sample.latencyMs);
  const totalLatency = latencyValues.reduce((sum, value) => sum + value, 0);
  return {
    requested: samples.length,
    successful: successful.length,
    failed: samples.length - successful.length,
    meanMs: latencyValues.length === 0 ? null : totalLatency / latencyValues.length,
    p50Ms: percentile(latencyValues, 0.5),
    p95Ms: percentile(latencyValues, 0.95),
    maxMs: latencyValues.length === 0 ? null : Math.max(...latencyValues)
  };
}

export function evaluateAcceptance(summary, thresholdMs = 300) {
  return {
    zeroErrors: summary.failed === 0,
    warmP95WithinThreshold: summary.p95Ms !== null && summary.p95Ms <= thresholdMs,
    thresholdMs,
    passed: summary.failed === 0 && summary.p95Ms !== null && summary.p95Ms <= thresholdMs
  };
}
