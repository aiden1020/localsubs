import { readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { listFiles } from "./files.mjs";

const extensionDir = path.resolve("dist/extension");
const expected = [
  "background.js",
  "content.js",
  "icons/icon-128.png",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "manifest.json",
  "options.css",
  "options.html",
  "options.js"
].sort();

const actual = (await listFiles(extensionDir)).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`unexpected extension package files:\n${actual.join("\n")}`);
}
const manifest = JSON.parse(await readFile(path.join(extensionDir, "manifest.json"), "utf8"));
const contentBundle = await readFile(path.join(extensionDir, "content.js"), "utf8");
if (!contentBundle.includes(manifest.version)) {
  throw new Error("content bundle does not contain the product build version");
}
const zipPath = path.resolve(`dist/localsubs-chrome-extension-v${manifest.version}.zip`);
const zipEntries = unzipSync(new Uint8Array(await readFile(zipPath)));
const zipFiles = Object.keys(zipEntries).sort();
if (JSON.stringify(zipFiles) !== JSON.stringify(expected)) {
  throw new Error(`unexpected extension ZIP files:\n${zipFiles.join("\n")}`);
}
for (const relative of expected) {
  const staged = await readFile(path.join(extensionDir, relative));
  if (!staged.equals(Buffer.from(zipEntries[relative]))) {
    throw new Error(`extension ZIP content differs from staging file: ${relative}`);
  }
}
if (manifest.host_permissions?.some((permission) => permission.includes("localhost") || permission.includes("127.0.0.1"))) {
  throw new Error("extension manifest still contains obsolete localhost permissions");
}

console.log(`Extension package smoke test passed for v${manifest.version}`);
