import { readFile } from "node:fs/promises";
import { SUPPORTED_SITES } from "../extension/src/core/supported-sites.js";

// extension/src/core/supported-sites.js is the list of supported sites. The
// README, the website and the store name and description are written by hand,
// so this fails when one of them names a different set of sites.

const names = SUPPORTED_SITES.map((site) => site.name);
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const readme = await readFile("README.md", "utf8");
const websiteSite = await readFile("website/app/site.ts", "utf8");

function sameList(actual, label) {
  if (actual.join("\n") !== names.join("\n")) {
    throw new Error(
      `${label} lists ${JSON.stringify(actual)}, but supported-sites.js lists ${JSON.stringify(names)}`
    );
  }
}

// README: the first column of the table under "## Supported sites".
const readmeSection = readme.split(/^## Supported sites\s*$/m)[1]?.split(/^## /m)[0];
if (!readmeSection) {
  throw new Error("README.md has no \"## Supported sites\" section");
}
const readmeSites = readmeSection
  .split("\n")
  .filter((line) => /^\|/.test(line) && !/^\|\s*(Site|-+)\s*\|/.test(line))
  .map((line) => line.split("|")[1].trim());
sameList(readmeSites, "README.md Supported sites");

// Website: export const supportedSites = ["…", "…"];
const websiteMatch = websiteSite.match(/export const supportedSites = (\[[^\]]*\]);/);
if (!websiteMatch) {
  throw new Error("website/app/site.ts has no supportedSites array");
}
sameList(JSON.parse(websiteMatch[1]), "website/app/site.ts supportedSites");

// Store name and description: both name every site, so people searching the
// store for a platform find LocalSubs. The store allows names up to 75
// characters.
for (const field of ["name", "description"]) {
  const missing = names.filter((name) => !manifest[field].includes(name));
  if (missing.length > 0) {
    throw new Error(`manifest.json ${field} does not mention ${missing.join(", ")}`);
  }
}
const MAX_NAME_LENGTH = 75;
if ([...manifest.name].length > MAX_NAME_LENGTH) {
  throw new Error(`manifest.json name is ${[...manifest.name].length} characters; the store allows ${MAX_NAME_LENGTH}`);
}

console.log(`Supported sites listed everywhere: ${names.join(", ")}`);
