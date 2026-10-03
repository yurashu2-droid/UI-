import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { buildSync, transformSync } from "esbuild";
import { createDeferredMount } from "../src/feature-loader.js";
import { ArenaService } from "../server/arena/service.js";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";

// The real app modal/deferred/cancel handlers compose with the complete bundled
// panel/client and durable ArenaService. Only DOM, CSS loading and transport are
// adapted in process. No HTTP listener, browser, native focus or paint acceptance.
const panelCode = buildSync({
  entryPoints: [new URL("../src/online/panel.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "PanelModule",
  platform: "browser",
  target: "es2022",
  loader: { ".css": "empty" },
}).outputFiles[0].text;
const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const modal = source.slice(
  source.indexOf("let modalFeatureDispose:"),
  source.indexOf("/* ---------- Isolated story profile"),
);
const online = source
  .slice(
    source.indexOf("function deferredModalFeature"),
    source.indexOf("function localRaidEditingAllowed"),
  )
  .replace('import("./online/panel.js")', "loadPanel()");
const cancelStart = source.indexOf(
  '$<HTMLDialogElement>("#modal").addEventListener("cancel"',
);
const cancel = source.slice(
  cancelStart,
  source.indexOf("new ResizeObserver", cancelStart),
);
const appCode =
  transformSync(modal + online + cancel, { loader: "ts", target: "es2022" })
    .code +
  `
  globalThis.app = { onlinePanel,
    getRequest: () => modalFeatureRequestClose,
    getDispose: () => modalFeatureDispose };
`;

class ModalElement extends ElementAdapter {
  get disabled() {
    return this.getAttribute("disabled") !== null;
  }
  get firstElementChild() {
    return this.children.find((node) => node.tagName !== "#TEXT");
  }
  get isConnected() {
    return this.ownerDocument.body.contains(this);
  }
  contains(node) {
    return node === this || this.children.some((child) => child.contains(node));
  }
  focus() {
    if (this.isConnected) this.ownerDocument.activeElement = this;
  }
  replaceChildren(...children) {
    if (
      this.children.some((child) =>
        child.contains(this.ownerDocument.activeElement),
      )
    )
      this.ownerDocument.activeElement = this.ownerDocument.body;
    super.replaceChildren(...children);
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
  matches(selector) {
    return selector.split(",").some((value) => {
      const parts = value.trim().split(/\s+/),
        simple = parts.pop();
      const id = simple.match(/#([\w-]+)/)?.[1];
      if (id && this.getAttribute("id") !== id) return false;
      if (!super.matches(simple.replace(/#[\w-]+/g, ""))) return false;
      if (!parts.length) return true;
      if (parts.at(-1) === ">") {
        parts.pop();
        return this.parentElement?.matches(parts.join(" ")) ?? false;
      }
      for (
        let parent = this.parentElement;
        parent;
        parent = parent.parentElement
      )
        if (parent.matches(parts.join(" "))) return true;
      return false;
    });
  }
  addEventListener(name, callback, options) {
    super.addEventListener(name, callback);
    options?.signal?.addEventListener(
      "abort",
      () => this.removeEventListener(name, callback),
      { once: true },
    );
  }
}
const turn = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate, label) {
  const deadline = Date.now() + 4000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, label);
    await turn();
  }
  await turn();
}

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "qa-modal-command-"));
  const service = new ArenaService({ filePath: join(directory, "arena.json") });
  const doc = {
    createElement(tag) {
      return new ModalElement(this, tag);
    },
  };
  doc.body = doc.createElement("body");
  doc.activeElement = doc.body;
  const dialog = doc.createElement("dialog"),
    content = doc.createElement("div"),
    queued = [],
    releases = [];
  dialog.setAttribute("id", "modal");
  content.setAttribute("id", "modal-content");
  doc.body.append(dialog);
  dialog.append(content);
  dialog.open = false;
  dialog.showModal = () => {
    dialog.open = true;
  };
  dialog.close = () => {
    if (!dialog.open) return;
    dialog.open = false;
    queued.push(() => dialog.dispatch("close"));
  };
  let token,
    fault,
    inFlight = 0;
  const commands = [];
  const context = {
    document: doc,
    createDeferredMount,
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
    Element: ModalElement,
    HTMLElement: ModalElement,
    HTMLInputElement: class {},
    HTMLSelectElement: class {},
    HTMLFormElement: class {},
    async fetch(url, init) {
      inFlight++;
      try {
        const path = String(url).slice("/api/arena".length),
          body = init.body && JSON.parse(init.body);
        if (path === "/session") {
          const session = service.openSession(token);
          token = session.token;
          return Response.json(session.view);
        }
        if (path === "/state") return Response.json(service.view(token));
        assert.equal(path, "/command");
        commands.push(body);
        const next = service.command(token, body),
          current = fault;
        fault = undefined;
        if (current?.gate) {
          current.seen();
          await current.gate;
        }
        if (current?.lose)
          return Response.json(
            { code: "PROXY_UNAVAILABLE", message: "Lost committed response" },
            { status: 503 },
          );
        return Response.json(next);
      } finally {
        inFlight--;
      }
    },
    $: (selector) => doc.body.querySelector(selector),
    modalHead: () => "<button data-close-modal>Close</button>",
    renderSide() {},
    pendingStorySettlement: null,
    battle: null,
    leaveBattle() {},
  };
  const panel = vm.runInNewContext(panelCode + "\nPanelModule;", context);
  context.loadPanel = async () => ({ ...panel, async loadStyles() {} });
  vm.runInNewContext(appCode, context);
  const host = () => doc.body.querySelector("#online-feature-host");
  const root = () => host()?.children[0];
  const button = (kind) => root()?.querySelector(`[data-arena="${kind}"]`);
  const idle = async () => {
    await until(() => inFlight === 0, "request completed");
  };
  const startClick = (target) =>
    root().dispatch("click", { target, stopPropagation() {} });
  const flush = async () => {
    while (queued.length) await queued.shift()();
  };
  t.after(async () => {
    for (const release of releases) release();
    context.app.getDispose()?.();
    await idle();
    service.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const open = async () => {
    context.app.onlinePanel();
    await until(() => button("buy"), "online connected");
  };
  await open();
  return {
    ...context.app,
    doc,
    dialog,
    host,
    root,
    button,
    commands,
    open,
    idle,
    startClick,
    flush,
    state: () => service.view(token),
    buy: () =>
      root()
        .querySelectorAll('[data-arena="buy"]')
        .find((node) => !node.disabled),
    lose() {
      fault = { lose: true };
    },
    hold() {
      let release, seen;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const started = new Promise((resolve) => {
        seen = resolve;
      });
      fault = { gate, seen };
      releases.push(release);
      return { release, started };
    },
    async click(kind) {
      const target = button(kind);
      assert.ok(target);
      await startClick(target);
      await idle();
    },
    async nativeCancel() {
      const event = {
        defaultPrevented: false,
        preventDefault() {
          event.defaultPrevented = true;
        },
      };
      await dialog.dispatch("cancel", event);
      if (!event.defaultPrevented) dialog.close();
      return event;
    },
  };
}

test("real app native cancel preserves the real panel's pending purchase through receipt recovery", async (t) => {
  const h = await fixture(t),
    before = h.state();
  h.lose();
  await h.startClick(h.buy());
  await h.idle();
  const committed = h.state(),
    original = h.commands[0],
    root = h.root();
  assert.equal(committed.revision, before.revision + 1);
  assert.equal(committed.run.owned.length, before.run.owned.length + 1);
  assert.equal((await h.nativeCancel()).defaultPrevented, true);
  await h.nativeCancel();
  assert.equal(h.dialog.open, true);
  assert.equal(h.root(), root);
  assert.ok(h.button("close-anyway"));
  assert.equal(h.commands.length, 1);
  await h.click("keep-recovering");
  assert.equal(h.commands.length, 1);
  const hold = h.hold();
  await h.startClick(h.button("retry"));
  await hold.started;
  await h.nativeCancel();
  const staleAcknowledgement = h.button("close-anyway");
  assert.ok(staleAcknowledgement);
  assert.deepEqual(h.commands[1], original);
  hold.release();
  await h.idle();
  assert.equal(h.button("close-anyway"), null);
  assert.equal(h.button("retry"), null);
  await h.startClick(staleAcknowledgement);
  assert.equal(h.dialog.open, true);
  assert.equal(h.root(), root);
  assert.deepEqual(
    h.state(),
    committed,
    "receipt confirmation does not repeat the purchase",
  );
  await h.nativeCancel();
  await h.flush();
  assert.equal(h.dialog.open, false);
  assert.equal(h.host().children.length, 0);
});

test("acknowledged in-flight dismissal and its late receipt cannot dispose or repaint the next real panel", async (t) => {
  const h = await fixture(t),
    hold = h.hold();
  await h.startClick(h.buy());
  await hold.started;
  const committed = h.state(),
    oldRequest = h.getRequest(),
    oldDispose = h.getDispose();
  await h.nativeCancel();
  assert.equal(
    h.dialog.open,
    true,
    "native cancel retains the pending original command",
  );
  assert.ok(h.button("close-anyway"));
  await h.startClick(h.button("close-anyway"));
  assert.equal(h.dialog.open, false);
  assert.equal(h.host().children.length, 0);
  await h.open();
  const currentRoot = h.root(),
    currentRequest = h.getRequest();
  oldRequest();
  oldDispose();
  await h.flush();
  hold.release();
  await h.idle();
  assert.equal(h.dialog.open, true);
  assert.equal(h.root(), currentRoot);
  assert.equal(h.getRequest(), currentRequest);
  assert.equal(h.button("retry"), null);
  assert.equal(h.commands.length, 1);
  assert.deepEqual(h.state(), committed);
  await h.nativeCancel();
  await h.flush();
  assert.equal(h.dialog.open, false);
});
