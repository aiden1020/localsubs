import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import { listFiles } from "./files.mjs";

const extensionDir = path.resolve("dist/extension");
const manifest = JSON.parse(await readFile(path.join(extensionDir, "manifest.json"), "utf8"));
const outputPath = path.resolve(`dist/localsubs-chrome-extension-v${manifest.version}.zip`);
const stableDate = new Date("2000-01-01T00:00:00.000Z");

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
    name: relative,
    date: stableDate,
    mode: 0o644
  });
}
await archive.finalize();
await completed;

console.log(`Packaged ${outputPath}`);
