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

// Complete production panel/client with DOM mechanics adapted, not browser QA.
// Real HTTP guests, purchases, publications and rounds; no injected pool data.
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
  const dir = mkdtempSync(join(tmpdir(), "online-pool-guidance-"));
  const server = createArenaServer({ filePath: join(dir, "store.json") });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/arena`;
  const faults = [],
    commands = [],
    requests = [],
    replies = [],
    peers = [];
  let cookie = "",
    active = 0;
  const transport = async (url, init) => {
    active++;
    requests.push(new URL(url).pathname);
    try {
      const isCommand = String(url).endsWith("/command");
      if (isCommand) commands.push(JSON.parse(init.body));
      const fault = isCommand ? faults.shift() : null;
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
          assert.equal(response.ok, true);
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
    createElement(tag) {
      return new (
        { input: InputAdapter, select: SelectAdapter, form: FormAdapter }[
          tag
        ] ?? ElementAdapter
      )(tag, this);
    },
  };
  doc.body = doc.createElement("body");
  doc.activeElement = doc.body;
  const host = doc.createElement("div");
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
  let handle;
  const open = () => {
    handle = mount(host, { baseUrl: base, onClose: () => handle.dispose() });
  };
  open();
  t.after(async () => {
    handle.dispose();
    peers.forEach((peer) => peer.dispose());
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
    await new Promise((resolve) => setImmediate(resolve));
  }
  const root = () => host.children[0];
  const node = (kind) => root().querySelector(`[data-arena="${kind}"]`);
  const dispatch = (type, target, extra = {}) => {
    for (const listener of root().events[type] || [])
      listener({ target, preventDefault() {}, stopPropagation() {}, ...extra });
  };
  async function click(kind, target = node(kind)) {
    assert.ok(target, `${kind} button exists`);
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
    dispatch,
    flush,
    state,
    commands,
    faults,
    requests,
    replies,
    guidance: () => root().querySelector("[data-arena-pool-guidance]"),
    published: () => root().querySelector("[data-arena-published]"),
    noOpponent: () => root().querySelector("[data-arena-no-opponent]"),
    status: () => root().querySelector(".arena-status").textContent,
    async prepare() {
      await click(
        "buy",
        root()
          .querySelectorAll('[data-arena="buy"]')
          .find(
            (button) =>
              !button.disabled &&
              D.PARTS[button.dataset.type]?.kind === "attack",
          ),
      );
      await click("place");
    },
    async reopen() {
      handle.dispose();
      open();
      await flush();
    },
    async peer(sameGuest = false) {
      let peerCookie = sameGuest ? cookie : "";
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
      return peer;
    },
  };
}
async function preparePeer(peer) {
  const stock = peer.current.run.shop.find(
    (stock) =>
      D.PARTS[stock.type]?.kind === "attack" &&
      D.PARTS[stock.type].price <= peer.current.run.cash,
  );
  assert.ok(stock);
  const bought = await peer.command({ kind: "purchase", type: stock.type });
  const part = bought.run.owned[0];
  await peer.command({
    kind: "placement",
    items: [{ id: part.id, x: 32, y: 24, w: part.w, h: part.h }],
  });
}
async function advancePeer(peer) {
  const matchId = peer.current.match.id;
  let next = await peer.command({ kind: "settle", matchId });
  if (next.run.phase === "reward")
    next = await peer.command({ kind: "claim", matchId, choice: null });
  return next;
}

test("empty and self-only results explain eligible saved players while preserving publication and Undo", async (t) => {
  const h = await fixture(t);
  await h.prepare();
  const before = await h.state();
  await h.click("match");
  const empty = await h.state();
  assert.equal(h.replies.at(-1).outcome.code, "NO_OPPONENT");
  assert.ok(empty.online.publishedSnapshotId);
  assert.equal(empty.revision, before.revision + 1);
  assert.deepEqual(empty.run, before.run);
  assert.match(h.status(), /前回の検索では/);
  assert.match(h.published()?.textContent ?? "", /公開済み/);
  assert.match(h.guidance()?.textContent ?? "", /同じサービス/);
  assert.match(h.guidance().textContent, /同じラウンド/);
  assert.match(h.guidance().textContent, /ほかのプレイヤー/);
  assert.match(h.guidance().textContent, /オンラインでなくても/);
  assert.match(h.guidance().textContent, /同じゲストの別タブ/);
  assert.match(h.guidance().textContent, /結果を確認・再接続/);
  assert.match(h.guidance().textContent, /自動/);
  assert.ok(h.noOpponent());
  assert.equal(h.node("match").textContent, "もう一度対戦相手を探す");
  assert.equal(h.node("undo").disabled, false);
  assert.equal(h.node("retry"), null);
  const count = h.requests.length;
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(h.requests.length, count, "no autonomous poll or match request");
  await h.click("match");
  const selfOnly = await h.state();
  assert.equal(h.replies.at(-1).outcome.code, "NO_OPPONENT");
  assert.equal(
    selfOnly.online.publishedSnapshotId,
    empty.online.publishedSnapshotId,
  );
  assert.deepEqual(selfOnly.run, before.run);
  assert.equal(h.node("undo").disabled, false);
  await h.click("undo");
  assert.equal((await h.state()).run.owned[0].x, null);
  assert.equal(
    h.published(),
    null,
    "editing must not leave current-build publication claim",
  );
  assert.equal(
    h.noOpponent(),
    null,
    "a later edit does not retain historical-search action state",
  );
  await h.click("redo");
  await h.click("publish");
  assert.ok(h.published());
  assert.equal(h.noOpponent(), null);
  await h.reopen();
  assert.ok(
    h.published(),
    "read-only session restoration has publication truth without outcome",
  );
  assert.equal(h.noOpponent(), null);
});

test("a real same-round peer supplies an idle ghost, while a later round still needs an eligible peer snapshot", async (t) => {
  const h = await fixture(t);
  await h.prepare();
  await h.click("match");
  const first = await h.state();
  const tab = await h.peer(true);
  assert.equal(tab.current.online.id, first.online.id);
  const sameGuest = await tab.command({ kind: "match" });
  assert.equal(
    sameGuest.outcome.code,
    "NO_OPPONENT",
    "another tab is still the same owner",
  );
  await h.reopen();
  const peer = await h.peer();
  assert.notEqual(peer.current.online.id, first.online.id);
  await preparePeer(peer);
  const peerBattle = await peer.command({ kind: "match" });
  assert.equal(peerBattle.outcome.code, "MATCH_READY");
  assert.equal(peerBattle.match.opponent.id, first.online.publishedSnapshotId);
  assert.deepEqual(
    (await h.state()).run,
    first.run,
    "fighting a ghost leaves its owner unchanged",
  );
  const advanced = await advancePeer(peer);
  assert.equal(advanced.run.stage, 1);
  const unavailable = await peer.command({ kind: "match" });
  assert.equal(unavailable.outcome.code, "NO_OPPONENT");
  assert.deepEqual(
    unavailable.run,
    advanced.run,
    "real round 2 cannot use round 1 opponents",
  );
  await h.click("match");
  const matched = await h.state();
  assert.equal(h.replies.at(-1).outcome.code, "MATCH_READY");
  assert.equal(matched.match.opponent.ownerRunId, peer.current.online.id);
  assert.equal(
    matched.match.opponent.round,
    0,
    "historical compatible round remains matchable",
  );
  assert.equal(
    h.guidance(),
    null,
    "build guidance disappears when battle is assigned",
  );
  assert.equal(h.noOpponent(), null);
});

for (const afterCommit of [false, true]) {
  test(`uncertain match ${afterCommit ? "after" : "before"} commit keeps explicit receipt recovery separate from another search`, async (t) => {
    const h = await fixture(t);
    await h.prepare();
    await h.click("match");
    assert.ok(h.noOpponent());
    const before = await h.state();
    h.faults.push({ status: 503, afterCommit }, { status: 429 });
    await h.click("match");
    const original = h.commands.at(-1),
      count = h.commands.length;
    assert.equal(
      h.noOpponent(),
      null,
      "uncertain response does not claim a new empty pool",
    );
    assert.equal(
      h.published(),
      null,
      "uncertain command suppresses current-build publication claim",
    );
    assert.equal(h.node("match").disabled, true);
    assert.ok(h.node("retry"));
    h.dispatch("click", h.node("match"));
    h.dispatch("keydown", h.root(), { key: "z", ctrlKey: true });
    await h.flush();
    assert.equal(
      h.commands.length,
      count,
      "match and editor history remain locked",
    );
    await h.click("retry");
    assert.equal(h.node("match").disabled, true);
    await h.click("retry");
    assert.deepEqual(h.commands.slice(count - 1), [
      original,
      original,
      original,
    ]);
    const recovered = await h.state();
    assert.equal(recovered.revision, before.revision + 1);
    assert.deepEqual(recovered.run, before.run);
    assert.ok(h.noOpponent());
    assert.ok(h.published());
    assert.equal(h.node("undo").disabled, false);
    assert.equal(h.node("retry"), null);
  });
}

for (const republished of [false, true]) {
  test(`an old search receipt uses the newer edited view's ${republished ? "published" : "unpublished"} state`, async (t) => {
    const h = await fixture(t);
    await h.prepare();
    h.faults.push({ status: 503, afterCommit: true });
    await h.click("match");
    const original = h.commands.at(-1);
    const tab = await h.peer(true);
    const part = tab.current.run.owned[0];
    await tab.command({
      kind: "placement",
      items: [{ id: part.id, x: 64, y: 24, w: part.w, h: part.h }],
    });
    if (republished) await tab.command({ kind: "publish" });
    const current = structuredClone(tab.current);
    await h.click("retry");
    assert.deepEqual(h.commands.at(-1), original);
    assert.equal(h.replies.at(-1).outcome.code, "NO_OPPONENT");
    assert.equal(h.replies.at(-1).revision, current.revision);
    assert.deepEqual((await h.state()).run, current.run);
    assert.match(h.status(), /前回の検索では/);
    assert.equal(
      !!h.published(),
      republished,
      "the historical successful publication does not override current snapshot truth",
    );
    assert.equal(
      h.node("undo").disabled,
      true,
      "another tab's edit invalidates obsolete editor history",
    );
    assert.ok(h.noOpponent(), "search guidance describes the old receipt only");
    assert.ok(!h.root().textContent.includes(current.online.id));
    if (current.online.publishedSnapshotId)
      assert.ok(
        !h.root().textContent.includes(current.online.publishedSnapshotId),
        "publication status does not expose snapshot identity",
      );
  });
}
