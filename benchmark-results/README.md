# Windows llama.cpp latency benchmark

Measured on 2026-08-03 with LocalSubs 0.3.4 development code, llama.cpp
`b10240` (`0b14b87d7`), Windows x64, a 12-logical-processor Intel CPU, and an
NVIDIA GeForce RTX 3080 10 GB using driver 591.86.

Both runs used all 100 cases in `mini_test_set.jsonl`, three warmup requests,
the same verified Q5_K_M model, and sequential requests to the llama.cpp
`/completion` endpoint.

| Backend | GPU layers | Startup | Mean | P50 | P95 | P99 | Max | Throughput |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pure CPU | 0 | 608.7 ms | 147.0 ms | 132.9 ms | 286.5 ms | 339.5 ms | 506.5 ms | 6.80 subtitles/s |
| NVIDIA CUDA 12.4 | 99 | 810.2 ms | 28.4 ms | 27.3 ms | 48.9 ms | 51.5 ms | 68.6 ms | 35.15 subtitles/s |

CUDA delivered about 5.17x the measured throughput and both runs completed
with zero request failures. Strict reference-string exact match was 8% for
both runs; that field is recorded for reproducibility and is not intended as a
translation-quality evaluation.

Reproduce from PowerShell after downloading both runtimes and the model:

```powershell
localsubs benchmark --backend cpu --dataset mini_test_set.jsonl --warmup 3 --output benchmark-results\windows-cpu-b10240.json
localsubs benchmark --backend cuda --dataset mini_test_set.jsonl --warmup 3 --output benchmark-results\windows-cuda-b10240.json
```

The full per-sample reports are `windows-cpu-b10240.json` and
`windows-cuda-b10240.json`. They include runtime, model and dataset hashes,
hardware metadata, latency percentiles, translations and errors.
