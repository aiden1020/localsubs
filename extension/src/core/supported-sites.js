// The streaming sites LocalSubs supports, as people see them: the name and
// the page the settings page opens. Content scripts pair each id with an
// adapter in content/platforms.js. scripts/check-supported-sites.mjs checks
// that the README, the website and the store listing name the same sites.
export const SUPPORTED_SITES = Object.freeze([
  Object.freeze({
    id: "youtube",
    name: "YouTube",
    homeUrl: "https://www.youtube.com/",
    domains: Object.freeze(["youtube.com"])
  }),
  Object.freeze({
    id: "max",
    name: "HBO Max",
    homeUrl: "https://www.hbomax.com/",
    domains: Object.freeze(["max.com", "hbomax.com"])
  })
]);
