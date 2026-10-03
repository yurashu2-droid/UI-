import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const anchor = (href, label = "Read the guide", attrs = "") =>
  `<a href="${href}" ${attrs}>${label}</a>`;
const pdfs = (html) =>
  analyzeLocalCode(html).candidates.filter((c) => c.kind === "pdf");

// Regression: explicit PDF filename advertisements were ordinary navigation.
// This is a filename hint, never a fetch, MIME inference, or PDF validation.
// WHATWG distinguishes the URL path from query/fragment, and link type is advisory.
// https://html.spec.whatwg.org/multipage/links.html#links-created-by-a-and-area-elements
// https://url.spec.whatwg.org/#url-writing
// Removing the local PDF branch must fail these semantic/canonical assertions.
test("local literal PDF path hints become existing canonical PDF rows with visible captions", async () => {
  for (const href of [
    "guide.pdf",
    "./guide.PDF",
    "../documents/guide.PdF",
    "/documents/guide.pdf",
    "資料.pdf",
    "./資料/案内.PDF",
    "https://example.invalid/資料.pdf",
    "https://example.invalid:8443/documents/guide.pdf",
    "HTTP://example.invalid/guide.PDF?token=PRIVATE#page=2",
    "guide.pdf?download=1&amp;token=PRIVATE#page=2",
    " \tguide.pdf\r\n ",
    "folder/../guide.pdf",
    "a".repeat(2044) + ".pdf",
  ]) {
    const html = anchor(
      href,
      "Read <span>the guide</span><span hidden>PRIVATE HIDDEN</span>",
      'class="guide" style="background:#123456;color:#fedcba" title="PRIVATE TITLE" aria-label="PRIVATE ARIA" download="PRIVATE DOWNLOAD.pdf" type="application/octet-stream"',
    );
    const found = pdfs(html);
    assert.equal(found.length, 1, href);
    assert.equal(found[0].label, "Read the guide");
    assert.deepEqual(found[0].sourceNode, {
      tag: "a",
      path: "document/html[0]/body[1]/a[0]",
      order: 5,
      group: 0,
      classes: ["guide"],
    });
    const result = await capture(html);
    assert.equal(result.ok, true, result.error);
    assert.equal((await verifyRaidBlueprint(result.value)).ok, true);
    const component = result.value.components[0];
    assert.equal(component.evidence, "pdf");
    assert.equal(component.canonicalType, "gov_pdf");
    assert.equal(component.sourceRect, null);
    assert.equal(component.appearance.primitives[1].text, "Read the guide");
    assert.equal(component.appearance.background, "#123456");
    assert.equal(component.appearance.primitives[1].color, "#fedcba");
    assert.equal(
      result.value.source.displayUrl,
      "local://" + hash(bytes(html)),
    );
    assert.deepEqual(
      result.value.warnings.filter((w) => w.includes("PDF")),
      [
        "PDFはリンク先のファイル名による表示上の手掛かりです。リンク先のファイル・MIME型・内容は取得・検証していません。",
      ],
    );
    assert.doesNotMatch(
      JSON.stringify(result.value),
      /PRIVATE|example\.invalid|guide\.pdf|資料|download=|href=/,
    );
    assert.equal(analyzeStaticCode(html).candidates[0].kind, "navigation");
  }
});

test("unsupported destination or metadata hints preserve ordinary navigation", async () => {
  for (const href of [
    "",
    "#guide.pdf",
    "?file=guide.pdf",
    "guide.html?download=guide.pdf",
    "guide.html#guide.pdf",
    ".pdf",
    "/.PDF",
    "guide.pdf/",
    "guide.pdf/next",
    "guide.pdf;download",
    "guide.pdf.html",
    "guide.pdＦ",
    "guide%2epdf",
    "guide.p%64f",
    "folder%2fguide.pdf",
    "%2e%2e/guide.pdf",
    "%E8%B3%87%E6%96%99.pdf",
    "guide%.pdf",
    "javascript:guide.pdf",
    "data:application/pdf,guide.pdf",
    "blob:https://example.invalid/guide.pdf",
    "mailto:guide.pdf",
    "file:///tmp/guide.pdf",
    "ftp://example.invalid/guide.pdf",
    "//example.invalid/guide.pdf",
    "///example.invalid/guide.pdf",
    "https:guide.pdf",
    "https:/example.invalid/guide.pdf",
    "https:///example.invalid/guide.pdf",
    "https://user:password@example.invalid/guide.pdf",
    "https://@example.invalid/guide.pdf",
    "https://example.invalid:99999/guide.pdf",
    "https://[broken]/guide.pdf",
    "https://guide.pdf",
    "folder\\guide.pdf",
    "C:\\guide.pdf",
    "guid\te.pdf",
    "guid\ne.pdf",
    "guid&#0;e.pdf",
    "guid&#127;e.pdf",
    "guid\u0085e.pdf",
    "guid&#xfffd;e.pdf",
    " guide name.pdf ",
    "\u00a0guide.pdf",
    "guide<name.pdf",
    "guide{part}.pdf",
    "guide[part].pdf",
    "a".repeat(2045) + ".pdf",
  ]) {
    const html = anchor(
      href,
      "Read PDF",
      'download="guide.pdf" type="application/pdf"',
    );
    assert.deepEqual(pdfs(html), [], href);
    assert.equal(analyzeLocalCode(html).candidates[0].kind, "navigation", href);
    const result = await capture(html);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.value.components[0].canonicalType, "ab_nav");
    assert.equal(
      result.value.warnings.some((w) => w.includes("PDF")),
      false,
    );
  }
  for (const html of [
    '<a type="application/pdf" download="guide.pdf">Read PDF</a>',
    '<area href="guide.pdf" alt="Guide">',
    '<div href="guide.pdf">Read PDF</div>',
    anchor("guide.pdf", "", 'title="PRIVATE" aria-label="PRIVATE"'),
    anchor(
      "guide.pdf",
      '<img alt="PRIVATE" src="https://resource.invalid/image">',
    ),
    anchor("guide.pdf", '<input value="PRIVATE"><span hidden>PRIVATE</span>'),
  ])
    assert.deepEqual(pdfs(html), [], html);
});

test("new PDF semantics respect visibility inert ancestry namespace and existing owners", () => {
  for (const attrs of [
    "hidden",
    "inert",
    'aria-hidden="true"',
    'style="display:none"',
    'style="visibility:hidden"',
  ]) {
    assert.deepEqual(pdfs(anchor("guide.pdf", "Guide", attrs)), [], attrs);
    assert.deepEqual(
      pdfs(`<div ${attrs}>${anchor("guide.pdf")}</div>`),
      [],
      attrs,
    );
  }
  for (const [open, close] of [
    ["<template>", "</template>"],
    ["<noscript>", "</noscript>"],
    ["<object>", "</object>"],
    ["<iframe>", "</iframe>"],
    ["<svg>", "</svg>"],
    ["<svg><foreignObject>", "</foreignObject></svg>"],
    ['<math><annotation-xml encoding="text/html">', "</annotation-xml></math>"],
    ["<button>", "</button>"],
    ["<datalist>", "</datalist>"],
    ["<output>", "</output>"],
    ["<meter>", "</meter>"],
    ["<progress>", "</progress>"],
    ["<form>", "</form>"],
    ['<form role="search"><input type="search">', "</form>"],
    ["<canvas>", "</canvas>"],
    ["<details>", "</details>"],
    ["<dialog>", "</dialog>"],
  ])
    assert.deepEqual(
      pdfs("<body>" + open + anchor("guide.pdf") + close),
      [],
      open,
    );
  assert.equal(
    pdfs("<details open>" + anchor("guide.pdf") + "</details>").length,
    1,
  );
  assert.equal(
    pdfs("<dialog open>" + anchor("guide.pdf") + "</dialog>").length,
    1,
  );
  assert.deepEqual(
    pdfs(
      "<article><h2>" +
        anchor("guide.pdf") +
        '</h2><input type="button" value="Buy guide"></article>',
    ),
    [],
  );
  assert.deepEqual(
    analyzeLocalCode(
      "<article><h2>" +
        anchor("guide.pdf") +
        '</h2><input type="button" value="Buy guide"></article>',
    ).candidates.map((c) => c.kind),
    ["product", "purchase"],
  );
});

test("unresolved base URLs suppress relative hints without changing explicit HTTP PDF paths", () => {
  for (const value of [
    "https://example.invalid/",
    "file:///private/",
    "javascript:alert(1)",
    "",
    "../",
  ])
    for (const path of ["guide.pdf", "./guide.pdf", "/guide.pdf"])
      assert.deepEqual(
        pdfs(`<base href="${value}">` + anchor(path)),
        [],
        value + path,
      );
  assert.equal(pdfs('<base target="_blank">' + anchor("guide.pdf")).length, 1);
  assert.equal(
    pdfs(
      '<base href="file:///private/">' +
        anchor("https://example.invalid/guide.pdf"),
    ).length,
    1,
  );
  // A template's inert contents do not join the analyzed document tree.
  assert.equal(
    pdfs(
      '<template><base href="file:///private/"></template>' +
        anchor("guide.pdf"),
    ).length,
    1,
  );
});

test("PDF hints keep source ordering candidate budgets and the existing legal selection", async () => {
  const html =
    "<nav>" +
    anchor("guide.pdf").repeat(30) +
    "</nav>" +
    anchor("guide.pdf").repeat(30) +
    '<a href="#next">Next</a>';
  const analysis = analyzeLocalCode(html);
  assert.equal(analysis.candidateCount, 61);
  assert.equal(analysis.candidates.length, 25);
  for (const region of ["navigation", "content"])
    assert.equal(
      analysis.candidates.filter((c) => c.kind === "pdf" && c.region === region)
        .length,
      12,
    );
  assert.ok(
    analysis.candidates.every(
      (c, i, all) => !i || all[i - 1].sourceNode.order < c.sourceNode.order,
    ),
  );
  const result = await capture(html);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(
    result.value.components.map((c) => c.evidence),
    ["pdf", "pdf", "pdf", "pdf", "navigation"],
  );
  assert.deepEqual(
    result.value.components.slice(0, 4).map((c) => c.sourceNode),
    analysis.candidates.slice(0, 4).map((c) => c.sourceNode),
  );
  assert.equal((await verifyRaidBlueprint(result.value)).ok, true);
  const omitted = await capture(
    '<h1>A</h1><h2>B</h2><h3>C</h3><input type="search">' + anchor("guide.pdf"),
  );
  assert.equal(omitted.value.analysis.candidateCount, 5);
  assert.equal(
    omitted.value.components.some((c) => c.evidence === "pdf"),
    false,
  );
  assert.equal(
    omitted.value.warnings.some((w) => w.includes("PDF")),
    false,
  );
  for (const html of [
    " ".repeat(524289) + anchor("guide.pdf"),
    "<i></i>".repeat(20000) + anchor("guide.pdf"),
    "<div>".repeat(65) + anchor("guide.pdf"),
  ])
    assert.throws(() => analyzeLocalCode(html), /source-too-large/);
});

test("unaffected local ownership and public whole-capture baseline bytes remain identical", async () => {
  const cases = [
    [
      '<a href="manual.pdf">Read the guide</a>',
      null,
      null,
      "6e0198aa280418e5c323e88e32dfc6cd852241456eeebd60b7cb3beb99ab038d",
      "2869a468285d0236f9a7bfde28c03dd214cf4d37dde6c0d343e021f23b4a2c63",
    ],
    [
      '<a href="manual.html" download="manual.pdf" type="application/pdf">Read PDF</a>',
      "fed1c0d493f226a1bf81ded92bc63329d3a8a3317e7b5c5eaea24e6960a4f190",
      "56ad8f49aa7b4ed8293f8ae4cd4334bf3569a096c05e0ff2e1deb717eb5ec250",
      "2d59f8703e96f827c1f065fa01cd3408651fe59522078c6a44d3ae2c5aa2b13e",
      "50eebf5b70b824e3c887aded9f17eea893318272c763661275ac3502b4577eda",
    ],
    [
      '<form role="search">Find docs<input type="search"><a href="manual.pdf">Read</a></form>',
      "578fb0ff60abfc8c1d68d3f376cbb97b253a4a5a2276cf20825716db56b25b7c",
      "7bd68fbd423331abae5c8ccc0cc08a12c019b10e3ed3834754bea1095141b31b",
      "078f6afaabe3c435c45e8414a21c67a9d265fc4cf1d459813ba82da0bc67c641",
      "1cb6af4abe6ba777715addea66f72afe6e061ea188197b9ca2ff0be7a55f8e20",
    ],
    [
      '<article><h2><a href="manual.pdf">Manual</a></h2><input type="button" value="Buy manual"></article>',
      "eb1fb0bc8225205352397ab36aa3b8ac3854041f70bb312a91169a13548c6756",
      "5a56a1976f2a24b8ab19348bd24e072c159181a3eb615a7dbeffa524ed70b24a",
      "04b5d9f4c9b2742afe29b9e558645b2b4c0c4585a8f4f2aedbf14667e2247a8f",
      "1df3374eb1fbcb60d04ea519a7fa6ce171eb335a9f23345a8a926069a1f7f3b2",
    ],
    [
      '<h1>Shop</h1><a href="#guide.pdf">Guide</a><input type="search"><label><input type="checkbox">Updates</label><input type="submit" value="Buy paper">',
      "faefc30c164c650fecdfc0bd948d1a95c803f42ec676744e5172ba2697096c3a",
      "f2d03b2d4b302a219aaf2ab6d9582b0ed7bd6daa52dcdc578e1316fa66e56f9c",
      "ff5944d9f2f39f0949f8306d6323115eafe51ff7b36a3355c381a3aa16469bf8",
      "35b1a3395e5a20dd5913bf7e861934cad2a97d5c839dcefeb6d14029355249a6",
    ],
  ];
  for (const [
    html,
    localAnalysis,
    localCapture,
    publicAnalysis,
    publicCapture,
  ] of cases) {
    if (localAnalysis) {
      assert.equal(hash(JSON.stringify(analyzeLocalCode(html))), localAnalysis);
      assert.equal(hash(JSON.stringify(await capture(html))), localCapture);
    }
    assert.equal(hash(JSON.stringify(analyzeStaticCode(html))), publicAnalysis);
    assert.equal(
      hash(
        JSON.stringify(
          await reconstructStaticCode({
            html,
            sourceHash: hash(html),
            capturedAt,
            requestedUrl: "https://books.toscrape.com/",
          }),
        ),
      ),
      publicCapture,
    );
  }
});
