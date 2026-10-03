import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { analyzeLocalCode, analyzeStaticCode } from "../src/raid/code.js";
import { reconstructLocalCode } from "../src/raid/local-code.js";
import { verifyRaidBlueprint } from "../src/raid/blueprint.js";

const capturedAt = "2026-10-03T03:20:00.000Z";
const bytes = (text) => new TextEncoder().encode(text);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const checks = (source) =>
  analyzeLocalCode(source).candidates.filter((c) => c.kind === "checkbox");
const capture = (source) =>
  reconstructLocalCode({ html: bytes(source), capturedAt });

// Regression: deleting the local exact-ID association drops this real control.
// This uses the actual inert parser, analysis, mapper and blueprint verifier.
test("local sibling label[for] preserves the source caption as one canonical checkbox", async () => {
  const html =
    '<h1>Preferences</h1><input id="news" type="checkbox" value="PRIVATE VALUE" aria-label="SPOOFED NAME"><label for="news" class="option" style="color:#123456">Receive <span>updates &amp; news</span><span hidden>HIDDEN NAME</span><input type="hidden" value="SECRET"></label>';
  const candidates = checks(html);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].label, "Receive updates & news");
  assert.equal(candidates[0].style.color, "#123456");
  assert.deepEqual(candidates[0].sourceNode, {
    tag: "label",
    path: "document/html[0]/body[1]/label[2]",
    order: 8,
    group: 0,
    classes: ["option"],
  });
  const result = await capture(html);
  assert.equal(result.ok, true, result.error);
  const blueprint = result.value;
  assert.equal((await verifyRaidBlueprint(blueprint)).ok, true);
  assert.equal(blueprint.analysis.sourceHash, hash(bytes(html)));
  assert.equal(blueprint.source.kind, "local-file");
  assert.equal(blueprint.fidelity, "code-approximation");
  const checkbox = blueprint.components.find((c) => c.evidence === "checkbox");
  assert.equal(checkbox.canonicalType, "gov_check");
  assert.equal(checkbox.sourceRect, null);
  assert.deepEqual(checkbox.sourceNode, candidates[0].sourceNode);
  assert.equal(
    checkbox.appearance.primitives[1].text,
    "Receive updates & news",
  );
  assert.equal(checkbox.appearance.primitives[1].color, "#123456");
  assert.doesNotMatch(
    JSON.stringify(blueprint),
    /PRIVATE|SPOOFED|HIDDEN|SECRET|<label|for=|value=/,
  );
  assert.equal(
    analyzeStaticCode(html).candidates.some((c) => c.kind === "checkbox"),
    false,
    "public-source interpretation remains on its existing branch",
  );
});

test("exact local ID association accepts either order and does not become selector or ARIA matching", () => {
  for (const id of ["news", "Receive:news[1]", "夜&朝", "__proto__"]) {
    const escaped = id.replaceAll("&", "&amp;");
    const input = `<input id="${escaped}" type="checkbox">`;
    const label = `<label for="${escaped}">Visible label</label>`;
    assert.equal(checks(input + label)[0]?.label, "Visible label", id);
    assert.equal(checks(label + input)[0]?.label, "Visible label", id);
  }
  for (const source of [
    '<input id="news" type="checkbox"><label for="NEWS">Wrong case</label>',
    '<input id="news" type="checkbox"><label for=" news ">Whitespace</label>',
    '<input id="news" type="checkbox"><label for="#news">Fragment</label>',
    '<input id="news" type="checkbox"><label for="news other">Token list</label>',
    '<input id="bad id" type="checkbox"><label for="bad id">Invalid ID</label>',
    '<input id="news" type="checkbox"><label>No association</label>',
    '<input name="news" type="checkbox"><label for="news">Name is not ID</label>',
    '<input id="news" type="text"><label for="news">Text field</label>',
    '<input id="news" type="radio"><label for="news">Radio field</label>',
    '<select id="news"><option>SECRET</option></select><label for="news">Select field</label>',
    '<input id="news" type="checkbox"><select><option><label for="news">Select text</label></option></select>',
    '<div id="news" role="checkbox" aria-checked="true"></div><label for="news">Spoofed control</label>',
    '<input id="news" type="checkbox" aria-labelledby="caption"><span id="caption">ARIA name</span>',
    '<input id="news" type="checkbox" aria-label="ARIA name"><label for="news"></label>',
    '<input id="news" type="checkbox"><label for="news"><span hidden>Invisible</span><input value="SECRET"></label>',
  ])
    assert.deepEqual(checks(source), [], source);
});

test("local association never activates omitted, hidden, inert or foreign source subtrees", async () => {
  const input = '<input id="news" type="checkbox">';
  const label = '<label for="news">Visible label</label>';
  for (const wrapper of [
    ["<div hidden>", "</div>"],
    ['<div aria-hidden="true">', "</div>"],
    ['<div style="display:none">', "</div>"],
    ['<div style="visibility:hidden">', "</div>"],
    ["<div inert>", "</div>"],
    ["<template>", "</template>"],
    ["<script>", "</script>"],
    ["<noscript>", "</noscript>"],
    ["<iframe>", "</iframe>"],
    ["<object>", "</object>"],
    ["<textarea>", "</textarea>"],
    ["<datalist>", "</datalist>"],
    ["<svg><foreignObject>", "</foreignObject></svg>"],
    ['<math><annotation-xml encoding="text/html">', "</annotation-xml></math>"],
  ]) {
    for (const source of [
      wrapper[0] + input + wrapper[1] + label,
      input + wrapper[0] + label + wrapper[1],
    ]) {
      assert.deepEqual(checks("<body>" + source), [], source);
    }
  }
  for (const attr of [
    "hidden",
    "inert",
    'aria-hidden="true"',
    'style="display:none"',
  ]) {
    assert.deepEqual(
      checks(`<input id="news" type="checkbox" ${attr}>${label}`),
      [],
      attr,
    );
    assert.deepEqual(
      checks(`${input}<label for="news" ${attr}>Invisible</label>`),
      [],
      attr,
    );
  }
  assert.deepEqual(
    checks('<svg><input id="news" type="checkbox"/></svg>' + label),
    [],
  );
  const source =
    input + '<label for="news"><span inert>INERT</span>Visible</label>';
  assert.equal(checks(source)[0]?.label, "Visible");
  assert.equal(
    (await capture('<input id="news" type="hidden">' + label)).code,
    "no-playable-elements",
  );
});

test("ambiguous IDs and conflicting label structures fail closed without alternate-target fallback", () => {
  const input = '<input id="news" type="checkbox">';
  const label = '<label for="news">Visible label</label>';
  for (const duplicate of [
    input,
    '<div id="news"></div>',
    '<div id="news" hidden></div>',
    '<svg id="news"></svg>',
    '<script id="news"></script>',
  ]) {
    assert.deepEqual(checks(duplicate + input + label), [], duplicate);
    assert.deepEqual(checks(input + label + duplicate), [], duplicate);
  }
  for (const source of [
    '<label for="missing">Wrong target<input type="checkbox"></label>',
    '<input id="news" type="text"><label for="news">Wrong target<input type="checkbox"></label>',
    input +
      '<label for="news">Conflicting control<input type="checkbox"></label>',
    '<label for="news">Ambiguous<input id="news" type="checkbox"><input type="checkbox"></label>',
    input + '<label for="news"><label>Nested label</label></label>',
  ])
    assert.deepEqual(checks(source), [], source);
  // A template has a separate tree. Its ID is neither an association target
  // nor an ambiguous duplicate of the visible document's control.
  assert.equal(
    checks("<template>" + input + "</template>" + input + label).length,
    1,
  );
});

test("one input produces one candidate with stable nested-label precedence", () => {
  const input = '<input id="news" type="checkbox">';
  const first = '<label for="news">First label</label>';
  const second = '<label for="news">Second label</label>';
  assert.deepEqual(
    checks(first + input + second).map((c) => c.label),
    ["First label"],
  );
  const nested = '<label class="option">Nested label' + input + "</label>";
  for (const source of [first + nested, nested + first]) {
    assert.deepEqual(
      checks(source).map((c) => c.label),
      ["Nested label"],
    );
  }
  assert.deepEqual(
    checks(
      '<label for="news"><span hidden>Invisible</span></label>' +
        input +
        second,
    ).map((c) => c.label),
    ["Second label"],
  );
});

test("existing nested local labels keep exact analysis and sealed result bytes", async () => {
  const expected = [
    [
      '<label class="option">Keep updates <input type="checkbox" value="secret"></label>',
      "37001e84a5ef38a64f267fec7338f14d6cdae8c1864770c2634a2a796d097309",
    ],
    [
      '<label for="updates" class="option">Keep updates <input id="updates" type="checkbox" value="secret"></label>',
      "c7d2e51860bed1b06d81f002844d5976478532da6f3a934e8717657214fdf085",
    ],
  ];
  for (const [label, resultHash] of expected) {
    const source = "<h1>Preferences</h1>" + label;
    assert.equal(
      hash(JSON.stringify(analyzeLocalCode(source))),
      "241beae43598f5b964b452f75014d4b6d7a7fbf45343970a27de5dbed9cdbfc4",
    );
    assert.equal(hash(JSON.stringify(await capture(source))), resultHash);
  }
});

test("local associations retain existing source and per-kind candidate ceilings", () => {
  const pair = (i) =>
    `<input id="n${i}" type="checkbox"><label for="n${i}">Item ${i}</label>`;
  const a = analyzeLocalCode(
    Array.from({ length: 300 }, (_, i) => pair(i)).join(""),
  );
  assert.equal(a.candidateCount, 300);
  assert.equal(a.candidates.length, 12);
  assert.deepEqual(
    a.candidates.map((c) => c.label),
    Array.from({ length: 12 }, (_, i) => `Item ${i}`),
  );
  assert.throws(
    () => analyzeLocalCode("<div>".repeat(65) + pair(1) + "</div>".repeat(65)),
    /source-too-large/,
  );
  assert.throws(
    () => analyzeLocalCode("<i></i>".repeat(20000) + pair(1)),
    /source-too-large/,
  );
});
