# Changelog

All notable user-facing changes are documented in this file. LocalSubs uses
semantic versioning.

## [Unreleased]

### Added

- Support `localsubs benchmark --backend metal` on macOS to benchmark
  llama.cpp with GPU layer offload.

## [0.5.0] - 2026-08-11

### Added

- Run the LocalSubs MLC model directly in the extension through WebLLM and
  WebGPU, with browser inference selected by default for new installations.
- Let users switch between browser inference and the optional native helper,
  and show WebGPU capability, model download, preparation, and readiness in
  extension settings.

### Changed

- Use the optimized 64,024-token `q4f16_1` model with a bundled no-subgroup
  WebGPU library, a 256-token context window, and a 16-token output limit.
- Preheat an already downloaded browser model before the first subtitle while
  requiring uncached downloads to be started explicitly from settings.
- Preserve the native helper backend for existing installations and keep it
  available for CPU inference, NVIDIA CUDA, or browsers without compatible
  WebGPU support.

### Fixed

- Store WebLLM artifacts in IndexedDB so the bundled `chrome-extension://`
  model library does not fail through CacheStorage's `Cache.add()` path.

## [0.4.1] - 2026-08-06

### Fixed

- Bundle the 100-case benchmark dataset into the CLI so installed releases can
  run `localsubs benchmark` without a repository checkout or separate file.

### Changed

- Detect Windows and macOS on the extension options page and show the matching
  WinGet or Homebrew installation instructions. Unsupported platforms no
  longer display commands that cannot work there.

## [0.4.0] - 2026-08-04

### Added

- Native Windows 10/11 x64 helper support for Chrome, Chromium, and Microsoft
  Edge, including per-user Native Messaging registration.
- Managed, checksum-verified llama.cpp b10240 CPU and NVIDIA CUDA 12.4
  runtimes on Windows, with automatic CUDA-to-CPU fallback.
- `runtime status`, `runtime download`, `benchmark`, and deep `doctor`
  diagnostics for backend selection and inference health.
- `uninstall` command for removing browser registrations while preserving user
  data by default; `--purge --yes` also removes models, runtimes, logs, and
  settings.
- Windows browser end-to-end coverage and reproducible CPU/CUDA benchmark
  reports.
- Windows amd64 ZIP release artifact, generated WinGet portable manifests, and
  GitHub build provenance attestations.

### Changed

- The Go CLI/helper is now one cross-platform codebase rather than a separate
  Windows implementation.
- Setup selects the best available Windows backend with `--backend auto`.

[0.5.0]: https://github.com/aiden1020/localsubs/releases/tag/v0.5.0
[0.4.1]: https://github.com/aiden1020/localsubs/releases/tag/v0.4.1
[0.4.0]: https://github.com/aiden1020/localsubs/releases/tag/v0.4.0
