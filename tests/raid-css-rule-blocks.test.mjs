import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  analyzeStaticCode,
  reconstructStaticCode,
} from "../server/site-ingest/code.js";
import {
  createSafeStyleReader,
  CSS_LIMITS,
} from "../server/site-ingest/css.js";
import { createStaticIngestService } from "../server/site-ingest/service.js";
import { verifyRaidBlueprint } from "../src/raid/index.js";

const PAGE = "https://books.toscrape.com/";
const SHEET = PAGE + "static/oscar/css/styles.css";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const [html, css] = await Promise.all(
  ["books.html", "books.css"].map((name) =>
    readFile(
      new URL(`../fixtures/raid/public-source/${name}`, import.meta.url),
      "utf8",
    ),
  ),
);
const source = {
  requestedUrl: PAGE,
  html,
  sourceHash: hash(html),
  bytes: Buffer.byteLength(html),
  capturedAt: "2026-10-03T03:20:00.000Z",
  extraction: { title: "Books", candidates: [] },
  stylesheets: [{ css, url: SHEET, sourceHash: hash(css) }],
};
const inertPrefixes = [
  "/* lone { inside comment */ ",
  "/* { ignored } display:none; */ ",
  'content: "{ ignored };display:none;"; ',
  "content: '{ ignored };display:none;'; ",
  String.raw`content: "escaped \" \{ ;display:none;"; `,
  String.raw`content: 'escaped \' \{ ;display:none;'; `,
];

// Vary only inert syntax in the real recorded navigation rule. The fixtures
// remain immutable; these are source-derived cases, not upstream captures.
test("inert rule-body braces preserve the recorded Books navigation and all eight appearances", async () => {
  assert.equal(
    hash(html),
    "9fdd63da34161ebd13408d7a85105f83ec3c9f351c5d77cd0aa578790e121c1e",
  );
  assert.equal(
    hash(css),
    "d497d4a0d52686ccd30f5941b02867075870372cdfe37adbcb0be74fdeed94cf",
  );
  assert.match(css, /\.nav > li > a \{[^}]*padding: 10px 15px;/);
  const original = await reconstructStaticCode(source);
  assert.equal(
    original.captureId,
    "capture_b51a0697f50e53fd012abd53d1225079e61099a4f71884658397e90dd5624fd5",
  );
  assert.equal(
    original.components[1].appearanceId,
    "appearance_d30ff827a1c2daac79828e388dcde19e9a9681c6aa2cc7545b9d06ea5a95ce2a",
  );
  assert.equal(original.components.length, 8);
  assert.equal(original.analysis.css.rules, 576);
  for (const prefix of inertPrefixes) {
    const stylesheet = css.replace(
      "padding: 10px 15px;",
      prefix + "padding: 10px 15px;",
    );
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
    const current = result.value;
    assert.deepEqual(
      current.components[1].appearance.primitives[1].rect,
      { x: 15, y: 10, w: 162, h: 20 },
      prefix,
    );
    assert.deepEqual(current.components, original.components, prefix);
    assert.deepEqual(current.analysis.css, {
      ...original.analysis.css,
      stylesheetHashes: [hash(stylesheet)],
    });
    assert.equal(current.analysis.sourceHash, original.analysis.sourceHash);
    assert.notEqual(
      current.captureId,
      original.captureId,
      "changed source bytes keep distinct provenance",
    );
    assert.equal(current.fidelity, "code-approximation");
    assert.ok(current.components.every((part) => part.sourceRect === null));
    assert.equal((await verifyRaidBlueprint(current)).ok, true);
  }
});

test("embedded rule scanning keeps inert braces out of nesting and declaration decisions", () => {
  for (const prefix of inertPrefixes) {
    const parsed = analyzeStaticCode(
      `<style>h1{${prefix}color:#123456;background:url(https://unreviewed.example/asset)}h1{font-size:18px}</style><h1>Visible</h1>`,
    );
    assert.equal(parsed.candidates.length, 1, prefix);
    assert.equal(parsed.candidates[0].label, "Visible");
    assert.equal(parsed.candidates[0].style.color, "#123456", prefix);
    assert.equal(
      parsed.candidates[0].style.size,
      18,
      "the following rule stays separate",
    );
    assert.equal(parsed.candidates[0].style.background, undefined);
    assert.doesNotMatch(
      JSON.stringify(parsed),
      /display:none|unreviewed\.example|content:/,
    );
  }
  const hidden = analyzeStaticCode(
    '<style>h1{content:"{ inert }";display:none}</style><h1>Hidden</h1><h2>Visible</h2>',
  );
  assert.deepEqual(
    hidden.candidates.map((candidate) => candidate.label),
    ["Visible"],
  );
});

test("true nested syntax and unfinished blocks remain rejected without losing following valid rules", () => {
  for (const rejected of [
    "h1{color:red;.nested{display:none}padding:7px}",
    "h1{--ignored:{nested:yes};color:red}",
    "@media screen{h1{color:red;display:none}}",
    '@supports(display:block){h1{content:"{";color:red}}',
    // Escapes outside strings remain unsupported; no CSS escape decoding.
    String.raw`h1{--ignored:\{ignored\};color:red}`,
  ]) {
    assert.equal(createSafeStyleReader([rejected]).rules, 0, rejected);
    const parsed = analyzeStaticCode(
      `<style>${rejected}h1{color:#123456}</style><h1>Visible</h1>`,
    );
    assert.equal(parsed.candidates[0].style.color, "#123456", rejected);
    assert.equal(parsed.candidates[0].style.padding, undefined, rejected);
  }
  for (const unfinished of [
    'h1{content:"{ unterminated;display:none}',
    'h1{content:"escaped \\";display:none}',
    "h1{/* { unterminated;display:none}",
    "h1{color:red;.nested{display:none}",
  ]) {
    const parsed = analyzeStaticCode(
      `<style>h1{color:#123456}${unfinished}</style><h1>Visible</h1>`,
    );
    assert.equal(parsed.candidates[0].style.color, "#123456", unfinished);
    assert.equal(parsed.candidates.length, 1);
  }
});

test("inert brace compatibility keeps exact block declaration selector and byte budgets", () => {
  assert.deepEqual(CSS_LIMITS, {
    bytes: 262144,
    rules: 1024,
    blocks: 4096,
    declarations: 64,
    selectorParts: 4,
  });
  const body = (value) => createSafeStyleReader([`h1{${value}}`]);
  assert.equal(
    body('content:"{";' + "unknown:0;".repeat(62) + "color:#123456").rules,
    1,
  );
  assert.equal(
    body('content:"{";' + "unknown:0;".repeat(63) + "color:#123456").rules,
    0,
  );
  assert.equal(
    body('content:"{' + ";".repeat(64) + '";color:#123456').rules,
    0,
  );
  assert.equal(body("/* { */" + " ".repeat(4096) + "color:#123456").rules, 0);
  assert.equal(
    createSafeStyleReader(['a b c d e{content:"{";color:red}']).rules,
    0,
  );
  const atLimit = createSafeStyleReader([
    ";".repeat(4095) + 'h1{content:"{";color:red}',
  ]);
  assert.equal(atLimit.rules, 1);
  assert.equal(atLimit.limited, false);
  const overLimit = createSafeStyleReader([
    ";".repeat(4096) + 'h1{content:"{";color:red}',
  ]);
  assert.equal(overLimit.rules, 0);
  assert.equal(overLimit.limited, true);
  const bytes = createSafeStyleReader([
    " ".repeat(CSS_LIMITS.bytes) + 'h1{content:"{";color:red}',
  ]);
  assert.equal(bytes.rules, 0);
  assert.equal(bytes.limited, true);
});
