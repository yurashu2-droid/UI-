import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, webcrypto } from "node:crypto";
import vm from "node:vm";
import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";
import { reconstructStaticCode } from "../server/site-ingest/code.js";
import {
  validateRaidBlueprint,
  verifyRaidBlueprint,
  contentHash,
  prepareRaidRewards,
} from "../src/raid/blueprint.js";
import { createProfileStore } from "../src/profile-store.js";
import R from "../src/run.js";

const bytes = (text) => new TextEncoder().encode(text);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const capturedAt = "2026-10-03T03:20:00.000Z";
const style = "<style>button{background:#123456}</style>";
const link = '<link rel="stylesheet" href="theme.css">';
const body =
  '<h1>Night Map</h1><a href="https://assets.invalid/nav">North</a><button>Add to cart</button>';
const html = `<title>Night Map</title>${style}${link}${body}`;
const css = "button{background:#654321}";
let core;
try {
  core = await import("../src/raid/local-code.js");
} catch (error) {
  if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
}
function request(source = html, stylesheet = css) {
  return {
    html: bytes(source),
    capturedAt,
    ...(stylesheet === null
      ? {}
      : { stylesheet: { name: "theme.css", bytes: bytes(stylesheet) } }),
  };
}
async function capture(input = request()) {
  assert.equal(
    typeof core?.reconstructLocalCode,
    "function",
    "the bounded local core must exist",
  );
  return core.reconstructLocalCode(input);
}
async function good(input = request()) {
  const result = await capture(input);
  assert.equal(result.ok, true, result.error);
  assert.equal((await verifyRaidBlueprint(result.value)).ok, true);
  return result.value;
}
const purchase = (blueprint) =>
  blueprint.components.find((c) => c.evidence === "purchase");

test("local Night Map uses closed local provenance and preserves real embedded/link cascade order", async () => {
  const selected = await good();
  assert.equal(selected.source.kind, "local-file");
  assert.deepEqual(Object.keys(selected.source), [
    "kind",
    "name",
    "displayUrl",
    "capturedAt",
  ]);
  assert.equal(selected.source.name, "Night Map");
  assert.equal(selected.source.displayUrl, "local://" + hash(bytes(html)));
  assert.equal(selected.analysis.sourceHash, hash(bytes(html)));
  assert.notEqual(selected.analysis.sourceHash, await contentHash(html));
  assert.deepEqual(selected.analysis.css.stylesheetHashes, [hash(bytes(css))]);
  assert.equal(selected.fidelity, "code-approximation");
  assert.equal(selected.extractorVersion, "code-v1");
  assert.equal(selected.mapperVersion, "canonical-v1");
  assert.equal(selected.analysis.layout, "inferred-flow");
  assert.equal(selected.analysis.confidence, "low");
  assert.ok(selected.components.every((c) => c.sourceRect === null));
  assert.equal(purchase(selected).appearance.background, "#654321");
  assert.equal(
    purchase(await good(request(html, null))).appearance.background,
    "#123456",
  );
  assert.equal(
    purchase(
      await good(request(`<title>Night Map</title>${link}${style}${body}`)),
    ).appearance.background,
    "#123456",
  );
  assert.equal(
    purchase(
      await good(
        request(html.replace('href="theme.css"', 'href="./theme.css"')),
      ),
    ).appearance.background,
    "#654321",
  );
  assert.doesNotMatch(
    JSON.stringify(selected),
    /theme\.css|assets\.invalid|<style|<link/,
  );
  assert.deepEqual(selected.analysis.omitted, [
    "unsupported-css",
    "images",
    "scripts",
  ]);
});

test("local selection rejects unmatched, duplicate, inactive and unsafe CSS names/links without guessing", async () => {
  for (const href of [
    "other.css",
    "../theme.css",
    "folder/theme.css",
    "/theme.css",
    "//host/theme.css",
    "https://host/theme.css",
    "file:///theme.css",
    "theme.css?q=1",
    "theme.css#x",
    "%74heme.css",
    ".\\theme.css",
  ]) {
    const result = await capture(
      request(html.replace('href="theme.css"', `href="${href}"`)),
    );
    assert.equal(result.ok, false, href);
    assert.equal(result.code, "stylesheet-unmatched", href);
  }
  for (const attrs of [
    "disabled",
    'media="print"',
    'media="screen and (min-width:1px)"',
    'type="text/plain"',
  ]) {
    assert.equal(
      (
        await capture(
          request(
            html.replace('rel="stylesheet"', `rel="stylesheet" ${attrs}`),
          ),
        )
      ).code,
      "stylesheet-unmatched",
    );
  }
  assert.equal(
    (
      await capture(
        request(html.replace('rel="stylesheet"', 'rel="alternate stylesheet"')),
      )
    ).code,
    "stylesheet-unmatched",
  );
  assert.equal(
    (await capture(request(html.replace(link, link + link)))).code,
    "stylesheet-ambiguous",
  );
  assert.equal(
    (
      await capture(
        request(
          html.replace(link, link + link.replace("theme.css", "./theme.css")),
        ),
      )
    ).code,
    "stylesheet-ambiguous",
  );
  for (const name of [
    "../theme.css",
    "folder/theme.css",
    "C:\\theme.css",
    "https://host/theme.css",
    ".theme.css",
    "theme.css?x=1",
    "theme.css\u0000",
    "theme.js",
  ]) {
    const input = request();
    input.stylesheet.name = name;
    assert.equal((await capture(input)).code, "invalid-stylesheet-name", name);
  }
});

test("strict UTF8 preserves BOM and non-ASCII raw byte hashes while rejecting malformed HTML/CSS", async () => {
  const source = "\ufeff<title>夜の地図 café 🌙</title>" + link + body;
  const sheet = "\ufeff/* 夜 🌙 */button{background:#654321}";
  const b = await good(request(source, sheet));
  assert.equal(b.source.name, "夜の地図 café 🌙");
  assert.equal(b.analysis.sourceHash, hash(bytes(source)));
  assert.notEqual(b.analysis.sourceHash, hash(bytes(source.slice(1))));
  assert.deepEqual(b.analysis.css.stylesheetHashes, [hash(bytes(sheet))]);
  const invalidBytes = [
    new Uint8Array([0xc0, 0xaf]),
    new Uint8Array([0xed, 0xa0, 0x80]),
    new Uint8Array([0xe2, 0x82]),
    new Uint8Array([0xff, 0xfe, 0x3c, 0]),
  ];
  for (const invalid of invalidBytes) {
    assert.equal(
      (await capture({ ...request(), html: invalid })).code,
      "invalid-utf8",
    );
    assert.equal(
      (
        await capture({
          ...request(),
          stylesheet: { name: "theme.css", bytes: invalid },
        })
      ).code,
      "invalid-utf8",
    );
  }
});

test("source size checks use UTF8 bytes and the exact existing HTML/CSS boundaries", async () => {
  const prefix = "<title>Bounded</title><h1>Heading</h1>";
  const exact = prefix + " ".repeat(524288 - bytes(prefix).length);
  assert.equal((await capture(request(exact, null))).ok, true);
  assert.equal(
    (await capture(request(exact + " ", null))).code,
    "source-too-large",
  );
  assert.equal(
    (await capture(request(prefix + "夜".repeat(175000), null))).code,
    "source-too-large",
  );
  const exactCss = css + " ".repeat(262144 - bytes(css).length);
  assert.equal((await capture(request(link + body, exactCss))).ok, true);
  assert.equal(
    (await capture(request(link + body, exactCss + " "))).code,
    "source-too-large",
  );
  assert.equal(
    (await capture(request(html, exactCss))).code,
    "source-too-large",
    "combined embedded and selected CSS budget is strict",
  );
  assert.equal(
    (await capture(request(`<style>${exactCss} </style>${body}`, null))).code,
    "source-too-large",
  );
});

test("node/depth and candidate bounds apply even to inert template descendants", async () => {
  for (const source of [
    "<div>".repeat(65) + body + "</div>".repeat(65),
    "<i></i>".repeat(20000) + body,
    "<template>" + "<i></i>".repeat(20000) + "</template>" + body,
    "<template>".repeat(65) + body + "</template>".repeat(65),
  ]) {
    assert.equal(
      (await capture(request(source, null))).code,
      "source-too-large",
    );
  }
  const b = await good(
    request(
      "<h1>Heading</h1>" +
        Array.from(
          { length: 300 },
          (_, i) => `<a>Link ${i}</a><button>Add to cart ${i}</button>`,
        ).join(""),
      null,
    ),
  );
  assert.equal(b.analysis.candidateCount, 601);
  assert.ok(b.components.length <= 8);
  assert.ok(
    b.components.filter((c) => c.evidence === "navigation").length <= 4,
  );
  assert.ok(
    b.decor.length +
      b.components.reduce((n, c) => n + c.appearance.primitives.length, 0) <=
      256,
  );
});

test("script-only shells and unsupported content cannot invent playable UI or execute resources", async () => {
  assert.equal(
    (
      await capture(
        request(
          '<title>Shell</title><div id=app></div><script>document.write("<h1>Generated</h1>")</script>',
          null,
        ),
      )
    ).code,
    "no-playable-elements",
  );
  const evil = `<title>Night Map</title><base href="https://evil.invalid"><meta http-equiv=refresh content="0;url=https://evil.invalid"><style>@import url(https://evil.invalid/a);@font-face{font-family:evil;src:url(https://evil.invalid/font)}button{background:#123456;background-image:url(https://evil.invalid/img)}</style><script>globalThis.__executed=true;fetch('https://evil.invalid/script')</script><iframe src="https://evil.invalid/frame"><h1>Frame secret</h1></iframe><object data="https://evil.invalid/object">Object secret</object><template><h1>Template secret</h1></template><img src="https://evil.invalid/img" onerror="globalThis.__executed=true"><input value="private-secret"><svg><text>SVG secret</text></svg>${body}`;
  const before = globalThis.__executed;
  const b = await good(request(evil, null));
  assert.equal(globalThis.__executed, before);
  assert.equal(purchase(b).appearance.background, "#123456");
  assert.doesNotMatch(
    JSON.stringify(b),
    /evil\.invalid|private-secret|Frame secret|Object secret|Template secret|SVG secret|__executed/,
  );
});

test("local provenance rejects URL/fixture masquerading, extra metadata, wrong hash and measured coordinates", async () => {
  const b = await good();
  const mutations = [
    (x) => (x.source.kind = "static-public"),
    (x) => (x.source.kind = "fixture"),
    (x) => (x.source.kind = "local-directory"),
    (x) => (x.source.displayUrl = "https://example.com/"),
    (x) => (x.source.displayUrl = "fixture://night-map"),
    (x) => (x.source.displayUrl = "local://" + "0".repeat(64)),
    (x) => (x.source.displayUrl += "/theme.css"),
    (x) => (x.source.filename = "private.html"),
    (x) => (x.analysis.filename = "private.html"),
    (x) => (x.analysis.css.stylesheetNames = ["theme.css"]),
    (x) => (x.extractorVersion = "static-v1"),
    (x) => (x.components[0].sourceRect = { x: 0, y: 0, w: 20, h: 20 }),
    (x) => (x.fidelity = "controlled-fixture"),
    (x) => (x.analysis.styles = "inline-and-embedded-subset"),
  ];
  for (const mutate of mutations) {
    const bad = structuredClone(b);
    mutate(bad);
    assert.equal(validateRaidBlueprint(bad).ok, false, String(mutate));
  }
});

test("the public compatibility wrappers preserve recorded Books and frozen public JSON byte digests", async () => {
  const cases = JSON.parse(
    await readFile(
      new URL("./fixtures/local-core-legacy-hashes.json", import.meta.url),
      "utf8",
    ),
  );
  for (const c of cases) {
    let source = c.source;
    if (source.recordedBooks) {
      const [html, css] = await Promise.all(
        ["books.html", "books.css"].map((name) =>
          readFile(
            new URL(`../fixtures/raid/public-source/${name}`, import.meta.url),
            "utf8",
          ),
        ),
      );
      source = {
        html,
        sourceHash: hash(html),
        bytes: bytes(html).length,
        capturedAt,
        requestedUrl: "https://books.toscrape.com/",
        extraction: { title: "unused", candidates: [] },
        stylesheets: [
          {
            css,
            sourceHash: hash(css),
            url: "https://books.toscrape.com/static/oscar/css/styles.css",
          },
        ],
      };
    }
    const result = await reconstructStaticCode(source);
    assert.equal(hash(JSON.stringify(result)), c.expected.jsonHash);
    assert.equal(result.captureId, c.expected.captureId);
    assert.deepEqual(
      result.components.map((c) => c.appearanceId),
      c.expected.appearanceIds,
    );
  }
});

test("browser bundle has no Node/server dependency or ambient DOM/fetch requirement", async () => {
  assert.equal(typeof core?.reconstructLocalCode, "function");
  const output = await build({
    entryPoints: [
      new URL("../src/raid/local-code.ts", import.meta.url).pathname,
    ],
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "LocalCore",
    write: false,
    metafile: true,
  });
  for (const path of Object.keys(output.metafile.inputs))
    assert.doesNotMatch(path, /(?:^|\/)server\/|node:/);
  const source = output.outputFiles[0].text;
  assert.doesNotMatch(
    source,
    /\bBuffer\b|require\(["']node:|import\(["']node:/,
  );
  const context = vm.createContext({
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    URL,
    fetch() {
      throw Error("unexpected fetch");
    },
  });
  // Native structuredClone returns data in the calling realm. This JSON-only
  // blueprint stand-in keeps vm's artificial realm boundary out of validation.
  vm.runInContext(
    "globalThis.structuredClone = value => JSON.parse(JSON.stringify(value));",
    context,
  );
  vm.runInContext(source, context);
  const result = await vm.runInContext(
    `LocalCore.reconstructLocalCode({html:new TextEncoder().encode(${JSON.stringify(html)}),capturedAt:${JSON.stringify(capturedAt)},stylesheet:{name:"theme.css",bytes:new TextEncoder().encode(${JSON.stringify(css)})}})`,
    context,
  );
  assert.equal(result.ok, true, result.error);
  assert.equal(result.value.source.kind, "local-file");
});

test("local collection round-trip keeps capture/reward IDs and prior captures exactly intact", async () => {
  const b = await good();
  const oldText = await readFile(
    new URL(
      "../fixtures/raid/compatibility/books-before-child-selectors.json",
      import.meta.url,
    ),
    "utf8",
  );
  const old = JSON.parse(oldText);
  assert.equal((await verifyRaidBlueprint(old)).ok, true);
  const source = createProfileStore(new IDBFactory()),
    run = R.newRun("lab");
  for (const [blueprint, battle] of [
    [old, "legacy-public-local-core-test"],
    [b, "local-night-map-test"],
  ]) {
    await source.recordRaidVictory(blueprint, battle);
    await source.claimRaidReward(
      run,
      prepareRaidRewards(blueprint, battle)[0],
      blueprint,
    );
  }
  const archive = await source.exportCollectionBackup();
  const target = createProfileStore(new IDBFactory());
  const plan = await target.inspectCollectionBackup(archive.text);
  assert.deepEqual(
    [plan.addCount, plan.unchangedCount, plan.conflicts.length],
    [2, 0, 0],
  );
  await target.restoreCollectionBackup(plan.candidate);
  assert.equal(
    JSON.stringify(await target.getBlueprint(b.captureId)),
    JSON.stringify(b),
  );
  assert.equal(
    JSON.stringify(await target.getBlueprint(old.captureId)),
    JSON.stringify(old),
  );
  assert.equal(JSON.stringify(old, null, 2) + "\n", oldText);
  assert.deepEqual(await target.listTrophies(), await source.listTrophies());
});

test("malformed local requests fail closed without reading source accessors or leaking names", async () => {
  let reads = 0;
  const getter = {
    capturedAt,
    get html() {
      reads++;
      throw Error("secret-name.html");
    },
  };
  const malformed = [
    null,
    {},
    [],
    getter,
    { ...request(), capturedAt: "2026-02-30T00:00:00.000Z" },
    { ...request(), capturedAt: "now" },
    { ...request(), html: new ArrayBuffer(10) },
    { ...request(), html: "source" },
    { ...request(), stylesheet: undefined },
    { ...request(), stylesheet: [] },
    { ...request(), stylesheet: { name: "theme.css" } },
    { ...request(), extra: "private-name.html" },
    { ...request(), stylesheets: [request().stylesheet] },
  ];
  for (const input of malformed) {
    const result = await capture(input);
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid-local-request");
    assert.doesNotMatch(result.error, /secret-name|private-name|now/);
  }
  assert.equal(reads, 0);
});

test("local input bytes and timestamp cannot change while asynchronous hashing yields", async () => {
  const input = request();
  const pending = capture(input);
  input.html.fill(32);
  input.stylesheet.bytes.fill(32);
  input.stylesheet.name = "other.css";
  input.capturedAt = "2026-11-01T00:00:00.000Z";
  const result = await pending;
  assert.equal(result.ok, true, result.error);
  assert.equal(result.value.analysis.sourceHash, hash(bytes(html)));
  assert.deepEqual(result.value.analysis.css.stylesheetHashes, [
    hash(bytes(css)),
  ]);
  assert.equal(result.value.source.capturedAt, capturedAt);
  assert.equal(purchase(result.value).appearance.background, "#654321");
});

test("public raw-hash browser extraction snapshots source before asynchronous digests", async () => {
  const source = {
    html,
    sourceHash: hash(html),
    requestedUrl: "https://example.com/",
    capturedAt,
    stylesheets: [
      { css, sourceHash: hash(css), url: "https://example.com/theme.css" },
    ],
  };
  const pending = reconstructStaticCode(source);
  source.html = "<h1>Changed while awaiting</h1>";
  source.sourceHash = hash(source.html);
  source.requestedUrl = "https://other.example/";
  source.capturedAt = "2026-11-01T00:00:00.000Z";
  source.stylesheets[0].css = "button{background:#abcdef}";
  source.stylesheets[0].sourceHash = hash(source.stylesheets[0].css);
  const b = await pending;
  assert.equal(b.analysis.sourceHash, hash(html));
  assert.equal(b.source.capturedAt, capturedAt);
  assert.equal(b.source.displayUrl, "https://example.com/");
  assert.equal(purchase(b).appearance.background, "#654321");
});

test("bounded CSS and candidate ceilings stay equal to the established interpreter", async () => {
  const { analyzeLocalCode } = await import("../src/raid/code.js");
  const { CSS_LIMITS, safeDeclarations } =
    await import("../src/raid/code-css.js");
  assert.deepEqual(CSS_LIMITS, {
    bytes: 262144,
    rules: 1024,
    blocks: 4096,
    declarations: 64,
    selectorParts: 4,
  });
  assert.deepEqual(
    safeDeclarations("unsupported:x;".repeat(64) + "color:#123456"),
    {},
  );
  const many =
    "<title>Bounds</title>" +
    ["h1", "a", "button"]
      .map((tag) =>
        Array.from(
          { length: 100 },
          (_, i) =>
            `<${tag}>${tag === "button" ? "Add to cart" : "Visible"} ${i}</${tag}>`,
        ).join(""),
      )
      .join("");
  const a = analyzeLocalCode(many);
  assert.ok(a.candidates.length <= 64);
  for (const kind of ["heading", "navigation", "purchase"])
    assert.equal(a.candidates.filter((c) => c.kind === kind).length, 12);
  assert.equal(a.candidateCount, 300);
  const capped = await good(
    request(link + body, "button{background:#654321}".repeat(1025)),
  );
  assert.equal(capped.analysis.css.rules, 1024);
  assert.equal(capped.analysis.css.limited, true);
});
