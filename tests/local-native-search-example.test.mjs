import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parse, serialize } from "parse5";
import { analyzeLocalCode } from "../src/raid/code.js";
import { reconstructLocalCode, LOCAL_CAPTURE_LIMITS } from "../src/raid/local-code.js";
import { verifyRaidBlueprint } from "../src/raid/blueprint.js";

const location = new URL("../examples/local-raid/native-search.html", import.meta.url);
const capturedAt = "2026-10-03T18:26:00.000Z";
const elements = node => [...(node.tagName ? [node] : []), ...(node.childNodes ?? []).flatMap(elements)];
const read = () => readFile(location);
const text = bytes => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
async function capture(html) {
  const result = await reconstructLocalCode({ html, capturedAt });
  assert.equal(result.ok, true, result.error);
  assert.equal((await verifyRaidBlueprint(result.value)).ok, true);
  return result.value;
}

test("native search example is one bounded original HTML file without active external resources", async () => {
  const bytes = await read(), html = text(bytes), nodes = elements(parse(html));
  assert.ok(bytes.length < LOCAL_CAPTURE_LIMITS.htmlBytes);
  const allowed = new Set(["html", "head", "meta", "title", "style", "body", "h1", "p", "search", "label", "input", "a", "footer"]);
  for (const node of nodes) {
    assert.ok(allowed.has(node.tagName), node.tagName);
    for (const { name, value } of node.attrs) {
      assert.doesNotMatch(name, /^on|^(src|srcdoc|action|formaction|value|defaultvalue)$/i);
      if (name === "href") assert.equal(value, "#notes");
    }
  }
  assert.doesNotMatch(html, /https?:|@import|url\s*\(/i);
  assert.equal(nodes.filter(n => n.tagName === "style").length, 1);
  assert.equal(nodes.filter(n => n.tagName === "search").length, 1);
  assert.equal(nodes.filter(n => n.tagName === "input").length, 4);
});

test("native search example gives one coalesced region and one separate generic search within five parts", async () => {
  const bytes = await read(), analysis = analyzeLocalCode(text(bytes)), blueprint = await capture(bytes);
  assert.deepEqual(analysis.candidates.map(c => [c.kind, c.label, c.sourceNode.tag]), [
    ["heading", "こもれび資料室", "h1"], ["search", "検索", "search"],
    ["search", "検索", "input"], ["checkbox", "紙の資料だけ", "label"],
    ["navigation", "この見本の読み方", "a"],
  ]);
  assert.equal(analysis.candidateCount, 5);
  assert.deepEqual(analysis.css, { rules: 6, limited: false });
  assert.deepEqual(blueprint.components.map(c => c.canonicalType), ["ab_heading", "go_search", "go_search", "gov_check", "ab_nav"]);
  assert.equal(blueprint.analysis.selectedCount, 5);
  assert.equal(blueprint.source.kind, "local-file");
  assert.equal(blueprint.source.displayUrl, "local://" + sha(bytes));
  assert.ok(blueprint.components.every(c => c.sourceRect === null));
  assert.deepEqual(blueprint.components.filter(c => c.evidence === "search").map(c => c.appearance.primitives[0].fill), ["#e5eee5", "#f2eaf3"]);
  assert.doesNotMatch(JSON.stringify(blueprint), /紙のノート|つくり方|小さな本棚|native-search\.html|<input/);
});

test("adding private-looking values and placeholders changes provenance but not the example's recovered appearance", async () => {
  const bytes = await read(), tree = parse(text(bytes));
  for (const node of elements(tree).filter(n => n.tagName === "input")) {
    node.attrs = node.attrs.filter(a => a.name !== "placeholder");
    node.attrs.push({ name: "value", value: "PRIVATE INPUT" }, { name: "placeholder", value: "PRIVATE PROMPT" }, { name: "aria-label", value: "PRIVATE ARIA" });
  }
  const original = await capture(bytes), changed = await capture(new TextEncoder().encode(serialize(tree)));
  assert.notEqual(changed.captureId, original.captureId);
  const appearance = b => b.components.map(c => ({ type: c.canonicalType, source: c.sourceNode, appearance: c.appearance }));
  assert.deepEqual(appearance(changed), appearance(original));
  assert.doesNotMatch(JSON.stringify(changed), /PRIVATE INPUT|PRIVATE PROMPT|PRIVATE ARIA/);
});
