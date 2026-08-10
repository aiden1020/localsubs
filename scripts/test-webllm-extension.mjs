import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import puppeteer from "puppeteer-core";
import { WEBLLM_MODEL_ID } from "../extension/src/core/webllm-config.js";

const extensionDir = path.resolve("dist/extension");
const modelDir = path.resolve("dist/LocalSubs-EN-ZH-TW-0.6B-q4f16_1-current-MLC");
const extensionID = "dpacileladlkfgdjbdjdjhgnepicejjb";
const warmup = process.argv.includes("--warmup");
const remoteModel = process.argv.includes("--remote");
const expectedTranslation = "我馬上回來";

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
    if (await exists(candidate)) return candidate;
  }
  throw new Error("Chrome or Edge was not found; set LOCALSUBS_BROWSER_PATH");
}

function buildExtension(modelURL = "") {
  const result = spawnSync(process.execPath, ["scripts/build-extension.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, LOCALSUBS_WEBLLM_MODEL_URL: modelURL },
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

async function startModelServer() {
  const server = createServer(async (request, response) => {
    try {
      const prefix = "/model/resolve/main/";
      const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
      if (!pathname.startsWith(prefix)) {
        response.writeHead(404).end("Not found");
        return;
      }
      const filePath = path.resolve(modelDir, pathname.slice(prefix.length));
      if (!filePath.startsWith(`${modelDir}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": filePath.endsWith(".json") ? "application/json" : "application/octet-stream"
      }).end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function allowTestModelOrigin(origin) {
  const manifestPath = path.join(extensionDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.host_permissions.push("http://127.0.0.1/*");
  manifest.content_security_policy.extension_pages += ` ${origin}`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const profileDir = await mkdtemp(path.join(os.tmpdir(), "localsubs-webllm-extension-"));
let browser;
let modelServer;
try {
  if (warmup && !remoteModel) {
    modelServer = await startModelServer();
    const modelURL = `${modelServer.origin}/model/resolve/main/`;
    buildExtension(modelURL);
    await allowTestModelOrigin(modelServer.origin);
  } else {
    buildExtension();
  }
  browser = await puppeteer.launch({
    browser: "chrome",
    executablePath: await browserExecutable(),
    enableExtensions: [extensionDir],
    headless: !process.argv.includes("--headed"),
    pipe: true,
    userDataDir: profileDir,
    args: ["--no-first-run", "--no-default-browser-check", "--disable-component-update"]
  });
  const optionsURL = `chrome-extension://${extensionID}/options.html`;
  const target = await browser.waitForTarget(
    (candidate) => candidate.type() === "page" && candidate.url() === optionsURL,
    { timeout: 10000 }
  );
  const page = await target.asPage();
  if (!page) throw new Error("Extension options page is unavailable");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.waitForFunction(
    () => document.querySelector("#service-status")?.classList.contains("is-idle")
      || document.querySelector("#service-status")?.classList.contains("is-error"),
    { timeout: 30000 }
  );
  const result = await page.evaluate(async () => ({
    backend: (await chrome.storage.sync.get("inferenceBackend")).inferenceBackend,
    health: await chrome.runtime.sendMessage({ type: "CHECK_TRANSLATOR", warmup: false }),
    status: {
      className: document.querySelector("#service-status")?.className || "",
      title: document.querySelector("#service-status-title")?.textContent || "",
      detail: document.querySelector("#service-status-detail")?.textContent || ""
    }
  }));
  let warmupResult;
  let translation;
  if (warmup && result.health?.needsDownload) {
    warmupResult = await page.evaluate(async () => chrome.runtime.sendMessage({
      type: "CHECK_TRANSLATOR",
      warmup: true
    }));
    translation = await page.evaluate(async () => chrome.runtime.sendMessage({
      type: "TRANSLATE_SUBTITLE",
      payload: {
        sessionId: "webllm-extension-e2e",
        cueId: "1",
        currentText: "I'll be right back.",
        contextLines: ["Wait here."],
        sourceLanguage: "en",
        targetLanguage: "zh-Hant"
      }
    }));
  }
  const report = {
    browserVersion: await browser.version(),
    errors,
    ...result,
    warmup: warmupResult,
    translation,
    passed: result.backend === "webllm"
      && result.health?.transport === "webllm"
      && result.health?.model === WEBLLM_MODEL_ID
      && result.health?.needsDownload === true
      && result.health?.error === undefined
      && (!warmup || (warmupResult?.ok === true
        && translation?.ok === true
        && warmupResult?.model === WEBLLM_MODEL_ID
        && translation?.model === WEBLLM_MODEL_ID
        && translation.translation?.trim() === expectedTranslation))
      && errors.length === 0
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await new Promise((resolve) => modelServer?.server.close(resolve) ?? resolve());
  if (warmup && !remoteModel) buildExtension();
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }).catch(() => {});
}
