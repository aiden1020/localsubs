import { execFileSync, spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import puppeteer from "puppeteer-core";

const EXTENSION_ID = "dpacileladlkfgdjbdjdjhgnepicejjb";
const HOST_NAME = "localsubs_helper";

function parseArgs(argv) {
  const options = {
    backend: "auto",
    browser: "edge",
    executable: "",
    expectedBackend: "",
    extension: path.resolve("dist/extension"),
    fakeBackend: false,
    headless: true,
    helper: path.resolve("dist/localsubs.exe"),
    output: "",
    simulateCudaFailure: false,
    timeoutMs: 120000,
    verbose: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--headed") {
      options.headless = false;
      continue;
    }
    if (argument === "--verbose") {
      options.verbose = true;
      continue;
    }
    if (argument === "--simulate-cuda-failure") {
      options.simulateCudaFailure = true;
      continue;
    }
    if (argument === "--fake-backend") {
      options.fakeBackend = true;
      continue;
    }
    const key = argument.startsWith("--") ? argument.slice(2) : "";
    if (!["backend", "browser", "executable", "expect-backend", "extension", "helper", "output", "timeout-ms"].includes(key)) {
      throw new Error(`unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value`);
    }
    index += 1;
    if (key === "timeout-ms") {
      options.timeoutMs = Number.parseInt(value, 10);
    } else if (key === "expect-backend") {
      options.expectedBackend = value;
    } else {
      options[key] = value;
    }
  }
  options.backend = options.backend.toLowerCase();
  options.browser = options.browser.toLowerCase();
  options.expectedBackend = (
    options.expectedBackend || (options.fakeBackend ? "fake" : options.backend === "auto" ? "" : options.backend)
  ).toLowerCase();
  if (!["auto", "cpu", "cuda"].includes(options.backend)) {
    throw new Error("--backend must be auto, cpu, or cuda");
  }
  if (!["chrome", "edge"].includes(options.browser)) {
    throw new Error("--browser must be chrome or edge");
  }
  if (options.expectedBackend && !["cpu", "cuda", "fake"].includes(options.expectedBackend)) {
    throw new Error("--expect-backend must be cpu, cuda, or fake");
  }
  if (options.simulateCudaFailure && options.backend !== "auto") {
    throw new Error("--simulate-cuda-failure requires --backend auto");
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive integer");
  }
  options.extension = path.resolve(options.extension);
  options.helper = path.resolve(options.helper);
  if (options.output) options.output = path.resolve(options.output);
  return options;
}

function browserCandidates(browser) {
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA || "";
  if (browser === "chrome") {
    return [
      path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe")
    ];
  }
  return [
    path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe")
  ];
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveBrowserExecutable(options) {
  const explicit = options.executable || process.env.LOCALSUBS_BROWSER_PATH;
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (!(await exists(resolved))) throw new Error(`browser executable not found: ${resolved}`);
    return resolved;
  }
  for (const candidate of browserCandidates(options.browser)) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error(`${options.browser} is not installed; pass --executable <path>`);
}

function runHelperInstall(helper, browser) {
  const result = spawnSync(helper, ["install", "--browser", browser], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`native host install failed: ${(result.stderr || result.stdout).trim()}`);
  }
}

function processIDs(imageName) {
  let output;
  try {
    output = execFileSync("tasklist.exe", ["/FI", `IMAGENAME eq ${imageName}`, "/FO", "CSV", "/NH"], {
      encoding: "utf8",
      windowsHide: true
    });
  } catch {
    return new Set();
  }
  const ids = new Set();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^"[^"]+","(\d+)"/);
    if (match) ids.add(Number.parseInt(match[1], 10));
  }
  return ids;
}

function difference(current, baseline) {
  return [...current].filter((pid) => !baseline.has(pid));
}

function mergeProcessIDs(left, right) {
  return [...new Set([...left, ...right])];
}

function terminateProcessTree(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
    encoding: "utf8",
    windowsHide: true
  });
}

async function closeBrowser(browser) {
  if (!browser) return false;
  const browserProcess = browser.process();
  let timedOut = false;
  await Promise.race([
    browser.close().catch(() => {}),
    new Promise((resolve) => setTimeout(() => {
      timedOut = true;
      resolve();
    }, 5000))
  ]);
  if (timedOut) {
    browser.disconnect();
    if (browserProcess?.pid) terminateProcessTree(browserProcess.pid);
  }
  return timedOut;
}

async function poll(action, predicate, timeoutMs, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await action();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`condition not met within ${timeoutMs} ms; last value: ${JSON.stringify(value)}`);
}

async function writeReport(outputPath, report) {
  if (!outputPath) return;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

async function run() {
  if (process.platform !== "win32") {
    throw new Error("browser Native Messaging E2E must run with Windows Node.js");
  }
  const options = parseArgs(process.argv.slice(2));
  const executablePath = await resolveBrowserExecutable(options);
  for (const requiredPath of [options.helper, options.extension, path.join(options.extension, "manifest.json")]) {
    if (!(await exists(requiredPath))) throw new Error(`required E2E input not found: ${requiredPath}`);
  }
  const manifest = JSON.parse(await readFile(path.join(options.extension, "manifest.json"), "utf8"));
  if (manifest.key === undefined || manifest.permissions?.includes("nativeMessaging") !== true) {
    throw new Error("built extension is missing its stable key or nativeMessaging permission");
  }

  runHelperInstall(options.helper, options.browser);
  const baseline = {
    helper: processIDs("localsubs.exe"),
    runtime: processIDs("llama-server.exe")
  };
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "localsubs-browser-e2e-"));
  const startedAt = Date.now();
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    browser: options.browser,
    browserExecutable: executablePath,
    extensionID: EXTENSION_ID,
    nativeHost: HOST_NAME,
    requestedBackend: options.backend,
    expectedBackend: options.expectedBackend || undefined,
    fakeBackend: options.fakeBackend,
    simulatedCudaFailure: options.simulateCudaFailure,
    headless: options.headless,
    passed: false,
    cleanupPassed: false
  };
  let browser;
  let page;
  const browserErrors = [];
  let observed = { helper: [], runtime: [] };
  try {
    const browserEnvironment = { ...process.env, LOCALSUBS_BACKEND: options.backend };
    if (options.fakeBackend) {
      browserEnvironment.LOCALSUBS_E2E_FAKE_BACKEND = "1";
    }
    if (options.simulateCudaFailure) {
      browserEnvironment.LOCALSUBS_LLAMA_SERVER_CUDA = options.helper;
    }
    browser = await puppeteer.launch({
      browser: "chrome",
      executablePath,
      enableExtensions: [options.extension],
      env: browserEnvironment,
      headless: options.headless,
      pipe: true,
      dumpio: options.verbose,
      timeout: 30000,
      userDataDir: profileDir,
      args: ["--no-first-run", "--no-default-browser-check", "--disable-component-update"]
    });
    report.browserVersion = await browser.version();
    const optionsTarget = await browser.waitForTarget(
      (target) => target.type() === "page" && target.url() === `chrome-extension://${EXTENSION_ID}/options.html`,
      { timeout: 5000 }
    ).catch(() => null);
    page = optionsTarget ? await optionsTarget.asPage() : await browser.newPage();
    if (!page) throw new Error("extension options page target is unavailable");
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    if (page.url() !== `chrome-extension://${EXTENSION_ID}/options.html`) {
      await page.goto(`chrome-extension://${EXTENSION_ID}/options.html`, {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });
    }
    const expectedSetupCommand = options.browser === "edge"
      ? "localsubs setup --browser edge --backend auto"
      : "localsubs setup --backend auto";
    report.ui = await poll(
      () => page.evaluate(() => ({
        statusClass: document.querySelector("#service-status")?.className || "",
        title: document.querySelector("#service-status-title")?.textContent || "",
        detail: document.querySelector("#service-status-detail")?.textContent || "",
        setupCommand: document.querySelector("#setup-command")?.textContent || ""
      })),
      (state) => state.statusClass.includes("is-ready")
        && state.setupCommand === expectedSetupCommand,
      options.timeoutMs,
      1000
    );
    observed = {
      helper: difference(processIDs("localsubs.exe"), baseline.helper),
      runtime: difference(processIDs("llama-server.exe"), baseline.runtime)
    };
    const health = await page.evaluate(async () => chrome.runtime.sendMessage({
      type: "CHECK_LOCAL_TRANSLATOR",
      warmup: true
    }));
    const translation = await page.evaluate(async () => chrome.runtime.sendMessage({
      type: "TRANSLATE_SUBTITLE",
      payload: {
        sessionId: "browser-e2e",
        cueId: "1",
        currentText: "I'll be right back.",
        contextLines: ["Wait here."],
        sourceLanguage: "en",
        targetLanguage: "zh-Hant"
      }
    }));
    report.ui = await page.evaluate(() => ({
      statusClass: document.querySelector("#service-status")?.className || "",
      title: document.querySelector("#service-status-title")?.textContent || "",
      detail: document.querySelector("#service-status-detail")?.textContent || "",
      setupCommand: document.querySelector("#setup-command")?.textContent || ""
    }));
    if (!health?.ok || health.apiVersion !== "1" || !health.backend?.ready) {
      throw new Error(`unexpected health response: ${JSON.stringify(health)}`);
    }
    const actualBackend = String(health.backend.kind || "").replace("llama.cpp-", "");
    if (options.expectedBackend && actualBackend !== options.expectedBackend) {
      throw new Error(`expected ${options.expectedBackend} but browser native host used ${actualBackend || "unknown"}`);
    }
    if (!translation?.ok || typeof translation.translation !== "string" || translation.translation.trim() === "") {
      throw new Error(`unexpected translation response: ${JSON.stringify(translation)}`);
    }
    if (browserErrors.length > 0) {
      throw new Error(`extension page errors: ${browserErrors.join("; ")}`);
    }
    observed = await poll(
      () => ({
        helper: difference(processIDs("localsubs.exe"), baseline.helper),
        runtime: difference(processIDs("llama-server.exe"), baseline.runtime)
      }),
      (processes) => processes.helper.length > 0 && (options.fakeBackend || processes.runtime.length > 0),
      10000
    );
    report.actualBackend = actualBackend;
    report.health = health;
    report.translation = translation;
    report.processesObserved = observed;
    report.durationMs = Date.now() - startedAt;
    report.passed = true;
  } catch (error) {
    if (page && !page.isClosed()) {
      report.pageURL = page.url();
      report.ui = await page.evaluate(() => ({
        statusClass: document.querySelector("#service-status")?.className || "",
        title: document.querySelector("#service-status-title")?.textContent || "",
        detail: document.querySelector("#service-status-detail")?.textContent || "",
        setupCommand: document.querySelector("#setup-command")?.textContent || ""
      })).catch(() => report.ui);
    }
    report.browserErrors = browserErrors;
    report.processesAtFailure = {
      helper: difference(processIDs("localsubs.exe"), baseline.helper),
      runtime: difference(processIDs("llama-server.exe"), baseline.runtime)
    };
    report.error = error instanceof Error ? error.message : String(error);
    await writeReport(options.output, report);
    throw error;
  } finally {
    observed = {
      helper: mergeProcessIDs(observed.helper, difference(processIDs("localsubs.exe"), baseline.helper)),
      runtime: mergeProcessIDs(observed.runtime, difference(processIDs("llama-server.exe"), baseline.runtime))
    };
    report.browserCloseForced = await closeBrowser(browser);
    const leaked = await poll(
      () => ({
        helper: observed.helper.filter((pid) => processIDs("localsubs.exe").has(pid)),
        runtime: observed.runtime.filter((pid) => processIDs("llama-server.exe").has(pid))
      }),
      (processes) => processes.helper.length === 0 && processes.runtime.length === 0,
      20000
    ).catch((error) => ({
      error: error.message,
      helper: observed.helper.filter((pid) => processIDs("localsubs.exe").has(pid)),
      runtime: observed.runtime.filter((pid) => processIDs("llama-server.exe").has(pid))
    }));
    report.cleanup = leaked;
    report.cleanupPassed = !leaked.error && leaked.helper.length === 0 && leaked.runtime.length === 0;
    if (!report.cleanupPassed && !report.error) report.error = leaked.error || "test processes did not exit";
    if (!report.cleanupPassed) {
      for (const pid of [...leaked.helper, ...leaked.runtime]) terminateProcessTree(pid);
      report.forcedProcessCleanup = true;
    }
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }).catch(() => {});
    await writeReport(options.output, report);
    if (report.passed && !report.cleanupPassed) {
      throw new Error(report.error);
    }
  }
  console.log(JSON.stringify(report, null, 2));
  console.log(`${options.browser} browser Native Messaging E2E passed (${options.backend} -> ${report.actualBackend})`);
}

try {
  await run();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
}
