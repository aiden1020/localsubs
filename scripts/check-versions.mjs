import { readFile } from "node:fs/promises";

// The extension and the native helper are released separately. Each keeps its
// own version: extension releases are tagged extension-vX.Y.Z and helper
// releases vX.Y.Z. They stay compatible through the helper API version, not
// through matching release numbers.

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

function alignedVersion(component, versions) {
  const unique = new Set(Object.values(versions));
  if (unique.size !== 1) {
    const details = Object.entries(versions)
      .map(([name, version]) => `${name}: ${version}`)
      .join("\n");
    throw new Error(`LocalSubs ${component} versions are not aligned:\n${details}`);
  }
  const [version] = unique;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`${component} version ${version} is not a semantic X.Y.Z version`);
  }
  return version;
}

const extensionVersion = alignedVersion("extension", {
  "manifest.json": manifest.version,
  "package.json": packageManifest.version,
  "content BUILD": capture(contentSource, /const BUILD = "([^"]+)";/, "content BUILD")
});
const helperVersion = alignedVersion("helper", {
  "runtime.HelperVersion": capture(
    runtimeSource,
    /HelperVersion\s*=\s*"([^"]+)"/,
    "runtime.HelperVersion"
  )
});

const apiVersions = {
  extension: capture(backgroundSource, /EXPECTED_API_VERSION = "([^"]+)";/, "extension API version"),
  helper: capture(runtimeSource, /APIVersion\s*=\s*"([^"]+)"/, "runtime.APIVersion")
};
if (apiVersions.extension !== apiVersions.helper) {
  throw new Error(
    `Extension API ${apiVersions.extension} does not match helper API ${apiVersions.helper}`
  );
}

const releaseTag = process.env.LOCALSUBS_RELEASE_TAG;
if (releaseTag) {
  const expected = releaseTag.startsWith("extension-v")
    ? { component: "extension", tag: `extension-v${extensionVersion}` }
    : { component: "helper", tag: `v${helperVersion}` };
  if (releaseTag !== expected.tag) {
    throw new Error(
      `Release tag ${releaseTag} does not match the ${expected.component} version (${expected.tag})`
    );
  }
}

console.log(
  `LocalSubs extension ${extensionVersion}, helper ${helperVersion}, helper API ${apiVersions.helper}`
);
