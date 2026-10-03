import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
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
import { ArenaService } from "../server/arena/service.js";

// Production panel, client, layout and component renderer run unmodified. Only
// browser DOM mechanics are adapted; requests hit a real isolated loopback arena.
// The transport can lose an already committed reply, refuse an attempt, or delay
// delivery. These are HTTP/DOM integration checks, not browser/pixel acceptance.
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
      const element = new ElementAdapter(node.tagName, this.ownerDocument);
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
const turn = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate, label) {
  const end = Date.now() + 6000;
  while (!predicate()) {
    assert.ok(Date.now() < end, `timed out: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 3));
  }
  await turn();
}
async function fixture(t, rules, duel = false) {
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const doc = {
    focusCalls: [],
    createElement(tag) {
      return new ElementAdapter(tag, this);
    },
  };
  doc.body = doc.createElement("body");
  doc.activeElement = doc.body;
  globalThis.document = doc;
  const dir = mkdtempSync(join(tmpdir(), "qa-panel-history-"));
  const filePath = join(dir, "store.json");
  let cookie = "",
    opponentCookie = "";
  if (duel) {
    // Test-only shop seed, chosen before HTTP startup. Both players still pay
    // normal initial cash for every item and use real placement/combat/rewards.
    const service = new ArenaService({ filePath, rules });
    const player = service.openSession(),
      opponent = service.openSession();
    cookie = `ui_raid_guest=${player.token}`;
    opponentCookie = `ui_raid_guest=${opponent.token}`;
    service.close();
    const saved = JSON.parse(readFileSync(filePath, "utf8"));
    for (const id of [player.view.online.id, opponent.view.online.id]) {
      const run = saved.runs[id].state;
      run.seed = 3;
      run.shop = R.market(run);
    }
    writeFileSync(filePath, JSON.stringify(saved));
  }
  const server = createArenaServer({ filePath, rules });
  let inFlight = 0,
    fault = null,
    stateFault = null,
    disposed = false;
  const commands = [],
    requests = [],
    releases = [];
  let handle;
  t.after(async () => {
    for (const release of releases) release();
    handle?.dispose();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
    if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument);
    else delete globalThis.document;
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/arena`;
  const http = async (path, body, identity = cookie) => {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(identity ? { cookie: identity } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  };
  const transport = async (url, init) => {
    inFlight++;
    const path = String(url).slice(base.length),
      isCommand = path === "/command";
    requests.push(path);
    if (isCommand) commands.push(JSON.parse(init.body));
    const active = isCommand ? fault : path === "/state" ? stateFault : null;
    if (active) {
      if (isCommand) fault = null;
      else stateFault = null;
    }
    try {
      if (active?.before)
        return Response.json(
          {
            code: active.code || `PROXY_${active.status}`,
            message: "Temporary attempt refusal",
          },
          { status: active.status },
        );
      const response = await fetch(url, {
        ...init,
        headers: { ...init?.headers, ...(cookie ? { cookie } : {}) },
      });
      const fresh = response.headers.get("set-cookie");
      if (fresh) cookie = fresh.split(";")[0];
      if (active?.hold) {
        active.captured();
        await active.gate;
      }
      if (active?.status) {
        assert.equal(
          response.ok,
          true,
          "lost reply belongs to a committed successful command",
        );
        await response.arrayBuffer();
        return Response.json(
          {
            code: `PROXY_${active.status}`,
            message: "Lost committed response",
          },
          { status: active.status },
        );
      }
      return response;
    } finally {
      inFlight--;
    }
  };
  const host = doc.createElement("div");
  doc.body.append(host);
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
    document: doc,
    structuredClone,
    Error,
    AbortController,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    performance,
    requestAnimationFrame() {
      return 1;
    },
    cancelAnimationFrame() {},
    window: { addEventListener() {} },
    Element: ElementAdapter,
    HTMLElement: ElementAdapter,
    HTMLInputElement: class {},
    HTMLSelectElement: class {},
    HTMLFormElement: class {},
  };
  const mount = compiled.runInNewContext(context);
  handle = mount(host, {
    baseUrl: base,
    onClose() {
      disposed = true;
      handle.dispose();
    },
  });
  let root = host.children[0];
  const button = (kind, predicate = () => true) =>
    root.querySelectorAll(`[data-arena="${kind}"]`).find(predicate);
  const fire = (target) => {
    for (const fn of root.events.click || [])
      fn({ target, preventDefault() {}, stopPropagation() {} });
  };
  const idle = async () => {
    await until(() => inFlight === 0, "request completion");
    await turn();
  };
  await until(() => button("buy") || button("new-guest"), "initial connection");
  return {
    get root() {
      return root;
    },
    host,
    button,
    commands,
    requests,
    http,
    idle,
    opponentCookie,
    status: () => root.querySelector(".arena-status")?.textContent,
    cookie: () => cookie,
    replaceCookie(value) {
      cookie = value;
    },
    async state(identity = cookie) {
      const response = await http("/state", undefined, identity);
      assert.equal(response.status, 200);
      return response.body;
    },
    async external(kind, extra = {}) {
      const current = await this.state();
      const response = await http("/command", {
        kind,
        commandId: crypto.randomUUID(),
        expectedRevision: current.revision,
        ...extra,
      });
      assert.equal(response.status, 200, JSON.stringify(response.body));
      return response.body;
    },
    lose(status = 503) {
      fault = { status };
    },
    refuse(status, code) {
      fault = { status, code, before: true };
    },
    refuseState(status) {
      stateFault = { status, before: true };
    },
    hold(path = "/command") {
      let release, captured;
      const gate = new Promise((resolve) => {
          release = resolve;
        }),
        seen = new Promise((resolve) => {
          captured = resolve;
        });
      releases.push(release);
      const value = { hold: true, gate, captured };
      if (path === "/state") stateFault = value;
      else fault = value;
      return { release, seen };
    },
    startClick(kind, predicate) {
      const target = button(kind, predicate);
      assert.ok(target, `${kind} exists`);
      assert.equal(target.disabled, false, `${kind} is enabled`);
      fire(target);
    },
    async click(kind, predicate) {
      this.startClick(kind, predicate);
      await idle();
    },
    async keyUndo(redo = false) {
      for (const fn of root.events.keydown || [])
        fn({
          target: root,
          key: "z",
          ctrlKey: true,
          shiftKey: redo,
          preventDefault() {},
          stopPropagation() {},
        });
      await idle();
    },
    async reopen() {
      handle.dispose();
      disposed = false;
      handle = mount(host, {
        baseUrl: base,
        onClose() {
          disposed = true;
          handle.dispose();
        },
      });
      root = host.children[0];
      await idle();
    },
    dispose() {
      disposed = true;
      handle.dispose();
    },
    get disposed() {
      return disposed;
    },
  };
}
const buy = (h) =>
  h.click(
    "buy",
    (button) => !button.disabled && !!D.PARTS[button.dataset.type],
  );
async function placed(t) {
  const h = await fixture(t);
  await buy(h);
  await h.click("place");
  return h;
}
const history = (h, undo, redo) => {
  assert.equal(h.button("undo")?.disabled, !undo, "Undo availability");
  assert.equal(h.button("redo")?.disabled, !redo, "Redo availability");
};
const resources = (view) => ({
  cash: view.run.cash,
  admin: view.run.admin,
  lives: view.run.lives,
  wins: view.run.wins,
  stage: view.run.stage,
  capacity: R.capacity(view.run),
  types: view.run.owned.map((p) => [p.id, p.type]),
  inbox: view.online.inbox,
});

test("mounted panel recovers a committed Undo once and Redo keeps every resource", async (t) => {
  const h = await placed(t),
    before = await h.state();
  history(h, true, false);
  h.lose();
  await h.click("undo");
  const committed = await h.state();
  assert.equal(committed.run.owned[0].x, null);
  assert.deepEqual(resources(committed), resources(before));
  await h.click("retry");
  history(h, false, true);
  assert.deepEqual(
    h.commands.at(-1),
    h.commands.at(-2),
    "same command identity, revision and payload on explicit retry",
  );
  await h.click("redo");
  history(h, true, false);
  assert.deepEqual((await h.state()).run.owned, before.run.owned);
  assert.deepEqual(resources(await h.state()), resources(before));
  await h.click("undo");
  history(h, false, true);
});

test("mounted panel recovers a committed placement and blocks overlapping uncertain edits", async (t) => {
  const h = await fixture(t);
  await buy(h);
  const before = await h.state();
  h.lose();
  await h.click("place");
  const attempts = h.commands.length;
  await h.keyUndo();
  // An apparent new purchase must neither displace the retained edit effect nor reach HTTP.
  const other = h.button("buy", (button) => !button.disabled);
  if (other) await h.click("buy", (button) => button === other);
  assert.equal(h.commands.length, attempts);
  await h.click("retry");
  history(h, true, false);
  await h.click("undo");
  history(h, false, true);
  assert.deepEqual((await h.state()).run.owned, before.run.owned);
  assert.deepEqual(resources(await h.state()), resources(before));
});

test("mounted panel recovered purchase invalidates pre-purchase edit history without a duplicate charge", async (t) => {
  const h = await placed(t),
    before = await h.state();
  const affordable = h.button(
    "buy",
    (button) => !button.disabled && !!D.PARTS[button.dataset.type],
  );
  assert.ok(affordable, "starter budget permits a second ordinary item");
  h.lose();
  await h.click(
    "buy",
    (button) => button.dataset.type === affordable.dataset.type,
  );
  const committed = await h.state();
  assert.equal(committed.run.owned.length, before.run.owned.length + 1);
  await h.click("retry");
  history(h, false, false);
  assert.deepEqual((await h.state()).run, committed.run);
  const attempts = h.commands.length;
  await h.keyUndo();
  assert.equal(h.commands.length, attempts);
});

for (const status of [408, 429]) {
  test(`mounted panel retains recovered Undo through HTTP ${status} and applies it only once`, async (t) => {
    const h = await placed(t),
      before = await h.state();
    h.lose();
    await h.click("undo");
    const original = h.commands.at(-1);
    h.refuse(status);
    await h.click("retry");
    assert.deepEqual(h.commands.at(-1), original);
    const attempts = h.commands.length;
    await turn();
    await turn();
    assert.equal(h.commands.length, attempts, "no automatic HTTP retry loop");
    await h.click("retry");
    history(h, false, true);
    assert.deepEqual(h.commands.at(-1), original);
    await h.click("redo");
    history(h, true, false);
    assert.deepEqual((await h.state()).run.owned, before.run.owned);
    await h.click("undo");
    history(h, false, true);
  });
}

test("mounted panel lost Redo replays the transfer once and a new edit drops its old branch", async (t) => {
  const h = await placed(t),
    original = await h.state();
  await h.click("undo");
  h.lose();
  await h.click("redo");
  await h.click("retry");
  history(h, true, false);
  assert.deepEqual((await h.state()).run.owned, original.run.owned);
  await h.click("undo");
  history(h, false, true);
  await h.click("place");
  history(h, true, false);
  await h.click("undo");
  history(h, false, true);
  assert.deepEqual(resources(await h.state()), resources(original));
});

test("mounted panel unchanged reconnect after a rejected publish preserves genuine Redo", async (t) => {
  const h = await placed(t);
  await h.click("undo");
  const before = await h.state();
  await h.click("publish");
  assert.ok(h.button("retry"));
  history(h, false, true);
  await h.click("retry");
  history(h, false, true);
  assert.deepEqual((await h.state()).run, before.run);
  await h.click("redo");
  history(h, true, false);
});

test("mounted panel definitive placement rejection keeps history and does not replay rejected intent", async (t) => {
  const h = await placed(t),
    before = await h.state();
  h.refuse(400, "INVALID_PLACEMENT");
  await h.click("undo");
  history(h, true, false);
  const attempts = h.commands.length;
  await h.click("retry");
  assert.equal(
    h.commands.length,
    attempts,
    "retry is a state read after definitive refusal",
  );
  history(h, true, false);
  assert.deepEqual((await h.state()).run, before.run);
  await h.click("undo");
  history(h, false, true);
  assert.notEqual(h.commands.at(-1).commandId, h.commands.at(-2).commandId);
});

test("mounted panel stale revision refresh drops history from the old resource state", async (t) => {
  const h = await placed(t),
    before = await h.state();
  const latest = await h.external("reroll");
  assert.equal(latest.run.cash, before.run.cash - R.REROLL);
  await h.click("undo");
  assert.ok(h.button("retry"));
  // A stale-revision response may refresh immediately or require the existing
  // explicit reconnect; either way accepting that newer view must reset history.
  await h.click("retry");
  history(h, false, false);
  assert.deepEqual((await h.state()).run, latest.run);
  const attempts = h.commands.length;
  await h.keyUndo();
  assert.equal(h.commands.length, attempts);
});

test("mounted panel older receipt cannot attach old history to a newer external revision", async (t) => {
  const h = await placed(t);
  h.lose();
  await h.click("undo");
  const original = h.commands.at(-1);
  const latest = await h.external("reroll");
  await h.click("retry");
  history(h, false, false);
  assert.deepEqual(
    h.commands.at(-1),
    original,
    "receipt lookup keeps original identity despite intervening state",
  );
  assert.deepEqual((await h.state()).run, latest.run);
  const attempts = h.commands.length;
  await h.keyUndo(true);
  assert.equal(h.commands.length, attempts);
});

test("mounted panel external refresh that changes inventory invalidates old Redo", async (t) => {
  const h = await placed(t);
  await h.click("undo");
  await h.click("publish");
  const state = await h.state();
  const stock = state.run.shop.find(
    (stock) => !stock.sold && D.PARTS[stock.type]?.price <= state.run.cash,
  );
  assert.ok(stock);
  const latest = await h.external("purchase", { type: stock.type });
  await h.click("retry");
  history(h, false, false);
  assert.deepEqual((await h.state()).run, latest.run);
});

test("mounted panel new guest drops old history and unresolved intent", async (t) => {
  const h = await placed(t),
    oldCookie = h.cookie();
  h.lose();
  await h.click("undo");
  const committed = await h.state();
  h.replaceCookie("ui_raid_guest=nonexistent-test-identity");
  await h.click("retry");
  assert.ok(h.button("new-guest"));
  await h.click("new-guest");
  history(h, false, false);
  const fresh = await h.state();
  assert.notEqual(fresh.online.id, committed.online.id);
  assert.equal(fresh.run.owned.length, 0);
  assert.equal(fresh.run.cash, fresh.rules.startingCash);
  assert.deepEqual(
    (await h.state(oldCookie)).run,
    committed.run,
    "old identity remains untouched",
  );
  await buy(h);
  await h.click("place");
  await h.click("undo");
  history(h, false, true);
  assert.equal((await h.state()).run.owned.length, 1);
});

test("mounted panel disposal ignores delayed committed callbacks and cannot recreate the dialog", async (t) => {
  const h = await placed(t),
    hold = h.hold();
  h.startClick("undo");
  await hold.seen;
  const committed = await h.state();
  assert.equal(committed.run.owned[0].x, null);
  h.dispose();
  assert.equal(h.host.children.length, 0);
  hold.release();
  await h.idle();
  assert.equal(h.host.children.length, 0);
  assert.equal(h.root.isConnected, false);
  assert.equal(
    Object.values(h.root.events).every((listeners) => listeners.length === 0),
    true,
  );
  assert.deepEqual((await h.state()).run, committed.run);
});

async function duel(t, rules) {
  const h = await fixture(t, rules, true);
  let opponent = await h.state(h.opponentCookie);
  const command = async (kind, extra = {}) => {
    const response = await h.http(
      "/command",
      {
        kind,
        commandId: crypto.randomUUID(),
        expectedRevision: opponent.revision,
        ...extra,
      },
      h.opponentCookie,
    );
    assert.equal(response.status, 200, JSON.stringify(response.body));
    opponent = response.body;
  };
  await command("purchase", { type: "ab_link" });
  await command("placement", {
    items: layout.placementPayload(
      opponent.run.owned.map((p) => ({ ...p, x: 32, y: 24 })),
    ),
  });
  await command("publish");
  await h.click("buy", (button) => button.dataset.type === "ab_link");
  await h.click("place");
  await h.click("buy", (button) => button.dataset.type === "ab_nav");
  await h.click("place");
  return h;
}

test("mounted panel lost settlement and claim preserve real winnings and reward exactly once", async (t) => {
  const h = await duel(t),
    before = await h.state();
  history(h, true, false);
  await h.click("match");
  const matched = await h.state();
  assert.equal(matched.match.winner, "player");
  h.lose();
  await h.click("settle");
  const settled = await h.state();
  assert.equal(settled.run.cash, before.run.cash + matched.match.summary.total);
  assert.equal(settled.run.history.length, 1);
  await h.click("retry");
  assert.deepEqual((await h.state()).run, settled.run);
  const reward = h.button("claim", (button) => !!D.PARTS[button.dataset.type]);
  assert.ok(reward);
  h.lose();
  await h.click(
    "claim",
    (button) => button.dataset.type === reward.dataset.type,
  );
  const claimed = await h.state();
  assert.equal(claimed.run.owned.length, before.run.owned.length + 1);
  assert.equal(claimed.run.cash, settled.run.cash);
  assert.equal(claimed.run.stage, 1);
  await h.click("retry");
  history(h, false, false);
  assert.deepEqual((await h.state()).run, claimed.run);
  const attempts = h.commands.length;
  await h.keyUndo();
  assert.equal(h.commands.length, attempts);
  assert.equal(claimed.match.claimed, true);
});

test("mounted panel recovered new run clears previous-run history before new edits", async (t) => {
  const h = await duel(t, { rounds: 1 });
  await h.click("match");
  assert.equal((await h.state()).match.winner, "player");
  // Recover every transaction to retain old history in the unfixed panel.
  for (const kind of ["settle", "skip"]) {
    h.lose();
    await h.click(kind);
    await h.click("retry");
  }
  const completed = await h.state();
  assert.equal(completed.run.phase, "complete");
  h.lose();
  await h.click("new-run");
  const fresh = await h.state();
  assert.notEqual(fresh.online.id, completed.online.id);
  assert.equal(fresh.run.owned.length, 0);
  await h.click("retry");
  history(h, false, false);
  assert.deepEqual((await h.state()).run, fresh.run);
  await buy(h);
  await h.click("place");
  await h.click("undo");
  history(h, false, true);
});

test("mounted panel first reconnect to a stale uncertain command refreshes and clears obsolete history", async (t) => {
  const h = await placed(t),
    before = await h.state();
  h.refuse(503);
  await h.click("undo");
  assert.deepEqual(
    (await h.state()).run,
    before.run,
    "the uncertain request never reached the arena",
  );
  const latest = await h.external("reroll");
  const requests = h.requests.length;
  await h.click("retry");
  assert.ok(
    h.requests.slice(requests).includes("/state"),
    "first stale reconnect refreshes authoritative state",
  );
  history(h, false, false);
  assert.ok(
    h.root
      .querySelector(".arena-metrics")
      .textContent.includes(`資金 $${latest.run.cash}`),
  );
  assert.deepEqual((await h.state()).run, latest.run);
});

test("mounted panel failed stale refresh can reconnect without replaying the rejected command", async (t) => {
  const h = await placed(t);
  h.refuse(503);
  await h.click("undo");
  const latest = await h.external("reroll");
  h.refuseState(503);
  await h.click("retry");
  assert.ok(h.button("retry"));
  history(h, false, false);
  const attempts = h.commands.length;
  await h.click("retry");
  assert.equal(
    h.commands.length,
    attempts,
    "the definitive stale rejection released client and panel intent",
  );
  history(h, false, false);
  assert.deepEqual((await h.state()).run, latest.run);
});

test("mounted panel disposal while stale reconnect refresh is delayed ignores its late view", async (t) => {
  const h = await placed(t);
  h.refuse(503);
  await h.click("undo");
  await h.external("reroll");
  const hold = h.hold("/state");
  h.startClick("retry");
  await hold.seen;
  h.dispose();
  hold.release();
  await h.idle();
  assert.equal(h.host.children.length, 0);
  assert.equal(h.root.isConnected, false);
});

test("mounted panel successful recovered publish preserves local edit history", async (t) => {
  const h = await fixture(t);
  await h.click(
    "buy",
    (button) =>
      !button.disabled && D.PARTS[button.dataset.type]?.kind === "attack",
  );
  await h.click("place");
  const before = await h.state();
  h.lose();
  await h.click("publish");
  const published = await h.state();
  assert.ok(published.online.publishedSnapshotId);
  await h.click("retry");
  history(h, true, false);
  assert.deepEqual(resources(await h.state()), resources(before));
  await h.click("undo");
  history(h, false, true);
  assert.equal((await h.state()).run.owned[0].x, null);
});

test("mounted panel repeated reconnect clicks while receipt delivery is delayed apply one history transfer", async (t) => {
  const h = await placed(t);
  h.lose();
  await h.click("undo");
  const hold = h.hold();
  h.startClick("retry");
  await hold.seen;
  const count = h.commands.length;
  h.startClick("retry");
  await turn();
  assert.equal(h.commands.length, count);
  hold.release();
  await h.idle();
  history(h, false, true);
  await h.click("redo");
  history(h, true, false);
  await h.click("undo");
  history(h, false, true);
});

test("mounted panel unresolved settlement remains recoverable while verified replay is shown", async (t) => {
  const h = await fixture(t);
  // Both real HTTP sessions use the unchanged initial shop and normal purchases.
  // No snapshots, pool members, results or inventory are inserted into storage.
  const other = await h.http("/session", {}, "");
  let opponent = other.body;
  const command = async (kind, extra = {}) => {
    const response = await h.http(
      "/command",
      {
        kind,
        ...extra,
        commandId: crypto.randomUUID(),
        expectedRevision: opponent.revision,
      },
      other.cookie,
    );
    assert.equal(response.status, 200, JSON.stringify(response.body));
    opponent = response.body;
  };
  const type = opponent.run.shop.find(
    (stock) =>
      D.PARTS[stock.type]?.kind === "attack" &&
      D.PARTS[stock.type].price <= opponent.run.cash,
  ).type;
  await command("purchase", { type });
  await command("placement", {
    items: layout.placementPayload(
      opponent.run.owned.map((p) => ({ ...p, x: 32, y: 24 })),
    ),
  });
  await command("publish");
  await h.click(
    "buy",
    (button) =>
      !button.disabled && D.PARTS[button.dataset.type]?.kind === "attack",
  );
  await h.click("place");
  await h.click("match");
  const matched = await h.state();
  assert.equal(matched.run.phase, "battle");
  h.lose();
  await h.click("settle");
  const committed = await h.state(),
    original = h.commands.at(-1);
  assert.equal(committed.match.settled, true);
  assert.equal(committed.run.history.length, 1);
  assert.equal(h.button("settle").disabled, true);
  assert.ok(h.button("retry"));
  const attempts = h.commands.length;
  for (let playback = 0; playback < 2; playback++) {
    await h.click("replay");
    await until(
      () => h.status().includes("保存された記録と一致するリプレイです"),
      "verified replay after lost settlement",
    );
    assert.equal(
      h.commands.length,
      attempts,
      "watching replay cannot submit a gameplay command",
    );
    assert.ok(
      h.button("retry"),
      "uncertain settlement keeps its visible recovery action during playback",
    );
    assert.match(h.status(), /前の操作の結果はまだ確認できていません/);
    assert.deepEqual((await h.state()).run, committed.run);
  }
  assert.equal(h.button("settle").disabled, true);
  await h.click("retry");
  assert.deepEqual(
    h.commands.at(-1),
    original,
    "explicit recovery uses the original settlement identity",
  );
  assert.deepEqual(
    (await h.state()).run,
    committed.run,
    "settlement is applied exactly once",
  );
  assert.equal(
    h.button("retry"),
    undefined,
    "resolved receipt removes pending recovery",
  );
  assert.ok(h.button(committed.run.phase === "reward" ? "claim" : "match"));
});

test("mounted panel unresolved reward claim remains recoverable while verified replay is shown", async (t) => {
  // Reuse the existing deterministic shop fixture; all purchases, match, winnings,
  // reward choice and retry still go through the production HTTP service.
  const h = await duel(t);
  await h.click("match");
  assert.equal((await h.state()).match.winner, "player");
  await h.click("settle");
  const before = await h.state();
  h.lose();
  await h.click("claim", (button) => !!D.PARTS[button.dataset.type]);
  const committed = await h.state(),
    original = h.commands.at(-1);
  assert.equal(committed.run.owned.length, before.run.owned.length + 1);
  assert.equal(committed.run.cash, before.run.cash);
  assert.equal(committed.run.stage, 1);
  const attempts = h.commands.length;
  for (let playback = 0; playback < 2; playback++) {
    await h.click("replay");
    await until(
      () => h.status().includes("保存された記録と一致するリプレイです"),
      "verified replay after lost reward claim",
    );
    assert.equal(
      h.commands.length,
      attempts,
      "watching replay cannot resubmit the reward claim",
    );
    assert.ok(
      h.button("retry"),
      "uncertain reward claim keeps its visible recovery action during playback",
    );
    assert.match(h.status(), /前の操作の結果はまだ確認できていません/);
    assert.deepEqual((await h.state()).run, committed.run);
  }
  assert.equal(h.button("claim").disabled, true);
  await h.click("retry");
  assert.deepEqual(
    h.commands.at(-1),
    original,
    "explicit recovery uses the original reward identity and choice",
  );
  assert.deepEqual(
    (await h.state()).run,
    committed.run,
    "reward, round and resources advance exactly once",
  );
  history(h, false, false);
  assert.equal(h.button("retry"), undefined);
  assert.ok(h.button("match"));
});

test("mounted panel closes during replay recovery and reopens the saved reward without duplicating settlement", async (t) => {
  const h = await duel(t);
  await h.click("match");
  h.lose();
  await h.click("settle");
  const committed = await h.state(),
    original = h.commands.at(-1);
  assert.equal(committed.run.phase, "reward");
  await h.click("replay");
  await until(
    () => h.status().includes("保存された記録と一致するリプレイです"),
    "verified replay before closing recovery",
  );
  const hold = h.hold();
  h.startClick("retry");
  await hold.seen;
  assert.deepEqual(h.commands.at(-1), original);
  h.dispose();
  assert.equal(h.host.children.length, 0);
  hold.release();
  await h.idle();
  assert.equal(
    h.host.children.length,
    0,
    "late receipt cannot reopen a disposed panel",
  );
  await h.reopen();
  assert.ok(
    h.button("claim"),
    "opening the panel reads the committed reward state",
  );
  assert.equal(
    h.button("retry"),
    undefined,
    "reopening does not restore old in-memory intent",
  );
  assert.deepEqual((await h.state()).run, committed.run);
  await h.click("claim", (button) => !!D.PARTS[button.dataset.type]);
  const claimed = await h.state();
  assert.equal(claimed.run.owned.length, committed.run.owned.length + 1);
  assert.equal(claimed.run.cash, committed.run.cash);
  assert.equal(claimed.run.history.length, 1);
  assert.equal(claimed.run.stage, 1);
  await h.reopen();
  assert.ok(h.button("match"));
  assert.deepEqual((await h.state()).run, claimed.run);
});
