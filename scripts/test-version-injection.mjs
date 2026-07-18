import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const injectedVersion = "9.9.9-injection-test";
const tempDir = await mkdtemp(path.join(os.tmpdir(), "localsubs-version-"));
const binary = path.join(tempDir, process.platform === "win32" ? "localsubs.exe" : "localsubs");

try {
  const build = spawnSync("go", [
    "build",
    "-ldflags",
    `-X localsubs/internal/runtime.HelperVersion=${injectedVersion}`,
    "-o",
    binary,
    "./cmd/localsubs"
  ], {
    encoding: "utf8",
    env: { ...process.env, GOCACHE: path.join(tempDir, "go-cache") }
  });
  if (build.status !== 0) {
    throw new Error(`version injection build failed:\n${build.stderr || build.stdout}`);
  }
  const version = spawnSync(binary, ["version"], { encoding: "utf8" });
  if (version.status !== 0 || !version.stdout.includes(`localsubs ${injectedVersion}`)) {
    throw new Error(`injected helper version was not reported:\n${version.stdout}\n${version.stderr}`);
  }
  console.log("Helper version ldflags injection test passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
