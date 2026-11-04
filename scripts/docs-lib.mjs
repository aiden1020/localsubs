import path from "node:path";

// The logic behind scripts/check-docs.mjs, as functions of their inputs so the
// tests can feed them small documents. Each check returns a list of messages
// like "README.md:42  ..."; an empty list means it passed.

const REPO_URL = "https://github.com/aiden1020/localsubs";

// --- Reading markdown --------------------------------------------------------

// Splits a document into lines and marks the ones inside fenced code blocks,
// where `[x](y)` and headings are examples, not links and headings.
export function scanLines(markdown) {
  let fence = null;
  return markdown.split("\n").map((text, index) => {
    const marker = text.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1];
    let inFence = fence !== null;
    if (marker) {
      if (fence === null) {
        fence = marker;
        inFence = true;
      } else if (marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
        inFence = true;
      }
    }
    return { text, line: index + 1, inFence };
  });
}

// GitHub's heading anchor: lower case, punctuation dropped, each space a hyphen.
export function slugify(heading) {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*~]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

// Every anchor a document defines. A repeated heading gets -1, -2, ... like on GitHub.
export function headingAnchors(lines) {
  const anchors = new Set();
  const seen = new Map();
  for (const { text, inFence } of lines) {
    if (inFence) continue;
    const heading = text.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/)?.[1];
    if (!heading) continue;
    const slug = slugify(heading);
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  }
  return anchors;
}

// Inline links and images, reference definitions, and src/href attributes in
// the HTML some READMEs use.
export function extractLinks(lines) {
  const links = [];
  for (const { text, line, inFence } of lines) {
    if (inFence) continue;
    for (const match of text.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      links.push({ target: match[1], line });
    }
    const definition = text.match(/^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+"[^"]*")?\s*$/);
    if (definition) links.push({ target: definition[1], line });
    for (const match of text.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
      links.push({ target: match[1], line });
    }
  }
  return links;
}

// --- Links and anchors -------------------------------------------------------

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// files: Map of repo-relative path to markdown. exists(p): whether a file or
// directory is in the repo.
export function checkLinks({ files, exists }) {
  const errors = [];
  const anchorCache = new Map();
  const anchorsOf = (file) => {
    if (!anchorCache.has(file)) anchorCache.set(file, headingAnchors(scanLines(files.get(file))));
    return anchorCache.get(file);
  };

  for (const [file, markdown] of files) {
    for (const { target, line } of extractLinks(scanLines(markdown))) {
      if (EXTERNAL.test(target)) continue;
      const hash = target.indexOf("#");
      const pathPart = decode((hash === -1 ? target : target.slice(0, hash)).replace(/\?.*$/, ""));
      const fragment = hash === -1 ? "" : decode(target.slice(hash + 1));

      let resolved = file;
      if (pathPart !== "") {
        resolved = pathPart.startsWith("/")
          ? path.posix.normalize(pathPart.slice(1))
          : path.posix.join(path.posix.dirname(file), pathPart);
        resolved = resolved.replace(/\/$/, "");
        if (resolved.startsWith("..") || !exists(resolved)) {
          errors.push(`${file}:${line}  link to ${target} does not resolve (${resolved} is not in the repo)`);
          continue;
        }
      }
      if (fragment !== "" && files.has(resolved) && !anchorsOf(resolved).has(fragment.toLowerCase())) {
        errors.push(`${file}:${line}  link to ${target} has no matching heading in ${resolved}`);
      }
    }
  }
  return errors;
}

// Places outside the docs that link into them: the website and the settings
// page point at README anchors and at files on GitHub.
export function checkExternalReferences({ sources, exists, readmeAnchors }) {
  const errors = [];
  const filePattern = new RegExp(
    `(?:${REPO_URL.replace(/[.\/]/g, "\\$&")}|\\$\\{repoUrl\\})/(?:blob|tree)/[\\w.-]+/([A-Za-z0-9_./-]+)`,
    "g"
  );
  const anchorPattern = new RegExp(`${REPO_URL.replace(/[.\/]/g, "\\$&")}#([A-Za-z0-9_-]+)`, "g");
  for (const [file, text] of sources) {
    for (const match of text.matchAll(filePattern)) {
      const target = match[1].replace(/[./]+$/, "");
      if (!exists(target)) errors.push(`${file}  links to ${target} on GitHub, which is not in the repo`);
    }
    for (const match of text.matchAll(anchorPattern)) {
      if (!readmeAnchors.has(match[1].toLowerCase())) {
        errors.push(`${file}  links to README.md#${match[1]}, which is not a heading there`);
      }
    }
  }
  return errors;
}

// --- Changelog ---------------------------------------------------------------

const VERSION_LABEL = /^(?:(extension|helper) )?(\d+\.\d+\.\d+)$/;

// Entries up to 0.7.0 are headed "[0.7.0]" and cover both components; later
// ones say which: "[extension 0.8.0]" or "[helper 0.7.1]".
export function checkChangelog({ changelog, extensionVersion, helperVersion }) {
  const errors = [];
  const headings = new Map();
  const definitions = new Map();

  for (const { text, line, inFence } of scanLines(changelog)) {
    if (inFence) continue;
    const heading = text.match(/^## \[([^\]]+)\](.*)$/);
    if (heading) {
      const [, label, rest] = heading;
      if (/^unreleased$/i.test(label)) continue;
      if (!VERSION_LABEL.test(label)) {
        errors.push(`CHANGELOG.md:${line}  "${label}" is not "X.Y.Z", "extension X.Y.Z" or "helper X.Y.Z"`);
      } else if (!/^ - \d{4}-\d{2}-\d{2}$/.test(rest)) {
        errors.push(`CHANGELOG.md:${line}  the entry for ${label} needs " - YYYY-MM-DD" after it`);
      }
      if (headings.has(label)) errors.push(`CHANGELOG.md:${line}  duplicate entry for ${label}`);
      headings.set(label, line);
      continue;
    }
    const definition = text.match(/^\[([^\]]+)\]:\s*(\S+)\s*$/);
    if (definition) definitions.set(definition[1], { url: definition[2], line });
  }

  for (const [label, line] of headings) {
    const match = label.match(VERSION_LABEL);
    if (!match) continue;
    const definition = definitions.get(label);
    const tag = `${match[1] === "extension" ? "extension-v" : "v"}${match[2]}`;
    if (!definition) {
      errors.push(`CHANGELOG.md:${line}  ${label} has no "[${label}]: ${REPO_URL}/releases/tag/${tag}" link at the bottom`);
    } else if (definition.url !== `${REPO_URL}/releases/tag/${tag}`) {
      errors.push(`CHANGELOG.md:${definition.line}  the link for ${label} should end in releases/tag/${tag}`);
    }
  }
  for (const [label, { line }] of definitions) {
    if (VERSION_LABEL.test(label) && !headings.has(label)) {
      errors.push(`CHANGELOG.md:${line}  the link for ${label} has no matching entry`);
    }
  }

  for (const [component, version] of [["extension", extensionVersion], ["helper", helperVersion]]) {
    if (!headings.has(`${component} ${version}`) && !headings.has(version)) {
      errors.push(
        `CHANGELOG.md  has no entry for the current ${component} version ${version}; add "## [${component} ${version}] - YYYY-MM-DD"`
      );
    }
  }
  return errors;
}

// --- Names the docs mention --------------------------------------------------

// The text a person would type: fenced code, and inline `code` in prose.
function codeSegments(lines) {
  const segments = [];
  for (const { text, line, inFence } of lines) {
    if (inFence) {
      segments.push({ text, line });
      continue;
    }
    for (const match of text.matchAll(/`([^`]+)`/g)) segments.push({ text: match[1], line });
  }
  return segments;
}

export function npmScriptsMentioned(lines) {
  const mentioned = [];
  for (const { text, line } of codeSegments(lines)) {
    for (const match of text.matchAll(/\bnpm run ([A-Za-z0-9:_.-]+)/g)) {
      mentioned.push({ script: match[1], line });
    }
    if (/\bnpm (?:test|t)\b/.test(text)) mentioned.push({ script: "test", line });
  }
  return mentioned;
}

export function cliCommandsMentioned(lines) {
  const mentioned = [];
  const pattern = /(?<![\w/-])(?:\.?[\\/])?(?:dist[\\/])?localsubs(?:\.exe)?[ \t]+([a-z][a-z-]*)/g;
  for (const { text, line } of codeSegments(lines)) {
    for (const match of text.matchAll(pattern)) mentioned.push({ command: match[1], line });
  }
  return mentioned;
}

// The commands the helper's `run` function dispatches on.
export function cliCommands(goSource) {
  const start = goSource.indexOf("func run(");
  const end = goSource.indexOf("default:", start);
  if (start === -1 || end === -1) throw new Error("cmd/localsubs/main.go has no run() switch to read commands from");
  const commands = new Set();
  for (const match of goSource.slice(start, end).matchAll(/case\s+([^:\n]+):/g)) {
    for (const name of match[1].matchAll(/"([a-z][a-z-]*)"/g)) commands.add(name[1]);
  }
  if (commands.size === 0) throw new Error("found no commands in cmd/localsubs/main.go");
  return commands;
}

// scriptsFor(file): the npm scripts of the package the file belongs to.
export function checkNames({ files, scriptsFor, commands }) {
  const errors = [];
  for (const [file, markdown] of files) {
    const lines = scanLines(markdown);
    const scripts = scriptsFor(file);
    if (scripts) {
      for (const { script, line } of npmScriptsMentioned(lines)) {
        if (!scripts.has(script)) errors.push(`${file}:${line}  "npm run ${script}" is not a script in package.json`);
      }
    }
    for (const { command, line } of cliCommandsMentioned(lines)) {
      if (!commands.has(command)) errors.push(`${file}:${line}  "localsubs ${command}" is not a localsubs command`);
    }
  }
  return errors;
}
