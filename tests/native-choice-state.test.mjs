import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import C from "../src/document.js";
import D from "../src/data.js";
import E from "../src/engine.js";
import V from "../src/components.js";
import Effects from "../src/effects.js";
import { previewCatalogueAction } from "../src/catalog/preview.js";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";

// Removing initial/current projection, changing reselect to toggle-off, replacing
// native children, or touching another group must fail. Production render, the
// unchanged app handler/delegate and real Effects are used; only DOM/timers are
// substituted. This is not browser keyboard, layout or AT acceptance.
const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const start = source.indexOf("function previewAction(e: MouseEvent)");
const end = source.indexOf("\n/* ---------- Events ---------- */", start);
assert.ok(start >= 0 && end > start);
const handlerCode = transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code;
const choices = [
  { type: "go_tabs", action: "tab", initial: 0, labels: ["すべて", "画像", "動画", "ニュース", "ショッピング"] },
  { type: "gov_font", action: "font", initial: 1, labels: ["小", "中", "大"] },
];
class NativeElement extends ElementAdapter {
  removeAttribute(name) { this.attrs.delete(name); }
  hasAttribute(name) { return this.attrs.has(name); }
  contains(other) { return this === other || this.children.some(child => child.contains(other)); }
  get disabled() { return this.hasAttribute("disabled"); }
  set disabled(value) { value ? this.setAttribute("disabled", "") : this.removeAttribute("disabled"); }
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
  const items = choices.flatMap((spec, i) => [0, 1].map(copy => ({
    ...C.makeItem(spec.type, `${spec.action}-${copy}`, 24 + copy * 460, 24 + i * 100),
    label: '<img src=x onerror="bad()"> & edited identity',
  })));
  items.push(C.makeItem("go_result", "result", 24, 240), C.makeItem("go_page", "pager", 24, 330));
  V.render(host, items, { interactive: true });
  const fx = new Effects();
  const nodeFor = id => host.querySelector(`.web-node[data-id="${id}"]`);
  const buttonsFor = id => nodeFor(id).querySelectorAll("button");
  const click = (target, { preview = true, battle = null } = {}) => {
    const handler = new Function("Element", "preview", "battle", "storyActive", "storySession", "fx", "previewCatalogueAction", `${handlerCode}; return previewAction;`)(
      NativeElement, preview, battle, false, null, fx, previewCatalogueAction,
    );
    handler({ target, preventDefault() { throw new Error("choice buttons cannot navigate"); } });
  };
  return { document, paper, host, layer, items, fx, click, nodeFor, buttonsFor };
}
function assertCurrent(buttons, selected) {
  assert.deepEqual(buttons.map(button => button.classList.contains("current")), buttons.map((_, index) => index === selected));
  assert.deepEqual(buttons.map(button => button.getAttribute("aria-current")), buttons.map((_, index) => index === selected ? "true" : null));
  for (const button of buttons) {
    assert.equal(button.getAttribute("aria-pressed"), null, "same-choice activation does not toggle off");
    assert.equal(button.getAttribute("aria-selected"), null, "native button is not a tab or option");
    assert.equal(button.getAttribute("role"), null);
  }
}
function stable(button) { return { attrs: [...button.attrs].filter(([name]) => !["class", "aria-current"].includes(name)), children: [...button.children], text: button.textContent, tabIndex: button.tabIndex }; }
function currentSnapshot(f) { return choices.flatMap(spec => [0, 1].map(copy => f.buttonsFor(`${spec.action}-${copy}`).map(button => ({ attrs: [...button.attrs], class: button.className, text: button.textContent })))); }

for (const spec of choices) {
  test(`${spec.type} markup exposes only its initial current choice on unchanged native buttons`, t => {
    const f = fixture(t), buttons = f.buttonsFor(`${spec.action}-0`);
    assertCurrent(buttons, spec.initial);
    assert.deepEqual(buttons.map(button => button.textContent), spec.labels);
    for (const button of buttons) {
      assert.equal(button.tagName, "BUTTON");
      assert.equal(button.getAttribute("type"), "button");
      assert.equal(button.dataset.ui, spec.action);
    }
    const item = f.items.find(item => item.type === spec.type), markup = V.markup(item);
    assert.equal((markup.match(/aria-current="true"/g) ?? []).length, 1);
    assert.doesNotMatch(markup, /role="(?:tab|tablist|tabpanel|radio|radiogroup)"|aria-controls=|aria-selected=|aria-pressed=|onkeydown=|<img/);
    if (spec.action === "tab") assert.equal(f.nodeFor("tab-0").querySelector("nav").getAttribute("aria-label"), "検索カテゴリ");
    else assert.equal(f.nodeFor("font-0").querySelector("span").textContent, "文字サイズ");
  });

  test(`${spec.action} actual preview switches and reselects without replacing native controls or affecting peers`, async t => {
    const f = fixture(t), id = `${spec.action}-0`, node = f.nodeFor(id), buttons = f.buttonsFor(id);
    const before = structuredClone(f.items), stableBefore = buttons.map(stable);
    let received = 0;
    buttons[0].addEventListener("custom-native-event", () => { received++; });
    for (const selected of [spec.initial, 2, 2, 0, spec.labels.length - 1, spec.initial]) {
      f.click(buttons[selected]);
      assertCurrent(buttons, selected);
      assert.deepEqual(f.buttonsFor(id), buttons);
      assert.equal(f.nodeFor(id), node);
      assert.deepEqual(buttons.map(stable), stableBefore);
      for (const other of choices) for (const copy of [0, 1]) {
        if (`${other.action}-${copy}` !== id) assertCurrent(f.buttonsFor(`${other.action}-${copy}`), other.initial);
      }
      assert.equal(node.classList.contains("is-firing"), true);
      t.mock.timers.tick(519); assert.equal(node.classList.contains("is-firing"), true);
      t.mock.timers.tick(1); assert.equal(node.classList.contains("is-firing"), false);
    }
    await buttons[0].dispatch("custom-native-event");
    assert.equal(received, 1);
    assert.deepEqual(f.items, before, "cosmetic choices do not edit saved labels, geometry or game stats");
    assert.equal(f.layer.children.length, 0);
  });

  test(`${spec.action} preview preserves editing, battle, disabled and outside-page gates`, t => {
    const f = fixture(t), node = f.nodeFor(`${spec.action}-0`), button = f.buttonsFor(`${spec.action}-0`)[2];
    const snapshot = () => ({ groups: currentSnapshot(f), class: node.className });
    const before = snapshot();
    f.click(button, { preview: false }); assert.deepEqual(snapshot(), before);
    f.click(button, { battle: Object.freeze({ ticks: 8 }) }); assert.deepEqual(snapshot(), before);
    button.disabled = true;
    const disabled = snapshot(); f.click(button); assert.deepEqual(snapshot(), disabled);
    button.disabled = false;
    f.host.remove(); f.click(button); assert.deepEqual(snapshot(), before);
    f.click("not an Element"); assert.deepEqual(snapshot(), before);
  });

  for (const reduced of [false, true]) {
    test(`${spec.action} passive direct Effects cycle wraps and stays aligned with preview (reduced ${reduced})`, t => {
      const f = fixture(t, reduced), id = `${spec.action}-0`, node = f.nodeFor(id), buttons = f.buttonsFor(id), before = structuredClone(f.items);
      const stableBefore = buttons.map(stable);
      assert.equal(D.PARTS[spec.type].kind, "passive");
      assert.equal(D.PARTS[spec.type].cd, 0);
      let selected = spec.initial;
      for (let repeat = 0; repeat < spec.labels.length * 2; repeat++) {
        // This existing effect action is reachable directly, not a fabricated
        // battle fire: both choice types are passive and have no normal fires.
        f.fx.act(node, spec.type);
        selected = (selected + 1) % buttons.length;
        assertCurrent(buttons, selected);
        assertCurrent(f.buttonsFor(`${spec.action}-1`), spec.initial);
        t.mock.timers.tick(1000); assertCurrent(buttons, selected);
        f.click(buttons[selected]); assertCurrent(buttons, selected);
        assert.deepEqual(buttons.map(stable), stableBefore);
      }
      f.click(buttons[0]); f.fx.advance(node); assertCurrent(buttons, 1);
      assert.deepEqual(f.items, before);
    });
  }
}

test("choice groups stay independent when multiple groups have current local selections", t => {
  const f = fixture(t);
  f.click(f.buttonsFor("tab-0")[3]);
  f.click(f.buttonsFor("tab-1")[4]);
  f.click(f.buttonsFor("font-0")[2]);
  f.click(f.buttonsFor("font-1")[0]);
  f.fx.advance(f.nodeFor("tab-0"));
  assertCurrent(f.buttonsFor("tab-0"), 4);
  assertCurrent(f.buttonsFor("tab-1"), 4);
  assertCurrent(f.buttonsFor("font-0"), 2);
  assertCurrent(f.buttonsFor("font-1"), 0);
});

test("normal render resets cosmetic choices across both sides and editor/preview modes", t => {
  const f = fixture(t), before = structuredClone(f.items);
  for (const side of ["player", "enemy"]) for (const interactive of [false, true]) {
    for (const spec of choices) for (const copy of [0, 1]) f.fx.act(f.nodeFor(`${spec.action}-${copy}`), spec.type);
    const old = choices.map(spec => f.buttonsFor(`${spec.action}-0`)[0]);
    V.render(f.host, f.items, { side, interactive });
    for (const spec of choices) for (const copy of [0, 1]) {
      const buttons = f.buttonsFor(`${spec.action}-${copy}`);
      assertCurrent(buttons, spec.initial);
      assert.deepEqual(buttons.map(button => button.textContent), spec.labels);
      assert.equal(buttons.every(button => button.tabIndex === (interactive ? 0 : -1)), true);
      assert.equal(old.includes(buttons[0]), false);
    }
  }
  assert.deepEqual(f.items, before);
});

for (const reduced of [false, true]) {
  test(`actual engine fires leave passive choices alone and retain pagination's page state (reduced ${reduced})`, t => {
    const f = fixture(t, reduced), beforeItems = structuredClone(f.items);
    const battle = new E.Battle(f.items, [C.makeItem("ab_link", "enemy", 24, 24)], {
      playerHp: 10000, enemyHp: 10000, playerCapacity: 99, enemyCapacity: 99,
    });
    let pageFires = 0, choiceFires = 0;
    const snapshot = () => structuredClone({ ticks: battle.ticks, elapsed: battle.elapsed, player: battle.player, enemy: battle.enemy, states: battle.states, metrics: battle.metrics });
    for (let tick = 0; tick < 400; tick++) for (const event of battle.step(.05)) {
      if (event.kind !== "fire") continue;
      if (choices.some(spec => spec.type === event.type)) choiceFires++;
      if (event.id !== "pager") continue;
      pageFires++;
      const before = snapshot(), buttons = f.buttonsFor("pager"), numbers = buttons.filter(button => button.dataset.page);
      f.fx.emit(event, battle);
      const selected = numbers[pageFires % numbers.length];
      assert.equal(selected.getAttribute("aria-current"), "page");
      assert.deepEqual(numbers.filter(button => button.classList.contains("current")), [selected]);
      assert.equal(buttons.some(button => button.getAttribute("aria-current") === "true"), false);
      t.mock.timers.tick(520);
      assert.deepEqual(snapshot(), before, "presentation leaves engine clocks, resources and power unchanged");
    }
    assert.ok(pageFires >= 2, "must see repeated real engine fires, not synthetic events");
    assert.equal(choiceFires, 0, "the passive choice types receive no normal engine fire");
    for (const spec of choices) for (const copy of [0, 1]) assertCurrent(f.buttonsFor(`${spec.action}-${copy}`), spec.initial);
    assert.deepEqual(f.items, beforeItems);
  });
}

test("unrelated Effects.advance fallback retains class-only current behavior", t => {
  const f = fixture(t), root = f.document.createElement("div");
  root.innerHTML = '<button class="current">one</button><button>two</button><button>›</button>';
  const buttons = root.querySelectorAll("button");
  f.fx.advance(root);
  assert.deepEqual(buttons.map(button => button.classList.contains("current")), [false, true, false]);
  assert.equal(buttons.every(button => button.getAttribute("aria-current") === null), true);
});
