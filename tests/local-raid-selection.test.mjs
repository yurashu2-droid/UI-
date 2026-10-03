import test from "node:test";
import assert from "node:assert/strict";
import { reconstructLocalCode } from "../src/raid/local-code.ts";
import { createFixtureRaid } from "../src/raid/fixtures.ts";
import { deferred, settle } from "./helpers/local-import-dom.mjs";

// The optional load lets the first RED demonstrate the missing API as an
// assertion, rather than failing test discovery with a missing-module error.
const module = await import("../src/raid/local-selection.ts").catch(() => ({}));
const create = () => {
  assert.equal(
    typeof module.createLocalRaidSelection,
    "function",
    "transient local selection factory exists",
  );
  return module.createLocalRaidSelection();
};
const local = async (heading = "Local rematch") => {
  const result = await reconstructLocalCode({
    html: new TextEncoder().encode(`<h1>${heading}</h1><a href='/'>Menu</a>`),
    capturedAt: "2026-10-03T13:00:00.000Z",
  });
  assert.equal(result.ok, true);
  return result.value;
};

test("single transient slot retains only a verified local reconstruction and isolates every returned copy", async () => {
  const slot = create(),
    first = await local(),
    second = await local("Second revision");
  assert.equal(slot.read(), undefined);
  const result = await slot.remember(first, () => true);
  assert.equal(result.ok, true);
  const id = first.captureId;
  first.source.name = "caller edit";
  result.value.source.name = "result edit";
  const view = slot.read();
  view.source.name = "reader edit";
  assert.equal(slot.read().captureId, id);
  assert.equal(slot.read().source.name, "ローカルHTML");
  assert.equal((await slot.remember(second, () => true)).ok, true);
  assert.equal(slot.read().captureId, second.captureId);
  slot.clear();
  assert.equal(slot.read(), undefined);
});

test("invalid, nonlocal, and raw-source-bearing submissions never replace the retained blueprint", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw Error("memory must not request resources");
  });
  const slot = create(),
    blueprint = await local();
  await slot.remember(blueprint, () => true);
  const invalid = structuredClone(blueprint);
  invalid.components[0].appearance.background = "#123456";
  for (const value of [
    invalid,
    await createFixtureRaid("archive"),
    { ...blueprint, html: "<h1>Raw HTML</h1>" },
    { ...blueprint, file: new Blob(["raw"]) },
  ]) {
    assert.equal((await slot.remember(value, () => true)).ok, false);
    assert.deepEqual(slot.read(), blueprint);
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("false or throwing owner checks cannot retain or replace memory", async () => {
  const slot = create(),
    blueprint = await local();
  assert.equal((await slot.remember(blueprint, () => false)).ok, false);
  assert.equal(
    (
      await slot.remember(blueprint, () => {
        throw Error("detached");
      })
    ).ok,
    false,
  );
  assert.equal(slot.read(), undefined);
});

test("clear and owner invalidation during verification reject late retention", async (t) => {
  const slot = create(),
    blueprint = await local(),
    held = deferred();
  const digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  let first = true,
    allowed = true;
  t.mock.method(globalThis.crypto.subtle, "digest", (...args) => {
    if (first) {
      first = false;
      return held.promise.then(() => digest(...args));
    }
    return digest(...args);
  });
  const pending = slot.remember(blueprint, () => allowed);
  await settle();
  slot.clear();
  allowed = false;
  held.resolve();
  assert.equal((await pending).ok, false);
  assert.equal(slot.read(), undefined);
});

test("a newer verified selection wins even when the older verification completes last", async (t) => {
  const slot = create(),
    older = await local(),
    newer = await local("Newer"),
    held = deferred();
  const digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  let first = true;
  t.mock.method(globalThis.crypto.subtle, "digest", (...args) => {
    if (first) {
      first = false;
      return held.promise.then(() => digest(...args));
    }
    return digest(...args);
  });
  const pending = slot.remember(older, () => true);
  assert.equal((await slot.remember(newer, () => true)).ok, true);
  held.resolve();
  assert.equal((await pending).ok, false);
  assert.deepEqual(slot.read(), newer);
});
