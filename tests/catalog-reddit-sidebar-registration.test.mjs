import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import D from "../src/data.js";
import R from "../src/run.js";
import C from "../src/document.js";
import V from "../src/components.js";
import { SITE_TEMPLATES } from "../src/catalog/index.js";
import { REDDIT_SIDEBAR_TEMPLATES } from "../src/catalog/reddit-sidebar-templates.js";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const lesson = REDDIT_SIDEBAR_TEMPLATES[0];

test("player-only lesson appends without changing any published template opponent part or preset prefix", () => {
  assert.equal(SITE_TEMPLATES.length, 29);
  assert.strictEqual(SITE_TEMPLATES[28], lesson);
  assert.equal(SITE_TEMPLATES.filter(t => t.id === lesson.id).length, 1);
  // Exact baseline data from published 61ec5121/frozen1758, no metadata normalization.
  assert.equal(hash(SITE_TEMPLATES.slice(0, 28)), "03f4cec1806647e5da6335afd5b24a4e9e526e60db62e4c3c1164ca169170fa6");
  assert.equal(R.labEnemies().length, 42);
  assert.equal(hash(R.labEnemies()), "fba9a675cc637b6e460a14e0a5f032f545b408bb50633f817878b100f3e6ebb0");
  assert.equal(hash(D.PARTS), "a949b4d8aa8f8b8b55f60fb827bb8e5c21f62219fccbc6da05fdd570189f5fb6");
  const entries = Object.entries(D.PRESETS);
  assert.equal(entries.length, 33); assert.equal(entries[32][0], lesson.id);
  assert.equal(hash(Object.fromEntries(entries.slice(0, 32))), "5e4c23560383734a8aab26f94202f7377ee3cf3f88ee9207cd9b22e8cc05f12a");
  assert.equal(R.labEnemies().some(e => e.id === lesson.id), false);
  assert.equal(Object.values(D.PARTS).filter(p => p.status === "experimental").length, 28);
});

test("registered lesson loads only the laboratory player and round-trips its page without replacing an opponent", () => {
  const run = R.newRun("lab", lesson.id);
  run.stage = 41;
  assert.equal(run.page.templateId, lesson.id); assert.equal(run.page.theme, "reddit");
  assert.equal(run.page.name, lesson.pageName); assert.deepEqual(run.admin, []);
  assert.deepEqual(run.owned.map(p => [p.type, p.x, p.y, p.w, p.h]), lesson.layout.map(p => p.slice(0, 5)));
  const link = run.owned.find(p => p.type === "ab_link"), before = JSON.stringify(run.owned);
  assert.equal(R.move(run, link.id, 692, 492), true);
  assert.equal(R.move(run, link.id, 100, 492), true); assert.equal(JSON.stringify(run.owned), before);
  const restored = JSON.parse(JSON.stringify(run));
  assert.equal(R.validateRun(restored), true); assert.deepEqual(R.pageDecor(restored), lesson.decor);
  assert.equal(R.opponent(restored).id, "site_pinterest");
  assert.ok(restored.owned.every(p => C.canPlace(restored.owned, p, p.x, p.y, p.w, p.h)));
  const campaign = R.newRun("campaign", lesson.id);
  assert.deepEqual(campaign.owned, []); assert.equal(campaign.page.templateId, undefined);
});

test("actual lesson rendering uses registered inert chrome and unchanged native controls", t => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "document");
  const document = { createElement(tag) { return new ElementAdapter(this, tag); } };
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  t.after(() => { if (prior) Object.defineProperty(globalThis, "document", prior); else delete globalThis.document; });
  const host = document.createElement("div"), run = R.newRun("lab", lesson.id);
  V.render(host, run.owned, { theme: run.page.theme, decor: R.pageDecor(run) });
  assert.equal(host.querySelectorAll(".web-node").length, 8);
  assert.ok(host.querySelector(".reddit-sidebar-lesson"));
  for (const [kind] of lesson.decor.filter(([kind]) => kind.startsWith("reddit-sidebar-"))) {
    const node = host.querySelector("." + kind); assert.ok(node, kind);
    assert.equal(node.querySelectorAll("button,input,select,a,textarea,iframe,script").length, 0, kind);
  }
  for (const part of run.owned) assert.equal(V.markup(part, { theme: "reddit" }), V.markup(part, { theme: "mixed" }));
  assert.match(readFileSync(new URL("../src/styles/catalog.css", import.meta.url), "utf8"), /@import ["']\.\.\/catalog\/reddit-sidebar\.css["'];/);
});
