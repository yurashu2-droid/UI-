import test from "node:test";
import assert from "node:assert/strict";
import { parseFragment } from "parse5";
import { createHash } from "node:crypto";
import {
  safeDeclarations,
  createSafeStyleReader,
  CSS_LIMITS,
} from "../server/site-ingest/css.js";
import { analyzeStaticCode } from "../server/site-ingest/code.js";
import { createStaticIngestService } from "../server/site-ingest/service.js";
import { verifyRaidBlueprint } from "../src/raid/blueprint.js";

// Independent parser/service behavior checks. Reintroducing naive semicolon
// splitting must fail the comment/quoted-value checks; dropping raw separators
// from budget accounting must fail the boundary matrix. No browser is used.
const PAGE = "https://books.toscrape.com/";
const SHEET = PAGE + "static/oscar/css/styles.css";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const declarations = [
  ["color", "#123456"],
  ["background-color", "#abcdef"],
  ["font-family", '"Helvetica Neue", sans-serif'],
  ["font-size", "18px"],
  ["font-weight", "700"],
  ["text-align", "center"],
  ["padding", "6px 12px 8px 10px"],
  ["border-radius", "8px"],
  ["border-width", "2px"],
  ["border-color", "#102030"],
];

test("QA CSS: comments around every supported token retain the complete interpreted style", () => {
  const plain = declarations.map(([key, value]) => `${key}:${value}`).join(";");
  const commented = declarations
    .map(
      ([key, value]) =>
        `/* ignored: red */${key}/**/:/* before value */${value}/* after value */`,
    )
    .join(";");
  const expected = {
    color: "#123456",
    background: "#abcdef",
    font: "sans",
    size: 18,
    weight: "bold",
    align: "center",
    padding: [6, 12, 8, 10],
    radius: 8,
    borderWidth: 2,
    borderColor: "#102030",
  };
  assert.deepEqual(safeDeclarations(plain), expected);
  assert.deepEqual(safeDeclarations(commented), expected);
  for (const input of [plain, commented]) {
    const analysis = analyzeStaticCode(
      `<style>h1{${input}}</style><h1>Source heading</h1>`,
    );
    assert.deepEqual(analysis.candidates[0].style, expected);
  }
});

test("QA CSS: quoted punctuation never becomes a declaration while real hiding remains effective", () => {
  for (const ignored of [
    `content:';display:none;visibility:hidden;color:red;';`,
    `content:"/* ;display:none; */";`,
    String.raw`content:"escaped \\\" ;display:none;";`,
    `--ignored:fn([";visibility:hidden;"]);`,
  ]) {
    for (const inline of [false, true]) {
      const css = `${ignored}/* inert */color:#123456;`;
      const html = inline
        ? `<h1 style="${css.replaceAll('"', "&quot;")}">Visible</h1><h1 style="display:none">Actually hidden</h1>`
        : `<style>.visible{${css}}.hidden{visibility:hidden}</style><h1 class="visible">Visible</h1><h1 class="hidden">Actually hidden</h1>`;
      const parsed = analyzeStaticCode(html);
      assert.deepEqual(
        parsed.candidates.map((part) => part.label),
        ["Visible"],
        `${inline}: ${ignored}`,
      );
      assert.equal(parsed.candidates[0].style.color, "#123456");
    }
  }
});

test("QA CSS: raw semicolon budget stays conservative at every quoted and commented boundary", () => {
  for (let count = 0; count <= 66; count++) {
    const semicolons = ";".repeat(count);
    const comment = `/* ${semicolons} */color:#123456`;
    const quoted = `content:"${semicolons}";color:#123456`;
    assert.deepEqual(
      safeDeclarations(comment),
      count < 64 ? { color: "#123456" } : {},
      `comment ${count}`,
    );
    assert.deepEqual(
      safeDeclarations(quoted),
      count < 63 ? { color: "#123456" } : {},
      `quote ${count}`,
    );
  }
  assert.deepEqual(
    safeDeclarations(";".repeat(63) + "color:#123456;color:red"),
    { color: "#123456" },
  );
  assert.deepEqual(safeDeclarations(";".repeat(64) + "color:#123456"), {});
});

test("QA CSS: declaration lexing cannot expand the combined UTF-8 stylesheet byte allowance", () => {
  const node = parseFragment('<h1 class="title">Title</h1>').childNodes[0];
  const first = ".title{color:#123456}";
  const second =
    "/*" +
    "あ".repeat(Math.floor((CSS_LIMITS.bytes - first.length - 4) / 3) + 1) +
    "*/.title{color:red}";
  assert.ok(
    first.length + second.length < CSS_LIMITS.bytes,
    "UTF-16 length alone would incorrectly fit",
  );
  assert.ok(Buffer.byteLength(first + second) > CSS_LIMITS.bytes);
  const reader = createSafeStyleReader([first, second]);
  assert.equal(reader.limited, true);
  assert.equal(reader.rules, 1);
  assert.equal(reader.styleFor(node).color, "#123456");
});

test("QA CSS: interpreted comments preserve style order, restricted fetches, and sealed source provenance", async () => {
  const html =
    '<style>h1{color:#222222}</style><link rel="stylesheet" href="static/oscar/css/styles.css"><style>h1{/* comment */color:#334455}</style><h1 style="/* inline */color:#456789">Visible store</h1><button>Add to basket</button>';
  const css =
    '@import "https://unreviewed.example/a.css";h1{content:";display:none;";color:#abcdef}button{/* purchase */background-color:#123456}';
  const calls = [];
  const service = createStaticIngestService({
    transport: async (url, options) => {
      calls.push(url);
      assert.equal(options.credentials, "omit");
      assert.equal(options.redirect, "error");
      return new Response(url === SHEET ? css : html, {
        headers: { "content-type": url === SHEET ? "text/css" : "text/html" },
      });
    },
  });
  const result = await service.reconstruct(PAGE);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(calls, [PAGE, SHEET]);
  const blueprint = result.value;
  assert.equal(blueprint.components.length, 2);
  assert.equal(
    blueprint.components[0].appearance.primitives.find(
      (primitive) => primitive.kind === "text",
    ).color,
    "#456789",
  );
  assert.equal(blueprint.components[1].appearance.background, "#123456");
  assert.equal(blueprint.analysis.sourceHash, hash(html));
  assert.deepEqual(blueprint.analysis.css.stylesheetHashes, [hash(css)]);
  assert.equal(blueprint.fidelity, "code-approximation");
  assert.ok(blueprint.components.every((part) => part.sourceRect === null));
  assert.doesNotMatch(
    JSON.stringify(blueprint),
    /unreviewed\.example|@import|display:none/,
  );
  assert.equal((await verifyRaidBlueprint(blueprint)).ok, true);
});
