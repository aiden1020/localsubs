import { describe, expect, it } from "vitest";
import {
  checkChangelog,
  checkExternalReferences,
  checkLinks,
  checkNames,
  cliCommands,
  cliCommandsMentioned,
  extractLinks,
  headingAnchors,
  npmScriptsMentioned,
  scanLines,
  slugify
} from "../../scripts/docs-lib.mjs";

const existsIn = (...paths) => {
  const known = new Set(paths);
  return (target) => known.has(target);
};

describe("heading anchors", () => {
  it("slugs headings the way GitHub does", () => {
    expect(slugify("Optional native helper: macOS")).toBe("optional-native-helper-macos");
    expect(slugify("Use `npm run check` (fast)")).toBe("use-npm-run-check-fast");
    expect(slugify("Adding a [site](#x)")).toBe("adding-a-site");
    expect(slugify("Latency & cost")).toBe("latency--cost");
  });

  it("numbers repeated headings and ignores headings inside code", () => {
    const lines = scanLines("# Setup\n\n## Notes\n\n## Notes\n\n```\n# not a heading\n```\n");
    expect([...headingAnchors(lines)]).toEqual(["setup", "notes", "notes-1"]);
  });
});

describe("extracting links", () => {
  it("finds inline links, images, definitions and html attributes, but not code", () => {
    const lines = scanLines([
      "[a](./one.md) and ![logo](icons/logo.png \"Logo\")",
      "<img src=\"icons/other.png\"> <a href='two.md#top'>x</a>",
      "[0.1.0]: https://example.com/tag",
      "```md",
      "[fake](./not-a-link.md)",
      "```"
    ].join("\n"));
    expect(extractLinks(lines).map((link) => link.target)).toEqual([
      "./one.md",
      "icons/logo.png",
      "icons/other.png",
      "two.md#top",
      "https://example.com/tag"
    ]);
  });
});

describe("links and anchors", () => {
  const files = new Map([
    ["README.md", "# Install\n[guide](./docs/guide.md#setup) [self](#install) [web](https://example.com/x)\n"],
    ["docs/guide.md", "# Guide\n## Setup\n[back](../README.md#install) [dir](../e2e-results/)\n"]
  ]);
  const exists = existsIn("README.md", "docs/guide.md", "e2e-results", "e2e-results/README.md");

  it("accepts links that resolve, including anchors, directories and other folders", () => {
    expect(checkLinks({ files, exists })).toEqual([]);
  });

  it("reports a missing file, a missing anchor and a missing same-page anchor", () => {
    const broken = new Map([
      ["README.md", "# Install\n[a](./docs/gone.md)\n[b](./docs/guide.md#nope)\n[c](#missing)\n"],
      ["docs/guide.md", "# Guide\n## Setup\n"]
    ]);
    const errors = checkLinks({ files: broken, exists: existsIn("README.md", "docs/guide.md") });
    expect(errors).toEqual([
      "README.md:2  link to ./docs/gone.md does not resolve (docs/gone.md is not in the repo)",
      "README.md:3  link to ./docs/guide.md#nope has no matching heading in docs/guide.md",
      "README.md:4  link to #missing has no matching heading in README.md"
    ]);
  });

  it("treats a link that climbs out of the repo as broken", () => {
    const errors = checkLinks({
      files: new Map([["README.md", "[x](../outside.md)\n"]]),
      exists: existsIn("README.md")
    });
    expect(errors).toHaveLength(1);
  });

  it("matches anchors case-insensitively, as GitHub does", () => {
    const errors = checkLinks({
      files: new Map([["README.md", "# Install\n[x](#Install)\n"]]),
      exists: existsIn("README.md")
    });
    expect(errors).toEqual([]);
  });
});

describe("links from outside the docs", () => {
  const readmeAnchors = new Set(["installation"]);
  const exists = existsIn("PRIVACY.md");

  it("accepts a README anchor and a file on GitHub that exist", () => {
    const sources = new Map([
      ["options.html", "href=\"https://github.com/aiden1020/localsubs#installation\""],
      ["website/app/page.tsx", "href={`${repoUrl}/blob/main/PRIVACY.md`}"]
    ]);
    expect(checkExternalReferences({ sources, exists, readmeAnchors })).toEqual([]);
  });

  it("reports a renamed heading and a moved file", () => {
    const sources = new Map([
      ["options.html", "href=\"https://github.com/aiden1020/localsubs#install-guide\""],
      ["website/app/page.tsx", "href={`${repoUrl}/blob/main/docs/PRIVACY.md`}"]
    ]);
    expect(checkExternalReferences({ sources, exists, readmeAnchors })).toEqual([
      "options.html  links to README.md#install-guide, which is not a heading there",
      "website/app/page.tsx  links to docs/PRIVACY.md on GitHub, which is not in the repo"
    ]);
  });
});

describe("changelog", () => {
  const good = [
    "# Changelog",
    "## [extension 0.8.0] - 2026-11-02",
    "## [0.7.0] - 2026-10-28",
    "[extension 0.8.0]: https://github.com/aiden1020/localsubs/releases/tag/extension-v0.8.0",
    "[0.7.0]: https://github.com/aiden1020/localsubs/releases/tag/v0.7.0"
  ].join("\n");

  it("accepts an entry and link for each current version, old combined entries included", () => {
    expect(checkChangelog({ changelog: good, extensionVersion: "0.8.0", helperVersion: "0.7.0" })).toEqual([]);
  });

  it("asks for an entry when a version is bumped without one", () => {
    const errors = checkChangelog({ changelog: good, extensionVersion: "0.8.1", helperVersion: "0.7.0" });
    expect(errors).toEqual([
      "CHANGELOG.md  has no entry for the current extension version 0.8.1; add \"## [extension 0.8.1] - YYYY-MM-DD\""
    ]);
  });

  it("reports a missing link, a wrong tag, an orphan link, a bad heading and a missing date", () => {
    const changelog = [
      "## [extension 0.8.0] - 2026-11-02",
      "## [helper 0.7.1]",
      "## [Version 2]",
      "[extension 0.8.0]: https://github.com/aiden1020/localsubs/releases/tag/v0.8.0",
      "[0.5.0]: https://github.com/aiden1020/localsubs/releases/tag/v0.5.0"
    ].join("\n");
    const errors = checkChangelog({ changelog, extensionVersion: "0.8.0", helperVersion: "0.7.1" });
    expect(errors).toEqual(expect.arrayContaining([
      "CHANGELOG.md:3  \"Version 2\" is not \"X.Y.Z\", \"extension X.Y.Z\" or \"helper X.Y.Z\"",
      "CHANGELOG.md:2  the entry for helper 0.7.1 needs \" - YYYY-MM-DD\" after it",
      "CHANGELOG.md:2  helper 0.7.1 has no \"[helper 0.7.1]: https://github.com/aiden1020/localsubs/releases/tag/v0.7.1\" link at the bottom",
      "CHANGELOG.md:4  the link for extension 0.8.0 should end in releases/tag/extension-v0.8.0",
      "CHANGELOG.md:5  the link for 0.5.0 has no matching entry"
    ]));
    expect(errors).toHaveLength(5);
  });

  it("allows an Unreleased section", () => {
    const changelog = `## [Unreleased]\n${good}`;
    expect(checkChangelog({ changelog, extensionVersion: "0.8.0", helperVersion: "0.7.0" })).toEqual([]);
  });
});

describe("names the docs mention", () => {
  const lines = (markdown) => scanLines(markdown);

  it("finds npm scripts in code, not in prose or placeholders", () => {
    const found = npmScriptsMentioned(lines([
      "Run `npm run check` and `npm test`.",
      "```bash",
      "npm run build:extension -- --flag",
      "npm run <script>",
      "```",
      "Then npm run in prose is not code."
    ].join("\n")));
    expect(found.map((item) => item.script)).toEqual(["check", "test", "build:extension"]);
  });

  it("finds localsubs commands in code, not repo paths, package names or prose", () => {
    const found = cliCommandsMentioned(lines([
      "```bash",
      "brew tap aiden1020/localsubs",
      "brew install localsubs",
      "localsubs setup            # install",
      "go build -o dist\\localsubs.exe .\\cmd\\localsubs",
      ".\\dist\\localsubs.exe runtime status --json",
      "```",
      "| `localsubs doctor --deep` | x |",
      "The localsubs binary does things, and LocalSubs is the product."
    ].join("\n")));
    expect(found.map((item) => item.command)).toEqual(["setup", "runtime", "doctor"]);
  });

  it("reads the commands from the helper's run switch", () => {
    const source = [
      "func run(args []string) error {",
      "\tswitch args[0] {",
      "\tcase \"install\":",
      "\tcase \"-h\", \"--help\", \"help\":",
      "\tcase \"native-host\":",
      "\tdefault:",
      "\t}",
      "}",
      "func other() { switch x { case \"unrelated\": } }"
    ].join("\n");
    expect([...cliCommands(source)].sort()).toEqual(["help", "install", "native-host"]);
    expect(() => cliCommands("package main")).toThrow(/no run\(\) switch/);
  });

  it("reports a script that doesn't exist and a command the helper lacks", () => {
    const files = new Map([
      ["CONTRIBUTING.md", "`npm run check` `npm run gone`\n`localsubs setup` `localsubs frobnicate`\n"],
      ["website/README.md", "`npm run dev` `npm run check`\n"]
    ]);
    const scripts = { "CONTRIBUTING.md": new Set(["check"]), "website/README.md": new Set(["dev"]) };
    const errors = checkNames({
      files,
      scriptsFor: (file) => scripts[file],
      commands: new Set(["setup"])
    });
    expect(errors).toEqual([
      "CONTRIBUTING.md:1  \"npm run gone\" is not a script in package.json",
      "CONTRIBUTING.md:2  \"localsubs frobnicate\" is not a localsubs command",
      "website/README.md:1  \"npm run check\" is not a script in package.json"
    ]);
  });
});
