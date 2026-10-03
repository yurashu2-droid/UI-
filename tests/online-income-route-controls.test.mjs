import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { parseFragment } from "parse5";
import C from "../src/document.js";
import D from "../src/data.js";
import E from "../src/engine.js";
import { placementPayload } from "../src/online/layout.js";
import { targetCaption } from "../src/catalog/target-caption.js";
import { ArenaService } from "../server/arena/service.js";
import { createArenaServer } from "../server/arena/http.js";

// Bundle the complete production panel and all actual imports/client code.
// Only DOM mechanics and network delivery are adapted. Persisted inventories
// are test-only boundary fixtures, not claims about progression or browser QA.
// Removing saved-route markup or event guards must change these DOM/server
// assertions; removing saveBoard history must break the Undo/Redo checks.
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
class InputAdapter extends ElementAdapter {}
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
const turn = () => new Promise((resolve) => setImmediate(resolve));
const seedBoard = () => [
  C.makeItem("am_cart", "cart", 32, 32, 200, 76),
  C.makeItem("ab_mail", "mail", 244, 32, 144, 32),
  C.makeItem("am_oneclick", "one", 400, 32, 208, 44),
  C.makeItem("ab_link", "link", 640, 480),
];
async function fixture(t, board = seedBoard()) {
  assert.ok(
    board
      .filter(C.placed)
      .every((part) => C.canPlace(board, part, part.x, part.y)),
    "fixture geometry is legal",
  );
  const dir = mkdtempSync(join(tmpdir(), "online-route-controls-"));
  const filePath = join(dir, "store.json");
  const service = new ArenaService({ filePath });
  const player = service.openSession();
  let cookie = `ui_raid_guest=${player.token}`;
  service.close();
  const stored = JSON.parse(readFileSync(filePath, "utf8"));
  stored.runs[player.view.online.id].state.owned = board;
  writeFileSync(filePath, JSON.stringify(stored));
  const server = createArenaServer({ filePath });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/arena`;
  const faults = [],
    commands = [],
    replies = [],
    releases = [];
  let active = 0;
  const transport = async (url, init) => {
    active++;
    try {
      const isCommand = String(url).endsWith("/command");
      if (isCommand) commands.push(JSON.parse(init.body));
      const fault = isCommand ? faults.shift() : null;
      let response;
      if (!fault || fault.afterCommit || fault.gate) {
        response = await fetch(url, {
          ...init,
          headers: { ...init.headers, cookie },
        });
        const next = response.headers.get("set-cookie");
        if (next) cookie = next.split(";")[0];
      }
      if (fault?.gate) {
        fault.captured();
        await fault.gate;
      }
      if (fault?.status) {
        if (response) {
          assert.equal(
            response.ok,
            true,
            "lost response follows a committed command",
          );
          await response.arrayBuffer();
        }
        response = Response.json(
          { code: `PROXY_${fault.status}`, message: "Temporary HTTP failure" },
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
  const mount = vm.runInNewContext(
    compiled + "\nOnlinePanel.mountOnlinePanel;",
    context,
  );
  let handle = mount(host, { baseUrl: base, onClose: () => handle.dispose() });
  const root = host.children[0];
  t.after(async () => {
    releases.forEach((release) => release());
    handle.dispose();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  async function flush() {
    const deadline = Date.now() + 6000;
    while (active) {
      assert.ok(Date.now() < deadline, "HTTP settles within fixture deadline");
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    await turn();
    await turn();
  }
  const dispatch = (type, target, extra = {}) => {
    for (const listener of root.events?.[type] ?? [])
      listener({ target, preventDefault() {}, stopPropagation() {}, ...extra });
  };
  const node = (kind) => root.querySelector(`[data-arena="${kind}"]`);
  async function state() {
    const response = await fetch(base + "/state", { headers: { cookie } });
    assert.equal(response.status, 200);
    return response.json();
  }
  await flush();
  assert.ok(node("buy"), "production panel connects to the HTTP arena");
  return {
    root,
    doc,
    host,
    commands,
    replies,
    faults,
    node,
    dispatch,
    flush,
    state,
    route: () => root.querySelector("[data-arena-route]"),
    select(id, finish = true) {
      const part = root.querySelector(
        `[data-arena-board="self"] [data-id="${id}"]`,
      );
      assert.ok(part, `placed part ${id} exists`);
      dispatch("pointerdown", part, {
        button: 0,
        clientX: 0,
        clientY: 0,
        pointerId: 1,
      });
      if (finish) dispatch("pointerup", root, { pointerId: 1 });
    },
    async click(kind) {
      const target = node(kind);
      assert.ok(target, `${kind} exists`);
      assert.equal(target.disabled, false, `${kind} is enabled`);
      dispatch("click", target);
      await flush();
    },
    async choose(value, control = this.route()) {
      assert.ok(control, "route control exists");
      control.value = value;
      dispatch("change", control);
      await flush();
    },
    async external(items) {
      const current = await state();
      const response = await fetch(base + "/command", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          kind: "placement",
          commandId: crypto.randomUUID(),
          expectedRevision: current.revision,
          items: placementPayload(items),
        }),
      });
      assert.equal(response.status, 200);
      return response.json();
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
const savedRoute = (view) =>
  view.run.owned.find((part) => part.id === "mail").routeTo;
const withoutRoutes = (view) => {
  const run = structuredClone(view.run);
  for (const part of run.owned) delete part.routeTo;
  return run;
};

for (const unavailable of ["distant", "stashed", "non-consumer"]) {
  test(`saved ${unavailable} route remains visibly selected while effective routing falls back`, async (t) => {
    const board = seedBoard();
    board[1].routeTo = unavailable === "non-consumer" ? "link" : "one";
    board[2].label = 'Checkout <B> "saved"';
    if (unavailable === "distant") Object.assign(board[2], { x: 700, y: 300 });
    if (unavailable === "stashed")
      Object.assign(board[2], { x: null, y: null });
    const h = await fixture(t, board),
      original = await h.state();
    h.select("mail");
    const select = h.route();
    assert.equal(
      select.value,
      board[1].routeTo,
      "native selection represents saved preference, never Auto",
    );
    assert.equal(select.selectedOptions[0].disabled, true);
    assert.match(select.selectedOptions[0].textContent, /現在は利用不可/);
    const guidance = h.root.querySelector(".arena-route-guidance");
    assert.ok(guidance, "online source has route guidance");
    const copy = guidance.textContent;
    assert.match(copy, /保存した指定/);
    assert.match(copy, /実際の接続先/);
    assert.ok(
      copy.includes(
        targetCaption(board.find((part) => part.id === board[1].routeTo)),
      ),
    );
    assert.ok(copy.includes(targetCaption(board[0])));
    assert.match(copy, /自動へフォールバック/);
    assert.match(copy, /指定.*保持/);
    assert.equal(
      h.root.querySelector("b" + "ad"),
      null,
      "saved label remains text",
    );
    assert.equal(
      h.commands.length,
      0,
      "selection/render does not mutate server state",
    );
    assert.deepEqual(await h.state(), original);
  });
}

test("automatic and conditional source controls use normal engine routes and hide non-producers", async (t) => {
  const board = seedBoard();
  board[1] = C.makeItem("gov_submit", "mail", 244, 32, 144, 32);
  const h = await fixture(t, board);
  h.select("mail");
  const info = E.analyze(board);
  assert.equal(h.route().value, "");
  assert.deepEqual(
    h
      .route()
      .options.slice(1)
      .map((option) => option.getAttribute("value")),
    E.incomeRouteCandidates(info.board, info.near, board[1]).map(
      (part) => part.id,
    ),
  );
  const guidance = h.root.querySelector(".arena-route-guidance");
  assert.ok(guidance, "online source has route guidance");
  const copy = guidance.textContent;
  assert.match(copy, /収益.*発生条件/);
  assert.match(copy, /二重配分/);
  assert.match(copy, /満杯.*別.*流れません/);
  h.select("cart");
  assert.equal(h.route(), null, "consumers are not income producers");
  h.select("link");
  assert.equal(h.route(), null, "ordinary non-earners have no route controls");
  assert.equal(h.commands.length, 0);
});

test("route commands are authoritative, reversible once, and restore select focus after repaint", async (t) => {
  const h = await fixture(t),
    original = await h.state();
  h.select("mail");
  const old = h.route();
  old.focus();
  await h.choose("one");
  const changed = await h.state();
  assert.equal(savedRoute(changed), "one");
  assert.equal(changed.revision, original.revision + 1);
  assert.deepEqual(withoutRoutes(changed), withoutRoutes(original));
  assert.ok(h.route() !== old);
  assert.ok(
    h.doc.activeElement === h.route(),
    "select retains keyboard focus after accepted route edit",
  );
  assert.equal(h.route().value, "one");
  await h.click("undo");
  assert.equal(savedRoute(await h.state()), undefined);
  assert.equal(
    h.node("undo").disabled,
    true,
    "one edit has exactly one history entry",
  );
  await h.click("redo");
  assert.equal(savedRoute(await h.state()), "one");
  await h.choose("");
  assert.equal(savedRoute(await h.state()), undefined);
  await h.click("undo");
  assert.equal(savedRoute(await h.state()), "one");
});

test("stale, detached, foreign, disabled and forged controls cannot change the selected source", async (t) => {
  const h = await fixture(t);
  h.select("mail");
  const original = await h.state(),
    stale = h.route();
  h.select("link");
  await h.choose("one", stale);
  assert.equal(
    h.commands.length,
    0,
    "old source control cannot edit newly selected non-source",
  );
  h.select("mail");
  await h.choose("one", stale);
  assert.equal(
    h.commands.length,
    0,
    "stale control cannot edit a reselected source",
  );
  const foreign = h.doc.createElement("select");
  foreign.innerHTML = '<option value="one">Foreign</option>';
  foreign.setAttribute("data-arena-route", "");
  foreign.setAttribute("data-source-id", "mail");
  h.root.append(foreign);
  await h.choose("one", foreign);
  foreign.remove();
  assert.equal(
    h.commands.length,
    0,
    "foreign attached select is not the current inspector control",
  );
  const live = h.route();
  live.setAttribute("disabled", "");
  await h.choose("one");
  live.attributes.delete("disabled");
  assert.equal(h.commands.length, 0, "disabled current select is rejected");
  live.value = "one";
  live.selectedOptions[0].setAttribute("disabled", "");
  await h.choose("one");
  live.selectedOptions[0].attributes.delete("disabled");
  assert.equal(h.commands.length, 0, "disabled target option is rejected");
  for (const id of ["link", "mail", "foreign", "go_jobs"]) {
    const option = h.doc.createElement("option");
    option.setAttribute("value", id);
    live.append(option);
    await h.choose(id);
  }
  assert.equal(
    h.commands.length,
    0,
    "only current legal normal-rule candidates are accepted",
  );
  live.selectedIndex = -1;
  h.dispatch("change", live);
  await h.flush();
  assert.equal(h.commands.length, 0, "no selection is not explicit Auto");
  live.dataset.sourceId = "link";
  await h.choose("one");
  assert.equal(h.commands.length, 0, "source binding cannot be retargeted");
  assert.deepEqual(await h.state(), original);
});

test("unchanged choices do not create commands or erase Redo", async (t) => {
  const h = await fixture(t);
  h.select("mail");
  await h.choose("");
  assert.equal(h.commands.length, 0);
  await h.choose("one");
  const count = h.commands.length;
  await h.choose("one");
  assert.equal(h.commands.length, count);
  await h.click("undo");
  const reverted = await h.state(),
    undoneCount = h.commands.length;
  await h.choose("");
  assert.equal(h.commands.length, undoneCount);
  assert.equal(h.node("redo").disabled, false);
  assert.deepEqual(await h.state(), reverted);
});

test("drag cancellation and source stashing preserve routes and disable edits at the right boundary", async (t) => {
  const board = seedBoard();
  board[1].routeTo = "one";
  const h = await fixture(t, board);
  h.select("mail", false);
  assert.equal(h.route().disabled, true, "active placement drag locks routing");
  await h.choose("cart");
  assert.equal(h.commands.length, 0);
  h.dispatch("pointercancel", h.root);
  assert.equal(h.route().disabled, false);
  await h.click("stash");
  assert.equal(h.route().disabled, true);
  assert.match(h.root.textContent, /配置してから/);
  const count = h.commands.length;
  await h.choose("");
  assert.equal(h.commands.length, count);
  assert.equal(savedRoute(await h.state()), "one");
  await h.click("undo");
  assert.equal(h.route().disabled, false);
  assert.equal(h.route().value, "one");
});

for (const temporary of [408, 429]) {
  test(`uncertain route receipt survives HTTP ${temporary} with the same command and one history edit`, async (t) => {
    const h = await fixture(t),
      original = await h.state();
    h.select("mail");
    h.faults.push({ status: 503, afterCommit: true });
    await h.choose("one");
    const command = h.commands.at(-1);
    assert.equal(savedRoute(await h.state()), "one");
    assert.equal(h.route().disabled, true);
    assert.equal(
      h.route().value,
      "",
      "pending screen retains acknowledged state",
    );
    const count = h.commands.length;
    await h.choose("cart");
    assert.equal(h.commands.length, count);
    h.faults.push({ status: temporary });
    await h.click("retry");
    assert.deepEqual(h.commands.at(-1), command);
    assert.equal(h.route().disabled, true);
    await h.click("retry");
    assert.deepEqual(h.commands.at(-1), command);
    assert.equal(h.route().value, "one");
    assert.equal(h.route().disabled, false);
    await h.click("undo");
    assert.equal(savedRoute(await h.state()), undefined);
    assert.equal(h.node("undo").disabled, true);
    await h.click("redo");
    assert.equal(savedRoute(await h.state()), "one");
    assert.deepEqual(withoutRoutes(await h.state()), withoutRoutes(original));
  });
}

test("authoritative conflict refreshes routes and rejects the old DOM without preserving stale history", async (t) => {
  const h = await fixture(t);
  h.select("mail");
  await h.choose("one");
  const stale = h.route(),
    external = (await h.state()).run.owned;
  Object.assign(
    external.find((part) => part.id === "one"),
    { x: 700, y: 300 },
  );
  const latest = await h.external(external);
  await h.choose("cart");
  assert.ok(h.replies.some((reply) => reply.code === "STALE_REVISION"));
  assert.equal(h.route().value, "one");
  assert.equal(h.route().selectedOptions[0].disabled, true);
  assert.equal(h.node("undo").disabled, true);
  assert.equal(h.node("redo").disabled, true);
  const count = h.commands.length;
  await h.choose("cart", stale);
  assert.equal(h.commands.length, count);
  const current = await h.state();
  assert.equal(current.revision, latest.revision);
  assert.deepEqual(current.run, latest.run);
});

test("delayed route responses do not steal deliberate focus or reopen a disposed panel", async (t) => {
  const h = await fixture(t);
  h.select("mail");
  h.route().focus();
  const pending = h.hold();
  h.route().value = "one";
  h.dispatch("change", h.route());
  await pending.seen;
  const close = h.node("close");
  close.focus();
  pending.release();
  await h.flush();
  assert.ok(
    h.doc.focusCalls.at(-1).node === close,
    "last requested focus stays on the deliberate target",
  );
  assert.ok(
    h.doc.activeElement !== h.route(),
    "focus moved elsewhere is not restored to routing",
  );
  h.route().focus();
  const closing = h.hold();
  h.route().value = "cart";
  h.dispatch("change", h.route());
  await closing.seen;
  h.dispatch("click", h.node("close"));
  closing.release();
  await h.flush();
  assert.equal(h.host.children.length, 0);
  const count = h.commands.length;
  h.dispatch("change", h.route());
  await h.flush();
  assert.equal(h.commands.length, count);
  assert.equal(savedRoute(await h.state()), "cart");
});

test("target stash and Undo retain the saved preference and resume its original connection", async (t) => {
  const board = seedBoard();
  board[1].routeTo = "one";
  const h = await fixture(t, board);
  h.select("one");
  await h.click("stash");
  h.select("mail");
  assert.equal(h.route().value, "one");
  assert.equal(h.route().selectedOptions[0].disabled, true);
  assert.equal(savedRoute(await h.state()), "one");
  await h.click("undo");
  assert.equal(h.route().value, "one");
  assert.equal(h.route().selectedOptions[0].disabled, false);
  const current = await h.state();
  const relation = E.analyze(current.run.owned).relations.find(
    (entry) => entry.kind === "conversion" && entry.from === "mail",
  );
  assert.equal(relation.to, "one");
  assert.equal(h.node("undo").disabled, true);
});

test("ordinary online routing never enables the laboratory jobs receiver", async (t) => {
  const board = [
    C.makeItem("go_jobs", "jobs", 32, 32),
    C.makeItem("ab_mail", "mail", 32, 160),
  ];
  board[1].routeTo = "jobs";
  const h = await fixture(t, board),
    original = await h.state();
  h.select("mail");
  assert.equal(h.route().value, "jobs");
  assert.equal(h.route().selectedOptions[0].disabled, true);
  assert.equal(
    h.route().options.length,
    2,
    "only Auto and preserved unavailable preference are present",
  );
  assert.match(
    h.root.querySelector(".arena-route-guidance").textContent,
    /実際の接続先：未接続/,
  );
  await h.choose("jobs");
  assert.equal(h.commands.length, 0);
  assert.deepEqual(await h.state(), original);
});

test("a newer revision in an uncertain receipt keeps authoritative routes and discards the old history", async (t) => {
  const h = await fixture(t);
  h.select("mail");
  h.faults.push({ status: 503, afterCommit: true });
  await h.choose("one");
  const originalCommand = h.commands.at(-1);
  const board = (await h.state()).run.owned;
  board.find((part) => part.id === "mail").routeTo = "cart";
  const latest = await h.external(board);
  await h.click("retry");
  assert.deepEqual(h.commands.at(-1), originalCommand);
  assert.equal(h.route().value, "cart");
  assert.equal(h.node("undo").disabled, true);
  assert.equal(h.node("redo").disabled, true);
  const current = await h.state();
  assert.deepEqual(current.run, latest.run);
  assert.equal(current.revision, latest.revision);
});
