import { spawnSync } from "node:child_process";

// The sitemap tells search engines when the landing page last changed
// (siteUpdated in website/app/site.ts). This fails when a branch changes the
// page's content compared with main without updating that date, so it isn't
// left behind again.

const CONTENT_FILES = [
  "website/app/page.tsx",
  "website/app/layout.tsx",
  "website/app/site.ts",
  "website/app/demo-video.tsx",
  "website/app/player-demo.tsx"
];

function git(...args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

const base = git("merge-base", "HEAD", "origin/main");
if (!base) {
  console.log("Website lastmod not checked: no origin/main to compare with");
} else {
  // Compared with the working tree, so uncommitted edits count too.
  const changed = git("diff", "--name-only", base, "--", ...CONTENT_FILES)?.split("\n").filter(Boolean) ?? [];
  const dateChanged = /^\+export const siteUpdated = /m.test(git("diff", base, "--", "website/app/site.ts") ?? "");
  if (changed.length > 0 && !dateChanged) {
    throw new Error(
      `${changed.join(", ")} changed the landing page, but siteUpdated in website/app/site.ts did not change. ` +
        "Set it to today's date so the sitemap's lastmod matches."
    );
  }
  console.log(changed.length > 0 ? "Website lastmod updated with the page" : "Website page unchanged");
}
