import test from "node:test";
import assert from "node:assert/strict";
import * as ingest from "../server/site-ingest/service.ts";

const SAMPLE =
  '<!doctype html><html><head><title>Public sample</title></head><body><h1>Library</h1><nav><a href="/books">Books</a></nav><button>Add to basket</button><script>throw new Error("never execute")</script><input type="password" value="private"><div hidden><a>secret hidden item</a></div></body></html>';

test("acquisition is limited to exact public sample pages with no arbitrary URL proxy", async () => {
  assert.equal(typeof ingest.createStaticIngestService, "function");
  const calls = [];
  const service = ingest.createStaticIngestService({
    transport: async (url, options) => {
      calls.push({ url, options });
      return new Response(SAMPLE, { headers: { "Content-Type": "text/html" } });
    },
  });
  for (const url of [
    "http://127.0.0.1/",
    "https://example.com/account/",
    "https://books.toscrape.com/?page=2",
    "https://books.toscrape.com.evil.example/",
    "https://evil.example/",
    "https://user:secret@books.toscrape.com/",
  ]) {
    const result = await service.probe(url);
    assert.equal(result.ok, false);
    assert.equal(result.code, "unsupported-origin");
  }
  assert.equal(calls.length, 0);
  const result = await service.probe("https://books.toscrape.com/");
  assert.equal(result.ok, false);
  assert.equal(result.code, "renderer-unavailable");
  assert.equal(result.source.fetched, true);
  assert.equal(result.source.candidateCount, 3);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(JSON.stringify(result).includes("never execute"), false);
  assert.equal(service.capabilities().publicStaticCapture, false);
});

test("inert extraction omits scripts hidden controls credentials and original links", () => {
  const result = ingest.extractStaticCandidates(SAMPLE);
  assert.equal(result.title, "Public sample");
  assert.deepEqual(
    result.candidates.map((c) => c.label),
    ["Library", "Books", "Add to basket"],
  );
  assert.equal(JSON.stringify(result).includes("href"), false);
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("capture source stream is bounded and non-HTML/redirect responses are rejected", async () => {
  for (const response of [
    new Response("x".repeat(524289), {
      headers: { "Content-Type": "text/html" },
    }),
    new Response("{}", { headers: { "Content-Type": "application/json" } }),
    new Response("", {
      status: 302,
      headers: { Location: "http://127.0.0.1/" },
    }),
  ]) {
    const service = ingest.createStaticIngestService({
      transport: async () => response,
    });
    const result = await service.probe("https://example.com/");
    assert.equal(result.ok, false);
    assert.notEqual(result.code, "renderer-unavailable");
    assert.equal(result.source, undefined);
  }
});

test("a cancelled fetch never reports a completed capture", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const service = ingest.createStaticIngestService({
    transport: async () => {
      calls++;
      return new Response(SAMPLE);
    },
  });
  const result = await service.probe("https://example.com/", controller.signal);
  assert.equal(result.code, "cancelled");
  assert.equal(calls, 0);
});
