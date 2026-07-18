import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const artifacts = JSON.parse(await readFile("dist/artifacts.json", "utf8"));
const metadata = JSON.parse(await readFile("dist/metadata.json", "utf8"));
const checksumBody = await readFile("dist/checksums.txt", "utf8");
const publishedChecksums = new Map(
  checksumBody.trim().split(/\n+/).map((line) => {
    const [checksum, name] = line.trim().split(/\s+/, 2);
    return [name, checksum];
  })
);
const binaries = artifacts.filter((artifact) => artifact.type === "Binary");
const archives = artifacts.filter((artifact) => artifact.type === "Archive");
const targets = new Set(binaries.map((artifact) => `${artifact.goos}/${artifact.goarch}`));
for (const target of ["darwin/amd64", "darwin/arm64"]) {
  if (!targets.has(target)) {
    throw new Error(`GoReleaser snapshot is missing ${target}`);
  }
}
if (archives.length !== 2 || !archives.every((artifact) => artifact.extra?.Format === "tar.gz")) {
  throw new Error("GoReleaser snapshot must contain exactly two Darwin tar.gz archives");
}
if (!artifacts.some((artifact) => artifact.type === "Checksum" && artifact.name === "checksums.txt")) {
  throw new Error("GoReleaser snapshot is missing checksums.txt");
}
const formula = artifacts.find((artifact) => artifact.type === "Homebrew Formula");
const normalizedFormulaPath = formula?.path?.split(path.sep).join("/");
if (!formula || !normalizedFormulaPath.endsWith("/homebrew/Formula/localsubs.rb")) {
  throw new Error("GoReleaser snapshot is missing the Homebrew formula");
}
const formulaBody = await readFile(formula.path, "utf8");
if (!formulaBody.includes(`version "${metadata.version}"`)) {
  throw new Error(`Homebrew formula version does not match ${metadata.version}`);
}
for (const archive of archives) {
  const contents = await readFile(archive.path);
  const checksum = createHash("sha256").update(contents).digest("hex");
  if (archive.extra?.Checksum !== `sha256:${checksum}`) {
    throw new Error(`${archive.name} artifact checksum metadata is incorrect`);
  }
  if (publishedChecksums.get(archive.name) !== checksum) {
    throw new Error(`checksums.txt does not match ${archive.name}`);
  }
  const expectedURL = `https://github.com/aiden1020/localsubs/releases/download/${metadata.tag}/${archive.name}`;
  if (!formulaBody.includes(`url "${expectedURL}"`) || !formulaBody.includes(`sha256 "${checksum}"`)) {
    throw new Error(`Homebrew formula does not reference ${archive.name} from this release`);
  }
}

const platform = process.platform === "win32" ? "windows" : process.platform;
const architecture = process.arch === "x64" ? "amd64" : process.arch;
const runnableBinary = binaries.find(
  (artifact) => artifact.goos === platform && artifact.goarch === architecture
);
if (runnableBinary) {
  const result = spawnSync(runnableBinary.path, ["version"], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.includes(`localsubs ${metadata.version}`)) {
    throw new Error(`snapshot binary does not report version ${metadata.version}`);
  }
}

const staleStrings = [
  "Aiden1020/SubtitleEN2TW-0.6B",
  "SubtitleEN2TW-0.6B"
];
for (const binary of binaries) {
  const buildInfo = spawnSync("go", ["version", "-m", binary.path], { encoding: "utf8" });
  const injectedFlag = `-X localsubs/internal/runtime.HelperVersion=${metadata.version}`;
  if (buildInfo.status !== 0 || !buildInfo.stdout.includes(injectedFlag)) {
    throw new Error(`${binary.path} was not linked with release version ${metadata.version}`);
  }
  const contents = await readFile(binary.path);
  for (const stale of staleStrings) {
    if (contents.includes(Buffer.from(stale))) {
      throw new Error(`${binary.path} contains stale model identifier ${stale}`);
    }
  }
}

console.log("GoReleaser snapshot smoke test passed");
