import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import puppeteer from "puppeteer-core";

const EXTENSION_ID = "dpacileladlkfgdjbdjdjhgnepicejjb";
const extensionDir = path.resolve("dist/extension");
const headed = process.argv.includes("--headed");
const workerDiagnostic = process.argv.includes("--worker-diagnostic");
const standalone = process.argv.includes("--standalone");
const benchmark = process.argv.includes("--benchmark") || workerDiagnostic || standalone;
const outputArgumentIndex = process.argv.indexOf("--output");
const outputPath = outputArgumentIndex >= 0
  ? path.resolve(process.argv[outputArgumentIndex + 1])
  : path.resolve("dist/wllama-latency-report.json");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function browserExecutable() {
  const candidates = [
    process.env.LOCALSUBS_BROWSER_PATH,
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }
  throw new Error("Chrome or Edge was not found; set LOCALSUBS_BROWSER_PATH");
}

async function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
      if (pathname === "/favicon.ico") {
        response.writeHead(204).end();
        return;
      }
      const relativePath = pathname === "/" ? "wllama-experiment.html" : pathname.slice(1);
      const filePath = path.resolve(extensionDir, relativePath);
      if (!filePath.startsWith(`${extensionDir}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(filePath);
      const contentType = filePath.endsWith(".html") ? "text/html"
        : filePath.endsWith(".js") || filePath.endsWith(".txt") ? "text/javascript"
          : filePath.endsWith(".jsonl") ? "application/x-ndjson"
            : filePath.endsWith(".wasm") ? "application/wasm"
              : "application/octet-stream";
      response.writeHead(200, {
        "Content-Type": contentType,
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp"
      }).end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForExperimentState(page, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let previous = "";
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      status: document.querySelector("#status")?.textContent || "",
      kind: document.querySelector("#status")?.dataset.kind || "",
      progress: document.querySelector("#load-progress")?.value ?? 0,
      runDisabled: document.querySelector("#run")?.disabled ?? true,
      downloadDisabled: document.querySelector("#download")?.disabled ?? true
    }));
    const serialized = JSON.stringify(state);
    if (serialized !== previous) {
      const benchmarkMatch = state.status.match(/^Benchmark (\d+)\/(\d+)/);
      if (!benchmarkMatch || Number(benchmarkMatch[1]) === 1 || Number(benchmarkMatch[1]) % 10 === 0) {
        console.log(`Experiment state: ${serialized}`);
      }
      previous = serialized;
    }
    if (predicate(state)) {
      return state;
    }
    await delay(1000);
  }
  throw new Error(`experiment state did not settle within ${timeoutMs} ms; last state: ${previous}`);
}

const profileDir = benchmark
  ? path.resolve(standalone ? "dist/.wllama-standalone-profile" : "dist/.wllama-browser-profile")
  : await mkdtemp(path.join(os.tmpdir(), "localsubs-wllama-capability-"));
let browser;
let staticSite;
try {
  if (standalone) {
    staticSite = await startStaticServer();
  }
  await mkdir(profileDir, { recursive: true });
  const launchOptions = {
    browser: "chrome",
    executablePath: await browserExecutable(),
    headless: !headed,
    pipe: true,
    protocolTimeout: 900000,
    userDataDir: profileDir,
    args: ["--no-first-run", "--no-default-browser-check", "--disable-component-update"]
  };
  if (!standalone) {
    launchOptions.enableExtensions = [extensionDir];
  }
  browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
    if (message.text().startsWith("[wllama:")) {
      console.log(message.text());
    }
  });
  const experimentURL = standalone
    ? `${staticSite.origin}/wllama-experiment.html?standalone=1`
    : `chrome-extension://${EXTENSION_ID}/wllama-experiment.html${workerDiagnostic ? "?worker-diagnostic=1" : ""}`;
  await page.goto(experimentURL, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
  await page.waitForFunction(
    () => document.querySelector("#adapter-status")?.textContent !== "Checking...",
    { timeout: 30000 }
  ).catch(() => null);
  const result = await page.evaluate(() => ({
    pageURL: location.href,
    title: document.title,
    adapterStatus: document.querySelector("#adapter-status")?.textContent || "",
    initializeDisabled: document.querySelector("#initialize")?.disabled ?? true,
    hasWebGPU: Boolean(navigator.gpu),
    userAgent: navigator.userAgent
  }));
  const report = {
    browserVersion: await browser.version(),
    headed,
    ...result,
    errors,
    passed: result.adapterStatus.includes("WebGPU")
      && result.hasWebGPU
      && !result.initializeDisabled
      && errors.length === 0
  };
  if (benchmark && report.passed) {
    console.log("WebGPU ready; starting production GGUF download and initialization...");
    await page.evaluate(() => {
      setTimeout(() => document.querySelector("#initialize")?.click(), 0);
    });
    const loadState = await waitForExperimentState(
      page,
      (state) => !state.runDisabled || state.kind === "error",
      600000
    );
    if (loadState.kind === "error") {
      throw new Error(`wllama model load failed: ${loadState.status}`);
    }
    console.log(`Model initialized: ${loadState.status}`);
    await page.evaluate(() => {
      setTimeout(() => document.querySelector("#run")?.click(), 0);
    });
    await waitForExperimentState(
      page,
      (state) => !state.downloadDisabled,
      600000
    );
    report.benchmark = JSON.parse(await page.$eval("#results", (element) => element.textContent || "{}"));
    report.passed = report.benchmark.summary?.acceptance?.passed === true && errors.length === 0;
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    report.outputPath = outputPath;
    console.log(
      `Benchmark complete: P95 ${report.benchmark.summary?.p95Ms ?? "n/a"} ms, exact ${report.benchmark.summary?.exactMatchPercent ?? "n/a"}%`
    );
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) {
    process.exitCode = 1;
  }
} finally {
  await browser?.close().catch(() => {});
  await new Promise((resolve) => staticSite?.server.close(resolve) ?? resolve());
  if (!benchmark) {
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }).catch(() => {});
  }
}
