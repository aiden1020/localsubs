import { spawnSync } from "node:child_process";
import { appendFile } from "node:fs/promises";

// GoReleaser releases only the helper, but it picks its current and previous
// tags from every tag in the repository. An extension-vX.Y.Z tag on the same
// commit is not semver, and one between two helper releases would cut the
// helper changelog short. Pin both to helper vX.Y.Z tags.

function describe(revision) {
  const result = spawnSync(
    "git",
    ["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", revision],
    { encoding: "utf8" }
  );
  return result.status === 0 ? result.stdout.trim() : "";
}

const current = describe("HEAD");
const previous = current ? describe(`${current}^`) : "";
const lines = [];
if (current) lines.push(`GORELEASER_CURRENT_TAG=${current}`);
if (previous) lines.push(`GORELEASER_PREVIOUS_TAG=${previous}`);

if (process.env.GITHUB_ENV && lines.length > 0) {
  await appendFile(process.env.GITHUB_ENV, `${lines.join("\n")}\n`);
}
console.log(lines.length > 0 ? lines.join("\n") : "No helper tags found; GoReleaser uses its default");
