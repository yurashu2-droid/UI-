import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import C from "../src/document.js";
import E from "../src/engine.js";
import V from "../src/components.js";
import Effects from "../src/effects.js";
import { previewCatalogueAction } from "../src/catalog/preview.js";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";

// Exact production markup, preview handler and Effects paths. This adapter only
// models DOM state and events; browser layout and assistive technology are not tested.
// Replacing the authored text with a fixed fallback, toggling by text, replacing
// children, or targeting nested status spans must fail these regressions.
class NativeElement extends ElementAdapter {
  get hidden() { return this.attrs.has("hidden"); }
  set hidden(value) {
    if (value) this.setAttribute("hidden", "");
    else this.attrs.delete("hidden");
  }
}
const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const start = source.indexOf("function previewAction(e: MouseEvent)");
const end = source.indexOf("\n/* ---------- Events ---------- */", start);
assert.ok(start >= 0 && end > start);
const code = transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code;
const visibleText = node => node.hidden ? "" : node.ownText + node.children.map(visibleText).join("");

function fixture(label = "夜ふかしメンバー") {
  const document = {
    createElement(tag) { return new NativeElement(this, tag); },
    querySelector(selector) { return selector === "#effect-layer" ? this.createElement("div") : null; },
  };
  const item = C.makeItem("yt_sub", "membership", 592, 24, 184, 40);
  item.label = label;
  const paper = document.createElement("div");
  paper.className = "browser-paper";
  const node = document.createElement("div");
  node.className = "web-node";
  node.dataset.id = item.id;
  node.innerHTML = V.markup(item);
  paper.append(node);
  const button = node.querySelector("button");
  button.disabled = false;
  let pulses = 0;
  const click = (preview = true, battle = null, target = button) => {
    const handler = new Function("Element", "preview", "battle", "storyActive", "storySession", "fx", "previewCatalogueAction", `${code}; return previewAction;`)(
      NativeElement, preview, battle, false, null, { pulse() { pulses++; } }, previewCatalogueAction,
    );
    handler({ target, preventDefault() { throw new Error("native button cannot navigate"); } });
  };
  return { document, item, node, button, click, pulses: () => pulses };
}

test("subscription preview restores exact edited text after the registration demonstration", () => {
  const f = fixture(), before = structuredClone(f.item);
  for (let i = 0; i < 3; i++) {
    f.click();
    assert.equal(visibleText(f.button), "登録済み");
    f.click();
    assert.equal(visibleText(f.button), f.item.label);
  }
  assert.deepEqual(f.item, before, "only native presentation changes");
});

for (const label of ["", "登録済み", "  改行\n会員  ", '<img src=x onerror="bad()"> & 会員', "長い会員ラベル".repeat(10)]) {
  test(`subscription native state preserves label ${JSON.stringify(label)}`, () => {
    const f = fixture(label), before = structuredClone(f.item), children = [...f.button.children];
    const expected = label || "メンバーになる";
    assert.equal(visibleText(f.button), expected);
    assert.equal(f.button.getAttribute("aria-pressed"), "false");
    assert.equal(f.button.getAttribute("data-ui"), "subscribe");
    assert.equal(f.button.getAttribute("type"), "button");
    assert.ok(f.button.classList.contains("native-button"));
    assert.ok(f.button.classList.contains("subscribe-button"));
    assert.equal(f.button.querySelector("img"), null, "authored text stays escaped");
    for (const on of [true, false, true, false]) {
      f.click();
      assert.equal(f.button.classList.contains("is-on"), on);
      assert.equal(f.button.getAttribute("aria-pressed"), String(on));
      assert.equal(visibleText(f.button), on ? "登録済み" : expected);
      assert.deepEqual(f.button.children, children, "native children retain their identity");
    }
    assert.deepEqual(f.item, before);
  });
}

test("subscription preview keeps existing edit, battle and disabled-control gates", () => {
  const f = fixture(), snapshot = () => ({ text: visibleText(f.button), attrs: [...f.button.attrs], className: f.button.className });
  const before = snapshot();
  f.click(false); assert.deepEqual(snapshot(), before);
  f.click(true, Object.freeze({ ticks: 8 })); assert.deepEqual(snapshot(), before);
  f.button.disabled = true; f.click(); assert.deepEqual(snapshot(), before);
  assert.equal(f.pulses(), 0);
});

test("subscription state changes only its direct label and status children, retaining extra native state and handlers", async () => {
  const f = fixture(), label = f.button.querySelector(":scope > .subscribe-label");
  const extra = f.document.createElement("span");
  extra.className = "existing-state";
  extra.innerHTML = '<span class="subscribe-label">nested label</span><span class="subscribe-state" hidden>nested status</span>';
  f.button.append(extra);
  // Put nested lookalikes first so a broad descendant query cannot pass by luck.
  f.button.children = [extra, ...f.button.children.filter(child => child !== extra)];
  const nestedLabel = extra.querySelector(".subscribe-label"), nestedState = extra.querySelector(".subscribe-state");
  const children = [...f.button.children], extraChildren = [...extra.children];
  let handled = 0;
  f.button.addEventListener("custom-native-event", () => { handled++; });
  f.click();
  assert.deepEqual(f.button.children, children);
  assert.deepEqual(extra.children, extraChildren);
  assert.equal(nestedLabel.hidden, false);
  assert.equal(nestedState.hidden, true);
  assert.equal(extra.textContent, "nested labelnested status");
  assert.ok(label);
  assert.equal(label.hidden, true);
  await f.button.dispatch("custom-native-event");
  assert.equal(handled, 1);
  f.click();
  assert.equal(label.hidden, false);
});

test("subscription feedback does not adopt a nested control when its own state children are absent", () => {
  const f = fixture();
  f.button.innerHTML = '<span class="existing-state"><span class="subscribe-label">other label</span><span class="subscribe-state" hidden>other status</span></span>';
  const children = [...f.button.children], text = f.button.textContent, pressed = f.button.getAttribute("aria-pressed");
  f.click();
  assert.deepEqual(f.button.children, children);
  assert.equal(f.button.textContent, text);
  assert.equal(f.button.classList.contains("is-on"), false);
  assert.equal(f.button.getAttribute("aria-pressed"), pressed);
});

for (const reduced of [false, true]) {
  test(`real subscription battle fires stay one-way and preserve clock, label and child identity (reduced motion ${reduced})`, t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const f = fixture('<b>会員</b> & original'), saved = structuredClone(f.item), children = [...f.button.children];
    t.mock.method(globalThis, "setTimeout");
    const documentBefore = Object.getOwnPropertyDescriptor(globalThis, "document");
    const mediaBefore = Object.getOwnPropertyDescriptor(globalThis, "matchMedia");
    Object.defineProperty(globalThis, "document", { configurable: true, value: f.document });
    Object.defineProperty(globalThis, "matchMedia", { configurable: true, value: () => ({ matches: reduced }) });
    t.after(() => {
      if (documentBefore) Object.defineProperty(globalThis, "document", documentBefore); else delete globalThis.document;
      if (mediaBefore) Object.defineProperty(globalThis, "matchMedia", mediaBefore); else delete globalThis.matchMedia;
    });
    const fx = new Effects();
    fx.part = (_side, id) => id === f.item.id ? f.node : null;
    const video = C.makeItem("yt_play", "video", 24, 24, 560, 280);
    const battle = new E.Battle([video, f.item], [], { playerHp: 10000, enemyHp: 10000, playerCapacity: 99, enemyCapacity: 99 });
    let fires = 0;
    for (let tick = 0; tick < 200; tick++) {
      for (const event of battle.step(.05)) {
        if (event.kind !== "fire" || event.type !== "yt_sub") continue;
        fires++;
        const snapshot = () => structuredClone({ ticks: battle.ticks, elapsed: battle.elapsed, player: battle.player, enemy: battle.enemy, metrics: battle.metrics, states: battle.states });
        const before = snapshot();
        fx.emit(event, battle);
        fx.emit(event, battle);
        assert.equal(visibleText(f.button), "登録済み");
        assert.equal(f.button.getAttribute("aria-pressed"), "true");
        assert.equal(f.button.classList.contains("is-on"), true);
        assert.deepEqual(f.button.children, children);
        t.mock.timers.tick(1000);
        assert.equal(visibleText(f.button), "登録済み", "battle feedback remains registered after cosmetic timers");
        assert.deepEqual(snapshot(), before);
      }
    }
    assert.ok(fires > 0, "real adjacent video activation produces subscription fire events");
    f.click();
    assert.equal(visibleText(f.button), f.item.label);
    assert.equal(f.button.getAttribute("aria-pressed"), "false");
    assert.deepEqual(f.item, saved);
  });
}
