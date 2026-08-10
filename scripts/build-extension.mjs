import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const outputDir = path.resolve("dist/extension");
const includeExperiments = process.argv.includes("--experiments");
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const entryPoints = {
  background: "extension/src/background/main.js",
  content: "extension/src/content/main.js",
  options: "extension/src/options.js"
};
if (includeExperiments) {
  Object.assign(entryPoints, {
    "webllm-experiment": "extension/src/webllm-experiment/main.js",
    "webllm-worker": "extension/src/webllm-experiment/worker.js",
    "wllama-experiment": "extension/src/wllama-experiment/main.js"
  });
}

await build({
  entryPoints,
  bundle: true,
  format: "iife",
  outdir: outputDir,
  platform: "browser",
  target: "chrome120",
  define: {
    "globalThis.__LOCALSUBS_WEBLLM_MODEL_URL__": JSON.stringify(
      process.env.LOCALSUBS_WEBLLM_MODEL_URL || ""
    )
  },
  legalComments: "none",
  sourcemap: false
});

const staticFiles = [
  "manifest.json",
  "options.html",
  "options.css"
];
if (includeExperiments) {
  staticFiles.push(
    "webllm-experiment.html",
    "webllm-experiment.css",
    "wllama-experiment.html"
  );
}
for (const file of staticFiles) {
  await cp(file, path.join(outputDir, file));
}
await cp("extension/vendor/model-lib.wasm", path.join(outputDir, "model-lib.wasm"));
if (includeExperiments) {
  await cp("mini_test_set.jsonl", path.join(outputDir, "wllama-mini-test-set.jsonl"));
  await cp("mini_test_set.jsonl", path.join(outputDir, "webllm-mini-test-set.jsonl"));
  await cp(
    "node_modules/@wllama/wllama/esm/wasm/wllama.wasm",
    path.join(outputDir, "wllama.wasm")
  );
  await cp(
    "node_modules/@wllama/wllama-compat/wasm/wllama.wasm",
    path.join(outputDir, "wllama-compat.wasm")
  );
  await cp(
    "node_modules/@wllama/wllama-compat/wasm/wllama.js",
    path.join(outputDir, "wllama-compat.js.txt")
  );
}
await mkdir(path.join(outputDir, "icons"), { recursive: true });
for (const icon of ["icon-16.png", "icon-32.png", "icon-48.png", "icon-128.png"]) {
  await cp(path.join("icons", icon), path.join(outputDir, "icons", icon));
}

const manifestPath = path.join(outputDir, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (includeExperiments) {
  manifest.sandbox = { pages: ["wllama-experiment.html"] };
  manifest.content_security_policy.sandbox =
    "sandbox allow-scripts; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; object-src 'self'; connect-src https://huggingface.co https://*.huggingface.co https://*.hf.co";
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Built ${includeExperiments ? "experiment" : "production"} extension ${manifest.version} in ${outputDir}`);
