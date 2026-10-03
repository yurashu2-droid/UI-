import test from "node:test";
import assert from "node:assert/strict";
import * as raid from "../src/raid/index.ts";

test("URL preflight rejects private credentials queries and suspicious paths before transport", () => {
  const valid = raid.normalizePublicPageUrl?.(
    "https://www.example.com/catalog/#section",
  );
  assert.deepEqual(valid, {
    ok: true,
    value: "https://www.example.com/catalog/",
  });
  for (const url of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://localhost/",
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://[::1]/",
    "http://host.local/",
    "https://u:p@example.com/",
    "https://example.com:8443/",
    "https://example.com/?q=book",
    "https://example.com/reset/secret",
    "https://example.com/abcdefghijklmnopqrstuvwxyz123456",
  ]) {
    assert.equal(raid.normalizePublicPageUrl(url).ok, false, url);
  }
});

test("missing safe capture capability is explicit and never sends target URL", async () => {
  const calls = [];
  const transport = async (url, options) => {
    calls.push({ url, options });
    return new Response("", { status: 404 });
  };
  const result = await raid.requestRaidCapture(
    "https://example.com/",
    undefined,
    transport,
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "capture-unavailable");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/raid-captures/capabilities");
  assert.equal(calls[0].options.body, undefined);
});

test("a capture endpoint cannot substitute a demo fixture as real URL success", async () => {
  const fixture = await raid.createFixtureRaid("archive");
  const transport = async (url) =>
    Response.json(
      url.endsWith("/capabilities")
        ? {
            schemaVersion: 1,
            publicStaticCapture: true,
            networkIsolation: true,
            rendererJavascript: false,
          }
        : fixture,
    );
  const result = await raid.requestRaidCapture(
    "https://example.com/",
    undefined,
    transport,
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid-capture");
});

test("oversized capture responses are bounded even without Content-Length", async () => {
  const transport = async (url) =>
    url.endsWith("/capabilities")
      ? Response.json({
          schemaVersion: 1,
          publicStaticCapture: true,
          networkIsolation: true,
          rendererJavascript: false,
        })
      : new Response("x".repeat(300001));
  const result = await raid.requestRaidCapture(
    "https://example.com/",
    undefined,
    transport,
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "capture-too-large");
});

test("cancelling or replacing a capture ignores stale results and prevents deferred side effects", async () => {
  const first = await raid.createFixtureRaid("archive"),
    second = await raid.createFixtureRaid("commerce");
  const pending = [];
  const session = raid.createRaidCaptureSession(
    (url, signal) =>
      new Promise((resolve) => pending.push({ url, signal, resolve })),
  );
  const a = session.capture("https://a.example/");
  const b = session.capture("https://b.example/");
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve({ ok: true, value: second });
  assert.equal((await b).ok, true);
  pending[0].resolve({ ok: true, value: first });
  assert.equal((await a).code, "cancelled");
  assert.equal(session.current.captureId, second.captureId);
  const c = session.capture("https://c.example/");
  session.cancel();
  pending[2].resolve({ ok: true, value: first });
  assert.equal((await c).code, "cancelled");
  assert.equal(session.current.captureId, second.captureId);
});

test("real public probe reports fetched source and renderer blocker without pretending a playable capture", async () => {
  const calls = [];
  const transport = async (url, options) => {
    calls.push({ url, options });
    return Response.json(
      url.endsWith("/capabilities")
        ? {
            schemaVersion: 1,
            publicStaticCapture: false,
            publicStaticProbe: true,
            supportedUrls: ["https://books.toscrape.com/"],
          }
        : {
            ok: false,
            code: "renderer-unavailable",
            source: {
              fetched: true,
              url: "https://books.toscrape.com/",
              bytes: 51294,
              candidateCount: 64,
            },
          },
      { status: url.endsWith("/capabilities") ? 200 : 503 },
    );
  };
  const result = await raid.requestRaidCapture(
    "https://books.toscrape.com/",
    undefined,
    transport,
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "renderer-unavailable");
  assert.match(result.error, /51294/);
  assert.match(result.error, /64/);
  assert.equal(calls[1].url, "/api/raid-captures/probe");
});
