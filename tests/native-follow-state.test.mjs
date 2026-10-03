import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import C from "../src/document.js";
import Editor from "../src/editor.js";
import E from "../src/engine.js";
import V from "../src/components.js";
import Effects from "../src/effects.js";
import { previewCatalogueAction } from "../src/catalog/preview.js";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";

// Production renderer/editor patch, application preview handler and engine fire
// events. This DOM adapter does not establish browser pixels or accessibility.
// Leaving the battle glyph at ＋, toggling on repeated fires, or replacing the
// native button/label children must fail these regressions.
const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const start = source.indexOf("function previewAction(e: MouseEvent)");
const end = source.indexOf("\n/* ---------- Events ---------- */", start);
assert.ok(start >= 0 && end > start);
const handlerCode = transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code;

function fixture(t, label = "夜の読書会をフォロー", reduced = false) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const document = {
    createElement(tag) { return new ElementAdapter(this, tag); },
    querySelector(selector) { return selector === "#effect-layer" ? layer : null; },
  };
  const layer = document.createElement("div");
  const previous = new Map(["document", "matchMedia"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  Object.defineProperty(globalThis, "matchMedia", { configurable: true, value: () => ({ matches: reduced }) });
  t.after(() => {
    for (const [key, descriptor] of previous)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  });
  const item = C.makeItem("tw_follow", "follow", 24, 24);
  assert.equal(Editor.patchItem([item], item.id, { label }), true, "use the editor's accepted label patch");
  const node = V.create(item), button = node.querySelector("button"), fx = new Effects();
  const paper = document.createElement("div");
  paper.className = "browser-paper";
  paper.append(node);
  button.disabled = false;
  fx.part = (_side, id) => id === item.id ? node : null;
  const click = ({ preview = true, battle = null, target = button } = {}) => {
    const handler = new Function("Element", "preview", "battle", "storyActive", "storySession", "fx", "previewCatalogueAction", `${handlerCode}; return previewAction;`)(
      ElementAdapter, preview, battle, false, null, fx, previewCatalogueAction,
    );
    handler({ target, preventDefault() { throw new Error("native Follow button must not navigate"); } });
  };
  return { document, item, node, button, fx, click };
}

for (const reduced of [false, true]) {
  test(`real Follow fire agrees with its pressed state and preview glyph (reduced motion ${reduced})`, t => {
    const f = fixture(t, "夜の読書会をフォロー", reduced);
    const saved = structuredClone(f.item), children = [...f.button.children], glyph = f.button.querySelector("b"), label = f.button.querySelector("span");
    const battle = new E.Battle([f.item], [C.makeItem("ab_link", "enemy", 24, 24)], { playerHp: 10000, enemyHp: 10000 });
    let fires = 0;
    for (let tick = 0; tick < 240; tick++) {
      for (const event of battle.step(.05)) {
        if (event.kind !== "fire" || event.type !== "tw_follow") continue;
        fires++;
        const snapshot = () => structuredClone({ ticks: battle.ticks, elapsed: battle.elapsed, player: battle.player, enemy: battle.enemy, metrics: battle.metrics, states: battle.states });
        const before = snapshot();
        f.fx.emit(event, battle);
        assert.equal(f.button.getAttribute("aria-pressed"), "true");
        assert.equal(glyph.textContent, "✓", "battle Follow must show the same followed glyph as local preview");
        assert.equal(f.button.getAttribute("title"), "フォロー中・常連を呼び戻しました");
        f.fx.emit(event, battle);
        t.mock.timers.tick(1000);
        assert.equal(glyph.textContent, "✓", "repeated battle feedback remains one-way after timers");
        assert.deepEqual(f.button.children, children);
        assert.equal(label.textContent, f.item.label);
        assert.deepEqual(snapshot(), before, "presentation cannot change combat clocks, resources or results");
      }
    }
    assert.ok(fires >= 2, "observe repeated real Follow activations");
    f.click({ target: glyph });
    assert.equal(f.button.getAttribute("aria-pressed"), "false");
    assert.equal(glyph.textContent, "＋");
    f.click({ target: label });
    assert.equal(f.button.getAttribute("aria-pressed"), "true");
    assert.equal(glyph.textContent, "✓");
    assert.deepEqual(f.item, saved);
  });
}

for (const label of ["", "フォロー中", "  改行\n会員  ", '<img src=x onerror="bad()"> & 読書会', "長い名前".repeat(20)]) {
  test(`Follow preview keeps accepted authored label and native children ${JSON.stringify(label)}`, async t => {
    const f = fixture(t, label), saved = structuredClone(f.item), children = [...f.button.children];
    const glyph = f.button.querySelector("b"), copy = f.button.querySelector("span");
    let handled = 0;
    copy.addEventListener("custom-native-event", () => { handled++; });
    assert.equal(f.button.querySelector("img"), null);
    assert.equal(f.button.getAttribute("type"), "button");
    assert.equal(f.button.getAttribute("data-ui"), "follow");
    assert.equal(glyph.getAttribute("aria-hidden"), "true");
    for (const followed of [true, false, true, false]) {
      f.click({ target: copy });
      assert.equal(f.button.getAttribute("aria-pressed"), String(followed));
      assert.equal(glyph.textContent, followed ? "✓" : "＋");
      assert.equal(copy.textContent, label || "フォローする");
      assert.deepEqual(f.button.children, children);
    }
    await copy.dispatch("custom-native-event");
    assert.equal(handled, 1);
    assert.deepEqual(f.item, saved);
  });
}

test("Follow preview keeps editing, active battle and disabled-control gates", t => {
  const f = fixture(t);
  const snapshot = () => ({ attrs: [...f.button.attrs], text: f.button.textContent, classes: f.node.className });
  const before = snapshot();
  f.click({ preview: false }); assert.deepEqual(snapshot(), before);
  f.click({ battle: Object.freeze({ ticks: 8 }) }); assert.deepEqual(snapshot(), before);
  f.button.disabled = true; f.click(); assert.deepEqual(snapshot(), before);
});
