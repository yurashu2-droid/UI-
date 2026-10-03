import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { buildSync } from "esbuild";
import R from "../src/run.js";
import D from "../src/data.js";
import { createOnlineClient } from "../src/online/client.js";
import { createArenaServer } from "../server/arena/http.js";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";

// Complete bundled production panel/client and a real durable loopback arena.
// The adapter supplies DOM events/focus and the fetch adapter supplies cookies.
// Held/lost replies occur after real commands unless explicitly marked before.
// This does not certify native dialog cancel, browser focus, paint, or AT.
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

class PanelElement extends ElementAdapter {
  get firstElementChild() {
    return this.children.find((child) => child.tagName !== "#TEXT");
  }
  get disabled() {
    return this.getAttribute("disabled") !== null;
  }
  get isConnected() {
    return (
      this === this.ownerDocument.body || !!this.parentElement?.isConnected
    );
  }
  contains(node) {
    return node === this || this.children.some((child) => child.contains(node));
  }
  replaceChildren(...nodes) {
    if (
      this.children.some((child) =>
        child.contains(this.ownerDocument.activeElement),
      )
    )
      this.ownerDocument.activeElement = this.ownerDocument.body;
    super.replaceChildren(...nodes);
  }
  focus(options) {
    if (this.isConnected && !this.disabled) {
      this.ownerDocument.activeElement = this;
      this.ownerDocument.focusCalls.push({ node: this, options });
    }
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
}
class InputElement extends PanelElement {}
class SelectElement extends PanelElement {}
class FormElement extends PanelElement {}

async function fixture(t, { sessionFailure = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "online-close-recovery-"));
  const arena = createArenaServer({ filePath: join(directory, "arena.json") });
  await new Promise((resolve) => arena.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${arena.address().port}/api/arena`;
  let cookie = "",
    panel,
    closes = 0,
    active = 0;
  const requests = [],
    commands = [],
    faults = [],
    releases = [],
    peers = [];
  const doc = {
    focusCalls: [],
    createElement(tag) {
      const Type =
        { input: InputElement, select: SelectElement, form: FormElement }[
          tag
        ] ?? PanelElement;
      return new Type(this, tag);
    },
  };
  doc.body = doc.createElement("body");
  doc.activeElement = doc.body;
  const dialog = doc.createElement("dialog");
  dialog.open = true;
  const host = doc.createElement("div");
  doc.body.append(dialog);
  dialog.append(host);
  const failure = (status = 503) =>
    new Response(
      JSON.stringify({
        code: "UPSTREAM_UNAVAILABLE",
        message: "private-upstream-detail ui_raid_guest=secret",
      }),
      { status, headers: { "content-type": "application/json" } },
    );
  const mount = vm.runInNewContext(
    compiled + "\nOnlinePanel.mountOnlinePanel;",
    {
      document: doc,
      async fetch(url, init) {
        active++;
        const isCommand = String(url).endsWith("/command");
        requests.push({ url, signal: init.signal });
        if (isCommand) commands.push(JSON.parse(init.body));
        const fault = isCommand ? faults.shift() : null;
        try {
          if (sessionFailure && String(url).endsWith("/session"))
            return failure();
          if (fault?.before) return failure(fault.status);
          const response = await fetch(url, {
            ...init,
            headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
          });
          const nextCookie = response.headers.get("set-cookie");
          if (nextCookie) cookie = nextCookie.split(";")[0];
          await response.clone().text();
          if (fault) {
            assert.equal(
              response.ok,
              true,
              "interrupted reply follows a real commit",
            );
            fault.seen?.();
            if (fault.gate) await fault.gate;
            if (fault.status) return failure(fault.status);
          }
          return response;
        } finally {
          active--;
        }
      },
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
      Element: PanelElement,
      HTMLElement: PanelElement,
      HTMLInputElement: InputElement,
      HTMLSelectElement: SelectElement,
      HTMLFormElement: FormElement,
    },
  );
  function open() {
    panel = mount(host, {
      baseUrl: base,
      onClose() {
        closes++;
        panel.dispose();
      },
    });
  }
  open();
  const root = () => host.children[0];
  const node = (kind) =>
    root()?.querySelector(`[data-arena="${kind}"]`) ?? null;
  const warning = () =>
    root()?.querySelector("[data-arena-close-warning]") ?? null;
  async function flush() {
    const deadline = Date.now() + 6000;
    while (active) {
      assert.ok(Date.now() < deadline, "HTTP settles within fixture deadline");
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  async function click(kind, target = node(kind)) {
    assert.ok(target, `${kind} exists`);
    assert.equal(target.disabled, false, `${kind} is enabled`);
    await root().dispatch("click", { target, stopPropagation() {} });
  }
  t.after(async () => {
    releases.forEach((release) => release());
    panel?.dispose();
    peers.forEach((peer) => peer.dispose());
    await flush();
    arena.closeAllConnections();
    await new Promise((resolve) => arena.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  });
  await flush();
  return {
    root,
    node,
    warning,
    click,
    flush,
    doc,
    host,
    commands,
    requests,
    faults,
    get closes() {
      return closes;
    },
    requestClose() {
      panel.requestClose();
    },
    async escape() {
      let prevented = false;
      await root().dispatch("keydown", {
        target: doc.activeElement,
        key: "Escape",
        stopPropagation() {},
        preventDefault() {
          prevented = true;
        },
      });
      assert.equal(prevented, true);
    },
    async state() {
      const response = await fetch(base + "/state", { headers: { cookie } });
      assert.equal(response.status, 200);
      return response.json();
    },
    async reopen() {
      open();
      await flush();
    },
    async publishOpponent() {
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
          const nextCookie = response.headers.get("set-cookie");
          if (nextCookie) peerCookie = nextCookie.split(";")[0];
          return response;
        },
      });
      peers.push(peer);
      const initial = await peer.connect();
      const stock = initial.run.shop.find(
        (stock) => D.PARTS[stock.type]?.kind === "attack",
      );
      assert.ok(stock, "ordinary initial stock contains a legal attacker");
      const bought = await peer.command({ kind: "purchase", type: stock.type });
      const part = bought.run.owned[0];
      await peer.command({
        kind: "placement",
        items: [{ id: part.id, x: 32, y: 32, w: part.w, h: part.h }],
      });
      await peer.command({ kind: "publish" });
    },
    hold(status) {
      let release, seen;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const captured = new Promise((resolve) => {
        seen = resolve;
      });
      releases.push(release);
      faults.push({ gate, seen, status });
      return { release, captured };
    },
  };
}

test("Close and repeated Escape preserve an uncertain paid command until explicit same-ID recovery", async (t) => {
  const h = await fixture(t);
  const before = await h.state();
  h.faults.push({ status: 503 });
  await h.click("reroll");
  await h.flush();
  const original = h.commands[0],
    root = h.root();
  const committed = await h.state();
  assert.equal(committed.revision, before.revision + 1);
  assert.equal(committed.run.cash, before.run.cash - R.REROLL);
  h.node("close").focus();
  await h.click("close");
  assert.equal(
    h.closes,
    0,
    "unacknowledged Close must preserve the unresolved command",
  );
  assert.equal(h.root(), root);
  assert.match(h.warning().textContent, /結果はまだ確認できていません/);
  assert.match(h.warning().textContent, /結果を確認・再接続/);
  assert.match(h.warning().textContent, /同じ操作/);
  assert.match(h.warning().textContent, /取り消されません/);
  assert.doesNotMatch(
    h.warning().textContent,
    /private-upstream|ui_raid_guest/,
  );
  assert.equal(h.doc.activeElement, h.node("keep-recovering"));
  assert.equal(
    h.doc.focusCalls.at(-1).options.preventScroll,
    false,
    "an explicit close request brings its decision into view",
  );
  await h.escape();
  await h.click("close");
  assert.equal(
    h.closes,
    0,
    "repeated close requests are never acknowledgement",
  );
  const oldConfirm = h.node("close-anyway");
  await h.click("keep-recovering");
  assert.equal(h.warning(), null);
  assert.equal(
    h.commands.length,
    1,
    "keeping the panel does not retry automatically",
  );
  assert.equal(h.doc.activeElement, h.node("retry"));
  await h.click("close-anyway", oldConfirm);
  assert.equal(h.closes, 0, "a stale confirmation is not a current choice");
  assert.equal(h.node("reroll").disabled, true);
  await h.click("retry");
  await h.flush();
  assert.equal(h.commands.length, 2);
  assert.deepEqual(h.commands[1], original);
  assert.deepEqual(
    await h.state(),
    committed,
    "receipt recovery cannot charge a second reroll",
  );
  assert.equal(h.warning(), null);
  await h.click("close");
  assert.equal(h.closes, 1, "confirmed results close normally");
});

test("an in-flight reply is retained after Escape and clears the warning without closing when confirmed", async (t) => {
  const h = await fixture(t);
  const hold = h.hold();
  await h.click("reroll");
  await hold.captured;
  await h.escape();
  assert.equal(
    h.closes,
    0,
    "in-flight Close must not silently abort pending recovery",
  );
  assert.match(h.warning().textContent, /応答を待っています/);
  assert.match(h.warning().textContent, /取り消されません/);
  assert.equal(
    h.node("retry"),
    null,
    "an in-flight request needs no competing retry",
  );
  assert.equal(h.requests.at(-1).signal.aborted, false);
  assert.equal(h.doc.activeElement, h.node("keep-recovering"));
  hold.release();
  await h.flush();
  assert.equal(h.warning(), null, "confirmed receipt removes obsolete warning");
  assert.equal(h.closes, 0, "receipt arrival is not permission to close");
  assert.equal(
    h.doc.activeElement,
    h.node("close"),
    "focus follows the removed warning to Close",
  );
  h.requestClose();
  assert.equal(h.closes, 1);
});

test("keeping an in-flight panel only dismisses the warning and later loss still permits recovery", async (t) => {
  const h = await fixture(t);
  const hold = h.hold(503);
  await h.click("reroll");
  await hold.captured;
  h.requestClose();
  await h.click("keep-recovering");
  assert.equal(h.warning(), null);
  assert.equal(h.closes, 0);
  assert.equal(h.commands.length, 1);
  assert.equal(h.doc.activeElement, h.node("close"));
  hold.release();
  await h.flush();
  assert.ok(h.node("retry"));
  h.requestClose();
  assert.match(h.warning().textContent, /結果はまだ確認できていません/);
  assert.doesNotMatch(h.warning().textContent, /応答を待っています/);
  await h.click("retry");
  await h.flush();
  assert.equal(h.warning(), null);
  assert.deepEqual(h.commands[1], h.commands[0]);
});

test("explicitly closing an in-flight command does not undo its commit or revive the disposed panel", async (t) => {
  const h = await fixture(t);
  const hold = h.hold();
  await h.click("reroll");
  await hold.captured;
  const committed = await h.state();
  h.requestClose();
  assert.equal(h.closes, 0);
  await h.click("close-anyway");
  assert.equal(h.closes, 1);
  assert.equal(h.root(), undefined);
  assert.equal(h.requests.at(-1).signal.aborted, true);
  hold.release();
  await h.flush();
  assert.equal(
    h.root(),
    undefined,
    "late committed reply cannot reopen the old panel",
  );
  assert.deepEqual(await h.state(), committed);
  await h.reopen();
  assert.equal(h.warning(), null);
  assert.equal(
    h.commands.length,
    1,
    "reopening reads authoritative state, not persisted intent",
  );
  assert.deepEqual(await h.state(), committed);
  await h.click("close");
  assert.equal(h.closes, 2);
});

test("a temporary retry refusal retains close protection until a definitive command rejection", async (t) => {
  const h = await fixture(t);
  h.faults.push({ before: true, status: 503 });
  await h.click("publish");
  await h.flush();
  h.requestClose();
  h.faults.push({ before: true, status: 429 });
  await h.click("retry");
  await h.flush();
  assert.ok(h.warning());
  assert.equal(h.node("reroll").disabled, true);
  await h.click("retry");
  await h.flush();
  assert.equal(
    h.warning(),
    null,
    "real empty-build rejection settles the uncertain intent",
  );
  assert.match(h.root().textContent, /攻撃UIを最低一つ/);
  assert.ok(
    h.commands.every(
      (command) => JSON.stringify(command) === JSON.stringify(h.commands[0]),
    ),
  );
  assert.equal((await h.state()).revision, 0);
  await h.click("close");
  assert.equal(h.closes, 1);
});

test("a failed connection without gameplay intent closes immediately", async (t) => {
  const h = await fixture(t, { sessionFailure: true });
  assert.ok(h.node("retry"));
  await h.click("close");
  assert.equal(h.closes, 1);
  assert.equal(h.commands.length, 0);
});

test("unknown match and settlement results keep their identities and pay only once after choosing to stay", async (t) => {
  const h = await fixture(t);
  await h.publishOpponent();
  const stock = h
    .root()
    .querySelectorAll('[data-arena="buy"]')
    .find(
      (button) =>
        !button.disabled && D.PARTS[button.dataset.type]?.kind === "attack",
    );
  assert.ok(stock);
  await h.click("buy", stock);
  await h.flush();
  await h.click("place");
  await h.flush();
  h.faults.push({ status: 503 });
  await h.click("match");
  await h.flush();
  const assigned = await h.state(),
    matchCommand = h.commands.at(-1);
  assert.equal(assigned.run.phase, "battle");
  h.requestClose();
  assert.ok(h.warning());
  await h.click("keep-recovering");
  await h.click("retry");
  await h.flush();
  assert.deepEqual(h.commands.at(-1), matchCommand);
  assert.deepEqual(
    await h.state(),
    assigned,
    "receipt recovery cannot assign another match",
  );
  h.faults.push({ status: 503 });
  await h.click("settle");
  await h.flush();
  const settled = await h.state(),
    settleCommand = h.commands.at(-1);
  assert.equal(
    settled.run.cash,
    assigned.run.cash + assigned.match.summary.total,
  );
  assert.equal(settled.run.history.length, assigned.run.history.length + 1);
  await h.escape();
  assert.ok(h.warning());
  await h.click("keep-recovering");
  await h.click("retry");
  await h.flush();
  assert.deepEqual(h.commands.at(-1), settleCommand);
  assert.deepEqual(
    await h.state(),
    settled,
    "receipt recovery cannot repeat rewards or history",
  );
  await h.click("close");
  assert.equal(h.closes, 1);
});
