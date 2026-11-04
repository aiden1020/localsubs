import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  checkChangelog,
  checkExternalReferences,
  checkLinks,
  checkNames,
  cliCommands,
  headingAnchors,
  scanLines
} from "./docs-lib.mjs";

// Checks the facts the docs state about the repo, so they can't quietly go
// stale: relative links and #anchors, the places outside the docs that link
// into them, that the changelog has an entry for each released version, and
// that the npm scripts and localsubs commands the docs name exist.

function repoFiles() {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr}`);
  return result.stdout.split("\n").filter((file) => file && existsSync(file));
}

const files = repoFiles();
const fileSet = new Set(files);
const dirSet = new Set();
for (const file of files) {
  for (let dir = path.posix.dirname(file); dir !== "."; dir = path.posix.dirname(dir)) dirSet.add(dir);
}
const exists = (target) => fileSet.has(target) || dirSet.has(target);

const markdown = new Map();
for (const file of files.filter((name) => name.endsWith(".md"))) {
  markdown.set(file, await readFile(file, "utf8"));
}

// npm scripts of the nearest package.json above a file.
const packageScripts = new Map();
for (const file of files.filter((name) => path.posix.basename(name) === "package.json")) {
  const scripts = JSON.parse(await readFile(file, "utf8")).scripts ?? {};
  packageScripts.set(path.posix.dirname(file), new Set(Object.keys(scripts)));
}
function scriptsFor(file) {
  for (let dir = path.posix.dirname(file); ; dir = path.posix.dirname(dir)) {
    if (packageScripts.has(dir)) return packageScripts.get(dir);
    if (dir === ".") return null;
  }
}

// Files outside the docs that link into them.
const sources = new Map();
for (const file of files) {
  const inScope =
    file === "options.html" ||
    file === "manifest.json" ||
    file.startsWith("website/app/") ||
    file.startsWith("extension/src/");
  if (inScope && /\.(?:tsx?|jsx?|mjs|html|json)$/.test(file)) sources.set(file, await readFile(file, "utf8"));
}

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const helperVersion = (await readFile("internal/runtime/runtime.go", "utf8")).match(
  /HelperVersion\s*=\s*"([^"]+)"/
)?.[1];
if (!helperVersion) throw new Error("Unable to read runtime.HelperVersion");

const errors = [
  ...checkLinks({ files: markdown, exists }),
  ...checkExternalReferences({
    sources,
    exists,
    readmeAnchors: headingAnchors(scanLines(markdown.get("README.md") ?? ""))
  }),
  ...checkChangelog({
    changelog: markdown.get("CHANGELOG.md") ?? "",
    extensionVersion: manifest.version,
    helperVersion
  }),
  ...checkNames({
    files: markdown,
    scriptsFor,
    commands: cliCommands(await readFile("cmd/localsubs/main.go", "utf8"))
  })
];

if (errors.length > 0) {
  console.error(`Docs are out of step with the repo:\n${errors.map((error) => `  ${error}`).join("\n")}`);
  process.exit(1);
}
console.log(`Docs checked: ${markdown.size} markdown files, changelog covers extension ${manifest.version} and helper ${helperVersion}`);
