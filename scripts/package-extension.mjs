import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";

const extensionDir = path.resolve("dist/extension");
const manifest = JSON.parse(await readFile(path.join(extensionDir, "manifest.json"), "utf8"));
const outputPath = path.resolve(`dist/localsubs-chrome-extension-v${manifest.version}.zip`);
const stableDate = new Date("2000-01-01T00:00:00.000Z");

async function listFiles(root, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, child));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

await mkdir(path.dirname(outputPath), { recursive: true });
const output = createWriteStream(outputPath);
const archive = archiver("zip", { zlib: { level: 9 } });
const completed = new Promise((resolve, reject) => {
  output.on("close", resolve);
  output.on("error", reject);
  archive.on("error", reject);
});

archive.pipe(output);
for (const relative of await listFiles(extensionDir)) {
  archive.append(await readFile(path.join(extensionDir, relative)), {
    name: relative.split(path.sep).join("/"),
    date: stableDate,
    mode: 0o644
  });
}
await archive.finalize();
await completed;

console.log(`Packaged ${outputPath}`);
