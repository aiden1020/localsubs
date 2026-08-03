# Contributing to LocalSubs

## Prerequisites

- Go version declared in `go.mod`
- Node.js 24 or later
- GoReleaser v2.15.2 for release checks (the binary Formula workflow is
  intentionally pinned until its Homebrew migration is planned)

## Verify changes

```bash
npm ci
npm run check
npm test
npm run test:integration
npm run package:extension
npm run smoke:extension
npm run check:extension-reproducibility
npm run test:version-injection

go test ./...
go test -race ./...
go vet ./...
goreleaser check
goreleaser release --snapshot --clean
npm run smoke:goreleaser
npm run generate:winget -- --version 0.4.0 --installer dist/localsubs_windows_amd64.zip --output dist/winget
git diff --check
```

Windows-specific changes must also be verified from an x64 PowerShell session:

```powershell
go test ./...
npm test
npm run test:integration
go build -o dist\localsubs.exe .\cmd\localsubs
.\dist\localsubs.exe runtime status --json
npm run test:e2e:windows -- --browser edge --fake-backend
```

The browser E2E uses an isolated temporary browser profile and verifies the
extension settings page, service worker, Windows Registry native host,
translation response, and helper process cleanup. For a real installed model,
replace `--fake-backend` with `--backend cpu` or `--backend cuda`. Pass
`--browser chrome` to test Chrome; `--executable` can point to Chrome for
Testing when regular Chrome is not installed.

For runtime or inference changes, download both backends and run the full
100-case benchmark described in `README.md`. CPU runs must report zero GPU
offload layers; CUDA runs must report the configured GPU offload layers.

The source extension is under `extension/src`. Generated bundles and the Chrome
extension ZIP are written to `dist/` and are not committed. To test an unpacked
extension, run `npm run build:extension` and load `dist/extension` in Chrome.
