import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { parseFragment } from "parse5";
import C from "../src/document.js";
import D from "../src/data.js";
import R from "../src/run.js";
import V from "../src/components.js";
import { targetCaption } from "../src/catalog/target-caption.js";

// The production app renderer runs unchanged. Parsing its actual HTML checks
// escaping and source accessibility attributes, not browser layout or AT output.
// Replacing targetCaption with the canonical part name must fail this regression.
const app = readFileSync(process.env.UI_RAID_STASH_APP_SOURCE || new URL("../src/app.ts", import.meta.url), "utf8");
const extract = name => {
  const source = app.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"))?.[0];
  assert.ok(source, `production ${name} function`);
  return source;
};
const compiledStash = transformSync(extract("renderStash"), { loader: "ts", target: "es2022" }).code;
const walk = node => [node, ...(node.childNodes ?? []).flatMap(walk)];
const textOf = node => node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(textOf).join("");
const attr = (node, name) => node.attrs?.find(attribute => attribute.name === name)?.value;
function renderStash(run) {
  const count = {}, list = {}, before = structuredClone(run);
  const context = { run, C, D, P: D.PARTS, esc: V.esc, targetCaption,
    $: selector => ({ "#stash-count": count, "#stash-list": list })[selector] };
  vm.runInNewContext(`${compiledStash}\nrenderStash();`, context);
  assert.deepEqual(run, before, "rendering may not rename owned items or change their economics/geometry");
  const nodes = walk(parseFragment(list.innerHTML));
  return { count: count.textContent, html: list.innerHTML, nodes,
    buttons: nodes.filter(node => attr(node, "data-stash-id") !== undefined) };
}

test("actual stash rows distinguish duplicate PDF labels using the shared canonical caption", () => {
  const items = ["First notes.pdf", "Second notes.pdf"].map((label, i) =>
    ({ ...C.makeItem("gov_pdf", `pdf-${i}`, null, null), label }));
  const run = { ...R.newRun("lab"), owned: items }, rendered = renderStash(run);
  assert.equal(rendered.count, "2");
  assert.deepEqual(rendered.buttons.map(button => textOf(button)), items.map(targetCaption));
  for (const [i, button] of rendered.buttons.entries()) {
    assert.equal(button.tagName, "button");
    assert.equal(attr(button, "data-stash-id"), items[i].id);
    assert.equal(attr(button, "aria-label"), targetCaption(items[i]));
    assert.ok(attr(button, "title")?.includes(targetCaption(items[i])));
    assert.match(attr(button, "title"), /ドラッグしてページへ/);
  }
});

test("actual stash captions retain literal hostile and full distinguishing long labels without source disclosure", () => {
  const labels = [
    '<img src=x onerror="bad()"> & \'copy\'',
    '" autofocus onfocus="bad()',
    "資料".repeat(39) + "甲A", "資料".repeat(39) + "乙B",
    "😀".repeat(40), "🚀".repeat(90), " \t資料\n A\u202e\u0000 ",
  ];
  for (const type of ["gov_pdf", "ab_link", "go_voice"]) {
    const items = labels.map((label, i) => ({ ...C.makeItem(type, `p${i + 1}`, null, null), label,
      appearanceId: "appearance:SOURCE_SECRET", provenanceId: "capture:SOURCE_SECRET" }));
    const rendered = renderStash({ ...R.newRun("lab"), owned: items });
    assert.equal(rendered.buttons.length, items.length);
    for (const [i, button] of rendered.buttons.entries()) {
      const caption = targetCaption(items[i]);
      assert.equal(textOf(button), caption);
      assert.equal(attr(button, "aria-label"), caption);
      assert.ok(attr(button, "title").includes(caption));
      assert.equal(walk(button).filter(node => node.tagName === "span").length, 1);
    }
    assert.notEqual(textOf(rendered.buttons[2]), textOf(rendered.buttons[3]), "valid 80-unit label tails remain distinct");
    assert.equal(rendered.nodes.some(node => ["img", "script", "iframe"].includes(node.tagName)), false);
    assert.ok(rendered.nodes.every(node => (node.attrs ?? []).every(a => !/^on|^autofocus$/.test(a.name))));
    assert.doesNotMatch(rendered.html, /SOURCE_SECRET/);
  }
});

test("every catalogue type uses canonical identity for missing, blank, control-only or equal labels", () => {
  for (const [type, def] of Object.entries(D.PARTS)) {
    const labels = [undefined, "", " \t\n ", "\u0000\u202e\u2069", def.name, ` \t${def.name}\n `];
    const items = labels.map((label, i) => ({ ...C.makeItem(type, `p${i + 1}`, null, null), label }));
    const { buttons } = renderStash({ ...R.newRun("lab"), owned: items });
    assert.equal(buttons.length, labels.length);
    for (const button of buttons) {
      assert.equal(textOf(button), def.name);
      assert.equal(attr(button, "aria-label"), def.name);
      assert.ok(attr(button, "title").includes(def.name));
    }
  }
});

test("actual stash filter, owned ordering, counter and empty state remain unchanged", () => {
  const run = R.newRun("lab", "blank");
  run.owned = [
    { ...C.makeItem("ab_link", "p7", null, null), label: "Second owned link" },
    { ...C.makeItem("gov_pdf", "p3", 24, 24), label: "Already placed" },
    { ...C.makeItem("ab_link", "p2", null, null), label: "First owned link" },
  ];
  const rendered = renderStash(run);
  assert.equal(rendered.count, "2");
  assert.deepEqual(rendered.buttons.map(button => attr(button, "data-stash-id")), ["p7", "p2"]);
  assert.doesNotMatch(rendered.html, /Already placed|p3/);
  const empty = renderStash({ ...run, owned: [run.owned[1]] });
  assert.equal(empty.count, "0"); assert.equal(empty.buttons.length, 0);
  assert.equal(textOf(empty.nodes.find(node => attr(node, "class") === "empty-list")), "なし");
});

test("long stash captions have a bounded flex item and ellipsis span while full identity remains in the DOM", () => {
  const item = { ...C.makeItem("gov_pdf", "p1", null, null), label: "長".repeat(80) };
  const button = renderStash({ ...R.newRun("lab"), owned: [item] }).buttons[0];
  const span = walk(button).find(node => node.tagName === "span");
  assert.ok(span, "bounded visible text element");
  assert.match(attr(button, "style"), /max-width:\s*100%/);
  assert.match(attr(span, "style"), /min-width:\s*0(?:;|$)/);
  assert.match(attr(span, "style"), /max-width:\s*24ch/);
  const css = readFileSync(new URL("../src/styles/game.css", import.meta.url), "utf8");
  const rule = css.match(/\.stash-item span\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(rule, /overflow:\s*hidden/); assert.match(rule, /white-space:\s*nowrap/);
  assert.match(rule, /text-overflow:\s*ellipsis/);
  assert.equal(textOf(span), targetCaption(item));
  assert.equal(attr(button, "aria-label"), targetCaption(item));
  assert.ok(attr(button, "title").includes(targetCaption(item)));
});

import { Editor } from "../src/editor.js";
import { createRunPersistence } from "../src/persistence.js";

// Minimal DOM/event and animation-scheduler boundary only. Real app save,
// change listener, Editor configuration/transactions, click/down/motion/up run.
// Frames, scheduled drag painting, pixels, native focus and AT are not simulated.
class ElementAdapter {
  constructor(tagName = "div", attrs = [], parent = null) {
    this.tagName = tagName.toUpperCase(); this.attributes = new Map(attrs.map(({ name, value }) => [name, value]));
    this.parentElement = parent; this.children = []; this.dataset = {}; this.style = {}; this.open = false;
    for (const [name, value] of this.attributes) {
      if (name.startsWith("data-")) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
      if (name === "id") this.id = value;
    }
    this.classList = { toggle() {} };
  }
  set innerHTML(html) {
    this.html = html;
    const convert = (node, parent) => {
      const element = new ElementAdapter(node.tagName ?? "#text", node.attrs ?? [], parent);
      element.textContent = node.value ?? "";
      element.children = (node.childNodes ?? []).map(child => convert(child, element));
      return element;
    };
    this.children = parseFragment(html).childNodes.map(node => convert(node, this));
  }
  get innerHTML() { return this.html ?? ""; }
  matches(selector) {
    return selector.split(",").some(value => {
      const simple = value.trim();
      if (simple.includes(" ")) return false; // No frame nodes are rendered by this boundary fixture.
      const tag = simple.match(/^[a-z][\w-]*/i)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      if ([...simple.matchAll(/#([\w-]+)/g)].some(([, id]) => this.id !== id)) return false;
      if ([...simple.matchAll(/\.([\w-]+)/g)].some(([, name]) => !(this.attributes.get("class") ?? "").split(/\s+/).includes(name))) return false;
      return [...simple.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/g)].every(([, name, expected]) =>
        expected === undefined ? this.attributes.has(name) : this.attributes.get(name) === expected);
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  append(...children) { children.forEach(child => { child.parentElement = this; this.children.push(child); }); }
  getBoundingClientRect() { return { left: 0, top: 0, width: D.WIDTH, height: D.HEIGHT }; }
  focus() {}
}

const editorOptions = app.match(/^const editor = new UIRaidEditor.Editor\([^]*?^\}\);/m)?.[0];
const labelChange = app.match(/^document.addEventListener\("change",[^]*?^\}\);/m)?.[0];
assert.ok(editorOptions); assert.ok(labelChange);
const compiledEditor = transformSync(`${extract("save")}\n${extract("renderStash")}\n${editorOptions}\n${labelChange}\nglobalThis.editor = editor;`, { loader: "ts", target: "es2022" }).code;
function editorFixture(t, run) {
  const names = ["document", "Element", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "requestAnimationFrame", "cancelAnimationFrame"];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  t.after(() => { for (const [name, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]; });
  const listeners = new Map(), frames = new Map(); let frameId = 0;
  const doc = { body: new ElementAdapter("body"), createElement: tag => new ElementAdapter(tag),
    addEventListener(type, callback) { listeners.set(type, [...listeners.get(type) ?? [], callback]); } };
  globalThis.document = doc;
  for (const name of names.slice(1, 5)) globalThis[name] = ElementAdapter;
  globalThis.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const nodes = Object.fromEntries(["stash-count", "stash-list", "player-body", "editor-overlay", "modal"].map(id => [id, new ElementAdapter("div", [{ name: "id", value: id }])]));
  const storage = new Map(), persistence = createRunPersistence({
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value),
  }, "stash-identity-");
  const counts = { build: 0, selected: 0 }, toasts = [];
  const context = vm.createContext({ run, C, D, P: D.PARTS, R, V, targetCaption, esc: V.esc,
    UIRaidEditor: { Editor }, document: doc, Element: ElementAdapter, HTMLInputElement: ElementAdapter, HTMLSelectElement: ElementAdapter,
    $: selector => nodes[selector.slice(1)], clone: structuredClone, memory: {}, runPersistence: persistence,
    storyActive: false, storySession: null, profileStore: null, saveOK: true, saveProblem: "",
    battle: null, preview: false, view: "self", renderStorageNotice() {},
    render() { context.renderStash(); }, renderSide() { counts.selected++; }, renderShop() {}, renderCoach() {},
    afterBuildChange() { counts.build++; }, toast: message => toasts.push(message),
  });
  vm.runInContext(compiledEditor, context); context.renderStash();
  const dispatch = (type, target, props = {}) => {
    const event = { target, pointerId: 1, button: 0, clientX: 0, clientY: 0, shiftKey: false, altKey: false,
      preventDefault() { this.defaultPrevented = true; }, ...props };
    for (const listener of listeners.get(type) ?? []) listener(event);
    return event;
  };
  return { context, editor: context.editor, nodes, counts, frames, toasts,
    row: id => nodes["stash-list"].querySelector(`[data-stash-id="${id}"]`),
    item: id => context.run.owned.find(part => part.id === id),
    rendered: () => renderStash(context.run),
    saved() { const result = persistence.load(context.run.mode); assert.equal(result.status, "loaded"); return result.run; },
    reload() { context.run = this.saved(); context.editor.reset(); context.renderStash(); },
    change(label) { const input = new ElementAdapter("input"); input.id = "part-label"; input.value = label; dispatch("change", input); },
    dispatch,
  };
}

function assertIdentity(f, id) {
  const button = f.rendered().buttons.find(button => attr(button, "data-stash-id") === id);
  assert.ok(button, `stashed ${id}`);
  assert.equal(textOf(button), targetCaption(f.item(id)));
  assert.equal(attr(button, "aria-label"), targetCaption(f.item(id)));
  assert.ok(attr(button, "title").includes(targetCaption(f.item(id))));
}

test("real app label editing saves raw stash identity through Undo/Redo and reload, rejecting overlength labels", t => {
  const run = R.newRun("lab", "blank"), bought = R.purchase(run, "gov_pdf");
  assert.equal(bought.ok, true); const id = bought.item.id;
  const f = editorFixture(t, run);
  for (const label of ['<img src=x onerror="bad()"> & \'copy\'', " \t資料\n A\u202e\u0000 ", "長".repeat(79) + "甲", " \t\n ", D.PARTS.gov_pdf.name, ""]) {
    const before = structuredClone(f.context.run); f.editor.select([id]); f.change(label);
    const edited = structuredClone(f.context.run);
    assert.deepEqual(edited, { ...before, owned: before.owned.map(item => item.id === id ? { ...item, label } : item) });
    assertIdentity(f, id); assert.equal(f.saved().owned.find(item => item.id === id).label, label);
    f.editor.undo(); assert.deepEqual(f.context.run, before); assertIdentity(f, id);
    f.editor.redo(); assert.deepEqual(f.context.run, edited); assertIdentity(f, id);
    f.reload(); assert.deepEqual(f.context.run, edited); assertIdentity(f, id);
  }
  f.editor.select([id]); const before = structuredClone(f.context.run), changes = f.counts.build;
  f.change("x".repeat(81));
  assert.deepEqual(f.context.run, before); assert.equal(f.counts.build, changes); assertIdentity(f, id);
  assert.equal(R.validateRun(f.context.run), true);
});

test("real mail stash child click and pointer drag choose the same owned ID without repurchasing", t => {
  const run = R.newRun("lab", "site_gmail"), ids = run.owned.filter(item => item.type === "ab_link").map(item => item.id);
  assert.equal(ids.length, 3); const f = editorFixture(t, run);
  f.editor.select(ids); f.editor.stash();
  const stashed = structuredClone(f.context.run), identity = stashed.owned.map(({ x, y, w, h, ...part }) => part);
  for (const id of ids) assertIdentity(f, id);
  const target = f.row(ids[1]).querySelector("span"); assert.ok(target);
  f.dispatch("click", target);
  assert.deepEqual([...f.editor.selection], [ids[1]]); assert.equal(f.editor.pending.id, ids[1]);
  assert.deepEqual(f.context.run, stashed, "click selects but does not spend or move");
  // A real page pointer down/up consumes the owned pending ID.
  f.dispatch("pointerdown", f.nodes["player-body"], { clientX: 380, clientY: 312 });
  f.dispatch("pointerup", f.nodes["player-body"], { clientX: 380, clientY: 312 });
  assert.equal(C.placed(f.item(ids[1])), true); assert.equal(f.editor.pending, null);
  assert.deepEqual([...f.editor.selection], [ids[1]]);
  assert.deepEqual(f.context.run.owned.map(({ x, y, w, h, ...part }) => part), identity);
  assert.equal(f.context.run.cash, stashed.cash); assert.equal(f.context.run.nextId, stashed.nextId);
  f.editor.undo(); assert.deepEqual(f.context.run, stashed); assertIdentity(f, ids[1]);
  // Pointer down on the nested span still resolves the original stash button.
  const dragTarget = f.row(ids[2]).querySelector("span");
  f.dispatch("pointerdown", dragTarget, { clientX: 20, clientY: 20 });
  assert.equal(f.editor.drag.kind, "stash"); assert.equal(f.editor.drag.item.id, ids[2]);
  f.dispatch("pointermove", dragTarget, { clientX: 380, clientY: 408, altKey: true });
  assert.equal(f.editor.drag.active, true); assert.equal(f.editor.drag.valid, true);
  f.dispatch("pointerup", dragTarget, { clientX: 380, clientY: 408, altKey: true });
  assert.equal(C.placed(f.item(ids[2])), true); assert.deepEqual([...f.editor.selection], [ids[2]]);
  assert.equal(f.editor.drag, null); assert.equal(f.editor.pending, null); assert.equal(f.frames.size, 0);
  assert.deepEqual(f.context.run.owned.map(({ x, y, w, h, ...part }) => part), identity);
  assert.equal(f.context.run.cash, stashed.cash); assert.equal(f.context.run.nextId, stashed.nextId);
  f.editor.undo(); assert.deepEqual(f.context.run, stashed); assertIdentity(f, ids[2]);
  f.reload(); assert.deepEqual(f.context.run, stashed); for (const id of ids) assertIdentity(f, id);
});

test("nested FRAMESET stash keeps each raw identity and loses nesting until individually re-placed; Undo restores it", t => {
  const run = R.newRun("lab", "site_figma"), original = structuredClone(run), ids = run.owned.map(item => item.id);
  assert.equal(ids.length, 3); assert.deepEqual(C.analyze(run.owned).parents, { [ids[1]]: ids[0], [ids[2]]: ids[1] });
  const f = editorFixture(t, run); f.editor.select([ids[0]]); f.editor.stash();
  const stashed = structuredClone(f.context.run);
  assert.deepEqual(stashed, { ...original, owned: original.owned.map(item => ({ ...item, x: null, y: null })) });
  assert.deepEqual(C.analyze(stashed.owned).parents, {}); assert.equal(f.editor.selection.size, 0);
  for (const id of ids) assertIdentity(f, id);
  f.editor.undo(); assert.deepEqual(f.context.run, original); assert.equal(f.rendered().count, "0");
  f.editor.redo(); assert.deepEqual(f.context.run, stashed); f.reload(); assert.deepEqual(f.context.run, stashed);
  const childId = ids[2]; f.dispatch("click", f.row(childId).querySelector("span"));
  f.dispatch("pointerdown", f.nodes["player-body"], { clientX: 400, clientY: 278 });
  f.dispatch("pointerup", f.nodes["player-body"], { clientX: 400, clientY: 278 });
  assert.equal(C.placed(f.item(childId)), true);
  assert.ok(ids.slice(0, 2).every(id => !C.placed(f.item(id))));
  assert.equal(f.rendered().count, "2"); assert.deepEqual(C.analyze(f.context.run.owned).parents, {});
  assert.equal(f.item(childId).label, original.owned[2].label);
  assert.equal(f.context.run.cash, original.cash); assert.equal(f.context.run.nextId, original.nextId);
  assert.equal(f.saved().owned.find(item => item.id === childId).label, original.owned[2].label);
  f.editor.undo(); assert.deepEqual(f.context.run, stashed); for (const id of ids) assertIdentity(f, id);
});
