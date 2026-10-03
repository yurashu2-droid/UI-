import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { parseFragment } from "parse5";
import D from "../src/data.js";
import C from "../src/document.js";
import R from "../src/run.js";
import V from "../src/components.js";
import E from "../src/engine.js";
import { incomeRouteGuidance } from "../src/income-route-guidance.js";
import { createOnlineClient, OnlineError } from "../src/online/client.js";
import * as layout from "../src/online/layout.js";
import * as replay from "../src/online/replay.js";
import { isSupportedCombatVersion } from "../src/combat-rules.js";
import { createArenaServer } from "../server/arena/http.js";

// Mount the complete production panel with its real client, layout and native
// components against a temporary durable HTTP arena. The DOM adapter supplies
// event dispatch and parsed HTML only; browser layout/focus are not asserted.
const source = readFileSync(
  new URL("../src/online/panel.ts", import.meta.url),
  "utf8",
)
  .replace(/^import\b[^]*?;\n/gm, "")
  .replace("export function mountOnlinePanel", "function mountOnlinePanel")
  .replace("export const loadStyles", "const loadStyles");
const compiled = new vm.Script(transformSync(source, { loader: "ts", target: "es2022" }).code + "\nmountOnlinePanel;");
const camel = (value) => value.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
class ElementAdapter {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = document;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.attributes = new Map();
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      },
    };
    this.events = {};
    this.className = "";
    this._text = "";
    this.classList = {
      add: (...names) => {
        this.className += ` ${names.join(" ")}`;
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "class") this.className = String(value);
    if (name.startsWith("data-"))
      this.dataset[camel(name.slice(5))] = String(value);
  }
  getAttribute(name) {
    return name === "class"
      ? this.className
      : name.startsWith("data-")
        ? (this.dataset[camel(name.slice(5))] ?? null)
        : (this.attributes.get(name) ?? null);
  }
  hasAttribute(name) {
    return this.getAttribute(name) !== null;
  }
  append(...children) {
    for (const child of children) {
      child.remove();
      child.parentElement = this;
      this.children.push(child);
    }
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter(
        (child) => child !== this,
      );
    this.parentElement = null;
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this._text = "";
    this.append(...children);
  }
  before(node) {
    const parent = this.parentElement;
    node.remove();
    node.parentElement = parent;
    parent.children.splice(parent.children.indexOf(this), 0, node);
  }
  after(node) {
    const parent = this.parentElement;
    node.remove();
    node.parentElement = parent;
    parent.children.splice(parent.children.indexOf(this) + 1, 0, node);
  }
  get firstElementChild() {
    return this.children[0];
  }
  get clientWidth() {
    return 960;
  }
  get disabled() {
    return this.hasAttribute("disabled");
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
  matches(selector) {
    return selector.split(",").some((part) => {
      const chain = part.trim().split(/\s+/),
        simple = chain.pop();
      const tag = simple.match(/^[a-z][\w-]*/i)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      for (const [, name] of simple.matchAll(/\.([\w-]+)/g))
        if (!this.classList.contains(name)) return false;
      for (const [, name, , value] of simple.matchAll(
        /\[([\w-]+)(?:=(['"]?)([^'"\]]*)\2)?\]/g,
      ))
        if (
          !this.hasAttribute(name) ||
          (value !== undefined && this.getAttribute(name) !== value)
        )
          return false;
      if (!chain.length) return true;
      let parent = this.parentElement;
      while (parent) {
        if (parent.matches(chain.join(" "))) return true;
        parent = parent.parentElement;
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
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  addEventListener(type, listener, options) {
    (this.events[type] ??= []).push(listener);
    options?.signal.addEventListener("abort", () => {
      this.events[type] = this.events[type].filter((fn) => fn !== listener);
    });
  }
  setPointerCapture(id) {
    this.pointer = id;
  }
  hasPointerCapture(id) {
    return this.pointer === id;
  }
  releasePointerCapture() {
    this.pointer = null;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 960, height: 680 };
  }
}
class InputAdapter extends ElementAdapter {}
class SelectAdapter extends ElementAdapter {}
class FormAdapter extends ElementAdapter {}

async function fixture(t) {
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const dir = mkdtempSync(join(tmpdir(), "online-panel-history-"));
  const server = createArenaServer({ filePath: join(dir, "store.json") });
  let handle;
  t.after(async () => {
    try { handle?.dispose(); }
    finally {
      server.closeAllConnections();
      if (server.listening) await new Promise((resolve) => server.close(resolve));
      rmSync(dir, { recursive: true, force: true });
      previousDocument
        ? Object.defineProperty(globalThis, "document", previousDocument)
        : delete globalThis.document;
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/arena`;
  const faults = [],
    commands = [],
    replies = [];
  let cookie = "",
    active = 0;
  const transport = async (url, init) => {
    active++;
    try {
      const command = String(url).endsWith("/command");
      if (command) commands.push(JSON.parse(init.body));
      const fault = command ? faults.shift() : null;
      let response;
      if (!fault || fault.afterCommit) {
        response = await fetch(url, {
          ...init,
          headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
        });
        const next = response.headers.get("set-cookie");
        if (next) cookie = next.split(";")[0];
      }
      if (fault) {
        if (response) {
          replies.push(await response.clone().json());
          await response.arrayBuffer();
        }
        return Response.json(
          {
            code: `PROXY_${fault.status}`,
            message: `Temporary HTTP ${fault.status}`,
          },
          { status: fault.status },
        );
      }
      replies.push(await response.clone().json());
      return response;
    } finally {
      active--;
    }
  };
  const doc = {
    createElement(tag) {
      return new (
        { input: InputAdapter, select: SelectAdapter, form: FormAdapter }[
          tag
        ] ?? ElementAdapter
      )(tag, this);
    },
  };
  const host = doc.createElement("div");
  globalThis.document = doc;
  const context = {
    D,
    C,
    R,
    V,
    E,
    incomeRouteGuidance,
    createOnlineClient: (url) => createOnlineClient(url, { fetch: transport }),
    OnlineError,
    ...layout,
    ...replay,
    isSupportedCombatVersion,
    Error,
    document: doc,
    structuredClone,
    AbortController,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    cancelAnimationFrame() {},
    window: { addEventListener() {} },
    Element: ElementAdapter,
    HTMLElement: ElementAdapter,
    HTMLInputElement: InputAdapter,
    HTMLSelectElement: SelectAdapter,
    HTMLFormElement: FormAdapter,
  };
  const mount = compiled.runInNewContext(context);
  handle = mount(host, {
    baseUrl: base,
    onClose() {
      handle.dispose();
    },
  });
  const root = host.children[0];

  async function flush() {
    const deadline = Date.now() + 5000;
    while (active) {
      assert.ok(Date.now() < deadline, "HTTP settled within fixture deadline");
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  const node = (kind) => root.querySelector(`[data-arena="${kind}"]`);
  const dispatch = (type, target, extra = {}) => {
    for (const listener of root.events[type] || [])
      listener({ target, preventDefault() {}, stopPropagation() {}, ...extra });
  };
  async function click(kind, target = node(kind)) {
    assert.ok(target, `${kind} button exists`);
    assert.equal(target.disabled, false, `${kind} is enabled`);
    dispatch("click", target);
    await flush();
  }
  async function state() {
    return (await fetch(base + "/state", { headers: { cookie } })).json();
  }
  await flush();
  assert.ok(node("buy"), "connected panel renders its actual shop");
  return {
    root,
    node,
    click,
    dispatch,
    flush,
    state,
    commands,
    faults,
    replies,
    buy: () =>
      click(
        "buy",
        root
          .querySelectorAll('[data-arena="buy"]')
          .find((b) => !b.disabled && D.PARTS[b.dataset.type]),
      ),
    key: () => dispatch("keydown", root, { key: "z", ctrlKey: true }),
    async external(kind, extra = {}) {
      const current = await state();
      const response = await fetch(base + "/command", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedRevision: current.revision,
          kind,
          ...extra,
        }),
      });
      assert.equal(response.status, 200);
      return response.json();
    },
  };
}
const board = (state) => layout.placementPayload(state.run.owned);

for (const afterCommit of [false, true]) {
  test(`recovered placement ${afterCommit ? "after" : "before"} commit becomes exactly one reversible edit`, async (t) => {
    const h = await fixture(t);
    await h.buy();
    const original = await h.state();
    h.faults.push({ status: 503, afterCommit });
    await h.click("place");
    const failed = h.commands.at(-1);
    await h.click("retry");
    const placed = await h.state();
    assert.equal(
      h.node("undo").disabled,
      false,
      "recovered placement adds Undo",
    );
    assert.deepEqual(
      h.commands.at(-1),
      failed,
      "retry preserves exact command and expected revision",
    );
    await h.click("undo");
    assert.deepEqual(board(await h.state()), board(original));
    assert.equal(
      h.node("undo").disabled,
      true,
      "one recovery creates only one Undo entry",
    );
    await h.click("redo");
    assert.deepEqual(board(await h.state()), board(placed));
    assert.equal((await h.state()).run.cash, original.run.cash);
  });
}

for (const kind of ["undo", "redo"]) {
  test(`committed ${kind} with a lost reply transfers history exactly once on explicit recovery`, async (t) => {
    const h = await fixture(t);
    await h.buy();
    await h.click("place");
    if (kind === "redo") await h.click("undo");
    const before = await h.state();
    h.faults.push({ status: 503, afterCommit: true });
    await h.click(kind);
    const committed = await h.state();
    assert.notDeepEqual(board(committed), board(before));
    await h.click("retry");
    const opposite = kind === "undo" ? "redo" : "undo";
    assert.equal(
      h.node(kind).disabled,
      true,
      "source stack consumed after acknowledgement",
    );
    assert.equal(
      h.node(opposite).disabled,
      false,
      "destination stack receives the previous board",
    );
    await h.click(opposite);
    assert.deepEqual(board(await h.state()), board(before));
    assert.equal((await h.state()).run.cash, before.run.cash);
  });
}

test("408 and 429 recovery preserve the original placement effect and block overlapping clicks and keys", async (t) => {
  const h = await fixture(t);
  await h.buy();
  h.faults.push(
    { status: 503, afterCommit: true },
    { status: 408 },
    { status: 429 },
  );
  await h.click("place");
  const initial = h.commands.at(-1),
    count = h.commands.length;
  assert.equal(
    h.node("reroll").disabled,
    true,
    "another command waits for original outcome",
  );
  h.dispatch("click", h.node("reroll"));
  h.key();
  await h.flush();
  assert.equal(
    h.commands.length,
    count,
    "uncertain action cannot be replaced by later input",
  );
  for (let i = 0; i < 3; i++) {
    const retry = h.node("retry");
    h.dispatch("click", retry);
    h.dispatch("click", retry);
    await h.flush();
    assert.equal(
      h.commands.length,
      count + i + 1,
      "repeat click does not overlap an in-flight retry",
    );
  }
  assert.deepEqual(h.commands.slice(count - 1), [
    initial,
    initial,
    initial,
    initial,
  ]);
  assert.equal(h.node("undo").disabled, false);
  await h.click("undo");
  assert.equal((await h.state()).run.owned[0].x, null);
  assert.equal(h.node("undo").disabled, true);
});

test("recovered purchase clears pre-transaction Undo and Redo without removing paid items", async (t) => {
  const h = await fixture(t);
  await h.buy();
  await h.click("place");
  await h.click("stash");
  await h.click("undo");
  assert.equal(h.node("undo").disabled, false);
  assert.equal(h.node("redo").disabled, false);
  const before = await h.state();
  h.faults.push({ status: 503, afterCommit: true });
  await h.buy();
  await h.click("retry");
  const bought = await h.state();
  assert.equal(bought.run.owned.length, before.run.owned.length + 1);
  assert.ok(bought.run.cash < before.run.cash);
  assert.equal(h.node("undo").disabled, true);
  assert.equal(h.node("redo").disabled, true);
  const count = h.commands.length;
  h.key();
  await h.flush();
  assert.equal(h.commands.length, count);
  assert.deepEqual(await h.state(), bought);
});

test("a later authoritative revision invalidates a recovered placement history instead of reverting external work", async (t) => {
  const h = await fixture(t);
  await h.buy();
  await h.click("place");
  h.faults.push({ status: 503, afterCommit: true });
  await h.click("stash");
  const later = await h.external("reroll");
  await h.click("retry");
  assert.equal(h.node("undo").disabled, true);
  assert.equal(h.node("redo").disabled, true);
  assert.deepEqual((await h.state()).run, later.run);
  assert.match(h.root.textContent, new RegExp(`資金 \\$${later.run.cash}`));
});

test("real stale-revision rejection refreshes the board and discards stale placement history", async (t) => {
  const h = await fixture(t);
  await h.buy();
  await h.click("place");
  const later = await h.external("reroll");
  await h.click("reroll");
  assert.equal(h.replies.at(-2).code, "STALE_REVISION");
  assert.equal(h.node("undo").disabled, true);
  assert.equal(h.node("redo").disabled, true);
  assert.deepEqual((await h.state()).run, later.run);
});
