import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parse } from "parse5";
import { analyzeLocalCode } from "../src/raid/code.js";
import { safeDeclarations } from "../src/raid/code-css.js";
import {
  LOCAL_CAPTURE_LIMITS,
  reconstructLocalCode,
} from "../src/raid/local-code.js";
import { verifyRaidBlueprint } from "../src/raid/blueprint.js";

const directory = new URL("../examples/local-raid/", import.meta.url);
const capturedAt = "2026-10-03T14:00:00.000Z";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const decode = (bytes) =>
  new TextDecoder("utf-8", { fatal: true }).decode(bytes);
async function source() {
  const html = new Uint8Array(
    await readFile(new URL("example.html", directory)),
  );
  const css = new Uint8Array(await readFile(new URL("example.css", directory)));
  return { html, css, htmlText: decode(html), cssText: decode(css) };
}
function request(files, styled = true) {
  return {
    html: files.html,
    capturedAt,
    ...(styled
      ? { stylesheet: { name: "example.css", bytes: files.css } }
      : {}),
  };
}
async function capture(files, styled = true) {
  const result = await reconstructLocalCode(request(files, styled));
  assert.equal(result.ok, true, result.error);
  const verified = await verifyRaidBlueprint(result.value);
  assert.equal(verified.ok, true, verified.error);
  return result.value;
}
function elements(node) {
  return [
    ...(node.tagName ? [node] : []),
    ...(node.childNodes ?? []).flatMap(elements),
  ];
}
const attr = (node, key) => node.attrs.find((a) => a.name === key)?.value;
const caption = (component) =>
  component.appearance.primitives.find((p) => p.kind === "text").text;
const expected = [
  ["heading", "ab_heading", "こもれび文具室"],
  ["navigation", "ab_nav", "紙のたより"],
  ["navigation", "ab_nav", "この見本について"],
  ["search", "go_search", "文具を探す 検索（見本）"],
  ["checkbox", "gov_check", "紙の手ざわりを楽しむ"],
  ["purchase", "am_buy", "便せんをカートに追加（見本）"],
];

test("local example is small UTF-8 source with one exact CSS link and no active external resources", async () => {
  const files = await source();
  assert.ok(files.html.length < LOCAL_CAPTURE_LIMITS.htmlBytes);
  assert.ok(files.css.length < LOCAL_CAPTURE_LIMITS.cssBytes);
  assert.match(files.htmlText, /^<!doctype html>/i);
  const nodes = elements(parse(files.htmlText, { scriptingEnabled: false }));
  const allowedTags = new Set([
    "html",
    "head",
    "meta",
    "title",
    "link",
    "body",
    "header",
    "h1",
    "p",
    "nav",
    "a",
    "main",
    "section",
    "form",
    "label",
    "input",
    "button",
    "footer",
  ]);
  const allowedAttributes = new Set([
    "lang",
    "charset",
    "rel",
    "href",
    "class",
    "id",
    "role",
    "method",
    "for",
    "type",
    "placeholder",
  ]);
  for (const node of nodes) {
    assert.ok(allowedTags.has(node.tagName), node.tagName);
    for (const attribute of node.attrs)
      assert.ok(allowedAttributes.has(attribute.name), attribute.name);
  }
  assert.equal(
    attr(
      nodes.find((n) => n.tagName === "html"),
      "lang",
    ),
    "ja",
  );
  assert.equal(
    attr(
      nodes.find((n) => n.tagName === "meta"),
      "charset",
    ),
    "UTF-8",
  );
  const links = nodes.filter((n) => n.tagName === "link");
  assert.equal(links.length, 1);
  assert.equal(attr(links[0], "rel"), "stylesheet");
  assert.equal(attr(links[0], "href"), "./example.css");
  const ids = nodes.map((n) => attr(n, "id")).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  const anchors = nodes.filter((n) => n.tagName === "a");
  assert.equal(anchors.length, 2);
  for (const anchor of anchors) {
    const href = attr(anchor, "href");
    assert.match(href, /^#[a-z][a-z-]*$/);
    assert.ok(
      ids.includes(href.slice(1)),
      "fragment resolves inside this page",
    );
  }
  const forms = nodes.filter((n) => n.tagName === "form");
  assert.equal(forms.length, 1);
  assert.equal(attr(forms[0], "method"), "dialog");
  for (const button of nodes.filter((n) => n.tagName === "button"))
    assert.equal(attr(button, "type"), "button");
  assert.deepEqual(
    nodes.filter((n) => n.tagName === "input").map((n) => attr(n, "type")),
    ["search", "checkbox"],
  );
  const checkbox = nodes.find((n) => attr(n, "id") === "paper-texture");
  const label = nodes.find((n) => attr(n, "for") === "paper-texture");
  assert.equal(checkbox.tagName, "input");
  assert.equal(label.tagName, "label");
  assert.equal(checkbox.parentNode, label.parentNode, "explicit sibling label");
  assert.ok(!elements(label).includes(checkbox), "not a wrapped-label example");
  assert.doesNotMatch(
    files.htmlText,
    /https?:|mailto:|tel:|javascript:|data:/i,
  );
});

test("every example CSS rule and declaration stays within the existing safe subset", async () => {
  const files = await source();
  assert.doesNotMatch(files.cssText, /@|url\s*\(|expression|javascript|\\/i);
  const blocks = [...files.cssText.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  assert.ok(blocks.length > 0);
  assert.equal(files.cssText.replace(/[^{}]+\{[^{}]*\}/g, "").trim(), "");
  for (const [, , body] of blocks) {
    for (const declaration of body
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean))
      assert.ok(Object.keys(safeDeclarations(declaration)).length, declaration);
  }
  const analysis = analyzeLocalCode(files.htmlText, {
    name: "example.css",
    css: files.cssText,
  });
  assert.equal(
    analysis.css.rules,
    blocks.length,
    "all simple selectors accepted",
  );
  assert.equal(analysis.css.limited, false);
  assert.equal(analysis.candidateCount, 6);
  assert.deepEqual(
    analysis.candidates.map((c) => [c.kind, c.label]),
    expected.map(([kind, , label]) => [kind, label]),
  );
});

test("the real local example reconstructs all six advertised parts in verified synthesized geometry", async (t) => {
  t.mock.method(globalThis, "fetch", () =>
    assert.fail("local source must not fetch"),
  );
  const blueprint = await capture(await source());
  assert.equal(blueprint.source.name, "こもれび文具室 | ローカルレイド見本");
  assert.equal(blueprint.source.kind, "local-file");
  assert.equal(blueprint.fidelity, "code-approximation");
  assert.equal(blueprint.extractorVersion, "code-v1");
  assert.equal(blueprint.mapperVersion, "canonical-v1");
  assert.deepEqual(blueprint.viewport, { width: 960, height: 680 });
  assert.equal(blueprint.analysis.layout, "inferred-flow");
  assert.equal(blueprint.analysis.confidence, "low");
  assert.equal(blueprint.analysis.candidateCount, 6);
  assert.equal(blueprint.analysis.selectedCount, 6);
  assert.equal(blueprint.background, "#f4f1e7");
  assert.deepEqual(
    blueprint.components.map((c) => [c.evidence, c.canonicalType, caption(c)]),
    expected,
  );
  for (const [index, component] of blueprint.components.entries()) {
    assert.equal(component.sourceRect, null);
    assert.equal(
      component.sourceNode.group,
      0,
      "no product layout suppresses other controls",
    );
    assert.deepEqual(component.combatRect, {
      x: 28 + (index % 2) * 472,
      y: 124 + Math.floor(index / 2) * 86,
      w: 432,
      h: index === 0 ? 52 : 44,
    });
  }
  const checkbox = blueprint.components.find((c) => c.evidence === "checkbox");
  assert.equal(checkbox.sourceNode.tag, "label");
  assert.deepEqual(checkbox.sourceNode.classes, ["check-caption"]);
  assert.equal(checkbox.appearance.background, "#e4eee2");
  const purchase = blueprint.components.find((c) => c.evidence === "purchase");
  assert.equal(purchase.appearance.background, "#2d604c");
  assert.equal(purchase.appearance.primitives[1].color, "#ffffff");
  assert.equal(purchase.appearance.primitives[1].weight, "bold");
  assert.equal(purchase.appearance.primitives[0].radius, 8);
});

test("example provenance hashes actual selected bytes without persisting filenames or raw source", async () => {
  const files = await source();
  const styled = await capture(files);
  assert.equal(styled.analysis.sourceHash, hash(files.html));
  assert.equal(styled.source.displayUrl, "local://" + hash(files.html));
  assert.deepEqual(styled.analysis.css.stylesheetHashes, [hash(files.css)]);
  assert.deepEqual(
    await capture(files),
    styled,
    "same bytes and timestamp seal deterministically",
  );
  assert.doesNotMatch(
    JSON.stringify(styled),
    /example\.html|example\.css|examples\/local-raid|<!doctype|<form|paper-texture/,
  );
  const plain = await capture(files, false);
  assert.deepEqual(
    plain.components.map((c) => [c.evidence, c.canonicalType, caption(c)]),
    expected,
  );
  assert.equal(plain.analysis.sourceHash, styled.analysis.sourceHash);
  assert.deepEqual(plain.analysis.css.stylesheetHashes, []);
  assert.notEqual(plain.captureId, styled.captureId);
  assert.notEqual(
    plain.components[5].appearanceId,
    styled.components[5].appearanceId,
  );
  const tampered = structuredClone(styled);
  tampered.components[4].appearance.primitives[1].text = "変更された見本";
  assert.equal((await verifyRaidBlueprint(tampered)).ok, false);
});
