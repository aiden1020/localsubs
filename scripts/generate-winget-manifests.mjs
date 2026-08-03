import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const PACKAGE_ID = "Aiden1020.LocalSubs";
const MANIFEST_VERSION = "1.12.0";

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!["--version", "--installer", "--output"].includes(key) || !value) {
      throw new Error(
        "Usage: node scripts/generate-winget-manifests.mjs --version X.Y.Z --installer PATH --output DIR"
      );
    }
    options[key.slice(2)] = value;
  }
  if (!options.version || !options.installer || !options.output) {
    throw new Error("--version, --installer, and --output are required");
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(options.version)) {
    throw new Error(`Invalid release version ${options.version}`);
  }
  return options;
}

const options = parseArguments(process.argv.slice(2));
const installerPath = path.resolve(options.installer);
const installerStat = await stat(installerPath);
if (!installerStat.isFile()) {
  throw new Error(`Installer is not a file: ${installerPath}`);
}
const installerBody = await readFile(installerPath);
const checksum = createHash("sha256").update(installerBody).digest("hex").toUpperCase();
const releaseURL = `https://github.com/aiden1020/localsubs/releases/download/v${options.version}`;
const releasePageURL = `https://github.com/aiden1020/localsubs/releases/tag/v${options.version}`;
const installerURL = `${releaseURL}/localsubs_windows_amd64.zip`;
const outputDir = path.resolve(options.output);

const manifests = new Map([
  [
    `${PACKAGE_ID}.yaml`,
    `# yaml-language-server: $schema=https://aka.ms/winget-manifest.version.${MANIFEST_VERSION}.schema.json\n` +
      `PackageIdentifier: ${PACKAGE_ID}\n` +
      `PackageVersion: ${options.version}\n` +
      "DefaultLocale: en-US\n" +
      "ManifestType: version\n" +
      `ManifestVersion: ${MANIFEST_VERSION}\n`
  ],
  [
    `${PACKAGE_ID}.installer.yaml`,
    `# yaml-language-server: $schema=https://aka.ms/winget-manifest.installer.${MANIFEST_VERSION}.schema.json\n` +
      `PackageIdentifier: ${PACKAGE_ID}\n` +
      `PackageVersion: ${options.version}\n` +
      "InstallerType: zip\n" +
      "NestedInstallerType: portable\n" +
      "Commands:\n" +
      "- localsubs\n" +
      "Installers:\n" +
      "- Architecture: x64\n" +
      `  InstallerUrl: ${installerURL}\n` +
      `  InstallerSha256: ${checksum}\n` +
      "  NestedInstallerFiles:\n" +
      "  - RelativeFilePath: localsubs.exe\n" +
      "    PortableCommandAlias: localsubs\n" +
      "ManifestType: installer\n" +
      `ManifestVersion: ${MANIFEST_VERSION}\n`
  ],
  [
    `${PACKAGE_ID}.locale.en-US.yaml`,
    `# yaml-language-server: $schema=https://aka.ms/winget-manifest.defaultLocale.${MANIFEST_VERSION}.schema.json\n` +
      `PackageIdentifier: ${PACKAGE_ID}\n` +
      `PackageVersion: ${options.version}\n` +
      "PackageLocale: en-US\n" +
      "Publisher: Aiden1020\n" +
      "PublisherUrl: https://github.com/aiden1020\n" +
      "PublisherSupportUrl: https://github.com/aiden1020/localsubs/issues\n" +
      "Author: Tsz-To Wong\n" +
      "PackageName: LocalSubs\n" +
      "PackageUrl: https://github.com/aiden1020/localsubs\n" +
      "License: Apache-2.0\n" +
      `LicenseUrl: https://github.com/aiden1020/localsubs/blob/v${options.version}/LICENSE\n` +
      "ShortDescription: Fully local AI subtitle translation for streaming video.\n" +
      "Description: Translates English streaming subtitles to Traditional Chinese on-device using a local model.\n" +
      "Tags:\n" +
      "- ai\n" +
      "- cli\n" +
      "- subtitles\n" +
      "- translation\n" +
      `ReleaseNotesUrl: ${releasePageURL}\n` +
      "ManifestType: defaultLocale\n" +
      `ManifestVersion: ${MANIFEST_VERSION}\n`
  ]
]);

await mkdir(outputDir, { recursive: true });
for (const [name, body] of manifests) {
  await writeFile(path.join(outputDir, name), body, "utf8");
}

console.log(`Generated WinGet ${PACKAGE_ID} ${options.version} manifests`);
console.log(`Installer SHA-256: ${checksum}`);
