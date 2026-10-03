import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { parseFragment } from "parse5";
import { Editor } from "../src/editor.js";
import C from "../src/document.js";
import R from "../src/run.js";
import V from "../src/components.js";

// Use the app's actual mode gate, rather than a second keyboard/mode algorithm.
const appSource = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const enabledSource = appSource.match(/  enabled: \(\) =>\n([^]*?),\n  onChange:/)?.[1];
assert.ok(enabledSource, "production Editor enabled callback");
const compiledEnabled = transformSync(`globalThis.enabled = () => (${enabledSource});`, {
  loader: "ts", target: "es2022",
}).code;

// A DOM boundary adapter: production Components.render builds the real wrappers
// and native markup. Focus/events/selectors are adapted; no browser pixels or
// native default actions are claimed. Editor's constructor and methods are real.
class ElementAdapter {
  constructor(doc, tag) {
    Object.assign(this, { ownerDocument: doc, tagName: tag.toUpperCase(),
      parentElement: null, children: [], attributes: {}, dataset: {}, className: "",
      id: "", tabIndex: -1, style: { setProperty() {} }, open: false });
    this.classList = {
      add: (...names) => names.forEach(name => this.classList.toggle(name, true)),
      remove: (...names) => names.forEach(name => this.classList.toggle(name, false)),
      toggle: (name, force) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        if (force ?? !names.has(name)) names.add(name); else names.delete(name);
        this.className = [...names].join(" ");
      },
    };
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "class") this.className = value;
    if (name === "id") this.id = value;
    if (name === "tabindex") this.tabIndex = Number(value);
    if (name.startsWith("data-")) this.dataset[this.dataKey(name)] = value;
    if (name === "open") this.open = true;
  }
  dataKey(name) { return name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
  getAttribute(name) {
    if (name === "class") return this.className;
    if (name === "id") return this.id;
    if (name.startsWith("data-")) return this.dataset[this.dataKey(name)] ?? null;
    return this.attributes[name] ?? null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  get isContentEditable() {
    const value = this.getAttribute("contenteditable");
    if (value === "false") return false;
    if (["", "true", "plaintext-only"].includes(value)) return true;
    return this.parentElement?.isContentEditable ?? false;
  }
  append(...nodes) {
    for (const node of nodes) { node.parentElement = this; this.children.push(node); }
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...nodes);
  }
  set innerHTML(html) {
    const convert = node => {
      const el = this.ownerDocument.createElement(node.tagName);
      for (const attr of node.attrs ?? []) el.setAttribute(attr.name, attr.value);
      el.append(...(node.childNodes ?? []).filter(child => child.tagName).map(convert));
      return el;
    };
    this.replaceChildren(...parseFragment(html).childNodes.filter(node => node.tagName).map(convert));
  }
  matches(selector) {
    return selector.split(",").some(part => {
      let simple = part.trim();
      const attributes = [...simple.matchAll(/\[([^=\]]+)(?:=["']?([^"'\]]*)["']?)?\]/g)];
      if (attributes.some(([, name, value]) => value === undefined
        ? !this.hasAttribute(name) : this.getAttribute(name) !== value)) return false;
      simple = simple.replace(/\[[^\]]+\]/g, "");
      const id = simple.match(/#([\w-]+)/)?.[1];
      if (id && this.id !== id) return false;
      if ([...simple.matchAll(/\.([\w-]+)/g)].some(([, name]) =>
        !this.className.split(/\s+/).includes(name))) return false;
      const tag = simple.match(/^[a-z][\w-]*/i)?.[0];
      return !tag || this.tagName === tag.toUpperCase();
    });
  }
  closest(selector) {
    if (this.matches(selector)) return this;
    return this.parentElement?.closest(selector) ?? null;
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [
      ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  focus() { this.ownerDocument.activeElement = this; }
}

function paidRun() {
  const run = R.newRun("campaign", "mixed", { tutorial: true });
  for (const type of ["ab_link", "ab_nav", "ab_heading"]) {
    const result = R.purchase(run, type);
    assert.equal(result.ok, true);
    const index = run.owned.length - 1;
    assert.equal(R.move(run, result.item.id,
      index === 1 ? 64 + run.owned[0].w : 64, index === 2 ? 200 : 64), true);
  }
  assert.equal(run.cash, 0, "the three guaranteed parts cost the actual starting $11");
  assert.equal(R.validateRun(run), true);
  return run;
}

function harness(t, run = paidRun()) {
  const listeners = new Map();
  const document = {
    activeElement: null,
    createElement(tag) { return new ElementAdapter(this, tag); },
    addEventListener(type, fn) { listeners.set(type, [...listeners.get(type) ?? [], fn]); },
    querySelector(selector) { return this.body.querySelector(selector); },
  };
  document.body = document.createElement("body");
  const original = Object.fromEntries(["document", "Element", "HTMLElement"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { document, Element: ElementAdapter, HTMLElement: ElementAdapter });
  t.after(() => {
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const host = document.createElement("div"), modal = document.createElement("dialog");
  host.id = "player-body";
  document.body.append(host, modal);
  const state = { run, battle: null, preview: false, view: "self", $: () => modal };
  vm.runInNewContext(compiledEnabled, state);
  const events = { changes: 0, selections: 0, toasts: [] };
  const editor = new Editor({
    getRun: () => run, getHost: () => host, getOverlay: () => null,
    enabled: () => !state.disabled && state.enabled(),
    onChange: () => events.changes++, onSelect: () => events.selections++,
    onToast: message => events.toasts.push(message), paint() {},
  });
  V.render(host, run.owned, { side: "player" });
  const part = id => host.querySelector(`.web-node[data-id="${id}"]`);
  function key(target, key, options = {}) {
    if (options.focus !== false) target?.focus();
    const event = { target, key, ctrlKey: false, metaKey: false, altKey: false,
      shiftKey: false, repeat: false, isComposing: false, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...options };
    for (const listener of listeners.get("keydown") ?? []) listener(event);
    return event;
  }
  return { run, editor, host, modal, document, state, events, key, part };
}

for (const activation of ["Enter", " "]) {
  test(`${JSON.stringify(activation)} selects a focused rendered owned part without editing the run`, t => {
    const h = harness(t), item = h.run.owned[0], node = h.part(item.id);
    const before = structuredClone(h.run);
    assert.equal(node.tabIndex, 0);
    assert.equal(node.getAttribute("role"), "group");
    h.editor.pending = { type: "ab_link" };
    assert.equal(h.key(node, activation).defaultPrevented, true);
    assert.deepEqual([...h.editor.selection], [item.id]);
    assert.equal(h.editor.pending, null);
    assert.equal(h.document.activeElement, node);
    assert.deepEqual(h.run, before);
    assert.equal(h.events.selections, 1);
    assert.equal(h.events.changes, 0);
    assert.deepEqual(h.editor.history, []);
  });
}

test("plain activation preserves selected groups, replaces other selections, and Shift toggles membership", t => {
  const h = harness(t), [a, b, c] = h.run.owned.map(item => item.id);
  h.key(h.part(a), "Enter");
  h.key(h.part(b), " ", { shiftKey: true });
  assert.deepEqual([...h.editor.selection], [a, b]);
  const pending = { type: "ab_link" };
  h.editor.pending = pending;
  h.key(h.part(a), "Enter");
  assert.deepEqual([...h.editor.selection], [a, b]);
  assert.equal(h.editor.pending, pending, "already selected activation matches pointer selection");
  h.key(h.part(b), "Enter", { shiftKey: true });
  assert.deepEqual([...h.editor.selection], [a]);
  assert.equal(h.editor.pending, pending, "additive selection matches pointer Shift behavior");
  h.key(h.part(c), " ");
  assert.deepEqual([...h.editor.selection], [c]);
  assert.equal(h.editor.pending, null);
  h.key(h.part(c), " ", { shiftKey: true });
  assert.deepEqual([...h.editor.selection], []);
  assert.equal(h.events.changes, 0);
});

test("held activation prevents Space scrolling without repeating Shift toggles", t => {
  const h = harness(t), node = h.part(h.run.owned[0].id);
  h.key(node, " ", { shiftKey: true });
  for (const key of [" ", "Enter"]) {
    assert.equal(h.key(node, key, { shiftKey: true, repeat: true }).defaultPrevented, true);
  }
  assert.deepEqual([...h.editor.selection], [h.run.owned[0].id]);
  assert.equal(h.events.selections, 1);
  h.key(node, " ", { shiftKey: true });
  assert.equal(h.editor.selection.size, 0);
});

test("keyboard-selected paid parts use real stash, undo, redo and exact run snapshots", t => {
  const h = harness(t), [a, b] = h.run.owned.map(item => item.id), before = structuredClone(h.run);
  h.key(h.part(a), "Enter");
  h.key(h.part(b), " ", { shiftKey: true });
  assert.equal(h.key(h.part(b), "Delete").defaultPrevented, true);
  assert.ok(h.run.owned.filter(item => [a, b].includes(item.id)).every(item => item.x === null && item.y === null));
  assert.equal(h.run.owned.length, before.owned.length);
  assert.equal(h.run.cash, before.cash);
  assert.equal(h.editor.history.length, 1);
  const stashed = structuredClone(h.run);
  h.key(h.host, "z", { ctrlKey: true });
  assert.deepEqual(h.run, before);
  h.key(h.host, "z", { metaKey: true, shiftKey: true });
  assert.deepEqual(h.run, stashed);
  h.key(h.host, "z", { metaKey: true });
  assert.deepEqual(h.run, before);
  h.key(h.host, "y", { ctrlKey: true });
  assert.deepEqual(h.run, stashed);
  assert.equal(h.events.changes, 5);
  assert.equal(R.validateRun(h.run), true);
});

test("keyboard-selected parts retain group selection and repeated arrow movement commands", t => {
  const h = harness(t), [a, b, c] = h.run.owned, before = structuredClone(h.run);
  assert.deepEqual(C.analyze(h.run.owned).member[a.id][0].items, [a.id, b.id]);
  h.key(h.part(a.id), "Enter");
  h.key(h.part(a.id), "g");
  assert.deepEqual([...h.editor.selection], [a.id, b.id]);
  h.key(h.part(a.id), "ArrowDown");
  h.key(h.part(a.id), "ArrowDown", { repeat: true, shiftKey: true });
  assert.equal(a.y, before.owned[0].y + 11);
  assert.equal(b.y, before.owned[1].y + 11);
  assert.deepEqual(c, before.owned[2]);
  assert.equal(h.editor.history.length, 2);
  h.key(h.host, "z", { ctrlKey: true });
  h.key(h.host, "z", { ctrlKey: true });
  assert.deepEqual(h.run, before);
});

test("activation leaves modifier shortcuts and composition events alone", t => {
  const h = harness(t), node = h.part(h.run.owned[0].id), before = structuredClone(h.run);
  for (const key of ["Enter", " "])
    for (const option of ["ctrlKey", "metaKey", "altKey", "isComposing"])
      assert.equal(h.key(node, key, { [option]: true }).defaultPrevented, false);
  assert.equal(h.editor.selection.size, 0);
  assert.equal(h.events.selections, 0);
  assert.deepEqual(h.run, before);
});

test("native controls and editable regions retain all their keys even inside a part", t => {
  const h = harness(t), node = h.part(h.run.owned[0].id), before = structuredClone(h.run);
  h.editor.select([h.run.owned[0].id]);
  const controls = ["input", "textarea", "select"].map(tag => h.document.createElement(tag));
  for (const value of ["true", "", "plaintext-only"]) {
    const region = h.document.createElement("div"), child = h.document.createElement("span");
    region.setAttribute("contenteditable", value);
    region.append(child);
    controls.push(region, child);
  }
  for (const control of controls) {
    if (!control.parentElement) node.append(control);
    for (const [key, options] of [["Enter", {}], [" ", { shiftKey: true }],
      ["Delete", {}], ["Backspace", {}], ["ArrowDown", {}], ["g", {}],
      ["z", { ctrlKey: true }], ["d", { metaKey: true }]]) {
      assert.equal(h.key(control, key, options).defaultPrevented, false, `${control.tagName} ${key}`);
      assert.deepEqual([...h.editor.selection], [h.run.owned[0].id]);
      assert.deepEqual(h.run, before);
    }
  }
  assert.equal(h.events.changes, 0);
});

test("activation ignores native descendants, other buttons, enemy/thumb and non-owned or unplaced wrappers", t => {
  const h = harness(t), item = h.run.owned[0], node = h.part(item.id);
  const anchor = node.querySelector("a"), button = h.document.createElement("button");
  assert.equal(anchor.tabIndex, -1, "render keeps edit-mode native controls out of the tab order");
  h.document.body.append(button);
  const child = h.document.createElement("span"); node.append(child);
  const targets = [anchor, button, child, h.host];
  const nativeButton = h.document.createElement("button"), buttonChild = h.document.createElement("span");
  nativeButton.append(buttonChild); node.append(nativeButton);
  targets.push(nativeButton, buttonChild);
  for (const side of ["enemy", "thumb"]) {
    const foreign = V.create(item, { side });
    h.host.append(foreign); // Even an owned ID inside the host is insufficient for a foreign side.
    targets.push(foreign);
  }
  const outside = V.create(item), unknown = V.create({ ...item, id: "not-owned" });
  h.document.body.append(outside); h.host.append(unknown);
  targets.push(outside, unknown);
  const unplaced = h.run.owned[2];
  assert.equal(R.move(h.run, unplaced.id, null, null), true);
  targets.push(h.part(unplaced.id)); // Stale rendered node after it moves to the stash.
  for (const target of targets)
    for (const key of ["Enter", " "])
      assert.equal(h.key(target, key, { shiftKey: true }).defaultPrevented, false);
  h.host.focus();
  assert.equal(h.key(node, "Enter", { focus: false }).defaultPrevented, false);
  assert.equal(h.key(null, "Enter", { focus: false }).defaultPrevented, false);
  assert.equal(h.editor.selection.size, 0);
  assert.equal(h.events.selections, 0);
});

test("actual app preview, battle, enemy-view, phase and modal gates keep activation disabled", t => {
  const h = harness(t), node = h.part(h.run.owned[0].id), before = structuredClone(h.run);
  const cases = [
    [h.state, "preview", true], [h.state, "battle", {}], [h.state, "view", "enemy"],
    [h.state, "disabled", true], [h.run, "phase", "reward"], [h.modal, "open", true],
  ];
  for (const [owner, key, value] of cases) {
    const previous = owner[key]; owner[key] = value;
    for (const activation of ["Enter", " "])
      assert.equal(h.key(node, activation).defaultPrevented, false, key);
    owner[key] = previous;
  }
  const otherDialog = h.document.createElement("dialog");
  otherDialog.setAttribute("open", ""); h.document.body.append(otherDialog);
  assert.equal(h.key(node, "Enter").defaultPrevented, false, "another open dialog");
  assert.equal(h.editor.selection.size, 0);
  assert.deepEqual(h.run, before);
});
