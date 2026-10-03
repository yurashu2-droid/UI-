import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  analyzeStaticCode,
  reconstructStaticCode,
} from "../server/site-ingest/code.js";
import { safeDeclarations, CSS_LIMITS } from "../server/site-ingest/css.js";
import { createStaticIngestService } from "../server/site-ingest/service.js";
import { verifyRaidBlueprint } from "../src/raid/index.js";

const PAGE = "https://books.toscrape.com/";
const SHEET = PAGE + "static/oscar/css/styles.css";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fixture = (name) =>
  readFile(new URL(`../fixtures/raid/${name}`, import.meta.url), "utf8");
const [html, css, oldJson] = await Promise.all([
  fixture("public-source/books.html"),
  fixture("public-source/books.css"),
  fixture("compatibility/books-before-child-selectors.json"),
]);
const source = (stylesheet) => ({
  requestedUrl: PAGE,
  html,
  sourceHash: hash(html),
  bytes: Buffer.byteLength(html),
  capturedAt: "2026-10-03T03:20:00.000Z",
  extraction: { title: "Books", candidates: [] },
  stylesheets: [{ css: stylesheet, url: SHEET, sourceHash: hash(stylesheet) }],
});
const label = (part) =>
  part.appearance.primitives.find((primitive) => primitive.kind === "text");

// A source-derived compatibility reproduction, not a change to the immutable
// upstream fixtures or a browser/pixel claim. Only inert syntax is varied.
test("recorded Books declarations keep their appearance when prefixed by an inert comment", async () => {
  assert.equal(
    hash(html),
    "9fdd63da34161ebd13408d7a85105f83ec3c9f351c5d77cd0aa578790e121c1e",
  );
  assert.equal(
    hash(css),
    "d497d4a0d52686ccd30f5941b02867075870372cdfe37adbcb0be74fdeed94cf",
  );
  assert.match(css, /\.nav > li > a \{[^}]*padding: 10px 15px;/);
  const original = await reconstructStaticCode(source(css));
  assert.equal(
    original.captureId,
    "capture_b51a0697f50e53fd012abd53d1225079e61099a4f71884658397e90dd5624fd5",
  );
  const commented = css.replace(
    "padding: 10px 15px;",
    "/* navigation spacing; inert comment */ padding: 10px 15px;",
  );
  const result = await reconstructStaticCode(source(commented));
  assert.deepEqual(label(result.components[1]).rect, {
    x: 15,
    y: 10,
    w: 162,
    h: 20,
  });
  assert.deepEqual(result.components, original.components);
  assert.deepEqual(result.analysis.css, {
    ...original.analysis.css,
    stylesheetHashes: [hash(commented)],
  });
  assert.equal(result.analysis.sourceHash, original.analysis.sourceHash);
  // This exact pre-repair comment variant reverted Books to the old padding.
  assert.notEqual(
    result.captureId,
    "capture_1e67381a873a072ca3c732b02cab01796e25f61bd028718399681288a8ebc6e6",
  );
  assert.equal(
    result.captureId,
    "capture_9c230cd7fa99822cfac31b858b2da1d7b348e5e46bed96945b77e130257ee87a",
  );
  assert.equal(
    result.components[1].appearanceId,
    "appearance_d30ff827a1c2daac79828e388dcde19e9a9681c6aa2cc7545b9d06ea5a95ce2a",
  );
  assert.notEqual(
    result.captureId,
    original.captureId,
    "changed source bytes retain distinct provenance",
  );
  assert.equal((await verifyRaidBlueprint(result)).ok, true);
  const legacy = JSON.parse(oldJson);
  assert.equal(
    hash(JSON.stringify(legacy)),
    "df768a21e42f6bfda965c4237e3074e18e6830a363707d7c755bd2b8ec2151e8",
  );
  assert.equal((await verifyRaidBlueprint(legacy)).ok, true);
});

test("quoted and commented declaration lookalikes cannot remove actual Books products", async () => {
  const original = await reconstructStaticCode(source(css));
  for (const suffix of [
    '\n.product_pod { content: "inert;display:none;"; }',
    "\n.product_pod { /* inert;display:none; */ }",
    '\n.product_pod { --ignored: fn(["inert";display:none;]); }',
  ]) {
    const stylesheet = css + suffix;
    const calls = [];
    const service = createStaticIngestService({
      transport: async (url, options) => {
        calls.push(url);
        assert.equal(options.credentials, "omit");
        assert.equal(options.redirect, "error");
        return new Response(url === SHEET ? stylesheet : html, {
          headers: { "content-type": url === SHEET ? "text/css" : "text/html" },
        });
      },
    });
    const result = await service.reconstruct(PAGE);
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(calls, [PAGE, SHEET]);
    assert.deepEqual(result.value.components, original.components, suffix);
    assert.equal(
      result.value.analysis.candidateCount,
      original.analysis.candidateCount,
    );
    assert.equal(result.value.analysis.css.rules, original.analysis.css.rules);
    assert.deepEqual(result.value.analysis.css.stylesheetHashes, [
      hash(stylesheet),
    ]);
    assert.equal(result.value.fidelity, "code-approximation");
    assert.ok(
      result.value.components.every((part) => part.sourceRect === null),
    );
    assert.doesNotMatch(
      JSON.stringify(result.value),
      /content:|display:none|--ignored/,
    );
    assert.equal((await verifyRaidBlueprint(result.value)).ok, true);
  }
});

test("declaration comments preserve supported tokens without joining invalid identifiers or values", () => {
  assert.deepEqual(
    safeDeclarations(
      "/* note; color:red; */ color:/* source */#123456; padding:6px/**/12px; border:2px/* border */solid #abcdef",
    ),
    {
      color: "#123456",
      padding: [6, 12, 6, 12],
      borderWidth: 2,
      borderColor: "#abcdef",
    },
  );
  for (const invalid of [
    "co/**/lor:red",
    "color:#12/**/3456",
    "padding:1/**/2px",
    "display:no/**/ne",
  ])
    assert.deepEqual(safeDeclarations(invalid), {}, invalid);
});

test("strings escapes and nested ignored values cannot manufacture supported declarations", () => {
  for (const ignored of [
    'content:"ignored;display:none;";',
    "content:'ignored;display:none;';",
    String.raw`content:"escaped \";display:none;";`,
    String.raw`content:'escaped \';display:none;';`,
    String.raw`content:ignored\;display:none;`,
    'content:"/*;display:none;*/";',
    "--ignored:fn([nested(;display:none;)]);",
    "--ignored:{inner:[display:none;]};",
  ]) {
    assert.deepEqual(
      safeDeclarations(ignored + "color:#123456"),
      { color: "#123456" },
      ignored,
    );
  }
  assert.deepEqual(
    safeDeclarations(
      'font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; padding:6px 12px',
    ),
    { font: "sans", padding: [6, 12, 6, 12] },
    "the recorded Books generic-font approximation remains supported",
  );
});

test("unfinished or mismatched syntax keeps prior complete declarations and fails closed for the remainder", () => {
  for (const unfinished of [
    'content:"unterminated;display:none;',
    "content:'unterminated;display:none;",
    "/* unterminated;display:none;",
    "--ignored:fn([unclosed;display:none;",
    "--ignored:([mismatched);display:none;",
    "--ignored:unmatched];display:none;",
    "content:trailing\\",
  ]) {
    assert.deepEqual(
      safeDeclarations("color:#123456;" + unfinished),
      { color: "#123456" },
      unfinished,
    );
  }
  assert.deepEqual(safeDeclarations("color:#123456/* unfinished"), {});
});

test("the shared parsed-node path treats quoted lookalikes inertly in embedded and inline styles", () => {
  for (const decoration of [
    '<style>.product_pod{content:"ignored;display:none;";color:#123456}</style>',
    "",
  ]) {
    const input = decoration
      ? html.replace("</head>", decoration + "</head>")
      : html.replace(
          '<article class="product_pod">',
          '<article class="product_pod" style="content:\'ignored;display:none;\';color:#123456">',
        );
    assert.notEqual(input, html);
    const original = analyzeStaticCode(html, [css]);
    const parsed = analyzeStaticCode(input, [css]);
    assert.deepEqual(
      parsed.candidates.map((candidate) => [candidate.kind, candidate.label]),
      original.candidates.map((candidate) => [candidate.kind, candidate.label]),
    );
  }
  const parsed = analyzeStaticCode(
    '<style>h1{/* inert;display:none; */color:#123456}</style><h1>Visible</h1><h1 style="display:none">Hidden</h1>',
  );
  assert.deepEqual(
    parsed.candidates.map((candidate) => candidate.label),
    ["Visible"],
  );
  assert.equal(parsed.candidates[0].style.color, "#123456");
});

test("resource grammar and the existing raw declaration and source budgets remain unchanged", () => {
  for (const value of [
    "background:url(https://unreviewed.example/a);",
    "background:u/**/rl(https://unreviewed.example/a);",
    "font-family:var(--font);",
    String.raw`background:u\72l(https://unreviewed.example/a);`,
    "padding:calc(2px + 4px);border-radius:expression(alert(1));",
    "color:constructor;background:__proto__;border-color:toString;",
  ])
    assert.deepEqual(safeDeclarations(value), {}, value);
  assert.equal(CSS_LIMITS.declarations, 64);
  assert.deepEqual(
    safeDeclarations("unknown:0;".repeat(63) + "color:#123456;color:red"),
    { color: "#123456" },
  );
  assert.deepEqual(
    safeDeclarations("unknown:0;".repeat(64) + "color:#123456"),
    {},
  );
  // Preserve the old conservative raw-semicolon ceiling before lexing, even
  // when the extra separators occur inside an ignored value or comment.
  for (const wrapped of [
    'content:"' + ";".repeat(64) + '";',
    "/*" + ";".repeat(64) + "*/",
  ])
    assert.deepEqual(safeDeclarations(wrapped + "color:#123456"), {});
  assert.deepEqual(safeDeclarations(" ".repeat(4096) + "color:#123456"), {});
  assert.equal(CSS_LIMITS.bytes, 262144);
  assert.equal(CSS_LIMITS.rules, 1024);
  assert.equal(CSS_LIMITS.blocks, 4096);
  assert.equal(CSS_LIMITS.selectorParts, 4);
  assert.throws(
    () =>
      analyzeStaticCode(
        "<div>".repeat(65) + "<h1>Too deep</h1>" + "</div>".repeat(65),
      ),
    /source-too-large/,
  );
});
