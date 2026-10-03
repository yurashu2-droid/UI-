import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";
import { until, settle, deferred } from "./helpers/local-import-dom.mjs";

// Bundled production renderer/model/engine with a DOM event/focus boundary.
// These checks are not browser presentation, keyboard, inert or AT acceptance.
const entry = new URL("../src/paid-witness-panel.ts", import.meta.url).pathname;
const present = existsSync(entry);
const compiled = present
  ? buildSync({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "PaidPanel",
      platform: "browser",
      target: "es2022",
      loader: { ".css": "empty" },
    }).outputFiles[0].text
  : "";

class PanelElement extends ElementAdapter {
  get tabIndex() {
    return Number(this.getAttribute("tabindex") ?? -1);
  }
  set tabIndex(value) {
    this.setAttribute("tabindex", value);
  }
  get isConnected() {
    return (
      this === this.ownerDocument.body || !!this.parentElement?.isConnected
    );
  }
  contains(node) {
    return node === this || this.children.some((child) => child.contains(node));
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
  remove() {
    if (this.contains(this.ownerDocument.activeElement))
      this.ownerDocument.activeElement = this.ownerDocument.body;
    super.remove();
  }
  focus(options) {
    if (this.isConnected && !this.disabled && !this.hidden) {
      this.ownerDocument.activeElement = this;
      this.ownerDocument.focusCalls.push({ node: this, options });
    }
  }
}
function mount(t, config = {}) {
  const doc = {
    focusCalls: [],
    createElement(tag) {
      return new PanelElement(this, tag);
    },
  };
  doc.body = doc.createElement("body");
  doc.documentElement = doc.body;
  doc.activeElement = doc.body;
  const observers = [];
  class Observer {
    constructor(callback) {
      this.callback = callback;
      this.active = false;
      observers.push(this);
    }
    observe() {
      this.active = true;
    }
    disconnect() {
      this.active = false;
    }
  }
  const dialog = doc.createElement("dialog");
  dialog.open = true;
  const close = doc.createElement("button");
  close.textContent = "閉じる";
  const host = doc.createElement("section");
  doc.body.append(dialog);
  dialog.append(close, host);
  let allowed = true,
    holding = false,
    failSchedule = false,
    calls = 0;
  const scheduled = new Map();
  let serial = 0;
  const timers = new Set();
  const schedule = (fn, delay) => {
    calls++;
    if (failSchedule) throw Error("simulated scheduler failure");
    if (holding && delay === 0) {
      const id = ++serial;
      scheduled.set(id, fn);
      return id;
    }
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, delay);
    timers.add(id);
    return id;
  };
  const cancel = (id) => {
    scheduled.delete(id);
    clearTimeout(id);
    timers.delete(id);
  };
  const api = vm.runInNewContext(compiled + "\nPaidPanel;", {
    document: doc,
    HTMLElement: PanelElement,
    Element: PanelElement,
    MutationObserver: Observer,
    AbortController,
    DOMException,
    TextEncoder,
    TextDecoder,
    structuredClone,
    crypto: config.crypto ?? globalThis.crypto,
    performance,
    URL,
    setTimeout: schedule,
    clearTimeout: cancel,
    console,
    fetch() {
      throw Error("unexpected network");
    },
  });
  const handles = [];
  const start = () => {
    const handle = api.mountPaidWitnessPanel(host, {
      isCurrent: () => allowed && dialog.open,
    });
    handles.push(handle);
    return handle;
  };
  if (config.loading) {
    const loading = doc.createElement("p");
    loading.textContent = "画面を読み込んでいます…";
    host.append(loading);
  }
  const handle = start();
  t.after(() => {
    handles.forEach((h) => h.dispose());
    timers.forEach(clearTimeout);
  });
  return {
    host,
    doc,
    dialog,
    close,
    handle,
    start,
    mutations() {
      observers
        .filter((observer) => observer.active)
        .forEach((observer) => observer.callback());
    },
    get observing() {
      return observers.filter((observer) => observer.active).length;
    },
    allowed(value) {
      allowed = value;
    },
    hold(value = true) {
      holding = value;
    },
    failSchedule(value = true) {
      failSchedule = value;
    },
    drain() {
      const queued = [...scheduled.values()];
      scheduled.clear();
      queued.forEach((fn) => fn());
    },
    get pending() {
      return scheduled.size;
    },
    get calls() {
      return calls;
    },
    action(name) {
      return host.querySelector(`[data-paid-action="${name}"]`);
    },
    select(name) {
      return host.querySelector(`[data-paid-select="${name}"]`);
    },
    status() {
      return host.querySelector(".paid-witness-status")?.textContent ?? "";
    },
    rows() {
      return host.querySelectorAll("[data-paid-result]");
    },
  };
}
async function ready(ui) {
  await until(() => ui.action("compare") && !ui.action("compare").disabled);
}
async function change(ui, key, value) {
  const select = ui.select(key);
  select.value = String(value);
  await select.dispatch("change");
}
async function finish(ui) {
  await ui.action("compare").dispatch("click");
  await until(() => ui.rows().length === 4);
}

test("read-only paid comparison panel module exists", () =>
  assert.equal(present, true));

test(
  "validation exposes fixed labelled selectors and complete inert native previews without auto-running",
  { skip: !present },
  async (t) => {
    const ui = mount(t);
    await ready(ui);
    assert.equal(ui.select("hp").value, "440");
    assert.deepEqual(
      ui.select("hp").children.map((n) => n.value),
      ["396", "440", "460", "484"],
    );
    assert.deepEqual(
      ui.select("phase").children.map((n) => n.value),
      ["-0.5", "0", "0.5"],
    );
    assert.deepEqual(
      ui.select("foe").children.map((n) => n.value),
      ["s3-candidate-1100144", "s0-candidate-432"],
    );
    for (const control of [
      ui.select("hp"),
      ui.select("phase"),
      ui.select("foe"),
    ])
      assert.equal(control.parentElement.tagName, "LABEL");
    const previews = ui.host.querySelectorAll("[data-paid-preview]");
    assert.equal(previews.length, 3);
    for (const preview of previews) {
      assert.equal(preview.inert, true);
      assert.equal(preview.getAttribute("aria-hidden"), "true");
      assert.equal(preview.querySelector(".page-body").style.width, "960px");
      assert.equal(preview.querySelector(".page-body").style.height, "680px");
      assert.ok(
        preview
          .querySelectorAll("[tabindex],button,input,select,textarea,a")
          .every((node) => node.tabIndex === -1),
      );
      let stopped = 0,
        prevented = 0;
      await preview.dispatch("click", {
        stopImmediatePropagation() {
          stopped++;
        },
        preventDefault() {
          prevented++;
        },
      });
      await preview.dispatch("submit", {
        stopImmediatePropagation() {
          stopped++;
        },
        preventDefault() {
          prevented++;
        },
      });
      assert.equal(stopped, 2);
      assert.equal(prevented, 2);
    }
    assert.equal(previews[0].querySelectorAll(".web-node").length, 14);
    assert.equal(previews[1].querySelectorAll(".web-node").length, 14);
    const inventory = ui.host.querySelectorAll("[data-paid-inventory]");
    assert.equal(inventory.length, 14);
    assert.ok(inventory.every((row) => !row.closest("[data-paid-preview]")));
    assert.match(ui.host.textContent, /反実仮想/);
    assert.match(ui.host.textContent, /実際のR8/);
    assert.match(
      ui.host.textContent,
      /部品\$51.*容量プラン\$12.*再抽選\$13.*支出\$76/,
    );
    assert.match(ui.host.textContent, /初期\$10.*報酬\$70.*残金\$4/);
    assert.match(ui.host.textContent, /所持品.*\$57/);
    assert.equal(ui.rows().length, 0);
    assert.equal(ui.calls, 0);
    assert.equal(
      ui.host.querySelectorAll("[data-add],[data-load],[data-loot]").length,
      0,
    );
    assert.equal(
      ui.host
        .querySelectorAll("input")
        .filter((node) => !node.closest("[data-paid-preview]")).length,
      0,
    );
  },
);

test(
  "one explicit request displays four real engine rows with captured HP, seats, CPU and phase",
  { skip: !present },
  async (t) => {
    const ui = mount(t);
    await ready(ui);
    await finish(ui);
    const rows = ui.rows();
    assert.deepEqual(
      rows.map((n) => n.dataset.paidResult),
      [
        "original-player",
        "original-enemy",
        "rearranged-player",
        "rearranged-enemy",
      ],
    );
    assert.match(rows[0].textContent, /相手の勝ち/);
    assert.match(rows[0].textContent, /30\.8/);
    assert.match(rows[0].textContent, /10\.80/);
    assert.match(rows[2].textContent, /自分の勝ち/);
    assert.match(rows[2].textContent, /69\.9/);
    assert.match(rows[2].textContent, /10\.15/);
    const results = ui.host.querySelector(".paid-witness-results").textContent;
    assert.match(results, /440.*550/);
    assert.match(results, /23.*31/);
    assert.match(results, /28.*35/);
    assert.match(results, /backup/);
    assert.match(results, /server/);
    assert.match(results, /combat-v4/);
    await change(ui, "hp", 460);
    assert.equal(ui.rows().length, 0);
    await change(ui, "foe", "s0-candidate-432");
    await change(ui, "phase", -0.5);
    await finish(ui);
    assert.match(
      ui.host.querySelector(".paid-witness-results").textContent,
      /460.*575/,
    );
    assert.match(
      ui.host.querySelector(".paid-witness-results").textContent,
      /Six-onestop/,
    );
    assert.match(
      ui.host.querySelector(".paid-witness-results").textContent,
      /相手.*0\.5秒/,
    );
  },
);

test(
  "selector changes and Cancel retire old batches and obsolete buttons cannot affect a replacement",
  { skip: !present },
  async (t) => {
    const ui = mount(t);
    await ready(ui);
    ui.hold();
    const compare = ui.action("compare");
    await compare.dispatch("click");
    await compare.dispatch("click");
    assert.equal(ui.pending, 1, "double click cannot start parallel batches");
    const cancel = ui.action("cancel");
    await change(ui, "hp", 484);
    assert.equal(ui.pending, 0);
    assert.equal(ui.rows().length, 0);
    await ui.action("compare").dispatch("click");
    assert.equal(ui.pending, 1);
    await cancel.dispatch("click");
    assert.equal(
      ui.pending,
      1,
      "obsolete cancel does not abort current request",
    );
    const ownCancel = ui.action("cancel");
    ownCancel.focus();
    await ownCancel.dispatch("click");
    assert.equal(ui.pending, 0);
    assert.match(ui.status(), /中止/);
    assert.equal(ui.doc.activeElement, ui.action("retry"));
    const retry = ui.action("retry");
    await retry.dispatch("click");
    ui.close.focus();
    ui.hold(false);
    ui.drain();
    await until(() => ui.rows().length === 4);
    assert.equal(
      ui.doc.activeElement,
      ui.close,
      "completed work never steals focus from Close",
    );
    await retry.dispatch("click");
    assert.equal(ui.rows().length, 4);
  },
);

for (const reason of ["close", "source", "detach", "dispose", "replace"])
  test(
    `${reason} rejects queued work, clears only its own panel, and never publishes stale results`,
    { skip: !present },
    async (t) => {
      const ui = mount(t);
      await ready(ui);
      ui.hold();
      await ui.action("compare").dispatch("click");
      const oldCancel = ui.action("cancel");
      if (reason === "close") ui.dialog.open = false;
      if (reason === "source") ui.allowed(false);
      if (reason === "detach") ui.host.remove();
      if (reason === "dispose") ui.handle.dispose();
      if (reason === "replace") {
        ui.start();
        await ready(ui);
      }
      ui.drain();
      await settle();
      assert.equal(ui.rows().length, 0);
      assert.equal(ui.pending, 0);
      await oldCancel.dispatch("click");
      if (reason === "replace") {
        assert.ok(ui.action("compare"));
        ui.handle.dispose();
        assert.ok(
          ui.action("compare"),
          "old dispose cannot remove replacement mount",
        );
      } else assert.equal(ui.host.querySelector(".paid-witness-panel"), null);
    },
  );

test(
  "deferred validation cannot paint after source invalidation and validation retry is explicit",
  { skip: !present },
  async (t) => {
    const gate = deferred();
    let calls = 0;
    const crypto = {
      subtle: {
        async digest(...args) {
          calls++;
          await gate.promise;
          return globalThis.crypto.subtle.digest(...args);
        },
      },
    };
    const ui = mount(t, { crypto });
    assert.match(ui.status(), /検証/);
    assert.equal(ui.action("compare"), null);
    ui.allowed(false);
    gate.resolve();
    await until(() => calls > 0);
    await settle();
    assert.equal(ui.host.querySelector(".paid-witness-panel"), null);
    let fail = true;
    const recover = mount(t, {
      crypto: {
        subtle: {
          digest(...args) {
            return fail
              ? Promise.reject(Error("<private-error>"))
              : globalThis.crypto.subtle.digest(...args);
          },
        },
      },
    });
    await until(() => recover.action("retry"));
    assert.equal(recover.host.querySelector("private-error"), null);
    assert.match(recover.status(), /検証/);
    fail = false;
    await recover.action("retry").dispatch("click");
    await ready(recover);
    assert.equal(recover.rows().length, 0);
  },
);

test(
  "malformed selectors fail closed; schedule failure can retry only the current selected comparison",
  { skip: !present },
  async (t) => {
    const ui = mount(t);
    await ready(ui);
    await change(ui, "hp", "999");
    assert.ok(!ui.action("compare") || ui.action("compare").disabled);
    assert.equal(ui.rows().length, 0);
    await change(ui, "hp", 396);
    await ready(ui);
    ui.failSchedule();
    await ui.action("compare").dispatch("click");
    await until(() => ui.action("retry"));
    assert.equal(ui.rows().length, 0);
    assert.match(ui.status(), /失敗/);
    const retry = ui.action("retry");
    await change(ui, "hp", 440);
    ui.failSchedule(false);
    await retry.dispatch("click");
    assert.equal(ui.rows().length, 0);
    await finish(ui);
    assert.match(ui.rows()[2].textContent, /69\.9/);
  },
);

test(
  "panel source and scoped stylesheet keep optional loading and read-only boundaries",
  { skip: !present },
  () => {
    const source = readFileSync(entry, "utf8");
    assert.match(source, /paid-witness\.css\?url/);
    assert.match(source, /loadFeatureStylesheet/);
    assert.doesNotMatch(
      source,
      /\b(?:fetch|localStorage|sessionStorage|Editor|startBattle|settleBattle|save|loadBuild)\s*\(/,
    );
    assert.doesNotMatch(source, /\.innerHTML\s*=/);
    const css = readFileSync(
      new URL("../src/styles/paid-witness.css", import.meta.url),
      "utf8",
    );
    assert.match(css, /paid-witness-panel/);
    assert.match(css, /overflow.*auto/s);
  },
);

for (const value of ["", " ", "0x0", "NaN", "0.50", "1"])
  test(
    `malformed native phase value ${JSON.stringify(value)} cannot silently launch natural startup`,
    { skip: !present },
    async (t) => {
      const ui = mount(t);
      await ready(ui);
      await finish(ui);
      await change(ui, "phase", value);
      assert.equal(ui.rows().length, 0);
      assert.ok(ui.action("compare").disabled);
      await ui.action("compare").dispatch("click");
      assert.equal(ui.rows().length, 0);
      assert.match(ui.status(), /選び直し/);
      await change(ui, "phase", 0);
      await ready(ui);
      assert.equal(ui.rows().length, 0);
    },
  );

for (const mode of ["closed", "source", "detached"])
  test(
    `observer retires settled results after ${mode} ownership and disconnects without stealing focus`,
    { skip: !present },
    async (t) => {
      const ui = mount(t);
      await ready(ui);
      await finish(ui);
      ui.close.focus();
      assert.equal(ui.observing, 1);
      if (mode === "closed") ui.dialog.open = false;
      if (mode === "source") ui.allowed(false);
      if (mode === "detached") ui.host.remove();
      ui.mutations();
      assert.equal(ui.rows().length, 0);
      assert.equal(ui.observing, 0);
      assert.equal(ui.doc.activeElement, ui.close);
      ui.mutations();
      ui.handle.dispose();
      assert.equal(ui.observing, 0);
    },
  );

test(
  "validation retry relinquishes focus only if it owns it and never resurrects a replaced root",
  { skip: !present },
  async (t) => {
    let fail = true;
    const ui = mount(t, {
      crypto: {
        subtle: {
          digest(...args) {
            return fail
              ? Promise.reject(Error("unavailable"))
              : globalThis.crypto.subtle.digest(...args);
          },
        },
      },
    });
    await until(() => ui.action("retry"));
    const obsolete = ui.action("retry");
    ui.close.focus();
    fail = false;
    ui.start();
    await ready(ui);
    await obsolete.dispatch("click");
    assert.equal(ui.doc.activeElement, ui.close);
    assert.equal(ui.rows().length, 0);
    assert.equal(ui.host.querySelectorAll(".paid-witness-panel").length, 1);
  },
);

test(
  "mount replaces its host loading status and labels the action-sequence hash accurately",
  { skip: !present },
  async (t) => {
    const ui = mount(t, { loading: true });
    await ready(ui);
    assert.doesNotMatch(ui.host.textContent, /画面を読み込んでいます/);
    assert.match(
      ui.host.textContent,
      /照合した取得・組み替え操作列：9ea3f00f9edb095147d7807bf27575dda0d1fe472e4540428cf78870f95a35cb/,
    );
    assert.doesNotMatch(ui.host.textContent, /照合したゲーム定義/);
    assert.equal(ui.close.isConnected, true);
  },
);

for (const moved of [false, true])
  test(
    `validation Retry transfers only its owned focus${moved ? " and yields to Close during validation" : " to the ready Compare control"}`,
    { skip: !present },
    async (t) => {
      let fail = true,
        held = false;
      const gate = deferred();
      const ui = mount(t, {
        crypto: {
          subtle: {
            async digest(...args) {
              if (fail) throw Error("unavailable");
              if (held) await gate.promise;
              return globalThis.crypto.subtle.digest(...args);
            },
          },
        },
      });
      await until(() => ui.action("retry"));
      const retry = ui.action("retry");
      retry.focus();
      fail = false;
      held = true;
      await retry.dispatch("click");
      if (moved) ui.close.focus();
      gate.resolve();
      await ready(ui);
      assert.ok(
        ui.doc.activeElement === (moved ? ui.close : ui.action("compare")),
        "retry must preserve only focus it owned",
      );
    },
  );
