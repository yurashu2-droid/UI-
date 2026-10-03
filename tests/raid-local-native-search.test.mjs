import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  analyzeLocalCode,
  analyzeStaticCode,
  reconstructStaticCode,
} from "../src/raid/code.js";
import { reconstructLocalCode } from "../src/raid/local-code.js";
import { verifyRaidBlueprint } from "../src/raid/blueprint.js";

const capturedAt = "2026-10-03T03:20:00.000Z";
const bytes = (text) => new TextEncoder().encode(text);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const capture = (html) =>
  reconstructLocalCode({ html: bytes(html), capturedAt });
const searches = (html) =>
  analyzeLocalCode(html).candidates.filter((c) => c.kind === "search");
const input = '<input type="search">';

// WHATWG input search is a native text-edit control; search is a native region
// for search/filter controls, including controls without a submitting form.
// https://html.spec.whatwg.org/multipage/input.html#text-(type=text)-state-and-search-state-(type=search)
// https://html.spec.whatwg.org/multipage/grouping-content.html#the-search-element
// Removing the local-only native-search path loses each positive candidate.
test("standalone explicit native search inputs become generic inert search parts", async () => {
  for (const type of ["search", "SEARCH", "SeArCh"]) {
    const html = `<input TYPE="${type}" class="query" value="PRIVATE VALUE" defaultvalue="PRIVATE DEFAULT" placeholder="PRIVATE PLACEHOLDER" title="PRIVATE TITLE" aria-label="PRIVATE ARIA" style="background:#123456;color:#fedcba">`;
    const candidates = searches(html);
    assert.equal(candidates.length, 1, type);
    assert.equal(candidates[0].label, "検索");
    assert.deepEqual(candidates[0].sourceNode, {
      tag: "input",
      path: "document/html[0]/body[1]/input[0]",
      order: 5,
      group: 0,
      classes: ["query"],
    });
    assert.equal(candidates[0].style.background, "#123456");
    assert.equal(candidates[0].style.color, "#fedcba");
    const result = await capture(html);
    assert.equal(result.ok, true, result.error);
    assert.equal((await verifyRaidBlueprint(result.value)).ok, true);
    assert.equal(result.value.components.length, 1);
    const component = result.value.components[0];
    assert.equal(component.evidence, "search");
    assert.equal(component.canonicalType, "go_search");
    assert.equal(component.sourceRect, null);
    assert.equal(component.appearance.primitives[1].text, "検索");
    assert.equal(
      result.value.source.displayUrl,
      "local://" + hash(bytes(html)),
    );
    assert.doesNotMatch(JSON.stringify(result.value), /PRIVATE|value=|<input/);
    assert.deepEqual(analyzeStaticCode(html).candidates, []);
  }
});

test("native search regions own their eligible inputs once and keep other semantics", async () => {
  const html =
    '<search class="query" style="background:#123456"><label>Find paper<input type="SEARCH" style="background:#fedcba" value="PRIVATE"></label><input type="search"><label>Exact matches<input type="checkbox"></label><h2>Results</h2><a href="https://private.invalid/">Paper</a></search>';
  const a = analyzeLocalCode(html);
  assert.deepEqual(
    a.candidates.map((c) => [c.kind, c.label]),
    [
      ["search", "検索"],
      ["checkbox", "Exact matches"],
      ["heading", "Results"],
      ["navigation", "Paper"],
    ],
  );
  const search = a.candidates[0];
  assert.equal(search.sourceNode.tag, "search");
  assert.equal(search.sourceNode.path, "document/html[0]/body[1]/search[0]");
  assert.equal(search.sourceNode.order, 5);
  assert.equal(search.style.background, "#123456");
  const r = await capture(html);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.value.analysis.candidateCount, 4);
  assert.equal(
    r.value.components.filter((c) => c.evidence === "search").length,
    1,
  );
  assert.doesNotMatch(
    JSON.stringify(r.value),
    /PRIVATE|Find paper|private\.invalid/,
  );
});

test("legacy search forms retain ownership and new inputs do not create duplicate parts", () => {
  const forms = [
    '<form role="search">Find paper<input type="SEARCH"></form>',
    '<form>Find paper<input type="search"><input type="SEARCH"></form>',
    '<search><form>Find paper<input type="search"></form></search>',
    '<form role="search">Find paper<search><input type="SEARCH"></search></form>',
    '<search><input type="SEARCH"><form role="search">Find paper</form></search>',
  ];
  for (const html of forms) {
    const found = searches(html);
    assert.equal(found.length, 1, html);
    assert.equal(found[0].sourceNode.tag, "form", html);
    assert.equal(found[0].label, "Find paper", html);
  }
  // A case variant in an otherwise unrecognized form is a new input candidate,
  // rather than a reinterpretation of the existing form's label or source node.
  assert.equal(
    searches('<form>Find paper<input type="SEARCH"></form>')[0]?.sourceNode.tag,
    "input",
  );
});

test("new search support rejects implicit types ARIA substitutes external owners and ambiguous regions", async () => {
  for (const html of [
    "<input>",
    '<input type="">',
    '<input type="text">',
    '<input type=" search ">',
    '<input type="search\t">',
    '<input type="ſearch">',
    '<input type="password">',
    '<input type="search" form="elsewhere">',
    '<input type="search" form="">',
    '<div role="search">Find paper</div>',
    '<input role="searchbox">',
    "<search>Search results</search>",
    '<search><input type="text"></search>',
    '<search><input type="search" form="elsewhere"></search>',
    '<search><search><input type="search"></search></search>',
    '<search><input type="search"><search>Nested region</search></search>',
  ]) {
    assert.deepEqual(searches(html), [], html);
    assert.equal((await capture(html)).code, "no-playable-elements", html);
  }
  // Disabled/readonly are visible source appearance, not executable behavior.
  assert.equal(searches('<input type="search" disabled readonly>').length, 1);
});

test("new search controls reject hidden inert omitted foreign and control ancestry", () => {
  for (const attribute of [
    "hidden",
    "inert",
    'aria-hidden="true"',
    'style="display:none"',
    'style="visibility:hidden"',
  ]) {
    for (const html of [
      `<input type="search" ${attribute}>`,
      `<div ${attribute}>${input}</div>`,
      `<search ${attribute}>${input}</search>`,
      `<search><span ${attribute}>${input}</span></search>`,
    ])
      assert.deepEqual(searches(html), [], html);
  }
  for (const [open, close] of [
    ["<template>", "</template>"],
    ["<script>", "</script>"],
    ["<noscript>", "</noscript>"],
    ["<iframe>", "</iframe>"],
    ["<object>", "</object>"],
    ["<textarea>", "</textarea>"],
    ["<datalist>", "</datalist>"],
    ["<svg>", "</svg>"],
    ["<svg><foreignObject>", "</foreignObject></svg>"],
    ['<math><annotation-xml encoding="text/html">', "</annotation-xml></math>"],
    ["<button>Other control", "</button>"],
    ["<a>Other link", "</a>"],
    ["<output>", "</output>"],
    ["<meter>", "</meter>"],
    ["<progress>", "</progress>"],
  ]) {
    assert.deepEqual(searches("<body>" + open + input + close), [], open);
    assert.deepEqual(
      searches("<body>" + open + "<search>" + input + "</search>" + close),
      [],
      open,
    );
  }
  assert.deepEqual(
    searches(
      '<style>.closed input{display:none}</style><search class="closed">' +
        input +
        "</search>",
    ),
    [],
  );
  // Judge parse5's repaired tree, not apparent invalid raw-markup nesting.
  assert.equal(searches("<table>" + input + "</table>").length, 1);
});

test("unreachable legacy forms and inactive nested regions cannot shadow visible native input", () => {
  for (const markup of [
    '<form role="search" hidden>Hidden form</form>',
    '<template><form role="search">Omitted form</form></template>',
    '<search hidden><input type="search"></search>',
    '<search inert><input type="search"></search>',
    '<template><search><input type="search"></search></template>',
  ]) {
    const found = searches("<search>" + input + markup + "</search>");
    assert.equal(found.length, 1, markup);
    assert.equal(found[0].sourceNode.tag, "search", markup);
  }
});

test("native search uses existing source ordering region quotas selection and budgets", async () => {
  const html =
    "<nav>" +
    input.repeat(30) +
    "</nav><search>" +
    input +
    "</search>" +
    input.repeat(30);
  const a = analyzeLocalCode(html);
  assert.equal(a.candidateCount, 61);
  assert.equal(a.candidates.length, 24);
  for (const region of ["navigation", "content"])
    assert.equal(a.candidates.filter((c) => c.region === region).length, 12);
  assert.ok(
    a.candidates.every(
      (c, i, cs) => !i || cs[i - 1].sourceNode.order < c.sourceNode.order,
    ),
  );
  const r = await capture(html);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.value.components.length, 4);
  assert.deepEqual(
    r.value.components.map((c) => c.sourceNode),
    a.candidates.slice(0, 4).map((c) => c.sourceNode),
  );
  for (const html of [
    " ".repeat(524289) + input,
    "<i></i>".repeat(20000) + input,
    "<div>".repeat(65) + input,
  ])
    assert.throws(() => analyzeLocalCode(html), /source-too-large/);
});

test("unaffected local form action checkbox outputs keep their complete baseline bytes", async () => {
  const cases = [
    [
      '<form role="search">Find paper<input type="search" value="PRIVATE"></form>',
      "30d5683925e0ba82d14931ab14cef920f504e75fc30c9be772ffa0203886125a",
      "8ac887cc402167ec4917979ef2dc2d7f7ca49aee343b7c82c303163fbfcceed9",
    ],
    [
      '<search><form>Find paper<input type="search" value="PRIVATE"></form></search>',
      "ec0f502d7e479f4232ca0a3d807e41b786ff4e4583c3947e7f45dab1ad26dc2c",
      "65f96e1d14f97c2da2cfb50abe8b66f7e5d14d3988f3d91996461014e4ee1706",
    ],
    [
      '<form inert role="search">Legacy inert<input type="search"></form>',
      "517320171ecb4291b1be604a9834b40860131d5bfd2c885475d9e2e4c40b7ef9",
      "adafa4b4c199ee2de15299113bdcaa65a6235896d302fe765cb4793d17592c60",
    ],
    [
      '<h1>Shop</h1><input type="submit" value="Buy paper"><label for="c">Updates</label><input id="c" type="checkbox">',
      "fb153314b569180758794ef5a4e8546dddcd34ea176345a9853bd862de69fd6d",
      "09553ac640c1574a5ee6741087a98b5259958f0ad0021ff4db1a5ff30735a2e4",
    ],
    [
      '<form><input type="search" hidden><button>Go</button></form><h1>Only heading</h1>',
      "6e8d463a5741d4be72e32b4cfa2f93c438b015005eba926dafb09fc1a2c80b33",
      "ea3f1ec555f86ecfab19653e52f88b5f276cb93c8cc98bbb0559a2fb289e564c",
    ],
  ];
  for (const [html, analysis, sealed] of cases) {
    assert.equal(hash(JSON.stringify(analyzeLocalCode(html))), analysis);
    assert.equal(hash(JSON.stringify(await capture(html))), sealed);
  }
});

test("public native search interpretation and recorded Books sealed bytes stay unchanged", async () => {
  assert.deepEqual(
    analyzeStaticCode(input + "<search>" + input + "</search>").candidates,
    [],
  );
  assert.deepEqual(
    analyzeStaticCode('<form><input type="SEARCH"></form>').candidates,
    [],
  );
  const directory = new URL("../fixtures/raid/public-source/", import.meta.url);
  const html = await readFile(new URL("books.html", directory), "utf8");
  const css = await readFile(new URL("books.css", directory), "utf8");
  const sheets = [
    {
      css,
      sourceHash: hash(css),
      url: "https://books.toscrape.com/static/oscar/css/styles.css",
    },
  ];
  assert.equal(
    hash(
      JSON.stringify(
        analyzeStaticCode(html, sheets, "https://books.toscrape.com/"),
      ),
    ),
    "508481a8d29ad4a3571fb0ce299d0402eeb3a4ab58a598bed0d9a938c9c086ea",
  );
  const b = await reconstructStaticCode({
    html,
    sourceHash: hash(html),
    capturedAt,
    requestedUrl: "https://books.toscrape.com/",
    stylesheets: sheets,
  });
  assert.equal(
    hash(JSON.stringify(b)),
    "8faf30cb571669839b4fa575817af74deccee919290b957c562b432990adaf34",
  );
});
