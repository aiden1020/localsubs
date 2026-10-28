import { SUPPORTED_SITES } from "../core/supported-sites.js";
import { createMaxPlatform } from "./max-platform.js";
import { createYouTubePlatform } from "./youtube-platform.js";

// Every supported site with its adapter. To add one: write an adapter that
// follows the contract in platform.js, add the site to core/supported-sites.js
// and its adapter here, and add its domains to manifest.json (host_permissions
// and a content_scripts entry). Tests check that these lists agree.
const ADAPTERS = Object.freeze({
  youtube: createYouTubePlatform,
  max: createMaxPlatform
});

export const PLATFORMS = Object.freeze(SUPPORTED_SITES.map((site) => Object.freeze({
  id: site.id,
  domains: site.domains,
  create: ADAPTERS[site.id]
})));

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
