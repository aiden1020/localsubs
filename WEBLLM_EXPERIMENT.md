# WebLLM latency experiment

This branch tests and integrates browser-native WebGPU inference as the default
translation path while retaining the native helper as an optional backend.

## Stage gates

1. **Framework feasibility**
   - Chrome or Edge 124+ exposes a WebGPU adapter to the extension.
   - WebLLM 0.2.84 loads `Qwen3-0.6B-q4f16_1-MLC` with the production defaults:
     direct engine, 256-token context, 16 output tokens, and one context line.
   - The model survives 2 warmups plus 10 measured subtitle prompts without an
     error or device loss.
   - Warm P95 is at most 300 ms, close to the current Windows CPU control
     (286.5 ms P95). Cold model download and initialization are reported
     separately and do not count toward warm P95.

2. **LocalSubs model feasibility**
   - Convert the original Hugging Face safetensors/config/tokenizer to MLC
     `q4f16_1`; the GGUF file is not a WebLLM input artifact.
   - Compile a matching WebGPU WASM model library and host immutable, hashed
     artifacts.
   - Run the same 100 embedded benchmark cases against native Q5_K_M and MLC.
   - Require zero inference errors, warm P95 no worse than 1.5x the native CPU
     result, and no material translation-quality regression.

3. **Extension lifecycle feasibility**
   - Move the engine handler to the MV3 extension service worker.
   - Measure warm requests, worker eviction/reload, cache-hit initialization,
     GPU device loss, and native fallback.
   - Require a bounded restart path and no lost translation requests.

4. **Product migration**
   - Add an opt-in inference transport and telemetry-free local diagnostics.
   - Keep native helper fallback until supported-device coverage and memory
     behavior are known.
   - Remove helper installation only after WebLLM passes latency, quality,
     lifecycle, and model-delivery gates.

## Run the first experiment

```bash
npm install
npm run build:extension:experiments
```

The experiment build is intentionally separate from `npm run build:extension`.
Only the latter is used for the Chrome Web Store package and excludes benchmark
pages, datasets, worker bundles, and wllama runtimes.

Load `dist/extension` from `chrome://extensions` using **Load unpacked**, then
open this URL after replacing `<extension-id>`:

```text
chrome-extension://<extension-id>/webllm-experiment.html
```

Click **Load model**, wait for the first download, then click **Run benchmark**.
Download the JSON report. Reload the extension page and run it again to capture
cache-hit initialization separately from the first download.

The stock Qwen3 model only validates WebLLM plumbing and latency at the target
model size. Its output is not a quality measurement for the fine-tuned
LocalSubs model.

## First result (2026-08-06)

The framework gate passed on Edge 151 and an NVIDIA GPU using the headed
extension test harness:

| Metric | WebLLM Qwen3 0.6B | Native CPU control | Native CUDA control |
| --- | ---: | ---: | ---: |
| First download + load | 45.37 s (about 320 MB) | n/a | n/a |
| Cache-hit load | 2.29 s | 608.7 ms | 810.2 ms |
| Warm mean | 180.94 ms | 147.0 ms | 28.4 ms |
| Warm P95 | 267.4 ms | 286.5 ms | 48.9 ms |
| Warm max | 267.4 ms | 506.5 ms | 68.6 ms |
| Successful requests | 10/10 | 100/100 | 100/100 |

The measured WebLLM TTFT was usually 41–52 ms and decoding was about 59–70
tokens/s after warmup. The first warmup also paid one-time GPU compilation
cost, so it is excluded from the warm summary just like the native benchmark's
warmups.

This is a framework **GO**, not a migration GO. The stock model produced
Simplified Chinese, English echoes, and prompt labels, so its output cannot be
used for product quality. The next experiment must convert the LocalSubs
safetensors/tokenizer to MLC, switch to the model's raw completion prompt, and
run the same 100-case dataset. The experiment also adds about 12.6 MB of
uncompressed JS across the page and worker bundles; these files and the added
model-host permissions must not enter the store build unchanged.

The automated headed run is:

```bash
npm run test:webllm:benchmark -- --headed
```

It retains the model cache in `dist/.webllm-browser-profile` and writes the
latest machine-readable report to `dist/webllm-latency-report.json`.

## llama.cpp WebGPU / wllama result (2026-08-06)

The second framework experiment uses wllama 3.5.1 (llama.cpp
`b9640-dd4623a`) and the production
`LocalSubs-EN-ZH-TW-0.6B-Q5_K_M.gguf` directly. Unlike WebLLM, it does not
require converting or recompiling the fine-tuned model.

The modern JSPI/MEMORY64 runtime passed the standalone localhost benchmark on
Edge 151 and an NVIDIA Ampere GPU. llama.cpp reported 29/29 layers offloaded,
a 347.73 MiB WebGPU model buffer, a 56 MiB WebGPU KV buffer, and a 26.51 MiB
WebGPU compute buffer.

| Metric | wllama production Q5 | Native CPU control | Native CUDA control |
| --- | ---: | ---: | ---: |
| Direct download | 81.47 s (367,318,176 bytes) | n/a | n/a |
| Model load after download | 3.17 s | 608.7 ms | 810.2 ms |
| Warm mean | 229.21 ms | 147.0 ms | 28.4 ms |
| Warm P50 | 226.97 ms | n/a | n/a |
| Warm P95 | 295.14 ms | 286.5 ms | 48.9 ms |
| Warm max | 390.56 ms | 506.5 ms | 68.6 ms |
| Exact match | 8/100 | 8/100 | 8/100 |
| Successful requests | 100/100 | 100/100 | 100/100 |

This is a **runtime and model GO**: the production model passes the initial
300 ms P95 and native-quality gates. It is not yet an extension integration
GO. MV3 extension pages cannot permit the Blob workers created internally by
wllama, while a declared sandbox page can permit Blob workers but crashes the
Edge 151 renderer when WebGPU is accessed inside that worker. A tiny Blob
worker that does not access WebGPU succeeds, which isolates the blocker from
model download, GGUF parsing, JSPI, and the GPU itself.

The likely next paths are either to replace wllama's generated Blob worker
with a packaged static extension worker, or test a runtime such as ONNX Runtime
Web / Transformers.js that can use WebGPU without this worker topology. Model
caching also remains required; this first run intentionally uses a direct Blob
download to keep download and model-load timing separate.

Run the reproducible standalone benchmark with:

```bash
npm run test:wllama:standalone -- --headed
```

It writes the full 100-case report to
`dist/wllama-standalone-latency-report.json`. The extension-only capability
check, which does not load a model, remains:

```bash
npm run test:wllama:capability -- --headed
```

## LocalSubs WebLLM result and production integration (2026-08-07)

The fine-tuned checkpoint was converted to `q4f16_1`. Its 64,024-token
embedding was zero-padded to the upstream Qwen3 vocabulary shape so the model
can reuse WebLLM's compatible Qwen3 0.6B WebGPU library, while
`active_vocab_size` keeps sampling restricted to the LocalSubs tokenizer.

| Metric | LocalSubs WebLLM | Native CPU | Native CUDA | wllama WebGPU |
| --- | ---: | ---: | ---: | ---: |
| Warm mean | 47.40 ms | 147.0 ms | 28.4 ms | 229.21 ms |
| Warm P95 | 84.67 ms | 286.5 ms | 48.9 ms | 295.14 ms |
| Exact match | 9/100 | 8/100 | 8/100 | 8/100 |
| Successful requests | 100/100 | 100/100 | 100/100 | 100/100 |

The MV3 production path now routes subtitle requests through WebLLM by default.
New installations select WebLLM; upgrades without a stored backend retain the
native helper. Options can switch the backend without restarting the browser,
show WebGPU capability and model-cache state, and display download progress.
The verified 5.3 MB model library is bundled with the extension so executable
WASM is not fetched at runtime.

The real extension service worker passed a local-artifact lifecycle test on
Edge 151 and NVIDIA WebGPU: fresh load, model download/cache, first shader
compilation, warmup, and a translation request all completed without a worker
or GPU error. Run it with:

```bash
npm run test:webllm:extension -- --warmup
```

The original padded-vocabulary 325 MB directory remains published at `webllm/`
for rollback. Production now uses the 64,024-token, approximately 272 MB model
at `webllm-64k-q4f16_1-v1/`; only the test build can inject a localhost URL.

## Latency optimization result (2026-08-07)

The 3080 experiment separated steady-state inference from startup latency. The
stock-vocabulary build completes a warm request in roughly 48 ms, but loading a
cached engine and compiling the first WebGPU kernels takes roughly 1.8–2.2 s.
The playback content script now detects a cached model and preheats it before
the first subtitle. It never starts an uncached model download automatically.

The safe request limits are now a 256-token context window and 16 generated
tokens. Across the 100-case set, input length was 12–55 tokens and no output was
truncated at 16 tokens. Context windows of 128, 256, and 512 had no meaningful
warm-latency difference; the smaller window mainly reduces reserved KV memory.

A custom-vocabulary `q4f16_1` build removes the zero-padded Qwen3 vocabulary:

| Metric | Padded vocabulary | 64,024-token vocabulary |
| --- | ---: | ---: |
| Model weights | about 325 MB | about 272 MB |
| Warm mean (median of 3 runs) | 48.04 ms | 45.66 ms |
| Warm P50 | 42.12 ms | 40.40 ms |
| TTFT | 25.23 ms | 23.75 ms |
| Decode rate | 108.87 tok/s | 112.76 tok/s |
| Output changes | baseline | 0/100 |

This is the best tested Pareto point: about 16% less download and 4–6% lower
typical latency with identical benchmark output. `q4f16_0` was slower;
`q4f16_2` was much larger and changed output. Enabling WebGPU subgroups on the
current WebLLM/MLC toolchain produced incorrect translations despite the
adapter advertising subgroup support, so the release library must be compiled
without subgroups. Limiting prompts to one context line changed output and
reduced exact matches from 9% to 7%, without a repeatable speed improvement.

The optimized 64k model is published at `webllm-64k-q4f16_1-v1/` and production
uses its matching no-subgroup WASM. The new model ID deliberately creates a
separate browser cache entry. Mixing either file with the padded-vocabulary
release produces invalid inference.
