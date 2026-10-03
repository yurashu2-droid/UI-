import test from "node:test";
import assert from "node:assert/strict";
import * as api from "../server/site-ingest/http.ts";
function request(method, url, body = "", headers = {}) {
  return {
    method,
    url,
    headers: { host: "localhost:5178", ...headers },
    on() {},
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(body);
    },
  };
}
function response() {
  return {
    statusCode: 0,
    headers: {},
    text: "",
    writableEnded: false,
    on() {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(v) {
      this.text = v;
      this.writableEnded = true;
    },
  };
}

test("capture middleware reports capabilities and rejects cross-origin probe before network access", async () => {
  assert.equal(typeof api.createSiteIngestMiddleware, "function");
  let calls = 0;
  const handle = api.createSiteIngestMiddleware({
    capabilities: () => ({
      schemaVersion: 1,
      publicStaticCapture: false,
      publicStaticProbe: true,
    }),
    probe: async () => {
      calls++;
      return { ok: false, code: "renderer-unavailable", error: "not ready" };
    },
  });
  const caps = response();
  await handle(request("GET", "/api/raid-captures/capabilities"), caps, () =>
    assert.fail(),
  );
  assert.equal(caps.statusCode, 200);
  assert.equal(JSON.parse(caps.text).publicStaticCapture, false);
  const denied = response();
  await handle(
    request(
      "POST",
      "/api/raid-captures/probe",
      '{"url":"https://books.toscrape.com/"}',
      { "content-type": "application/json", origin: "https://evil.example" },
    ),
    denied,
    () => assert.fail(),
  );
  assert.equal(denied.statusCode, 403);
  assert.equal(calls, 0);
});

test("capture middleware bounds request body and exposes an honest renderer-unavailable response", async () => {
  const handle = api.createSiteIngestMiddleware({
    capabilities: () => ({}),
    probe: async () => ({
      ok: false,
      code: "renderer-unavailable",
      error: "safe renderer unavailable",
      source: { fetched: true },
    }),
  });
  const large = response();
  await handle(
    request("POST", "/api/raid-captures/probe", "x".repeat(4097), {
      "content-type": "application/json",
    }),
    large,
    () => assert.fail(),
  );
  assert.equal(large.statusCode, 413);
  const result = response();
  await handle(
    request(
      "POST",
      "/api/raid-captures/probe",
      '{"url":"https://example.com/"}',
      { "content-type": "application/json" },
    ),
    result,
    () => assert.fail(),
  );
  assert.equal(result.statusCode, 503);
  assert.equal(JSON.parse(result.text).code, "renderer-unavailable");
});

test("capture plugin registers the bounded middleware for dev and local preview without starting a listener", async () => {
  let module = {};
  try {
    module = await import("../server/site-ingest/plugin.ts");
  } catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
  }
  assert.equal(typeof module.raidCapturePlugin, "function");
  const plugin = module.raidCapturePlugin(),
    handlers = [];
  plugin.configureServer({
    middlewares: { use: (handler) => handlers.push(handler) },
  });
  plugin.configurePreviewServer({
    middlewares: { use: (handler) => handlers.push(handler) },
  });
  assert.equal(handlers.length, 2);
  const caps = response();
  await handlers[0](
    request("GET", "/api/raid-captures/capabilities"),
    caps,
    () => assert.fail(),
  );
  assert.equal(JSON.parse(caps.text).publicStaticCapture, false);
});

test("code reconstruction endpoint returns a verified approximate blueprint with source scripts disabled", async () => {
  const { createStaticIngestService } =
    await import("../server/site-ingest/service.js");
  const { verifyRaidBlueprint } = await import("../src/raid/blueprint.js");
  const handle = api.createSiteIngestMiddleware(
    createStaticIngestService({
      transport: async () =>
        new Response(
          '<title>Fetched HTTP source</title><h1>Original heading</h1><a href="/more">Read more</a>',
          { headers: { "content-type": "text/html" } },
        ),
    }),
  );
  const res = response();
  await handle(
    request(
      "POST",
      "/api/raid-captures/code",
      '{"url":"https://example.com/"}',
      { "content-type": "application/json", origin: "http://localhost:5178" },
    ),
    res,
    () => assert.fail(),
  );
  assert.equal(res.statusCode, 200);
  const b = JSON.parse(res.text);
  assert.equal(b.fidelity, "code-approximation");
  assert.equal((await verifyRaidBlueprint(b)).ok, true);
  assert.equal(b.components[0].sourceRect, null);
});
