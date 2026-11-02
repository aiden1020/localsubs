# Releasing LocalSubs

The Chrome extension and the native helper are released separately, each with
its own version:

| Component | Version lives in | Tag | Published to |
|---|---|---|---|
| Extension | `manifest.json`, `package.json`, `BUILD` in `extension/src/content/main.js` | `extension-vX.Y.Z` | A GitHub release (never marked Latest), then the Chrome Web Store |
| Helper | `HelperVersion` in `internal/runtime/runtime.go` | `vX.Y.Z` | The Latest GitHub release, Homebrew, WinGet |

Release only the component that changed. A helper update is optional for users,
so don't publish one without helper changes.

## Compatibility

The extension and the helper stay compatible through the helper API version,
not through matching release numbers. The extension's `EXPECTED_API_VERSION`
in `extension/src/background/translator-service.js` must equal the helper's
`APIVersion` in `internal/runtime/runtime.go`; `npm run check` enforces this.

- Raise the API version only for a breaking change to the Native Messaging
  protocol. Both components must then be released together.
- The helper's model list is built in (`internal/manifest/model_manifest.json`).
  A new model needs a helper release first. Until users update, extension
  settings show the model's helper as needing an update.

## Release acceptance gates

A release tag may be pushed only when all of these gates pass:

1. Version gate: `npm run check` passes with `LOCALSUBS_RELEASE_TAG` set to the
   tag. The tag must match the extension version for `extension-vX.Y.Z` or
   `HelperVersion` for `vX.Y.Z`.
2. Code gate: Go tests, race tests, vet, JavaScript checks and tests, and the
   Native Messaging integration test pass.
3. Platform gate: the native Windows job builds and smoke-tests the helper and
   completes the Edge Native Messaging E2E test.
4. Packaging gate: the extension ZIP is reproducible and passes its smoke test.
   For a helper release, GoReleaser also produces Darwin amd64/arm64 archives,
   a Windows amd64 ZIP, checksums, and a Homebrew formula.
5. Release-candidate gate (helper releases): `localsubs version`,
   `runtime status`, `status`, and `doctor` pass from the packaged Windows
   helper. Real CPU inference must pass; CUDA inference must pass on supported
   NVIDIA hardware or automatic fallback must be demonstrated.
6. Documentation gate: changelog, installation, upgrade, uninstall, privacy,
   and security documentation describe the release accurately.

## Release the extension

1. Update the version in `manifest.json`, `package.json` and `package-lock.json`,
   and `BUILD` in `extension/src/content/main.js`.
2. Add a `## [extension X.Y.Z] - YYYY-MM-DD` entry to `CHANGELOG.md`, and its
   link to `releases/tag/extension-vX.Y.Z` at the bottom.
3. Run the commands in `CONTRIBUTING.md`, then merge to `main` and tag:

   ```bash
   LOCALSUBS_RELEASE_TAG=extension-v0.7.1 npm run check
   git tag -a extension-v0.7.1 -m "LocalSubs extension v0.7.1"
   git push origin extension-v0.7.1
   ```

4. The tag workflow waits for both verification jobs, then publishes
   `localsubs-chrome-extension-vX.Y.Z.zip` with a provenance attestation as
   its own GitHub release.
5. Upload that ZIP to the Chrome Web Store.

## Release the helper

1. Update `HelperVersion` in `internal/runtime/runtime.go`.
2. Add a `## [helper X.Y.Z] - YYYY-MM-DD` entry to `CHANGELOG.md`, and its link
   to `releases/tag/vX.Y.Z` at the bottom.
3. Run the commands in `CONTRIBUTING.md`. Create a local snapshot and generate
   a WinGet preview from its Windows archive:

   ```bash
   goreleaser release --snapshot --clean
   npm run smoke:goreleaser
   npm run generate:winget -- --version 0.7.0 \
     --installer dist/localsubs_windows_amd64.zip \
     --output dist/winget
   ```

   The snapshot checksum is for RC validation only. Never submit its WinGet
   manifest because the tagged release archive has a different checksum.

4. Merge to `main` and tag:

   ```bash
   LOCALSUBS_RELEASE_TAG=v0.7.0 npm run check
   git tag -a v0.7.0 -m "LocalSubs helper v0.7.0"
   git push origin v0.7.0
   ```

5. The tag workflow waits for both verification jobs, publishes the GitHub
   release and Homebrew formula, generates WinGet manifests from the exact
   released Windows ZIP, and creates provenance attestations.
   `scripts/goreleaser-tags.mjs` points GoReleaser at the current and previous
   `vX.Y.Z` tags, so `extension-v` tags don't affect the helper release.

## Submit to WinGet

Download the `winget-manifests-vX.Y.Z` workflow artifact. On Windows, validate
and sandbox-test the directory before submitting it to
`microsoft/winget-pkgs`:

```powershell
winget validate .\winget-manifests-v0.7.0
```

The first package submission requires a normal community-repository pull
request. Do not advertise the WinGet command as available until that PR is
merged. Future releases repeat the process with the newly generated manifests.

## Post-release checks

For a helper release:

- Download every public release archive and compare it with `checksums.txt`.
- Run `gh attestation verify` against the Windows ZIP.
- Install with Homebrew on macOS and WinGet on Windows after its manifest is
  published.
- Run `localsubs setup`, `localsubs doctor --deep`, and one browser translation.

For an extension release:

- Run `gh attestation verify` against the extension ZIP.
- Install the published store version and translate one line with the browser
  model and with the current helper.
