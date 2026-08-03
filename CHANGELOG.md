# Changelog

All notable user-facing changes are documented in this file. LocalSubs uses
semantic versioning.

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

[0.4.0]: https://github.com/aiden1020/localsubs/releases/tag/v0.4.0
