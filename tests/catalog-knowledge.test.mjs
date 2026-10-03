import test from "node:test";
import assert from "node:assert/strict";
import D from "../src/data.js";
import C from "../src/document.js";
import E from "../src/engine.js";
import V from "../src/components.js";
import { readFileSync } from "node:fs";
import { SITE_TEMPLATES } from "../src/catalog/index.js";

const ids = ["wk_article", "wk_reference", "wk_infobox", "gh_diff", "gh_commit", "gh_checks"];

test("knowledge and repository parts are experimental, priced, structurally different roles", () => {
  for (const id of ids) {
    assert.ok(D.PARTS[id], `${id} is defined`);
    assert.equal(D.PARTS[id].status, "experimental");
    assert.ok(D.PARTS[id].price > 0 && D.PARTS[id].load > 0);
  }
  assert.equal(D.PARTS.wk_infobox.container, true);
  assert.equal(D.PARTS.gh_diff.kind, "attack");
  assert.equal(D.PARTS.gh_commit.kind, "echo");
  assert.equal(D.PARTS.gh_checks.kind, "shield");
  assert.ok(D.PARTS.gh_diff.value > D.PARTS.gov_pdf.value);
  assert.ok(D.PARTS.gh_diff.load > D.PARTS.gov_pdf.load);
});

test("Wikipedia and GitHub-inspired pages stay recognizable, fictional and legally placed", () => {
  for (const [id, name, faction] of [["site_wikipedia", /Wikipedia風/, "wiki"], ["site_github", /GitHub風/, "forge"]]) {
    const template = SITE_TEMPLATES.find((t) => t.id === id);
    assert.ok(template, id);
    assert.match(template.name, name);
    assert.equal(template.faction, faction);
    assert.equal(template.status, "experimental");
    assert.ok(D.PRESETS[id]);
    assert.match(template.inspiredBy, /無関係/);
    const board = template.layout.map(([type, x, y, w, h], i) => C.makeItem(type, `${id}-${i}`, x, y, w, h));
    for (const part of board) assert.ok(C.canPlace(board, part, part.x, part.y), `${id}:${part.type}`);
    for (const [, x, y, w, h] of template.decor) assert.ok(x >= 0 && y >= 0 && x + w <= 960 && y + h <= 680);
    assert.ok(template.loot.every((type) => board.some((p) => p.type === type)));
    assert.ok(template.references.length);
  }
});

test("infobox can hold a real small text UI without inventing a layout bonus", () => {
  assert.ok(D.PARTS.wk_infobox);
  const box = C.makeItem("wk_infobox", "box", 32, 32, 232, 252);
  const link = C.makeItem("ab_link", "link", 44, 128, 192, 32);
  assert.equal(C.canContain(box, link), true);
  assert.equal(C.analyze([box, link]).parents.link, "box");
  assert.match(V.markup(box), /container-slot/);
});

test("infobox title style reserves the single-line header used by fixed containment padding", () => {
  // Source-level guard while visual browser verification is unavailable, not a pixel-layout claim.
  const css = readFileSync(new URL("../src/styles/catalog.css", import.meta.url), "utf8");
  const header = css.match(/\.native-wiki-infobox h3\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(header, /white-space:\s*nowrap/);
  assert.match(header, /overflow:\s*hidden/);
  assert.match(header, /text-overflow:\s*ellipsis/);
  const box = C.makeItem("wk_infobox", "box", 32, 32, 200, 180);
  box.label = "長い見出し".repeat(16);
  assert.match(V.markup(box), /長い見出し/);
  assert.equal(C.inner(box).y, 116);
});

test("reference and commit controllers reuse natural-payload replay without generating real operations", () => {
  assert.ok(D.PARTS.wk_article && D.PARTS.gh_diff);
  const board = [
    C.makeItem("wk_article", "article", 24, 24, 500, 140),
    C.makeItem("wk_reference", "reference", 24, 172, 500, 52),
    C.makeItem("gh_diff", "diff", 24, 280, 600, 172),
    C.makeItem("gh_commit", "commit", 24, 460, 600, 44),
    C.makeItem("gh_checks", "checks", 656, 280, 280, 128),
  ];
  const battle = new E.Battle(board, [C.makeItem("ab_link", "enemy", 24, 24)], { playerHp: 10000, enemyHp: 10000 });
  const events = [];
  for (let i = 0; i < 400; i++) events.push(...battle.step(.05));
  assert.ok(events.some((e) => e.kind === "echo" && e.id === "reference" && e.to === "article"));
  assert.ok(events.some((e) => e.kind === "echo" && e.id === "commit" && e.to === "diff"));
  assert.ok(events.some((e) => e.kind === "shield" && e.id === "checks"));
  assert.equal(battle.player.parts.find((p) => p.id === "diff").pierce, 0);
  for (const id of ids) {
    const part = C.makeItem(id, id, 0, 0);
    part.label = '<script>alert("x")</script>';
    const html = V.markup(part);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script|<iframe|<img[^>]+https?:|onclick=|action="https?:/i);
  }
  assert.match(V.markup(C.makeItem("wk_reference", "r", 0, 0)), /<ol/);
  assert.match(V.markup(C.makeItem("gh_diff", "d", 0, 0)), /diff-line/);
  assert.match(V.header("wiki"), /Wikipedia風/);
  assert.match(V.header("forge"), /GitHub風/);
});
