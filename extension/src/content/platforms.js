import { createMaxPlatform } from "./max-platform.js";
import { createYouTubePlatform } from "./youtube-platform.js";

// Every supported site. To add one: write an adapter that follows the contract
// in platform.js, list it here with the domains it serves, and add the same
// domains to manifest.json (host_permissions and a content_scripts entry).
// A test checks that the two lists agree.
export const PLATFORMS = Object.freeze([
  Object.freeze({
    id: "youtube",
    domains: Object.freeze(["youtube.com"]),
    create: createYouTubePlatform
  }),
  Object.freeze({
    id: "max",
    domains: Object.freeze(["max.com", "hbomax.com"]),
    create: createMaxPlatform
  })
]);

export function hostMatchesDomain(hostname = "", domain = "") {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function findPlatform(hostname, platforms = PLATFORMS) {
  return platforms.find((platform) => {
    return platform.domains.some((domain) => hostMatchesDomain(hostname, domain));
  }) || null;
}

// Builds the adapter for this page, or returns null on a site LocalSubs does
// not support. options are passed to the adapter factory ({ getSettings }).
export function createPlatformForHost(hostname, options, platforms = PLATFORMS) {
  const platform = findPlatform(hostname, platforms);
  return platform ? platform.create(options) : null;
}
