import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("dist/extension/manifest.json", "utf8"));
const zipPath = `dist/localsubs-chrome-extension-v${manifest.version}.zip`;

async function hashPackage() {
  const result = spawnSync(process.execPath, ["scripts/package-extension.mjs"], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`extension packaging failed:\n${result.stderr || result.stdout}`);
  }
  return createHash("sha256").update(await readFile(zipPath)).digest("hex");
}

const first = await hashPackage();
const second = await hashPackage();
if (first !== second) {
  throw new Error(`extension ZIP is not reproducible: ${first} != ${second}`);
}
console.log(`Extension ZIP is reproducible: ${first}`);
