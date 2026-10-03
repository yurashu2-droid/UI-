import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { buildSync } from "esbuild";
import D from "../src/data.js";
import { createArenaServer } from "../server/arena/http.js";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";

// Production panel/client and real durable loopback HTTP arena. The DOM
// adapter supplies events; a cookie adapter honors the real Max-Age while
// the clock advances past expiry. No credentials are persisted by the client.
// This is not native-browser, focus, paint, or assistive-technology acceptance.
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
  addEventListener(name, callback, options) {
    super.addEventListener(name, callback);
    options?.signal?.addEventListener("abort", () =>
      this.removeEventListener(name, callback),
    );
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
    return { width: 960, height: 680 };
  }
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

async function fixture(t, { retainExpiredCookie = false } = {}) {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const directory = mkdtempSync(join(tmpdir(), "online-session-loss-"));
  const filePath = join(directory, "arena.json");
  const arena = createArenaServer({ filePath });
  await new Promise((resolve) => arena.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${arena.address().port}/api/arena`;
  let cookie = "",
    cookieExpires = 0,
    panel,
    active = 0;
  const requests = [],
    commands = [],
    faults = [],
    releases = [];
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
  const host = doc.createElement("div");
  doc.body.append(host);
  const failure = (fault) =>
    new Response(
      JSON.stringify({
        code: fault.code ?? "UPSTREAM_UNAVAILABLE",
        message: fault.message ?? "Temporary failure",
      }),
      { status: fault.status, headers: { "content-type": "application/json" } },
    );
  const mount = vm.runInNewContext(
    compiled + "\nOnlinePanel.mountOnlinePanel;",
    {
      document: doc,
      async fetch(url, init) {
        active++;
        if (!retainExpiredCookie && now >= cookieExpires) cookie = "";
        const request = {
          path: new URL(url).pathname,
          body: init.body && JSON.parse(init.body),
        };
        requests.push(request);
        if (request.path.endsWith("/command")) commands.push(request.body);
        const nextFault = faults[0];
        const fault =
          nextFault && request.path.endsWith(nextFault.path ?? "/command")
            ? faults.shift()
            : null;
        try {
          if (fault?.transport)
            throw new TypeError("simulated unavailable network");
          let response;
          if (fault?.before) response = failure(fault);
          else {
            response = await fetch(url, {
              ...init,
              headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
            });
            const nextCookie = response.headers.get("set-cookie");
            if (nextCookie) {
              cookie = nextCookie.split(";")[0];
              cookieExpires =
                now + Number(nextCookie.match(/Max-Age=(\d+)/)[1]) * 1000;
            }
            if (fault?.status) {
              assert.equal(
                response.ok,
                true,
                "lost reply follows a real accepted command",
              );
              await response.arrayBuffer();
              response = failure(fault);
            }
          }
          request.status = response.status;
          request.result = await response.clone().json();
          fault?.seen?.();
          if (fault?.gate) await fault.gate;
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
  const open = () => {
    panel = mount(host, { baseUrl: base, onClose: () => panel.dispose() });
  };
  open();
  const root = () => host.children[0];
  const node = (kind) =>
    root()?.querySelector(`[data-arena="${kind}"]`) ?? null;
  async function flush() {
    const deadline = performance.now() + 6000;
    while (active) {
      assert.ok(
        performance.now() < deadline,
        "HTTP settles within fixture deadline",
      );
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
    await flush();
    arena.closeAllConnections();
    await new Promise((resolve) => arena.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  });
  await flush();
  return {
    root,
    node,
    click,
    flush,
    commands,
    requests,
    faults,
    status: () => root().querySelector(".arena-status").textContent,
    persisted: () => JSON.parse(readFileSync(filePath, "utf8")),
    expire() {
      now += 86_400_001;
    },
    dispose() {
      panel.dispose();
    },
    open,
    requestClose() {
      panel.requestClose();
    },
    hold(path = "/command") {
      let release, seen;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const captured = new Promise((resolve) => {
        seen = resolve;
      });
      releases.push(release);
      faults.push({ path, gate, seen });
      return { release, captured };
    },
    async otherTabReroll() {
      const response = await fetch(base + "/command", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          kind: "reroll",
          commandId: crypto.randomUUID(),
          expectedRevision: requests.at(-1).result.revision,
        }),
      });
      assert.equal(response.ok, true);
      return response.json();
    },
    async prepare() {
      const buy = root()
        .querySelectorAll('[data-arena="buy"]')
        .find(
          (button) =>
            !button.disabled && D.PARTS[button.dataset.type]?.kind === "attack",
        );
      await click("buy", buy);
      await flush();
      await click("place");
      await flush();
    },
  };
}

for (const retainExpiredCookie of [true, false]) {
  test(`expired mounted guest offers explicit replacement when cookie is ${retainExpiredCookie ? "retained" : "removed by Max-Age"}`, async (t) => {
    const h = await fixture(t, { retainExpiredCookie });
    await h.prepare();
    const before = h.persisted(),
      staleButton = h.node("reroll");
    assert.equal(Object.keys(before.sessions).length, 1);
    h.expire();
    await h.click("reroll");
    await h.flush();
    const expectedCode = retainExpiredCookie
      ? "SESSION_EXPIRED"
      : "SESSION_REQUIRED";
    assert.equal(h.requests.at(-1).status, 401);
    assert.equal(h.requests.at(-1).result.code, expectedCode);
    assert.deepEqual(
      h.persisted(),
      before,
      "rejection cannot change the expired run or session",
    );
    await h.click("retry");
    await h.flush();
    assert.ok(h.requests.at(-1).path.endsWith("/state"));
    assert.equal(h.requests.at(-1).result.code, expectedCode);
    assert.deepEqual(
      h.persisted(),
      before,
      "reconnect cannot implicitly replace the guest",
    );
    assert.ok(
      h.node("new-guest"),
      "missing identity must expose explicit guest replacement",
    );
    assert.match(h.status(), /前のランを復元した状態ではありません/);
    assert.doesNotMatch(h.status(), /SESSION_REQUIRED/);
    assert.equal(h.node("reroll"), null, "expired gameplay is hidden");
    const count = h.commands.length;
    await h.click("reroll", staleButton);
    await h
      .root()
      .dispatch("keydown", { key: "z", ctrlKey: true, stopPropagation() {} });
    await h.flush();
    assert.equal(
      h.commands.length,
      count,
      "obsolete controls and Undo cannot operate on an unusable guest",
    );
    const replacement = h.node("new-guest"),
      hold = h.hold("/session");
    await h.click("new-guest", replacement);
    await hold.captured;
    await h.click("new-guest", replacement);
    hold.release();
    await h.flush();
    const after = h.persisted();
    assert.equal(
      Object.keys(after.sessions).length,
      2,
      "repeat click creates only one explicit replacement",
    );
    for (const [id, run] of Object.entries(before.runs))
      assert.deepEqual(after.runs[id], run);
    assert.ok(h.node("reroll"));
    assert.equal(h.node("new-guest"), null);
  });
}

test("expiry during explicit recovery never transfers a committed old command to a fresh guest", async (t) => {
  const h = await fixture(t);
  const before = h.persisted();
  h.faults.push({ status: 503 });
  await h.click("reroll");
  await h.flush();
  const committed = h.persisted(),
    original = h.commands.at(-1);
  const runId = Object.keys(before.runs)[0];
  assert.equal(committed.runs[runId].revision, before.runs[runId].revision + 1);
  assert.ok(h.root().querySelector("[data-arena-pending-command]"));
  h.requestClose();
  assert.ok(h.root().querySelector("[data-arena-close-warning]"));
  h.expire();
  await h.click("retry");
  await h.flush();
  assert.deepEqual(
    h.commands.at(-1),
    original,
    "existing retry uses the old exact identity",
  );
  assert.equal(h.requests.at(-1).result.code, "SESSION_REQUIRED");
  assert.deepEqual(h.persisted(), committed);
  assert.ok(h.node("new-guest"));
  assert.equal(h.root().querySelector("[data-arena-pending-command]"), null);
  assert.equal(
    h.root().querySelector("[data-arena-close-warning]"),
    null,
    "definitive rejection resolves the previous warning",
  );
  await h.click("new-guest");
  await h.flush();
  assert.deepEqual(h.persisted().runs[runId], committed.runs[runId]);
  const count = h.commands.length;
  await h.click("reroll");
  await h.flush();
  assert.equal(h.commands.length, count + 1);
  assert.notEqual(h.commands.at(-1).commandId, original.commandId);
  assert.equal(h.commands.at(-1).expectedRevision, 0);
});

for (const fault of [
  { status: 400, code: "COMMAND_REJECTED" },
  { status: 401, code: "OTHER_UNAUTHORIZED" },
  { status: 503, code: "SESSION_REQUIRED" },
  { status: 503, code: "SESSION_EXPIRED" },
]) {
  test(`${fault.status} ${fault.code} does not authorize guest replacement`, async (t) => {
    const h = await fixture(t),
      before = h.persisted();
    h.faults.push({ ...fault, before: true });
    await h.click("reroll");
    await h.flush();
    assert.equal(h.node("new-guest"), null);
    assert.ok(h.node("reroll"));
    assert.deepEqual(h.persisted(), before);
    assert.equal(
      h.node("reroll").disabled,
      fault.status >= 500,
      "uncertain failures preserve the existing lock",
    );
    await h.click("retry");
    await h.flush();
    assert.equal(Object.keys(h.persisted().sessions).length, 1);
    assert.equal(h.node("new-guest"), null);
  });
}

test("network failure preserves same-ID recovery and close warning without suggesting a new guest", async (t) => {
  const h = await fixture(t),
    before = h.persisted();
  h.faults.push({ transport: true }, { transport: true });
  await h.click("reroll");
  await h.flush();
  assert.equal(
    h.commands.length,
    2,
    "the existing bounded transport retry is unchanged",
  );
  assert.deepEqual(h.commands[0], h.commands[1]);
  assert.deepEqual(h.persisted(), before);
  assert.equal(h.node("new-guest"), null);
  assert.ok(h.root().querySelector("[data-arena-pending-command]"));
  h.requestClose();
  assert.ok(h.root().querySelector("[data-arena-close-warning]"));
  await h.click("retry");
  await h.flush();
  assert.deepEqual(h.commands[2], h.commands[0]);
  const [oldRun] = Object.values(before.runs),
    [newRun] = Object.values(h.persisted().runs);
  assert.equal(newRun.revision, oldRun.revision + 1);
  assert.equal(h.root().querySelector("[data-arena-close-warning]"), null);
  assert.equal(h.node("new-guest"), null);
});

test("a late missing-session response from a disposed panel cannot replace the newly opened panel", async (t) => {
  const h = await fixture(t);
  h.expire();
  const hold = h.hold();
  await h.click("reroll");
  await hold.captured;
  assert.equal(h.requests.at(-1).result.code, "SESSION_REQUIRED");
  h.dispose();
  h.open();
  // Let the new independent session finish while the obsolete reply stays held.
  const deadline = performance.now() + 6000;
  while (!h.node("reroll")) {
    assert.ok(performance.now() < deadline);
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  const current = h.root(),
    text = current.textContent,
    persisted = h.persisted();
  assert.equal(Object.keys(persisted.sessions).length, 2);
  hold.release();
  await h.flush();
  assert.equal(h.root(), current);
  assert.equal(h.root().textContent, text);
  assert.equal(h.node("new-guest"), null);
  assert.deepEqual(h.persisted(), persisted);
});

async function startRecoveryDrag(h) {
  const item = h
    .root()
    .querySelector('[data-arena-board="self"]')
    .querySelector(".web-node");
  assert.ok(item);
  await h.root().dispatch("pointerdown", {
    target: item,
    button: 0,
    clientX: 40,
    clientY: 40,
    pointerId: 71,
    stopPropagation() {},
  });
  assert.equal(h.root().hasPointerCapture(71), true);
  await h.root().dispatch("pointermove", {
    clientX: 56,
    clientY: 40,
    pointerId: 71,
    stopPropagation() {},
  });
}
async function finishRecoveryDrag(h) {
  await h.root().dispatch("pointermove", {
    clientX: 72,
    clientY: 40,
    pointerId: 71,
    stopPropagation() {},
  });
  await h.root().dispatch("pointerup", { pointerId: 71, stopPropagation() {} });
  await h.flush();
}
for (const retainExpiredCookie of [true, false]) {
  test(`session loss retires an active drag and its late events when the expired cookie is ${retainExpiredCookie ? "retained" : "removed"}`, async (t) => {
    const h = await fixture(t, { retainExpiredCookie });
    await h.prepare();
    await h.otherTabReroll();
    await h.click("reroll");
    await h.flush();
    assert.ok(
      h.requests.some((request) => request.result?.code === "STALE_REVISION"),
    );
    assert.ok(
      h.node("retry"),
      "real stale-tab conflict exposes the current Retry",
    );
    // The player returns after idle expiry, starts a drag, then uses the
    // already-visible retry with the keyboard while pointer capture is active.
    h.expire();
    await startRecoveryDrag(h);
    h.node("retry").focus();
    await h.click("retry");
    await h.flush();
    assert.equal(
      h.requests.at(-1).result.code,
      retainExpiredCookie ? "SESSION_EXPIRED" : "SESSION_REQUIRED",
    );
    assert.ok(h.node("new-guest"));
    const oldState = h.persisted(),
      count = h.commands.length;
    assert.equal(
      h.root().hasPointerCapture(71),
      false,
      "authoritative loss immediately releases capture",
    );
    // Cover both a release before replacement and a gesture whose first late
    // event arrives only after the player explicitly starts the fresh guest.
    if (retainExpiredCookie) await assert.doesNotReject(finishRecoveryDrag(h));
    assert.equal(
      h.commands.length,
      count,
      "late release cannot send the expired board",
    );
    assert.deepEqual(h.persisted(), oldState);
    await h.click("new-guest");
    await h.flush();
    const newState = h.persisted();
    await assert.doesNotReject(finishRecoveryDrag(h));
    assert.equal(
      h.commands.length,
      count,
      "the old gesture cannot submit to a fresh identity",
    );
    assert.deepEqual(h.persisted(), newState);
    assert.equal(
      h
        .root()
        .querySelector('[data-arena-board="self"]')
        .querySelector(".web-node"),
      null,
    );
  });
}

test("a temporary read-only reconnect failure preserves a legal active drag", async (t) => {
  const h = await fixture(t);
  await h.prepare();
  await h.otherTabReroll();
  await h.click("reroll");
  await h.flush();
  const before = h.persisted(),
    count = h.commands.length;
  await startRecoveryDrag(h);
  h.faults.push({ path: "/state", before: true, status: 503 });
  await h.click("retry");
  await h.flush();
  assert.equal(h.node("new-guest"), null);
  assert.equal(
    h.root().hasPointerCapture(71),
    true,
    "temporary read failure is not identity loss",
  );
  await finishRecoveryDrag(h);
  assert.equal(h.root().hasPointerCapture(71), false);
  assert.equal(h.commands.length, count + 1);
  assert.equal(h.commands.at(-1).kind, "placement");
  const [oldRun] = Object.values(before.runs),
    [newRun] = Object.values(h.persisted().runs);
  assert.equal(newRun.state.owned[0].x, oldRun.state.owned[0].x + 32);
  assert.equal(newRun.revision, oldRun.revision + 1);
});

test("authoritative guest loss during stale-revision refresh is surfaced on that first recovery", async (t) => {
  const h = await fixture(t);
  await h.prepare();
  await h.otherTabReroll();
  const before = h.persisted(),
    count = h.commands.length,
    hold = h.hold();
  await h.click("reroll");
  await hold.captured;
  assert.equal(h.requests.at(-1).result.code, "STALE_REVISION");
  // The rejected command did not renew either deadline. Its response can arrive
  // after an idle cookie expires, before the automatic read-only refresh.
  h.expire();
  hold.release();
  await h.flush();
  assert.ok(h.requests.at(-1).path.endsWith("/state"));
  assert.equal(h.requests.at(-1).status, 401);
  assert.equal(h.requests.at(-1).result.code, "SESSION_REQUIRED");
  assert.ok(
    h.node("new-guest"),
    "the first authoritative loss must offer explicit replacement",
  );
  assert.equal(h.node("reroll"), null);
  assert.match(h.status(), /前のランを復元した状態ではありません/);
  assert.equal(h.commands.length, count + 1);
  assert.deepEqual(
    h.persisted(),
    before,
    "conflict recovery never creates a new identity automatically",
  );
});

test("a temporary stale-revision refresh error does not retire the current guest", async (t) => {
  const h = await fixture(t);
  await h.prepare();
  await h.otherTabReroll();
  const hold = h.hold(),
    before = h.persisted();
  await h.click("reroll");
  await hold.captured;
  assert.equal(h.requests.at(-1).result.code, "STALE_REVISION");
  h.faults.push({
    path: "/state",
    before: true,
    status: 503,
    code: "SESSION_REQUIRED",
  });
  hold.release();
  await h.flush();
  assert.equal(h.requests.at(-1).status, 503);
  assert.equal(h.node("new-guest"), null);
  assert.ok(h.node("reroll"));
  assert.equal(
    h.node("undo").disabled,
    true,
    "the stale history stays invalidated",
  );
  assert.deepEqual(h.persisted(), before);
  await h.click("retry");
  await h.flush();
  assert.equal(h.requests.at(-1).status, 200);
  assert.deepEqual(h.persisted(), before);
});
