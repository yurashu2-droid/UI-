import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { parseFragment } from "parse5";
import D from "../src/data.js";
import { createOnlineClient } from "../src/online/client.js";
import { createArenaServer } from "../server/arena/http.js";

// Complete production panel, renderer, client and real temporary HTTP arena.
// Only DOM event/focus mechanics are adapted. Purchases, placements, publication
// and matching use ordinary commands, without patched stores or seeded pools.
// These assertions do not certify browser tab order, pixels or screen readers.
const compiled = buildSync({
  entryPoints: [new URL("../src/online/panel.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "OnlinePanel",
  platform: "browser",
  target: "es2022",
  loader: { ".css": "empty" },
}).outputFiles[0].text;
const camel = (value) => value.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

class ElementAdapter {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      },
    };
    this.className = "";
    this.id = "";
    this.open = false;
    this._text = "";
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      add: (...names) => {
        this.className = [
          ...new Set([
            ...this.className.split(/\s+/).filter(Boolean),
            ...names,
          ]),
        ].join(" ");
      },
      remove: (...names) => {
        this.className = this.className
          .split(/\s+/)
          .filter((name) => !names.includes(name))
          .join(" ");
      },
      toggle: (name, force) => {
        const add = force ?? !this.classList.contains(name);
        this.classList[add ? "add" : "remove"](name);
        return add;
      },
    };
  }
  get title() {
    return this.getAttribute("title") ?? "";
  }
  set title(value) {
    this.setAttribute("title", value);
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter(
        (node) => node !== this,
      );
    this.parentElement = null;
  }
  get tabIndex() {
    const value = this.getAttribute("tabindex");
    return value === null ? -1 : Number(value);
  }
  set tabIndex(value) {
    this.setAttribute("tabindex", String(value));
  }
  get isContentEditable() {
    const value = this.getAttribute("contenteditable")?.toLowerCase();
    if (value === "false") return false;
    if (value === "" || value === "true" || value === "plaintext-only")
      return true;
    return this.parentElement?.isContentEditable ?? false;
  }
  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === "id") this.id = text;
    if (name === "class") this.className = text;
    if (name === "open") this.open = true;
    if (name.startsWith("data-")) this.dataset[camel(name.slice(5))] = text;
  }
  getAttribute(name) {
    if (name === "class") return this.className || null;
    if (name === "id") return this.id || null;
    if (name === "open") return this.open ? "" : null;
    if (name.startsWith("data-"))
      return this.dataset[camel(name.slice(5))] ?? null;
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name) {
    return this.getAttribute(name) !== null;
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentElement)
        node.parentElement.children = node.parentElement.children.filter(
          (child) => child !== node,
        );
      node.parentElement = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    if (
      this.children.some((node) =>
        node.contains(this.ownerDocument.activeElement),
      )
    )
      this.ownerDocument.activeElement = this.ownerDocument.body;
    for (const node of this.children) node.parentElement = null;
    this.children = [];
    this._text = "";
    this.append(...nodes);
  }
  contains(node) {
    return node === this || this.children.some((child) => child.contains(node));
  }
  set innerHTML(html) {
    const convert = (node) => {
      if (!node.tagName) return null;
      const element = this.ownerDocument.createElement(node.tagName);
      for (const { name, value } of node.attrs || [])
        element.setAttribute(name, value);
      element._text = (node.childNodes || [])
        .filter((child) => child.nodeName === "#text")
        .map((child) => child.value)
        .join("");
      element.append(...(node.childNodes || []).map(convert).filter(Boolean));
      return element;
    };
    this.replaceChildren(
      ...parseFragment(html).childNodes.map(convert).filter(Boolean),
    );
  }
  get textContent() {
    return (
      this._text + this.children.map((child) => child.textContent).join("")
    );
  }
  set textContent(value) {
    this.replaceChildren();
    this._text = String(value);
  }
  matches(selector) {
    return selector.split(",").some((part) => {
      const chain = part.trim().split(/\s+/),
        simple = chain.pop();
      if (!simple) return false;
      const tag = simple.match(/^[a-z][\w-]*/i)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      for (const [, id] of simple.matchAll(/#([\w-]+)/g))
        if (this.id !== id) return false;
      for (const [, name] of simple.matchAll(/\.([\w-]+)/g))
        if (!this.classList.contains(name)) return false;
      for (const [, name, , value] of simple.matchAll(
        /\[([\w-]+)(?:=(['"]?)([^'"\]]*)\2)?\]/g,
      )) {
        if (
          this.getAttribute(name) === null ||
          (value !== undefined && this.getAttribute(name) !== value)
        )
          return false;
      }
      if (!chain.length) return true;
      if (chain.at(-1) === ">") {
        chain.pop();
        return this.parentElement?.matches(chain.join(" ")) ?? false;
      }
      let ancestor = this.parentElement;
      while (ancestor) {
        if (ancestor.matches(chain.join(" "))) return true;
        ancestor = ancestor.parentElement;
      }
      return false;
    });
  }
  closest(selector) {
    return this.matches(selector)
      ? this
      : (this.parentElement?.closest(selector) ?? null);
  }
  querySelectorAll(selector) {
    if (selector.startsWith(":scope > "))
      return this.children.filter((child) => child.matches(selector.slice(9)));
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  get isConnected() {
    return this.ownerDocument.body.contains(this);
  }
  focus(options) {
    this.ownerDocument.focusCalls.push({ node: this, options });
    if (this.isConnected) this.ownerDocument.activeElement = this;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 960, height: 680 };
  }
}

Object.assign(ElementAdapter.prototype, {
  addEventListener(type, listener, options) {
    this.events ??= {};
    (this.events[type] ??= []).push(listener);
    options?.signal.addEventListener("abort", () => {
      this.events[type] = this.events[type].filter((fn) => fn !== listener);
    });
  },
  before(node) {
    const parent = this.parentElement;
    node.parentElement = parent;
    parent.children.splice(parent.children.indexOf(this), 0, node);
  },
  after(node) {
    const parent = this.parentElement;
    node.parentElement = parent;
    parent.children.splice(parent.children.indexOf(this) + 1, 0, node);
  },
  setPointerCapture(id) {
    this.pointer = id;
  },
  hasPointerCapture(id) {
    return this.pointer === id;
  },
  releasePointerCapture() {
    this.pointer = null;
  },
});
Object.defineProperties(ElementAdapter.prototype, {
  firstElementChild: {
    get() {
      return this.children[0];
    },
  },
  clientWidth: {
    get() {
      return 960;
    },
  },
  disabled: {
    get() {
      return this.hasAttribute("disabled");
    },
  },
});
class InputAdapter extends ElementAdapter {
  get value() {
    return this._value ?? this.getAttribute("value") ?? "";
  }
  set value(value) {
    this._value = String(value);
  }
}
class FormAdapter extends ElementAdapter {}
class SelectAdapter extends ElementAdapter {
  get options() {
    return this.children.filter((node) => node.tagName === "OPTION");
  }
  get selectedIndex() {
    if (this._none) return -1;
    const index = this.options.findIndex((node) =>
      node.hasAttribute("selected"),
    );
    return index < 0 && this.options.length ? 0 : index;
  }
  set selectedIndex(index) {
    this._none = index < 0;
    this.options.forEach((node, i) =>
      i === index
        ? node.setAttribute("selected", "")
        : node.attributes.delete("selected"),
    );
  }
  get selectedOptions() {
    return this.selectedIndex < 0 ? [] : [this.options[this.selectedIndex]];
  }
  get value() {
    return this.selectedOptions[0]?.getAttribute("value") ?? "";
  }
  set value(value) {
    this.selectedIndex = this.options.findIndex(
      (node) => node.getAttribute("value") === value,
    );
  }
}

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "online-keyboard-selection-"));
  const server = createArenaServer({ filePath: join(dir, "store.json") });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/arena`;
  const commands = [],
    faults = [],
    peers = [],
    releases = [];
  let cookie = "",
    active = 0;
  const transport = async (url, init) => {
    active++;
    try {
      const isCommand = String(url).endsWith("/command");
      if (isCommand) commands.push(JSON.parse(init.body));
      const fault = isCommand ? faults.shift() : null;
      const response = await fetch(url, {
        ...init,
        headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
      });
      const next = response.headers.get("set-cookie");
      if (next) cookie = next.split(";")[0];
      if (fault?.gate) {
        fault.captured();
        await fault.gate;
      }
      if (fault?.lost) {
        assert.equal(
          response.ok,
          true,
          "lost reply follows a committed operation",
        );
        await response.arrayBuffer();
        return Response.json(
          { code: "PROXY_503", message: "Reply lost" },
          { status: 503 },
        );
      }
      return response;
    } finally {
      active--;
    }
  };
  const doc = {
    focusCalls: [],
    createElement(tag) {
      const Type =
        { input: InputAdapter, select: SelectAdapter, form: FormAdapter }[
          tag
        ] ?? ElementAdapter;
      return new Type(tag, this);
    },
  };
  doc.body = doc.createElement("body");
  doc.activeElement = doc.body;
  const host = doc.createElement("div");
  doc.body.append(host);
  const frames = new Map();
  let frameId = 0;
  const context = {
    document: doc,
    fetch: transport,
    crypto,
    structuredClone,
    Error,
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    performance,
    TextEncoder,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame(fn) {
      frames.set(++frameId, fn);
      return frameId;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    matchMedia: () => ({ matches: true }),
    window: { addEventListener() {} },
    Element: ElementAdapter,
    HTMLElement: ElementAdapter,
    HTMLInputElement: InputAdapter,
    HTMLSelectElement: SelectAdapter,
    HTMLFormElement: FormAdapter,
    FormData: class {
      constructor(form) {
        this.form = form;
      }
      get(name) {
        return this.form.querySelector(`[name="${name}"]`)?.value ?? null;
      }
    },
  };
  const mount = vm.runInNewContext(
    compiled + "\nOnlinePanel.mountOnlinePanel;",
    context,
  );
  let handle;
  const open = () => {
    handle = mount(host, { baseUrl: base, onClose: () => handle.dispose() });
  };
  open();
  t.after(async () => {
    releases.forEach((release) => release());
    handle.dispose();
    peers.forEach((peer) => peer.dispose());
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  const root = () => host.children[0];
  async function flush() {
    const deadline = Date.now() + 6000;
    while (active) {
      assert.ok(Date.now() < deadline, "HTTP settles within fixture deadline");
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  function dispatch(type, target, extra = {}) {
    const event = {
      target,
      defaultPrevented: false,
      stopPropagation() {},
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...extra,
    };
    for (const listener of root().events?.[type] ?? []) listener(event);
    return event;
  }
  const node = (kind) => root().querySelector(`[data-arena="${kind}"]`);
  async function click(kind, target = node(kind)) {
    assert.ok(target, `${kind} exists`);
    assert.equal(target.disabled, false, `${kind} is enabled`);
    dispatch("click", target);
    await flush();
  }
  async function state() {
    const response = await fetch(base + "/state", { headers: { cookie } });
    assert.equal(response.status, 200);
    return response.json();
  }
  await flush();
  return {
    root,
    node,
    click,
    state,
    flush,
    dispatch,
    doc,
    host,
    commands,
    faults,
    frames,
    part(id, side = "self") {
      return root().querySelector(
        `[data-arena-board="${side}"] [data-id="${id}"]`,
      );
    },
    key(target, key = "Enter", extra = {}) {
      return dispatch("keydown", target, { key, ...extra });
    },
    form() {
      return root().querySelector("[data-arena-layout]");
    },
    async prepare() {
      let spent = 0;
      for (let index = 0; index < 2; index++) {
        const stock = root()
          .querySelectorAll('[data-arena="buy"]')
          .find(
            (button) =>
              !button.disabled &&
              D.PARTS[button.dataset.type] &&
              (index > 0 || D.PARTS[button.dataset.type].kind === "attack"),
          );
        assert.ok(
          stock,
          "initial real stock has two affordable standard parts",
        );
        spent += D.PARTS[stock.dataset.type].price;
        await click("buy", stock);
        await click("place");
      }
      const current = await state();
      assert.equal(
        current.run.cash,
        10 - spent,
        "ordinary acquisitions pay the actual shop prices",
      );
      return current.run.owned;
    },
    async reopen() {
      handle.dispose();
      open();
      await flush();
    },
    async submit(values) {
      const form = this.form();
      assert.ok(form, "selected item has its real placement form");
      for (const [name, value] of Object.entries(values))
        form.querySelector(`[name="${name}"]`).value = value;
      dispatch("submit", form);
      await flush();
    },
    async peer() {
      let peerCookie = "";
      const peer = createOnlineClient(base, {
        fetch: async (url, init) => {
          const response = await fetch(url, {
            ...init,
            headers: {
              ...init.headers,
              ...(peerCookie ? { cookie: peerCookie } : {}),
            },
          });
          const next = response.headers.get("set-cookie");
          if (next) peerCookie = next.split(";")[0];
          return response;
        },
      });
      peers.push(peer);
      await peer.connect();
      const stock = peer.current.run.shop.find(
        (stock) => D.PARTS[stock.type]?.kind === "attack",
      );
      assert.ok(stock);
      const bought = await peer.command({ kind: "purchase", type: stock.type });
      const p = bought.run.owned[0];
      await peer.command({
        kind: "placement",
        items: [{ id: p.id, x: 32, y: 32, w: p.w, h: p.h }],
      });
      await peer.command({ kind: "publish" });
      return peer;
    },
    hold() {
      let release, captured;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const seen = new Promise((resolve) => {
        captured = resolve;
      });
      releases.push(release);
      faults.push({ gate, captured });
      return { release, seen };
    },
  };
}

test("reopened acquired online build can select and edit each focused part with Enter or Space", async (t) => {
  const h = await fixture(t);
  const parts = await h.prepare();
  await h.reopen();
  assert.equal(h.form(), null, "reopened run starts with no item selected");
  for (const [index, key] of ["Enter", " "].entries()) {
    const part = parts[index],
      before = await h.state(),
      count = h.commands.length;
    const target = h.part(part.id);
    assert.equal(
      target.tabIndex,
      0,
      "production renderer exposes a focusable group",
    );
    target.focus();
    h.key(target, key);
    assert.ok(
      h.form(),
      `${key === " " ? "Space" : "Enter"} opens the focused item's inspector`,
    );
    assert.ok(h.part(part.id).classList.contains("is-selected"));
    assert.ok(
      h.doc.activeElement === h.part(part.id),
      "focus follows only the chosen live group across repaint",
    );
    assert.equal(
      h.commands.length,
      count,
      "selection is local and does not acquire or move parts",
    );
    assert.deepEqual(await h.state(), before);
    await h.submit({ x: 32, y: 300 });
    const moved = await h.state();
    assert.equal(moved.run.owned.find((p) => p.id === part.id).y, 300);
    assert.equal(moved.run.cash, before.run.cash);
    assert.equal(moved.revision, before.revision + 1);
    await h.click("undo");
    assert.deepEqual(
      (await h.state()).run,
      before.run,
      "keyboard-selected form uses the existing authoritative Undo path",
    );
  }
});

test("selection stays local through an empty pool and resumes after verified replay and settlement", async (t) => {
  const h = await fixture(t);
  const parts = await h.prepare();
  await h.click("match");
  assert.ok(
    h.root().querySelector("[data-arena-no-opponent]"),
    "real empty pool is reported",
  );
  const published = await h.state(),
    count = h.commands.length;
  h.part(parts[0].id).focus();
  h.key(h.part(parts[0].id), " ");
  assert.ok(
    h.part(parts[0].id).classList.contains("is-selected"),
    "can return to a different item after empty search",
  );
  assert.ok(h.doc.activeElement === h.part(parts[0].id));
  assert.equal(h.commands.length, count);
  assert.deepEqual(await h.state(), published);
  assert.equal(
    h.node("undo").disabled,
    false,
    "empty-pool keyboard selection keeps existing edit history",
  );

  await h.peer();
  await h.click("match");
  const battle = await h.state();
  assert.equal(battle.run.phase, "battle");
  await h.click("replay");
  const deadline = Date.now() + 6000;
  while (!h.frames.size) {
    assert.ok(
      Date.now() < deadline,
      "actual verified replay schedules its frame: " +
        h.root().querySelector(".arena-status").textContent,
    );
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  const replayCommands = h.commands.length;
  for (const side of ["self", "opponent"]) {
    const group = h
      .root()
      .querySelector(`[data-arena-board="${side}"]`)
      .querySelector(".web-node");
    group.focus();
    assert.equal(
      h.key(group).defaultPrevented,
      false,
      "non-build keys do not masquerade as an editor action",
    );
    assert.equal(h.form(), null, "replay parts cannot open an editor");
  }
  assert.equal(h.commands.length, replayCommands);
  await h.click("settle");
  if ((await h.state()).run.phase === "reward") await h.click("skip");
  assert.equal((await h.state()).run.phase, "build");
  assert.equal((await h.state()).run.stage, 1);
  assert.equal(
    h.frames.size,
    0,
    "settlement stops replay before returning to build",
  );
  await h.reopen();
  const resumed = await h.state(),
    resumedCommands = h.commands.length;
  h.part(parts[0].id).focus();
  h.key(h.part(parts[0].id));
  assert.ok(h.form(), "reconnected next-round part can reopen its inspector");
  assert.ok(h.doc.activeElement === h.part(parts[0].id));
  assert.equal(h.commands.length, resumedCommands);
  assert.deepEqual(await h.state(), resumed);
});

test("only an unmodified activation of the current focused own group selects; native controls and draft fields survive", async (t) => {
  const h = await fixture(t);
  const parts = await h.prepare();
  await h.reopen();
  const first = h.part(parts[0].id);
  const native = first.querySelector("a,button,input,select");
  assert.ok(
    native,
    "ordinary acquired attacker includes its actual native control",
  );
  native.focus();
  assert.equal(h.key(native).defaultPrevented, false);
  assert.equal(h.form(), null, "native child activation is not part selection");
  first.focus();
  for (const extra of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { isComposing: true },
  ]) {
    assert.equal(h.key(first, "Enter", extra).defaultPrevented, false);
    assert.equal(h.form(), null);
  }
  assert.equal(
    h.key(first, " ", { repeat: true }).defaultPrevented,
    true,
    "held Space does not scroll the editor",
  );
  assert.equal(h.form(), null, "held key does not start a new selection");
  h.doc.activeElement = h.doc.body;
  h.key(first);
  assert.equal(h.form(), null, "unfocused group is ignored");

  await h.reopen();
  h.doc.activeElement = first;
  h.key(first);
  assert.equal(
    h.form(),
    null,
    "detached group from the preceding panel is ignored",
  );
  const live = h.part(parts[0].id);
  const foreign = h.doc.createElement("div");
  foreign.className = "web-node";
  foreign.dataset.id = parts[0].id;
  foreign.dataset.side = "player";
  h.root().append(foreign);
  foreign.focus();
  h.key(foreign);
  assert.equal(
    h.form(),
    null,
    "matching attributes outside the actual own page are ignored",
  );
  foreign.remove();
  live.focus();
  assert.equal(h.key(live).defaultPrevented, true);
  const form = h.form();
  assert.ok(form);
  form.querySelector('[name="x"]').value = "333";
  const focused = h.part(parts[0].id);
  h.key(focused, " ");
  assert.ok(
    h.form() === form,
    "activating the selected item does not replace unsaved fields",
  );
  assert.equal(form.querySelector('[name="x"]').value, "333");
  form.querySelector('[name="x"]').focus();
  assert.equal(
    h.key(form.querySelector('[name="x"]')).defaultPrevented,
    false,
    "Enter remains available to the native inspector form",
  );
  assert.ok(h.form() === form);

  h.dispatch("pointerdown", h.part(parts[0].id), {
    button: 0,
    clientX: 0,
    clientY: 0,
    pointerId: 9,
  });
  const second = h.part(parts[1].id);
  second.focus();
  assert.equal(h.key(second).defaultPrevented, false);
  assert.ok(
    h.part(parts[0].id).classList.contains("is-selected"),
    "active pointer drag owns selection",
  );
  h.dispatch("pointercancel", h.root());
});

test("in-flight and uncertain commands lock keyboard selection until the same receipt is resolved", async (t) => {
  const h = await fixture(t);
  const parts = await h.prepare();
  const pending = h.hold();
  h.dispatch("click", h.node("publish"));
  await pending.seen;
  h.part(parts[0].id).focus();
  const before = h.commands.length;
  assert.equal(h.key(h.part(parts[0].id)).defaultPrevented, false);
  assert.ok(
    h.part(parts[1].id).classList.contains("is-selected"),
    "in-flight publication keeps selected item",
  );
  pending.release();
  await h.flush();
  assert.equal(h.commands.length, before);
  h.faults.push({ lost: true });
  await h.click("publish");
  const original = h.commands.at(-1);
  assert.ok(h.node("retry"));
  h.part(parts[0].id).focus();
  assert.equal(h.key(h.part(parts[0].id), " ").defaultPrevented, false);
  assert.ok(
    h.part(parts[1].id).classList.contains("is-selected"),
    "uncertain receipt keeps selected item",
  );
  await h.click("retry");
  assert.deepEqual(h.commands.at(-1), original);
  const resolved = await h.state(),
    count = h.commands.length;
  h.part(parts[0].id).focus();
  h.key(h.part(parts[0].id));
  assert.ok(
    h.part(parts[0].id).classList.contains("is-selected"),
    "explicit receipt recovery unlocks keyboard selection",
  );
  assert.ok(h.doc.activeElement === h.part(parts[0].id));
  assert.equal(h.commands.length, count);
  assert.deepEqual(await h.state(), resolved);
});
