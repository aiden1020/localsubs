import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const outputDir = path.resolve("dist/extension");
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

await build({
  entryPoints: {
    background: "extension/src/background/main.js",
    content: "extension/src/content/main.js",
    options: "extension/src/options.js"
  },
  bundle: true,
  format: "iife",
  outdir: outputDir,
  platform: "browser",
  target: "chrome120",
  legalComments: "none",
  sourcemap: false
});

for (const file of ["manifest.json", "options.html", "options.css"]) {
  await cp(file, path.join(outputDir, file));
}
await mkdir(path.join(outputDir, "icons"), { recursive: true });
for (const icon of ["icon-16.png", "icon-32.png", "icon-48.png", "icon-128.png"]) {
  await cp(path.join("icons", icon), path.join(outputDir, "icons", icon));
}

const manifestPath = path.join(outputDir, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Built extension ${manifest.version} in ${outputDir}`);
