import test from "node:test";
import assert from "node:assert/strict";
import { processLocalImportMessage } from "../src/raid/local-import-worker.ts";
import { verifyRaidBlueprint } from "../src/raid/blueprint.ts";
const bytes = (text) => new TextEncoder().encode(text).buffer;
const request = (
  html = '<h1>Local heading</h1><a href="https://evil.invalid">Menu</a>',
  extra = {},
) => ({
  type: "import-local",
  requestId: 1,
  html: bytes(html),
  capturedAt: "2026-10-03T12:00:00.000Z",
  ...extra,
});

test("actual worker handler returns independently verified inert local source without filenames", async () => {
  const output = await processLocalImportMessage(request());
  assert.equal(output.type, "local-import-result");
  assert.equal(output.requestId, 1);
  assert.equal(output.result.ok, true);
  assert.equal(output.result.value.source.kind, "local-file");
  assert.equal((await verifyRaidBlueprint(output.result.value)).ok, true);
  assert.match(
    output.result.value.source.displayUrl,
    /^local:\/\/[a-f0-9]{64}$/,
  );
  assert.doesNotMatch(JSON.stringify(output.result), /evil\.invalid/);
});

test("actual worker handler strict-decodes and refuses malformed or over-limit requests", async () => {
  for (const input of [
    null,
    request("", { html: new Uint8Array([0xc0, 0xaf]).buffer }),
    request("", { html: new ArrayBuffer(524289) }),
    request("", { html: "<h1>not bytes</h1>" }),
    request("", { extra: "unapproved" }),
    request("", { requestId: 0 }),
    request("", {
      stylesheet: { name: "style.css", bytes: new ArrayBuffer(262145) },
    }),
  ]) {
    const result = await processLocalImportMessage(input);
    assert.equal(result.result.ok, false);
  }
});

test("actual worker handler preserves the selected CSS declaration position and rejects unmatched file", async () => {
  const html =
    '<link rel="stylesheet" href="style.css"><style>h1{color:#00ff00}</style><h1>Heading</h1>';
  const matched = await processLocalImportMessage(
    request(html, {
      stylesheet: { name: "style.css", bytes: bytes("h1{color:#ff0000}") },
    }),
  );
  assert.equal(matched.result.ok, true);
  assert.equal(matched.result.value.analysis.css.stylesheetHashes.length, 1);
  const unmatched = await processLocalImportMessage(
    request(html, {
      stylesheet: { name: "different.css", bytes: bytes("h1{color:#ff0000}") },
    }),
  );
  assert.equal(unmatched.result.ok, false);
  assert.equal(unmatched.result.code, "stylesheet-unmatched");
});
