import assert from "node:assert/strict";
import test from "node:test";

const siteUrl = "https://localsubs.aidenw.me";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

async function render(pathname, accept = "text/html") {
  const worker = await loadWorker();
  return worker.fetch(
    new Request(`${siteUrl}${pathname}`, { headers: { accept } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders an indexable Traditional Chinese landing page", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-Hant-TW">/);
  assert.match(html, /<title>LocalSubs｜免費 HBO Max 英文＋繁中雙字幕 Chrome 擴充功能<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/localsubs\.aidenw\.me"\/>/);
  assert.match(html, /<h1>在 HBO Max 看原文/);
  assert.match(html, /type="application\/ld\+json"/);
  assert.match(html, /"@type":"SoftwareApplication"/);
  assert.doesNotMatch(html, /tsztowong\.chatgpt\.site/);
});

test("publishes robots and sitemap metadata routes", async () => {
  const robotsResponse = await render("/robots.txt", "text/plain");
  assert.equal(robotsResponse.status, 200);
  const robots = await robotsResponse.text();
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/localsubs\.aidenw\.me\/sitemap\.xml/);

  const sitemapResponse = await render("/sitemap.xml", "application/xml");
  assert.equal(sitemapResponse.status, 200);
  const sitemap = await sitemapResponse.text();
  assert.match(sitemap, /<loc>https:\/\/localsubs\.aidenw\.me<\/loc>/);
});
