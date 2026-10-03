import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { parseFragment, serialize } from "parse5";
import C from "../src/document.js";
import V from "../src/components.js";
import Effects from "../src/effects.js";
import { targetCaption } from "../src/catalog/target-caption.js";
import { previewCatalogueAction } from "../src/catalog/preview.js";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";

// Parsed production HTML and exact local preview/Effects handlers, not browser
// layout or assistive-technology acceptance. Missing names, blanket relabeling,
// changed native artwork/actions, or changing the demo behavior must fail.
const cases = [
  {
    type: "go_voice", action: "voice", classes: "native-button voice-button",
    name: "音声検索UIの反応をプレビュー",
    title: "ページ内の操作デモです。音声の録音・認識はしません。",
    artwork: () => V.icon("mic"),
  },
  {
    type: "yt_notify", action: "notify", classes: "native-button yt-button notify-button",
    name: "通知ベルの表示を切り替える（プレビュー）",
    title: "ページ内の表示プレビューです。端末への通知は送りません。",
    artwork: () => `${V.icon("bell")}<i class="notification-dot"></i>`,
  },
];
const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const start = source.indexOf("function previewAction(e: MouseEvent)");
const end = source.indexOf("\n/* ---------- Events ---------- */", start);
assert.ok(start >= 0 && end > start, "use the actual application preview handler");
const handlerCode = transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code;
const attr = (node, name) => node.attrs.find(attribute => attribute.name === name)?.value;
const visibleText = node => attr(node, "aria-hidden") === "true" ? ""
  : (node.childNodes ?? []).map(child => child.value ?? visibleText(child)).join("");

class NativeElement extends ElementAdapter {
  get childElementCount() { return this.children.filter(child => child.tagName !== "#TEXT").length; }
  getBoundingClientRect() { return { x: 24, y: 24, left: 24, top: 24, right: 96, width: 72, height: 44 }; }
}

function fixture(t, spec, label = "", reduced = false) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let layer;
  const document = {
    createElement(tag) { return new NativeElement(this, tag); },
    querySelector(selector) { return selector === "#effect-layer" ? layer : null; },
  };
  layer = document.createElement("div");
  const prior = new Map(["document", "matchMedia"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  Object.defineProperty(globalThis, "matchMedia", { configurable: true, value: () => ({ matches: reduced }) });
  t.after(() => {
    for (const [key, descriptor] of prior)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  });
  const item = { ...C.makeItem(spec.type, spec.type, 24, 24), label };
  const node = V.create(item), button = node.querySelector("button"), fx = new Effects();
  const paper = document.createElement("div");
  paper.className = "browser-paper";
  paper.append(node);
  button.disabled = false;
  const click = ({ preview = true, battle = null, target = button } = {}) => {
    const handler = new Function("Element", "preview", "battle", "storyActive", "storySession", "fx", "previewCatalogueAction", `${handlerCode}; return previewAction;`)(
      NativeElement, preview, battle, false, null, fx, previewCatalogueAction,
    );
    handler({ target, preventDefault() { throw new Error("native icon buttons must not navigate"); } });
  };
  return { document, item, node, button, layer, fx, click };
}

for (const spec of cases) {
  test(`${spec.type} gives its actual icon button an honest local action name and tooltip`, () => {
    const item = C.makeItem(spec.type, "native-icon", 24, 24), before = structuredClone(item);
    const parsed = parseFragment(V.markup(item));
    assert.equal(parsed.childNodes.length, 1);
    const button = parsed.childNodes[0];
    assert.equal(button.tagName, "button");
    assert.equal(attr(button, "aria-label"), spec.name);
    assert.equal(attr(button, "title"), spec.title);
    assert.deepEqual(Object.fromEntries(button.attrs.map(({ name, value }) => [name, value])), {
      type: "button", class: spec.classes, "data-ui": spec.action,
      "aria-label": spec.name, title: spec.title,
    });
    assert.equal(visibleText(button), "", "the control remains icon-only");
    assert.equal(serialize(button), serialize(parseFragment(spec.artwork())), "authored SVG and decorative children remain intact");
    assert.equal(attr(button.childNodes[0], "aria-hidden"), "true");
    assert.deepEqual(item, before, "rendering does not change dimensions or saved data");
  });

  test(`${spec.type} keeps edited wrapper identity separate from the local button action`, t => {
    const f = fixture(t, spec);
    for (const label of ["", " \t\n ", '<img src=x onerror="bad()"> & custom', "資料".repeat(80)]) {
      const item = { ...f.item, label }, before = structuredClone(item);
      const host = f.document.createElement("div");
      for (const interactive of [false, true]) {
        V.render(host, [item], { side: "enemy", interactive });
        const node = host.querySelector(".web-node"), button = node.querySelector("button");
        assert.equal(node.getAttribute("aria-label"), targetCaption(item));
        assert.equal(node.getAttribute("title"), targetCaption(item));
        assert.equal(button.getAttribute("aria-label"), spec.name);
        assert.equal(button.getAttribute("title"), spec.title);
        assert.equal(button.tabIndex, interactive ? 0 : -1);
        assert.equal(node.style.width, `${item.w}px`);
        assert.equal(node.style.height, `${item.h}px`);
        assert.equal(node.querySelector("img,script,iframe"), null);
      }
      assert.equal(V.markup(item), V.markup(f.item), "editable part labels never overwrite these icon-only actions");
      assert.deepEqual(item, before);
    }
  });

  test(`${spec.type} keeps its actual repeated local preview and nested-icon click behavior`, t => {
    const f = fixture(t, spec, "custom identity"), before = structuredClone(f.item);
    const children = [...f.button.children], attrs = [...f.button.attrs];
    for (const on of [true, false, true, false]) {
      f.click({ target: f.button.querySelector("path") });
      assert.equal(f.node.classList.contains("is-firing"), true, "the existing generic pulse still runs");
      assert.equal(f.button.classList.contains("is-on"), spec.type === "yt_notify" && on);
      assert.equal(f.node.classList.contains("is-listening"), false, "preview does not start the battle-only listening animation");
      assert.equal(f.layer.childElementCount, 0, "preview does not create game notification toasts");
      assert.deepEqual(f.button.children, children);
      assert.deepEqual([...f.button.attrs], attrs);
      t.mock.timers.tick(520);
      assert.equal(f.node.classList.contains("is-firing"), false);
    }
    assert.deepEqual(f.item, before);
  });

  test(`${spec.type} retains edit, battle and disabled preview gates`, t => {
    const f = fixture(t, spec), before = structuredClone(f.item), attrs = [...f.button.attrs];
    f.click({ preview: false });
    f.click({ battle: Object.freeze({ ticks: 8 }) });
    f.button.disabled = true;
    f.click({ target: f.button.querySelector("path") });
    assert.equal(f.node.classList.contains("is-firing"), false);
    assert.equal(f.node.classList.contains("is-listening"), false);
    assert.equal(f.button.classList.contains("is-on"), false);
    assert.equal(f.layer.childElementCount, 0);
    assert.deepEqual([...f.button.attrs], attrs);
    assert.deepEqual(f.item, before);
  });

  for (const reduced of [false, true]) {
    test(`${spec.type} retains real timed battle feedback and native names (reduced motion ${reduced})`, t => {
      const f = fixture(t, spec, "battle identity", reduced), before = structuredClone(f.item);
      const children = [...f.button.children], attrs = [...f.button.attrs];
      for (let repeat = 0; repeat < 2; repeat++) {
        f.fx.act(f.node, spec.type);
        assert.equal(f.node.classList.contains("is-listening"), spec.type === "go_voice");
        assert.equal(f.button.classList.contains("is-on"), spec.type === "yt_notify");
        if (spec.type === "yt_notify" && !reduced) {
          assert.equal(f.layer.childElementCount, 1);
          assert.match(f.layer.textContent, repeat ? /ライブ配信が始まりました/ : /新しい動画が公開されました/);
        } else assert.equal(f.layer.childElementCount, 0);
        t.mock.timers.tick(999);
        assert.equal(f.node.classList.contains("is-listening"), spec.type === "go_voice");
        t.mock.timers.tick(1);
        assert.equal(f.node.classList.contains("is-listening"), false);
        t.mock.timers.tick(700);
        assert.equal(f.layer.childElementCount, 0);
        assert.deepEqual(f.button.children, children);
        assert.deepEqual([...f.button.attrs], attrs);
      }
      assert.deepEqual(f.item, before);
    });
  }
}

test("naming icon-only controls leaves native numeric and authored text controls alone", () => {
  for (const [type, text] of [["yt_like", "128"], ["yt_speed", "2×"], ["yt_caption", "CC"], ["am_wish", "custom text"], ["go_lucky", "custom text"]]) {
    const item = { ...C.makeItem(type, type), label: "custom text" };
    const button = parseFragment(V.markup(item)).childNodes[0];
    assert.equal(attr(button, "aria-label"), undefined);
    assert.equal(attr(button, "title"), undefined);
    assert.ok(visibleText(button).includes(text));
  }
});
