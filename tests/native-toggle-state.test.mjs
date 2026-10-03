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

// Production markup/render, the unchanged application's previewAction and its
// real catalogue delegate, and real Effects paths. Removing initial semantics,
// toggling twice, replacing children, or including like must fail. This adapter
// substitutes only DOM/timers; it does not test browser input, pixels or AT.
const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const start = source.indexOf("function previewAction(e: MouseEvent)");
const end = source.indexOf("\n/* ---------- Events ---------- */", start);
assert.ok(start >= 0 && end > start);
const handlerCode = transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code;
const controls = [
  { type: "yt_caption", action: "caption", label: "字幕の編集名", text: "CC", child: ".cc-icon" },
  { type: "yt_notify", action: "notify", label: "通知の編集名", text: "", child: "path" },
  { type: "am_wish", action: "wish", label: '<img src=x onerror="bad()"> & 欲しいもの', text: '<img src=x onerror="bad()"> & 欲しいもの', child: "path" },
];
class NativeElement extends ElementAdapter {
  get childElementCount() { return this.children.filter(child => child.tagName !== "#TEXT").length; }
  getBoundingClientRect() { return { x: 24, y: 24, left: 24, top: 24, right: 96, width: 72, height: 44 }; }
}
function fixture(t, reduced = false) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const document = {
    createElement(tag) { return new NativeElement(this, tag); },
    querySelector(selector) {
      if (selector === "#effect-layer") return layer;
      const match = selector.match(/^#(player|enemy)-body \.web-node\[data-id="([^"]+)"\]$/);
      return match ? host.querySelector(`.web-node[data-id="${match[2]}"][data-side="${match[1]}"]`) : null;
    },
  };
  const layer = document.createElement("div"), paper = document.createElement("div"), host = document.createElement("div");
  paper.className = "browser-paper";
  paper.append(host);
  const previous = new Map(["document", "matchMedia"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  Object.defineProperty(globalThis, "matchMedia", { configurable: true, value: () => ({ matches: reduced }) });
  t.after(() => {
    for (const [key, descriptor] of previous)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  });
  const items = controls.flatMap((spec, i) => [0, 1].map(copy => {
    const item = C.makeItem(spec.type, `${spec.action}-${copy}`, 24 + copy * 400, 24 + i * 120);
    assert.equal(Editor.patchItem([item], item.id, { label: spec.label }), true);
    return item;
  }));
  const like = C.makeItem("yt_like", "like", 24, 420);
  items.push(like);
  V.render(host, items, { interactive: true });
  const fx = new Effects();
  const nodeFor = id => host.querySelector(`.web-node[data-id="${id}"]`);
  const buttonFor = id => nodeFor(id).querySelector("button");
  const click = (target, { preview = true, battle = null } = {}) => {
    const handler = new Function("Element", "preview", "battle", "storyActive", "storySession", "fx", "previewCatalogueAction", `${handlerCode}; return previewAction;`)(
      NativeElement, preview, battle, false, null, fx, previewCatalogueAction,
    );
    handler({ target, preventDefault() { throw new Error("native toggle button cannot navigate"); } });
  };
  return { document, paper, host, layer, items, like, fx, click, nodeFor, buttonFor };
}
function assertState(button, on) {
  assert.equal(button.classList.contains("is-on"), on);
  assert.equal(button.getAttribute("aria-pressed"), String(on));
}
const fixedAttrs = button => [...button.attrs].filter(([key]) => key !== "aria-pressed");

for (const spec of controls) {
  test(`${spec.action} renders explicitly off while preserving native action, text and children`, t => {
    const f = fixture(t), button = f.buttonFor(`${spec.action}-0`);
    assertState(button, false);
    assert.equal(button.tagName, "BUTTON");
    assert.equal(button.getAttribute("type"), "button");
    assert.equal(button.getAttribute("data-ui"), spec.action);
    assert.equal(button.textContent, spec.text);
    assert.equal(button.querySelector("img,script,iframe"), null);
    assert.ok(button.querySelector(spec.child));
    if (spec.action === "notify") {
      assert.equal(button.getAttribute("aria-label"), "通知ベルの表示を切り替える（プレビュー）");
      assert.equal(button.getAttribute("title"), "ページ内の表示プレビューです。端末への通知は送りません。");
      assert.ok(button.querySelector(".notification-dot"));
    }
  });

  test(`${spec.action} actual preview toggles once per nested click and leaves other instances unchanged`, async t => {
    const f = fixture(t), button = f.buttonFor(`${spec.action}-0`), node = f.nodeFor(`${spec.action}-0`);
    const before = structuredClone(f.items), children = [...button.children], attrs = fixedAttrs(button);
    const child = button.querySelector(spec.child);
    let handled = 0;
    child.addEventListener("custom-native-event", () => { handled++; });
    for (const on of [true, false, true, false]) {
      f.click(child);
      assertState(button, on);
      for (const item of f.items.filter(item => item.id !== `${spec.action}-0` && item.type !== "yt_like"))
        assertState(f.buttonFor(item.id), false);
      assert.equal(f.nodeFor(`${spec.action}-0`), node);
      assert.equal(f.buttonFor(`${spec.action}-0`), button);
      assert.deepEqual(button.children, children);
      assert.deepEqual(fixedAttrs(button), attrs);
      assert.equal(button.textContent, spec.text);
      assert.equal(node.classList.contains("is-firing"), true);
      assert.equal(f.layer.childElementCount, 0, "local preview does not produce battle notification toasts");
      t.mock.timers.tick(520);
      assert.equal(node.classList.contains("is-firing"), false);
    }
    await child.dispatch("custom-native-event");
    assert.equal(handled, 1);
    assert.deepEqual(f.items, before, "preview must not mutate authored items");
  });

  test(`${spec.action} retains disabled, editing, active-battle and outside-page preview gates`, t => {
    const f = fixture(t), button = f.buttonFor(`${spec.action}-0`), node = f.nodeFor(`${spec.action}-0`);
    const snapshot = () => ({ attrs: [...button.attrs], classes: button.className, text: button.textContent, nodeClasses: node.className });
    const before = snapshot(), target = button.querySelector(spec.child);
    f.click(target, { preview: false }); assert.deepEqual(snapshot(), before);
    f.click(target, { battle: Object.freeze({ ticks: 8 }) }); assert.deepEqual(snapshot(), before);
    button.disabled = true;
    f.click(target); assert.deepEqual(snapshot(), before);
    button.disabled = false;
    f.host.remove();
    f.click(target); assert.deepEqual(snapshot(), before);
    f.click("not an Element"); assert.deepEqual(snapshot(), before);
    assert.equal(f.layer.childElementCount, 0);
  });
}

for (const reduced of [false, true]) {
  test(`real notify/wish fire events synchronize one-way native feedback and preserve notification effects (reduced ${reduced})`, t => {
    const f = fixture(t, reduced), beforeItems = structuredClone(f.items);
    const battle = new E.Battle(f.items, [C.makeItem("ab_link", "enemy", 24, 24)], {
      playerHp: 10000, enemyHp: 10000, playerCapacity: 99, enemyCapacity: 99,
    });
    const seen = new Map(), children = new Map(f.items.map(item => [item.id, [...f.buttonFor(item.id).children]]));
    const snapshot = () => structuredClone({ ticks: battle.ticks, elapsed: battle.elapsed, player: battle.player, enemy: battle.enemy, states: battle.states, metrics: battle.metrics });
    for (let tick = 0; tick < 240; tick++) {
      for (const event of battle.step(.05)) {
        if (event.kind !== "fire" || !["yt_notify", "am_wish"].includes(event.type)) continue;
        seen.set(event.id, (seen.get(event.id) ?? 0) + 1);
        const before = snapshot(), button = f.buttonFor(event.id), attrs = fixedAttrs(button), notes = f.fx.notes;
        f.fx.emit(event, battle);
        f.fx.emit(event, battle);
        assertState(button, true);
        assert.deepEqual(button.children, children.get(event.id));
        assert.deepEqual(fixedAttrs(button), attrs);
        assert.equal(f.fx.notes, notes + (event.type === "yt_notify" ? 2 : 0));
        assert.equal(f.layer.childElementCount, event.type === "yt_notify" && !reduced ? 2 : 0);
        if (event.type === "yt_notify" && !reduced) {
          assert.match(f.layer.textContent, /UI RAID Channel/);
          t.mock.timers.tick(1699);
          assert.equal(f.layer.childElementCount, 2);
          t.mock.timers.tick(1);
        } else t.mock.timers.tick(1700);
        assert.equal(f.layer.childElementCount, 0);
        assertState(button, true);
        assert.deepEqual(snapshot(), before, "presentation cannot alter gameplay state or clocks");
        f.click(button);
        assertState(button, false, "first preview click clears the state set by a battle fire");
      }
    }
    for (const item of f.items.filter(item => ["yt_notify", "am_wish"].includes(item.type)))
      assert.ok(seen.get(item.id) >= 2, `${item.id} must receive repeated real engine fires`);
    assert.deepEqual(f.items, beforeItems);
  });

  test(`passive caption's existing Effects action agrees with preview without inventing a battle activation (reduced ${reduced})`, t => {
    const f = fixture(t, reduced), node = f.nodeFor("caption-0"), button = f.buttonFor("caption-0"), children = [...button.children];
    // Caption is passive. Exercise its real existing effect action directly;
    // emitting a made-up engine fire would hide the actual battle boundary.
    for (let repeat = 0; repeat < 2; repeat++) {
      f.fx.act(node, "yt_caption");
      f.fx.act(node, "yt_caption");
      assertState(button, true);
      assertState(f.buttonFor("caption-1"), false);
      t.mock.timers.tick(2000);
      assertState(button, true);
      assert.deepEqual(button.children, children);
      assert.equal(button.textContent, "CC");
      f.click(button);
      assertState(button, false);
    }
  });
}

test("native rerender resets cosmetic pressed state in both sides and editing/preview modes", t => {
  const f = fixture(t), saved = structuredClone(f.items);
  for (const side of ["player", "enemy"]) for (const interactive of [false, true]) {
    for (const spec of controls) {
      const node = f.nodeFor(`${spec.action}-0`), button = f.buttonFor(`${spec.action}-0`);
      f.fx.act(node, spec.type);
      assertState(button, true);
    }
    const old = controls.map(spec => f.buttonFor(`${spec.action}-0`));
    V.render(f.host, f.items, { side, interactive });
    for (const spec of controls) for (const copy of [0, 1]) {
      const button = f.buttonFor(`${spec.action}-${copy}`);
      assertState(button, false);
      assert.equal(button.tabIndex, interactive ? 0 : -1);
      assert.equal(button.textContent, spec.text);
      assert.equal(old.includes(button), false, "normal rerender creates its fresh initial native controls");
    }
  }
  assert.deepEqual(f.items, saved);
});

test("like remains a numeric preview counter and class-only battle feedback, never a binary pressed control", t => {
  const f = fixture(t), button = f.buttonFor("like"), node = f.nodeFor("like"), children = [...button.children];
  assert.equal(button.getAttribute("aria-pressed"), null);
  for (const count of [129, 130, 131]) {
    f.click(button.querySelector("path"));
    assert.equal(button.querySelector(".like-value").textContent, String(count));
    assert.equal(button.getAttribute("aria-pressed"), null);
  }
  f.fx.act(node, "yt_like");
  assert.equal(button.classList.contains("is-on"), true);
  assert.equal(button.getAttribute("aria-pressed"), null);
  f.click(button);
  assert.equal(button.querySelector(".like-value").textContent, "132");
  assert.equal(button.classList.contains("is-on"), true);
  assert.equal(button.getAttribute("aria-pressed"), null);
  assert.deepEqual(button.children, children);
});
