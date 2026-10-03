import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { createStaticIngestService } from "../server/site-ingest/service.js";
import { createSiteIngestMiddleware } from "../server/site-ingest/http.js";
import { requestRaidCapture, verifyRaidBlueprint } from "../src/raid/index.js";

// An explicit test source is served through the real local HTTP middleware.
// This verifies transport and parsing contracts, not browser layout or live-site rendering.
const HTML = '<!doctype html><title>QA HTTP source</title><h1>Visible source heading</h1><nav><a href="/">Source navigation</a></nav><article><h3>Source book</h3><button>Add to basket</button></article><script>throw new Error("NEVER_EXECUTE")</script>';
async function serve(t) {
  const calls = [];
  const service = createStaticIngestService({ transport: async (url, options) => {
    calls.push({ url, options });
    return new Response(HTML, { headers: { "content-type": "text/html" } });
  } });
  const handler = createSiteIngestMiddleware(service);
  const server = createServer((req, res) => {
    handler(req, res, () => { res.writeHead(404); res.end(); }).catch(error => {
      res.writeHead(500); res.end(String(error));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject); server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, calls };
}

test("QA: real HTTP code capture round-trip preserves the fetched source identity and honest approximation", async t => {
  const { base, calls } = await serve(t), endpoints = [];
  const result = await requestRaidCapture("https://books.toscrape.com/", undefined, (url, options) => {
    endpoints.push(url);
    return fetch(new URL(url, base), options);
  });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(endpoints, ["/api/raid-captures/capabilities", "/api/raid-captures/code"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://books.toscrape.com/");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(result.value.fidelity, "code-approximation");
  assert.equal(result.value.analysis.sourceHash, createHash("sha256").update(HTML).digest("hex"));
  assert.ok(result.value.components.every(c => c.sourceRect === null));
  assert.doesNotMatch(JSON.stringify(result.value), /NEVER_EXECUTE|<script/);
  assert.equal((await verifyRaidBlueprint(result.value)).ok, true);
});

test("QA: real HTTP rejects cross-origin, oversized and unsupported URL requests before source fetching", async t => {
  const { base, calls } = await serve(t);
  const cases = [
    { status: 403, headers: { origin: "https://unrelated.example" }, body: { url: "https://books.toscrape.com/" } },
    { status: 413, body: { url: "https://books.toscrape.com/", padding: "x".repeat(4096) } },
    { status: 422, body: { url: "https://books.toscrape.com/other-path" } },
    { status: 422, body: { url: "http://127.0.0.1/private" } },
    { status: 422, body: { url: "https://books.toscrape.com.evil.example/" } },
    { status: 422, body: { url: "https://user:password@books.toscrape.com/" } },
  ];
  for (const item of cases) {
    const response = await fetch(`${base}/api/raid-captures/code`, {
      method: "POST", headers: { "content-type": "application/json", ...item.headers },
      body: JSON.stringify(item.body),
    });
    assert.equal(response.status, item.status, JSON.stringify(item.body));
    assert.equal((await response.json()).ok, false);
  }
  assert.equal(calls.length, 0);
});
