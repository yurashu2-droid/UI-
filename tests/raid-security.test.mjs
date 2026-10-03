import test from "node:test";
import assert from "node:assert/strict";
import * as raid from "../src/raid/index.js";

const copy = structuredClone;
async function publicBlueprint(url = "https://example.com/") {
  const { captureId, ...draft } = await raid.createFixtureRaid("archive");
  draft.source = { ...draft.source, kind: "static-public", displayUrl: url };
  draft.fidelity = "static-reconstruction";
  return raid.sealRaidBlueprint(draft);
}

test("adversarial numeric, executable, duplicate and oversized fields fail closed", async () => {
  const valid = await raid.createFixtureRaid("archive");
  const cases = [];
  for (const bad of [NaN, Infinity, -Infinity, -1, 1e9, "24", null, {}, []])
    for (const field of ["x", "y", "w", "h"])
      cases.push([
        `combat ${field} ${String(bad)}`,
        (b) => (b.components[0].combatRect[field] = bad),
      ]);
  for (const bad of [
    "url(https://outside.example/a.png)",
    "var(--evil)",
    "expression(alert(1))",
    "#fff",
    "red",
  ])
    cases.push([
      `color ${bad}`,
      (b) => (b.components[0].appearance.background = bad),
    ]);
  for (const field of [
    "html",
    "css",
    "style",
    "url",
    "href",
    "src",
    "srcdoc",
    "onload",
    "__proto__",
    "constructor",
    "prototype",
  ])
    cases.push([
      `field ${field}`,
      (b) =>
        Object.defineProperty(b.components[0].appearance, field, {
          value: "https://outside.example/",
          enumerable: true,
        }),
    ]);
  cases.push([
    "duplicate component",
    (b) => (b.components[1].componentId = b.components[0].componentId),
  ]);
  cases.push([
    "unknown canonical type",
    (b) => (b.components[0].canonicalType = "__proto__"),
  ]);
  cases.push([
    "external primitive reference",
    (b) => (b.decor[0].href = "https://outside.example/"),
  ]);
  cases.push([
    "13 components",
    (b) =>
      (b.components = Array.from({ length: 13 }, () => copy(b.components[0]))),
  ]);
  cases.push([
    "257 primitives",
    (b) =>
      (b.components[0].appearance.primitives = Array.from({ length: 257 }, () =>
        copy(b.components[0].appearance.primitives[0]),
      )),
  ]);
  cases.push([
    "long text",
    (b) => (b.components[0].appearance.primitives[0].text = "a".repeat(81)),
  ]);
  for (const [name, mutate] of cases) {
    const b = copy(valid);
    mutate(b);
    assert.equal(raid.validateRaidBlueprint(b).ok, false, name);
    assert.equal((await raid.verifyRaidBlueprint(b)).ok, false, name);
  }
  assert.equal(raid.validateRaidBlueprint(valid).ok, true);
});

test("enum fields reject JSON arrays instead of accepting string coercion", async () => {
  const valid = await raid.createFixtureRaid("archive");
  for (const field of ["weight", "font", "align"]) {
    const b = copy(valid),
      p = b.components[0].appearance.primitives[0];
    p[field] = [p[field]];
    assert.equal(raid.validateRaidBlueprint(b).ok, false, field);
    assert.equal(
      raid.validateRaidAppearance(b.components[0].appearance),
      false,
      field,
    );
  }
});

test("schema validation does not call getters or coercion methods in supplied objects", async () => {
  const b = await raid.createFixtureRaid("archive");
  let called = 0;
  Object.defineProperty(b.source, "name", {
    get() {
      called++;
      return "injected";
    },
    enumerable: true,
  });
  assert.equal(raid.validateRaidBlueprint(b).ok, false);
  assert.equal(called, 0);
  const a = copy(
    (await raid.createFixtureRaid("archive")).components[0].appearance,
  );
  a.primitives[0].font = {
    toString() {
      called++;
      return "sans";
    },
  };
  assert.equal(raid.validateRaidAppearance(a), false);
  assert.equal(called, 0);
});

test("sparse or augmented lists cannot pass a JSON-only manifest boundary", async () => {
  const valid = await raid.createFixtureRaid("archive");
  for (const field of ["decor", "warnings", "primitives"]) {
    const b = copy(valid);
    if (field === "primitives")
      b.components[0].appearance.primitives = new Array(2);
    else b[field] = new Array(2);
    assert.equal(raid.validateRaidBlueprint(b).ok, false, field);
  }
  const a = copy(valid.components[0].appearance);
  a.primitives.extra = "ignored-by-JSON";
  assert.equal(raid.validateRaidAppearance(a), false);
});

test("oversized decoration is rejected before inspecting array entries", async () => {
  const b = await raid.createFixtureRaid("archive");
  let inspected = 0;
  b.decor = new Array(1_000_000);
  Object.defineProperty(b.decor, 0, {
    get() {
      inspected++;
      return b.components[0].appearance.primitives[0];
    },
    enumerable: true,
  });
  assert.equal(raid.validateRaidBlueprint(b).ok, false);
  assert.equal(inspected, 0);
});

test("public provenance only stores normalized public HTTP origins and real ISO dates", async () => {
  const valid = await publicBlueprint();
  for (const url of [
    "https://127.0.0.1/",
    "http://2130706433/",
    "http://[::1]/",
    "https://localhost/",
    "https://host.internal/",
    "https://user:secret@example.com/",
    "https://example.com/?token=secret",
    "https://example.com/#secret",
    "file:///tmp/x",
    "javascript:alert(1)",
    "https://example.com/private",
    "https://example.com:8443/",
  ]) {
    const b = copy(valid);
    b.source.displayUrl = url;
    assert.equal(raid.validateRaidBlueprint(b).ok, false, url);
  }
  const bad = copy(valid);
  bad.source.capturedAt = "2026-02-31T00:00:00.000Z";
  assert.equal(raid.validateRaidBlueprint(bad).ok, false, "rolled-over date");
});

test("loot conversion rejects mismatched or extra identity fields", async () => {
  const b = await raid.createFixtureRaid("archive"),
    reward = raid.prepareRaidRewards(b, "expected-battle")[0];
  for (const patch of [
    { rewardId: "raid:other-battle:component-00" },
    { battleId: "../bad" },
    { componentId: "component-99" },
    { sourceUrl: "https://outside.example/" },
    { rewardId: ["accepted-by-coercion"] },
  ]) {
    assert.throws(
      () => raid.createRaidLootItem({ ...reward, ...patch }, "p1"),
      /回収/,
    );
  }
});

test("capture result must belong to requested origin even when its own hashes verify", async () => {
  const wrong = await publicBlueprint("https://other.example/");
  const transport = async (url) =>
    Response.json(
      url.endsWith("/capabilities")
        ? {
            schemaVersion: 1,
            publicStaticCapture: true,
            networkIsolation: true,
            rendererJavascript: false,
          }
        : wrong,
    );
  const result = await raid.requestRaidCapture(
    "https://example.com/",
    undefined,
    transport,
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid-capture");
});

test("same-origin capture requests forbid redirects and aborted reads cannot finish as success", async () => {
  const b = await publicBlueprint();
  const calls = [];
  const transport = async (url, options) => {
    calls.push(options);
    return Response.json(
      url.endsWith("/capabilities")
        ? {
            schemaVersion: 1,
            publicStaticCapture: true,
            networkIsolation: true,
            rendererJavascript: false,
          }
        : b,
    );
  };
  assert.equal(
    (
      await raid.requestRaidCapture(
        "https://example.com/",
        undefined,
        transport,
      )
    ).ok,
    true,
  );
  for (const options of calls) assert.equal(options.redirect, "error");
  const controller = new AbortController();
  const aborted = await raid.requestRaidCapture(
    "https://example.com/",
    controller.signal,
    async (url) => {
      if (url.endsWith("/capabilities"))
        return Response.json({
          schemaVersion: 1,
          publicStaticCapture: false,
          publicStaticProbe: true,
          supportedUrls: ["https://example.com/"],
        });
      controller.abort();
      return Response.json({
        code: "renderer-unavailable",
        source: {
          fetched: true,
          url: "https://example.com/",
          bytes: 42,
          candidateCount: 1,
        },
      });
    },
  );
  assert.equal(aborted.code, "cancelled");
});
