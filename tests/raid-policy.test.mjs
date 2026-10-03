import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PUBLIC_SOURCES,
  definePublicSources,
} from "../server/site-ingest/config.js";
import { createStaticIngestService } from "../server/site-ingest/service.js";
import { requestRaidCapture } from "../src/raid/capture.js";

test("reviewed source config keeps the existing two origins and exact same-origin asset", () => {
  assert.deepEqual(
    DEFAULT_PUBLIC_SOURCES.map((s) => s.pageUrl),
    ["https://books.toscrape.com/", "https://example.com/"],
  );
  assert.equal(
    DEFAULT_PUBLIC_SOURCES[0].stylesheetUrl,
    "https://books.toscrape.com/static/oscar/css/styles.css",
  );
  assert.ok(Object.isFrozen(DEFAULT_PUBLIC_SOURCES));
  assert.ok(DEFAULT_PUBLIC_SOURCES.every(Object.isFrozen));
});

test("server-owned config rejects wildcards, private origins, credentials and asset escapes", () => {
  const valid = {
    origin: "https://example.com",
    pageUrl: "https://example.com/",
    stylesheetUrl: "https://example.com/site.css",
  };
  const bad = [
    { ...valid, origin: "https://*.example.com" },
    { ...valid, pageUrl: "https://example.com/private" },
    { origin: "http://127.0.0.1", pageUrl: "http://127.0.0.1/" },
    {
      origin: "https://private.localhost",
      pageUrl: "https://private.localhost/",
    },
    { ...valid, pageUrl: "https://u:p@example.com/" },
    { ...valid, stylesheetUrl: "https://example.com.evil.test/site.css" },
    { ...valid, stylesheetUrl: "https://example.com/site.css?token=x" },
    { ...valid, stylesheetUrl: "https://example.com/site.css#fragment" },
    { ...valid, stylesheetUrl: "https://example.com:444/site.css" },
    { ...valid, stylesheetUrl: "https://example.com/redirect" },
    { ...valid, anySubpath: true },
  ];
  for (const entry of bad)
    assert.throws(
      () => definePublicSources([entry]),
      /source|設定/i,
      JSON.stringify(entry),
    );
  assert.throws(() => definePublicSources([valid, valid]), /source|設定/i);
  assert.throws(
    () => definePublicSources(Array(9).fill(valid)),
    /source|設定/i,
  );
  let invoked = false;
  assert.throws(
    () =>
      definePublicSources([
        {
          get origin() {
            invoked = true;
            return valid.origin;
          },
          pageUrl: valid.pageUrl,
        },
      ]),
    /source|設定/i,
  );
  assert.equal(invoked, false);
});

test("service consumes a frozen trusted config snapshot and never broadens requested URLs", async () => {
  const input = [
    {
      origin: "https://example.com",
      pageUrl: "https://example.com/",
      stylesheetUrl: "https://example.com/site.css",
    },
  ];
  const calls = [];
  const service = createStaticIngestService({
    sources: input,
    transport: async (url) => {
      calls.push(url);
      return url.endsWith(".css")
        ? new Response("h1{color:#456789}", {
            headers: { "content-type": "text/css" },
          })
        : new Response(
            '<link rel="stylesheet" href="/site.css"><h1>Configured source</h1><button>Add to basket</button>',
            { headers: { "content-type": "text/html" } },
          );
    },
  });
  input[0].pageUrl = "https://unreviewed.example/";
  assert.deepEqual(service.capabilities().supportedUrls, [
    "https://example.com/",
  ]);
  assert.equal(
    (await service.reconstruct("https://example.com/other")).code,
    "unsupported-origin",
  );
  assert.equal(
    (await service.reconstruct("https://books.toscrape.com/")).code,
    "unsupported-origin",
  );
  assert.equal(calls.length, 0);
  const result = await service.reconstruct("https://example.com/");
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(calls, [
    "https://example.com/",
    "https://example.com/site.css",
  ]);
  assert.equal(result.value.analysis.css.stylesheetHashes.length, 1);
});

test("client unsupported notice lists the configured capability instead of hardcoded two-site coverage", async () => {
  const result = await requestRaidCapture(
    "https://books.toscrape.com/",
    undefined,
    async () =>
      Response.json({
        schemaVersion: 1,
        publicCodeReconstruction: true,
        sourceJavascript: false,
        supportedUrls: ["https://example.com/"],
      }),
  );
  assert.equal(result.code, "unsupported-origin");
  assert.match(result.error, /https:\/\/example\.com\//);
  assert.doesNotMatch(result.error, /books\.toscrape/);
});
