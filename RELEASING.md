# Releasing LocalSubs

## Release acceptance gates

A release tag may be pushed only when all of these gates pass:

1. Version gate: `manifest.json`, `package.json`, the extension build marker,
   and `runtime.HelperVersion` match the intended `vX.Y.Z` tag.
2. Code gate: Go tests, race tests, vet, JavaScript checks and tests, and the
   Native Messaging integration test pass.
3. Platform gate: the native Windows job builds and smoke-tests the helper and
   completes the Edge Native Messaging E2E test.
4. Packaging gate: GoReleaser produces Darwin amd64/arm64 archives, a Windows
   amd64 ZIP, checksums, and a Homebrew formula; the extension ZIP is
   reproducible and passes its smoke test.
5. Release-candidate gate: `localsubs version`, `runtime status`, `status`, and
   `doctor` pass from the packaged Windows helper. Real CPU inference must pass;
   CUDA inference must pass on supported NVIDIA hardware or automatic fallback
   must be demonstrated.
6. Documentation gate: changelog, installation, upgrade, uninstall, privacy,
   and security documentation describe the release accurately.

## Prepare and verify

Update every product version, add the changelog entry, and run the commands in
`CONTRIBUTING.md`. Create a local snapshot and generate a WinGet preview from
its Windows archive:

```bash
goreleaser release --snapshot --clean
npm run smoke:goreleaser
npm run generate:winget -- --version 0.4.1 \
  --installer dist/localsubs_windows_amd64.zip \
  --output dist/winget
```

The snapshot checksum is for RC validation only. Never submit its WinGet
manifest because the tagged release archive has a different checksum.

## Publish

After reviewing the diff and local RC, commit the release, push it, and create
the matching annotated tag:

```bash
git tag -a v0.4.1 -m "LocalSubs v0.4.1"
git push origin main
git push origin v0.4.1
```

The tag workflow waits for both verification jobs, publishes GitHub and
Homebrew artifacts, uploads the extension ZIP, generates WinGet manifests from
the exact released Windows ZIP, and creates provenance attestations.

## Submit to WinGet

Download the `winget-manifests-vX.Y.Z` workflow artifact. On Windows, validate
and sandbox-test the directory before submitting it to
`microsoft/winget-pkgs`:

```powershell
winget validate .\winget-manifests-v0.4.1
```

The first package submission requires a normal community-repository pull
request. Do not advertise the WinGet command as available until that PR is
merged. Future releases repeat the process with the newly generated manifests.

## Post-release checks

- Download every public release archive and compare it with `checksums.txt`.
- Run `gh attestation verify` against the Windows ZIP.
- Install with Homebrew on macOS and WinGet on Windows after its manifest is
  published.
- Run `localsubs setup`, `localsubs doctor --deep`, and one browser translation.
- Confirm the Chrome Web Store listing is compatible with the released helper.
