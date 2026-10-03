import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "parse5";
import { analyzeLocalCode } from "../src/raid/code.js";
import { reconstructLocalCode, LOCAL_CAPTURE_LIMITS } from "../src/raid/local-code.js";
import { verifyRaidBlueprint } from "../src/raid/blueprint.js";
const file = new URL("../examples/local-raid/pdf-link-hints.html", import.meta.url);
const elements = node => [...(node.tagName ? [node] : []), ...(node.childNodes ?? []).flatMap(elements)];
const caption = component => component.appearance.primitives.find(p => p.kind === "text")?.text;

test("PDF-link example is one bounded static HTML file with original local-only references", async () => {
  const bytes = await readFile(file), html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  assert.ok(bytes.length < LOCAL_CAPTURE_LIMITS.htmlBytes);
  const allowed = new Set(["html", "head", "meta", "title", "style", "body", "h1", "p", "a", "footer"]);
  const hrefs = [];
  for (const node of elements(parse(html))) {
    assert.ok(allowed.has(node.tagName), node.tagName);
    for (const { name, value } of node.attrs) {
      assert.doesNotMatch(name, /^on|^(src|srcdoc|action|formaction)$/i);
      if (name === "href") hrefs.push(value);
    }
  }
  assert.deepEqual(hrefs, ["manual.pdf?view=sample#page=1", "資料.PDF", "?file=manual.pdf", "#notes"]);
  assert.doesNotMatch(html, /https?:|@import|url\s*\(/i);
  assert.match(html, /PDF本体は同梱していません/);
});

test("PDF-link example distinguishes literal path hints from query-only navigation without storing destinations", async () => {
  const bytes = await readFile(file), html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const analysis = analyzeLocalCode(html);
  assert.deepEqual(analysis.candidates.map(c => [c.kind, c.label]), [
    ["heading", "こもれび資料室"], ["pdf", "紙の手引き"], ["pdf", "日本語名の資料"],
    ["navigation", "クエリーだけの例"], ["navigation", "この見本について"],
  ]);
  assert.equal(analysis.candidateCount, 5); assert.deepEqual(analysis.css, { rules: 5, limited: false });
  const result = await reconstructLocalCode({ html: bytes, capturedAt: "2026-10-03T20:05:00.000Z" });
  assert.equal(result.ok, true, result.error); const b = result.value;
  assert.equal((await verifyRaidBlueprint(b)).ok, true);
  assert.deepEqual(b.components.map(c => c.canonicalType), ["ab_heading", "gov_pdf", "gov_pdf", "ab_nav", "ab_nav"]);
  assert.deepEqual(b.components.map(caption), ["こもれび資料室", "紙の手引き", "日本語名の資料", "クエリーだけの例", "この見本について"]);
  assert.equal(b.source.kind, "local-file"); assert.equal(b.analysis.selectedCount, 5);
  assert.ok(b.components.every(c => c.sourceRect === null));
  assert.deepEqual(b.components.filter(c => c.evidence === "pdf").map(c => c.appearance.primitives[0].fill), ["#e8f1ef", "#f4eaf0"]);
  assert.doesNotMatch(JSON.stringify(b), /manual\.pdf|資料\.PDF|view=sample|page=1|pdf-link-hints\.html/);
  assert.ok(b.warnings.some(w => /PDF/.test(w) && /未確認|確認していません|確認しません|検証していません/.test(w)), "advertised PDF is not represented as fetched/verified content");
});
