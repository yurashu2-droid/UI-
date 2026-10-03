import test from "node:test";
import assert from "node:assert/strict";
import { parseFragment } from "parse5";
import C from "../src/document.js";
import D from "../src/data.js";
import R from "../src/run.js";
import V from "../src/components.js";
import { Editor } from "../src/editor.js";
import { targetCaption } from "../src/catalog/target-caption.js";
import { previewCatalogueAction } from "../src/catalog/preview.js";
import { createRunPersistence } from "../src/persistence.js";
import { createFixtureRaid, registerRaidBlueprint, applyRaidAppearance } from "../src/raid/index.js";

// DOM boundary only: production create/render, Editor and appearance code run.
// This checks source DOM attributes, not browser tooltip layout, focus traversal
// or assistive-technology output. Removing either wrapper identity attribute,
// interpolating it into HTML, or changing native control semantics must fail.
class ElementAdapter {
  constructor(document, tag) {
    Object.assign(this, { ownerDocument: document, tagName: tag.toUpperCase(),
      parentElement: null, children: [], attrs: new Map(), dataset: {}, className: "",
      tabIndex: -1, ownText: "", style: { setProperty(name, value) { this[name] = value; } } });
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => names.forEach(name => this.classList.toggle(name, true)),
      remove: (...names) => names.forEach(name => this.classList.toggle(name, false)),
      toggle: (name, force) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        const on = force ?? !names.has(name);
        if (on) names.add(name); else names.delete(name);
        this.className = [...names].join(" "); return on;
      },
    };
  }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
    if (name === "class") this.className = String(value);
    if (name.startsWith("data-")) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
  }
  getAttribute(name) { return name === "class" ? this.className : this.attrs.get(name) ?? null; }
  get title() { return this.getAttribute("title") ?? ""; }
  set title(value) { this.setAttribute("title", value); }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    this.parentElement = null;
  }
  append(...children) { children.forEach(child => { child.remove(); child.parentElement = this; this.children.push(child); }); }
  replaceChildren(...children) { this.children.forEach(child => { child.parentElement = null; }); this.children = []; this.ownText = ""; this.append(...children); }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.replaceChildren(); this.ownText = String(value); }
  set innerHTML(html) {
    this.htmlSource = html;
    const convert = node => {
      const el = this.ownerDocument.createElement(node.tagName ?? "#text");
      for (const attr of node.attrs ?? []) el.setAttribute(attr.name, attr.value);
      if (node.nodeName === "#text") el.ownText = node.value;
      el.append(...(node.childNodes ?? []).map(convert)); return el;
    };
    this.replaceChildren(...parseFragment(html).childNodes.map(convert));
  }
  matches(selector) {
    return selector.split(",").some(value => {
      const simple = value.trim();
      const tag = simple.match(/^[a-z][\w-]*/i)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      if ([...simple.matchAll(/\.([\w-]+)/g)].some(([, name]) => !this.classList.contains(name))) return false;
      return [...simple.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/g)].every(([, name, expected]) =>
        expected === undefined ? this.getAttribute(name) !== null : this.getAttribute(name) === expected);
    });
  }
  querySelectorAll(selector) {
    if (selector.startsWith(":scope > ")) return this.children.filter(child => child.matches(selector.slice(9)));
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

function withDocument(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const document = { createElement(tag) { return new ElementAdapter(this, tag); }, addEventListener() {} };
  globalThis.document = document;
  t.after(() => {
    V.setAppearanceRenderer(null);
    if (previous) Object.defineProperty(globalThis, "document", previous); else delete globalThis.document;
  });
  return document;
}
function identity(node, item) {
  assert.equal(node.getAttribute("aria-label"), targetCaption(item), `${item.type}: accessible wrapper name`);
  assert.equal(node.getAttribute("title"), targetCaption(item), `${item.type}: full plain-text hover title`);
}
const controls = node => node.querySelectorAll("button,input,select,a");
const semantics = node => controls(node).map(control => ({
  tag: control.tagName, attrs: [...control.attrs], text: control.textContent,
}));
const timing = '<i class="node-timing" aria-hidden="true"></i>';

test("all catalogue wrappers identify their edited label without changing native markup or preview semantics", t => {
  withDocument(t);
  for (const type of Object.keys(D.PARTS)) for (const preview of [false, true]) {
    const item = { ...C.makeItem(type, "local-part", 24, 24), label: " \t資料\n A\u202e\u0000 " };
    const before = structuredClone(item), node = V.create(item, { preview, side: "enemy" });
    identity(node, item);
    assert.equal(node.getAttribute("aria-label"), `資料 A（${D.PARTS[type].name}）`);
    assert.equal(node.htmlSource, V.markup(item, { side: "enemy", theme: "mixed" }) + timing);
    assert.equal(node.tabIndex, preview ? -1 : 0);
    assert.equal(node.getAttribute("role"), preview ? null : "group");
    assert.equal(node.dataset.id, item.id); assert.equal(node.dataset.side, "enemy");
    assert.deepEqual(item, before, "caption formatting cannot normalize stored data");
  }
});

test("blank, controls-only and canonical labels retain the canonical wrapper identity", t => {
  withDocument(t);
  for (const type of Object.keys(D.PARTS)) for (const label of ["", " \t\n ", "\u0000\u202e\u2069", D.PARTS[type].name, ` \t${D.PARTS[type].name}\n `]) {
    const item = { ...C.makeItem(type, "canonical", 24, 24), label }, node = V.create(item);
    identity(node, item);
    assert.equal(node.getAttribute("aria-label"), D.PARTS[type].name);
    assert.equal(node.htmlSource, V.markup(item) + timing);
  }
});

test("hostile and long labels stay literal and retain their safe full distinguishing caption", t => {
  withDocument(t);
  for (const type of ["go_voice", "yt_progress", "ab_link"]) {
    const canonical = D.PARTS[type].name;
    const labels = [
      ['<img src=x onerror="bad()"> & \'copy\'', '<img src=x onerror="bad()"> & \'copy\''],
      ["資料".repeat(39) + "甲A", "資料".repeat(39) + "甲A"],
      ["資料".repeat(39) + "乙B", "資料".repeat(39) + "乙B"],
      ["😀".repeat(40), "😀".repeat(40)],
      ["🚀".repeat(90), "🚀".repeat(79) + "…"],
    ];
    for (const [label, visible] of labels) {
      const item = { ...C.makeItem(type, "untrusted", 24, 24), label }, node = V.create(item);
      identity(node, item); assert.equal(node.title, `${visible}（${canonical}）`);
      assert.equal(node.querySelector("img,script,iframe"), null);
      for (const element of [node, ...node.querySelectorAll("*")])
        assert.ok([...element.attrs.keys()].every(name => !name.startsWith("on")));
      assert.equal(node.htmlSource, V.markup(item) + timing, "identity is not appended as raw HTML");
    }
  }
});

test("icon and state-native controls retain original artwork, internal names and actions after labeling", t => {
  withDocument(t);
  for (const type of ["go_voice", "yt_notify", "yt_like", "yt_progress", "yt_autoplay", "am_quantity", "go_translate"]) {
    const item = C.makeItem(type, "icon", 24, 24), original = V.create(item);
    item.label = "My <custom> part & title";
    const edited = V.create(item); identity(edited, item);
    assert.equal(edited.htmlSource, original.htmlSource);
    assert.deepEqual(semantics(edited), semantics(original));
  }
});

test("actual render preserves identity across edit/interactive and player/enemy modes", t => {
  const document = withDocument(t), host = document.createElement("div");
  const a = { ...C.makeItem("ab_link", "a", 24, 24), label: "First link" };
  const b = { ...C.makeItem("ab_nav", "b", 24 + a.w, 24), label: "Second link" };
  const board = [a, b], before = structuredClone(board);
  assert.ok(C.analyze(board).member.a.length, "exercise a real composite wrapper");
  for (const side of ["player", "enemy"]) for (const interactive of [false, true]) {
    V.render(host, board, { side, interactive, selected: [a.id] });
    for (const item of board) {
      const node = host.querySelectorAll(".web-node").find(node => node.dataset.id === item.id);
      identity(node, item); assert.equal(node.tabIndex, 0); assert.equal(node.getAttribute("role"), "group");
      assert.ok(controls(node).every(control => control.tabIndex === (interactive ? 0 : -1)));
    }
    assert.equal(host.querySelector(".ui-composite").getAttribute("role"), "group");
    assert.equal(host.querySelector(".is-selected").dataset.id, a.id);
  }
  assert.deepEqual(board, before);
});

test("actual editor label edits, undo, redo, rejection, save and reload keep wrapper identity in sync", t => {
  const document = withDocument(t), host = document.createElement("div"), run = R.newRun("lab");
  for (const item of run.owned) assert.equal(R.move(run, item.id, null, null), true);
  const bought = R.purchase(run, "go_voice"); assert.equal(bought.ok, true);
  assert.equal(R.move(run, bought.item.id, 24, 24), true);
  const id = bought.item.id, original = structuredClone(run), storage = new Map();
  const persistence = createRunPersistence({ getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value) }, "part-label-v3-");
  let changes = 0;
  const editor = new Editor({ getRun: () => run, getHost: () => host, getOverlay: () => null,
    enabled: () => true, onChange() { changes++; assert.equal(persistence.save(run).ok, true); V.render(host, run.owned); },
    onSelect() {}, onToast() {}, paint() {} });
  const item = () => run.owned.find(item => item.id === id), node = () => host.querySelector(".web-node");
  V.render(host, run.owned); const nativeMarkup = node().htmlSource;
  const hostile = '<img src=x onerror="bad()">&\'資料';
  const labels = [hostile + "長".repeat(80 - hostile.length), " \t資料\n A\u202e\u0000 ", " \t\n ", D.PARTS.go_voice.name, ""];
  for (const label of labels) {
    const before = structuredClone(run);
    editor.select([id]); editor.update({ label });
    const updated = structuredClone(run);
    assert.deepEqual(updated, { ...before, owned: before.owned.map(part => part.id === id ? { ...part, label } : part) });
    identity(node(), item()); assert.equal(node().htmlSource, nativeMarkup);
    assert.equal(persistence.load("lab").run.owned.find(part => part.id === id).label, label);
    editor.undo(); assert.deepEqual(run, before); identity(node(), item());
    editor.redo(); assert.deepEqual(run, updated); identity(node(), item());
    const loaded = persistence.load("lab"); assert.equal(loaded.status, "loaded");
    V.render(host, loaded.run.owned, { interactive: true }); identity(node(), item());
  }
  editor.select([id]); const beforeRejected = structuredClone(run), beforeChanges = changes;
  editor.update({ label: "x".repeat(81) });
  assert.deepEqual(run, beforeRejected); assert.equal(changes, beforeChanges);
  assert.equal(R.validateRun(run), true); assert.deepEqual(run, original, "clearing the label restores the original saved shape");
});

test("acquired appearances retain wrapper identity and live controls through repeated apply and render", async t => {
  const document = withDocument(t), host = document.createElement("div"), blueprint = await createFixtureRaid("archive");
  assert.equal((await registerRaidBlueprint(blueprint)).ok, true);
  V.setAppearanceRenderer(applyRaidAppearance);
  for (const type of ["yt_play", "go_search", "yt_autoplay", "am_quantity"]) {
    const item = { ...C.makeItem(type, "acquired", 24, 24), appearanceId: blueprint.components[0].appearanceId };
    for (const label of ["source <label> & name", "長".repeat(80), " \t\n ", D.PARTS[type].name]) {
      item.label = label; const before = structuredClone(item);
      const preview = V.create(item, { preview: true });
      identity(preview, item); assert.equal(preview.tabIndex, -1); assert.equal(preview.getAttribute("role"), null);
      assert.equal(preview.querySelectorAll(":scope > .raid-skin").length, 1);
      for (const interactive of [false, true]) {
        V.render(host, [item], { interactive }); const node = host.querySelector(".web-node");
        identity(node, item);
        const live = controls(node), originalSemantics = semantics(node);
        const nativeChildren = node.children.filter(child => !child.classList.contains("raid-skin"));
        for (let n = 0; n < 3; n++) {
          assert.equal(applyRaidAppearance(node, item), true); identity(node, item);
          assert.deepEqual(controls(node), live, "source appearance cannot replace live controls");
          assert.deepEqual(semantics(node), originalSemantics);
          assert.deepEqual(node.children.filter(child => !child.classList.contains("raid-skin")), nativeChildren);
          assert.equal(node.querySelectorAll(":scope > .raid-skin").length, 1);
          assert.equal(node.querySelector(".raid-skin").getAttribute("aria-hidden"), "true");
          assert.equal(node.getAttribute("role"), "group"); assert.equal(node.tabIndex, 0);
          assert.ok(live.every(control => control.tabIndex === (interactive ? 0 : -1)));
        }
      }
      assert.deepEqual(item, before);
    }
  }
});

test("native preview state and control titles update without replacing the part label", t => {
  withDocument(t);
  const item = { ...C.makeItem("tw_favorite", "favorite", 24, 24), label: "My saved <favorite>" };
  const node = V.create(item), control = node.querySelector("button"), before = structuredClone(item);
  for (let n = 0; n < 6; n++) {
    assert.equal(previewCatalogueAction(control, node), true);
    assert.equal(control.getAttribute("aria-pressed"), String(n % 2 === 0));
    assert.notEqual(control.title, node.title, "native action tooltip stays separate from the wrapper identity");
    identity(node, item); assert.equal(node.querySelector("button"), control);
  }
  assert.deepEqual(item, before);
});
