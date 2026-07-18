import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const packageManifest = JSON.parse(await readFile("package.json", "utf8"));
const contentSource = await readFile("extension/src/content/main.js", "utf8");
const backgroundSource = await readFile("extension/src/background/translator-service.js", "utf8");
const runtimeSource = await readFile("internal/runtime/runtime.go", "utf8");

function capture(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Unable to read ${label}`);
  }
  return match[1];
}

const versions = {
  "manifest.json": manifest.version,
  "package.json": packageManifest.version,
  "content BUILD": capture(contentSource, /const BUILD = "([^"]+)";/, "content BUILD"),
  "runtime.HelperVersion": capture(
    runtimeSource,
    /HelperVersion\s*=\s*"([^"]+)"/,
    "runtime.HelperVersion"
  )
};

const unique = new Set(Object.values(versions));
if (unique.size !== 1) {
  const details = Object.entries(versions)
    .map(([name, version]) => `${name}: ${version}`)
    .join("\n");
  throw new Error(`LocalSubs product versions are not aligned:\n${details}`);
}

const [version] = unique;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error(`Product version ${version} is not a semantic X.Y.Z version`);
}
const apiVersions = {
  extension: capture(backgroundSource, /EXPECTED_API_VERSION = "([^"]+)";/, "extension API version"),
  helper: capture(runtimeSource, /APIVersion\s*=\s*"([^"]+)"/, "runtime.APIVersion")
};
if (apiVersions.extension !== apiVersions.helper) {
  throw new Error(
    `Extension API ${apiVersions.extension} does not match helper API ${apiVersions.helper}`
  );
}
const expectedTag = process.env.LOCALSUBS_RELEASE_TAG;
if (expectedTag && expectedTag !== `v${version}`) {
  throw new Error(`Release tag ${expectedTag} does not match product version v${version}`);
}

console.log(`LocalSubs versions aligned at ${version}`);
