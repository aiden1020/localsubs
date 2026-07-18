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
git diff --check
```

The source extension is under `extension/src`. Generated bundles and the Chrome
extension ZIP are written to `dist/` and are not committed. To test an unpacked
extension, run `npm run build:extension` and load `dist/extension` in Chrome.
