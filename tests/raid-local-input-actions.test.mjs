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
const capture = (source) =>
  reconstructLocalCode({ html: bytes(source), capturedAt });
const purchases = (source) =>
  analyzeLocalCode(source).candidates.filter((c) => c.kind === "purchase");
const input = (label, type = "submit") =>
  `<input type="${type}" value="${label}">`;
const caption = (component) => component.appearance.primitives[1].text;

// Regression: omitting all input nodes loses genuine static action captions.
// Only submit/button value is a visible label; editable field values are not.
// https://html.spec.whatwg.org/multipage/input.html#submit-button-state-(type=submit)
// https://html.spec.whatwg.org/multipage/input.html#button-state-(type=button)
test("local submit and button input labels become one existing canonical purchase", async () => {
  for (const type of ["submit", "button", "SuBmIt", "BUTTON"]) {
    const source = `<form><input TYPE="${type}" class="purchase" value="  購入 &amp; Add to cart  " style="background:#123456;color:#fedcba" aria-label="SPOOFED"></form>`;
    const candidates = purchases(source);
    assert.equal(candidates.length, 1, type);
    assert.equal(candidates[0].label, "購入 & Add to cart");
    assert.equal(candidates[0].sourceNode.tag, "input");
    assert.equal(
      candidates[0].sourceNode.path,
      "document/html[0]/body[1]/form[0]/input[0]",
    );
    assert.equal(candidates[0].sourceNode.order, 6);
    assert.deepEqual(candidates[0].sourceNode.classes, ["purchase"]);
    const result = await capture(source);
    assert.equal(result.ok, true, result.error);
    const b = result.value;
    assert.equal((await verifyRaidBlueprint(b)).ok, true);
    assert.equal(b.source.kind, "local-file");
    assert.equal(b.source.displayUrl, "local://" + hash(bytes(source)));
    assert.equal(b.analysis.sourceHash, hash(bytes(source)));
    assert.equal(b.components.length, 1);
    const action = b.components[0];
    assert.equal(action.canonicalType, "am_buy");
    assert.equal(action.evidence, "purchase");
    assert.equal(action.sourceRect, null);
    assert.equal(caption(action), "購入 & Add to cart");
    assert.equal(action.appearance.background, "#123456");
    assert.equal(action.appearance.primitives[1].color, "#fedcba");
    assert.doesNotMatch(JSON.stringify(b), /SPOOFED|<input|value=/);
    assert.deepEqual(analyzeStaticCode(source).candidates, []);
  }
});

test("input action labels require supported explicit types and existing purchase words", async () => {
  for (const label of [
    "Buy now",
    "Add to basket",
    "Add to cart",
    "購入",
    "カートへ",
    "かごへ",
  ])
    assert.equal(purchases(input(label)).length, 1, label);
  for (const type of [
    "",
    "text",
    "search",
    "password",
    "hidden",
    "checkbox",
    "radio",
    "number",
    "email",
    "file",
    "reset",
    "image",
    "unknown",
    " submit ",
    "button\t",
  ])
    assert.deepEqual(purchases(input("Buy PRIVATE", type)), [], type);
  for (const source of [
    '<input value="Buy PRIVATE">',
    '<input type="submit">',
    '<input type="button">',
    '<input type="submit" value="">',
    '<input type="button" value=" &#9; ">',
    '<input type="submit" value="Submit" aria-label="Buy SPOOFED">',
    '<input type="button" title="Buy SPOOFED" placeholder="Buy SPOOFED" aria-labelledby="name"><span id="name">Buy SPOOFED</span>',
    '<div role="button" value="Buy SPOOFED"></div>',
    input("Read more"),
  ]) {
    assert.deepEqual(purchases(source), [], source);
    assert.equal((await capture(source)).code, "no-playable-elements", source);
  }
  // Disabled still has a visible caption, just like the existing button path.
  assert.equal(
    purchases('<input type="submit" value="Buy visible" disabled>')[0].label,
    "Buy visible",
  );
});

test("only eligible action labels survive hidden inert omitted and foreign ancestry", () => {
  for (const attribute of [
    "hidden",
    "inert",
    'aria-hidden="true"',
    'style="display:none"',
    'style="visibility:hidden"',
  ]) {
    assert.deepEqual(
      purchases(`<input type="submit" value="Buy EXCLUDED" ${attribute}>`),
      [],
      attribute,
    );
    assert.deepEqual(
      purchases(`<div ${attribute}>${input("Buy EXCLUDED")}</div>`),
      [],
      attribute,
    );
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
    ["<button>Ordinary control", "</button>"],
    ['<a href="#">Ordinary link', "</a>"],
  ])
    assert.deepEqual(
      purchases("<body>" + open + input("Buy EXCLUDED") + close),
      [],
      open,
    );
  assert.deepEqual(
    purchases(
      '<style>.closed input{display:none}</style><div class="closed">' +
        input("Buy EXCLUDED") +
        "</div>",
    ),
    [],
  );
  // parse5 repairs this apparent nesting into an ordinary eligible body input.
  assert.equal(
    purchases("<table>" + input("Buy repaired") + "</table>")[0]?.label,
    "Buy repaired",
  );
});

test("action labels never leak into ancestor heading search product or checkbox captions", () => {
  const a = analyzeLocalCode(
    "<h1>Catalog " +
      input("Buy HEADING ACTION") +
      "</h1>" +
      '<form role="search">Find paper ' +
      input("Buy SEARCH ACTION") +
      '<input type="search" value="PRIVATE SEARCH"></form>' +
      "<article><h2>Notebook " +
      input("Buy PRODUCT ACTION") +
      '</h2><input type="password" value="PRIVATE PASSWORD"><input type="hidden" value="PRIVATE HIDDEN"></article>' +
      '<label>Receive news<input type="checkbox" value="PRIVATE CHECKBOX"></label>' +
      '<label for="act">External name is not the action caption</label><input id="act" type="button" value="Buy OWN CAPTION">',
  );
  assert.equal(a.candidates.find((c) => c.kind === "heading").label, "Catalog");
  assert.equal(
    a.candidates.find((c) => c.kind === "search").label,
    "Find paper",
  );
  assert.equal(
    a.candidates.find((c) => c.kind === "product")?.label,
    "Notebook",
  );
  assert.equal(
    a.candidates.find((c) => c.kind === "checkbox").label,
    "Receive news",
  );
  assert.deepEqual(
    a.candidates.filter((c) => c.kind === "purchase").map((c) => c.label),
    [
      "Buy HEADING ACTION",
      "Buy SEARCH ACTION",
      "Buy PRODUCT ACTION",
      "Buy OWN CAPTION",
    ],
  );
  assert.doesNotMatch(JSON.stringify(a), /PRIVATE|External name/);
});

test("input articles use the existing product layout and one first purchase per group", async () => {
  for (const firstInput of [true, false]) {
    const first = input("Buy input"),
      second = "<button>Buy legacy</button>";
    const source =
      "<h1>Paper shop</h1><article><h2>Notebook</h2>" +
      (firstInput ? first + second : second + first) +
      "</article><article><h2>Pencil</h2>" +
      input("購入する", "button") +
      "</article>";
    const a = analyzeLocalCode(source);
    assert.equal(a.candidateCount, 6);
    const result = await capture(source);
    assert.equal(result.ok, true, result.error);
    assert.equal((await verifyRaidBlueprint(result.value)).ok, true);
    assert.deepEqual(
      result.value.components.map((c) => c.evidence),
      ["heading", "product", "purchase", "product", "purchase"],
    );
    const actions = result.value.components.filter(
      (c) => c.evidence === "purchase",
    );
    // Fresh local reconstruction may choose a different first purchase only
    // when a newly eligible input exists. Archived blueprints are not reparsed.
    assert.deepEqual(actions.map(caption), [
      firstInput ? "Buy input" : "Buy legacy",
      "購入する",
    ]);
    assert.deepEqual(
      actions.map((c) => c.combatRect),
      [
        { x: 252, y: 362, w: 324, h: 44 },
        { x: 600, y: 362, w: 324, h: 44 },
      ],
    );
    for (const product of result.value.components.filter(
      (c) => c.evidence === "product",
    ))
      assert.equal(
        actions.filter((c) => c.sourceNode.group === product.sourceNode.group)
          .length,
        1,
      );
  }
  const noProductCaption = await capture(
    "<article>" + input("Buy only action") + "</article>",
  );
  assert.equal(noProductCaption.ok, true);
  assert.deepEqual(
    noProductCaption.value.components.map((c) => c.evidence),
    ["purchase"],
  );
});

test("local input actions retain per-kind per-region quotas selection and source bounds", async () => {
  const row = (i) => input("Buy item " + i);
  const source =
    "<nav>" +
    Array.from({ length: 30 }, (_, i) => row(i)).join("") +
    "</nav>" +
    Array.from({ length: 30 }, (_, i) => row(i + 30)).join("");
  const a = analyzeLocalCode(source);
  assert.equal(a.candidateCount, 60);
  assert.equal(a.candidates.length, 24);
  for (const region of ["navigation", "content"])
    assert.equal(a.candidates.filter((c) => c.region === region).length, 12);
  const r = await capture(source);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.value.components.length, 4);
  assert.deepEqual(
    r.value.components.map(caption),
    [0, 1, 2, 3].map((i) => "Buy item " + i),
  );
  const crowded = analyzeLocalCode(
    Array.from(
      { length: 30 },
      (_, i) =>
        `<h1>Heading ${i}</h1><a>Link ${i}</a><form role="search">Find ${i}</form><label>News ${i}<input type="checkbox"></label>${row(i)}<article><h2>Product ${i}</h2><button>Buy product ${i}</button></article>`,
    ).join(""),
  );
  assert.equal(crowded.candidates.length, 64);
  assert.throws(
    () => analyzeLocalCode("<div>".repeat(65) + row(1)),
    /source-too-large/,
  );
  assert.throws(
    () => analyzeLocalCode("<i></i>".repeat(20000) + row(1)),
    /source-too-large/,
  );
  assert.throws(
    () => analyzeLocalCode(" ".repeat(524289) + row(1)),
    /source-too-large/,
  );
});

test("local action captions remain bounded and source behavior stays inert", async () => {
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = () => {
    requests++;
    throw Error("unexpected source fetch");
  };
  try {
    const source =
      '<form action="https://private.invalid/send"><input type="submit" value="Buy &#10;&#9; visible ' +
      "x".repeat(120) +
      '" formaction="https://private.invalid/override" onclick="globalThis.inputActionExecuted=true"><input type="text" value="PRIVATE TEXT"></form><script>globalThis.inputActionExecuted=true</script><img src="https://private.invalid/image"><style>@import "https://private.invalid/style"; input{background:#123456;background-image:url(https://private.invalid/image)}</style>';
    const r = await capture(source);
    assert.equal(r.ok, true, r.error);
    assert.equal((await verifyRaidBlueprint(r.value)).ok, true);
    assert.equal(caption(r.value.components[0]).length, 80);
    assert.match(caption(r.value.components[0]), /^Buy visible x+$/);
    assert.equal(requests, 0);
    assert.equal(globalThis.inputActionExecuted, undefined);
    assert.doesNotMatch(
      JSON.stringify(r.value),
      /PRIVATE|private\.invalid|inputActionExecuted|onclick|formaction/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("local sources without newly eligible actions keep exact prior analysis and sealed bytes", async () => {
  const expected = [
    [
      '<title>Paper shop</title><h1>Stationery</h1><a href="/paper">Paper</a><article><h2>Notebook</h2><button>Add to cart</button></article>',
      "aacfb4ba4b14fe53ba3e8129298db8423e7e6103ac9717bf0a2e04ce312129ab",
      "d1ba4050cf2a6685ac2f4127c9e4be7ab702d946a68a6c3244580b3d9e683b53",
    ],
    [
      '<h1>Preferences</h1><input id="news" type="checkbox" value="PRIVATE"><label for="news">Receive news</label><form role="search"><input type="search" value="PRIVATE SEARCH"></form><button>購入</button>',
      "ef66e75db4f31afa3a5a1e92453bbec9bf5e0770e379bb9f1418b8b56d84d407",
      "12822a14915c549458c9a00c2153aec94a11a0a6435e03d39321f387ef0e6967",
    ],
    [
      '<h1>Legacy actions</h1><input value="Buy private"><input type="password" value="Buy private"><input type="hidden" value="Buy private"><input type="reset" value="Buy reset"><button>Buy legacy</button>',
      "ff9a7636b87202bcd34b209cd194e03e688f87b267104513c36b254d57e34563",
      "a2eb3ed343f197cb764fa95091cbeeaba555119dbc64869ca32d9d900f34b230",
    ],
  ];
  for (const [source, analysisHash, resultHash] of expected) {
    assert.equal(hash(JSON.stringify(analyzeLocalCode(source))), analysisHash);
    assert.equal(hash(JSON.stringify(await capture(source))), resultHash);
  }
});

test("public input interpretation and recorded Books sealed bytes remain unchanged", async () => {
  assert.deepEqual(analyzeStaticCode(input("Buy visible")).candidates, []);
  assert.deepEqual(
    analyzeStaticCode(
      "<article><h2>Notebook</h2>" + input("Buy visible") + "</article>",
    ).candidates.map((c) => c.kind),
    ["heading"],
  );
  const directory = new URL("../fixtures/raid/public-source/", import.meta.url);
  const html = await readFile(new URL("books.html", directory), "utf8");
  const css = await readFile(new URL("books.css", directory), "utf8");
  const b = await reconstructStaticCode({
    html,
    sourceHash: hash(html),
    capturedAt,
    requestedUrl: "https://books.toscrape.com/",
    stylesheets: [
      {
        css,
        sourceHash: hash(css),
        url: "https://books.toscrape.com/static/oscar/css/styles.css",
      },
    ],
  });
  assert.equal((await verifyRaidBlueprint(b)).ok, true);
  assert.equal(
    hash(JSON.stringify(b)),
    "8faf30cb571669839b4fa575817af74deccee919290b957c562b432990adaf34",
  );
  assert.equal(
    b.captureId,
    "capture_b51a0697f50e53fd012abd53d1225079e61099a4f71884658397e90dd5624fd5",
  );
});
