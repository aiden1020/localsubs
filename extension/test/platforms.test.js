import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createPlatformForHost, findPlatform, hostMatchesDomain, PLATFORMS } from "../src/content/platforms.js";

const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "manifest.json"), "utf8"));

// "*://*.max.com/*" -> "max.com"; "https://www.youtube.com/*" -> "www.youtube.com"
function patternHost(pattern) {
  return pattern.replace(/^[^:]+:\/\//, "").replace(/\/.*$/, "").replace(/^\*\./, "");
}

describe("platform registry", () => {
  it("picks the adapter by domain, including subdomains", () => {
    expect(findPlatform("www.youtube.com")?.id).toBe("youtube");
    expect(findPlatform("play.max.com")?.id).toBe("max");
    expect(findPlatform("www.hbomax.com")?.id).toBe("max");
    expect(findPlatform("example.com")).toBeNull();
    expect(findPlatform("notmax.com")).toBeNull();
    expect(hostMatchesDomain("max.com", "max.com")).toBe(true);
    expect(hostMatchesDomain("evilmax.com", "max.com")).toBe(false);
  });

  it("builds the adapter with the shared options and returns null elsewhere", () => {
    const create = vi.fn(() => ({ id: "fake" }));
    const platforms = [{ id: "fake", domains: ["fake.test"], create }];
    const options = { getSettings: () => ({}) };
    expect(createPlatformForHost("www.fake.test", options, platforms)).toEqual({ id: "fake" });
    expect(create).toHaveBeenCalledWith(options);
    expect(createPlatformForHost("other.test", options, platforms)).toBeNull();
  });

  it("has a platform for every page content.js is injected into, and the reverse", () => {
    const contentHosts = manifest.content_scripts
      .filter((entry) => entry.js.includes("content.js"))
      .flatMap((entry) => entry.matches.map(patternHost));
    for (const host of contentHosts) {
      expect(findPlatform(host), host).not.toBeNull();
    }
    for (const platform of PLATFORMS) {
      const covered = platform.domains.some((domain) => contentHosts.some((host) => hostMatchesDomain(host, domain)));
      expect(covered, platform.id).toBe(true);
    }
  });

  it("has an adapter for every supported site", () => {
    for (const platform of PLATFORMS) {
      expect(typeof platform.create, platform.id).toBe("function");
    }
  });

  it("gives every platform host permission", () => {
    const permissionHosts = manifest.host_permissions.map(patternHost);
    for (const platform of PLATFORMS) {
      for (const domain of platform.domains) {
        expect(permissionHosts.some((host) => hostMatchesDomain(host, domain)), domain).toBe(true);
      }
    }
  });

  // The Chrome Web Store rejects permissions the extension does not use. Model
  // downloads need only the CSP connect-src entry: Hugging Face sends CORS
  // headers for the extension's origin.
  it("requests host permission only for supported sites", () => {
    for (const host of manifest.host_permissions.map(patternHost)) {
      expect(findPlatform(host), host).not.toBeNull();
    }
  });
});
