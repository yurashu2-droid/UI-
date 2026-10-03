import test from "node:test";
import assert from "node:assert/strict";
import { mountRaidPanel } from "../src/raid/panel.ts";
import { reconstructLocalCode } from "../src/raid/local-code.ts";
import { processLocalImportMessage } from "../src/raid/local-import-worker.ts";
import {
  documentAdapter,
  ElementAdapter,
  settle,
  until,
  deferred,
  localFile,
  WorkerAdapter,
} from "./helpers/local-import-dom.mjs";
const localBlueprint = async () => {
  const result = await reconstructLocalCode({
    html: new TextEncoder().encode(
      '<h1>Local heading</h1><a href="/">Menu</a>',
    ),
    capturedAt: "2026-10-03T12:00:00.000Z",
  });
  assert.equal(result.ok, true);
  return result.value;
};
function mount(t, options = {}) {
  const originals = { Worker: globalThis.Worker, Element: globalThis.Element };
  globalThis.Worker = WorkerAdapter;
  globalThis.Element = ElementAdapter;
  WorkerAdapter.instances = [];
  t.after(() => {
    for (const [k, v] of Object.entries(originals)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });
  const doc = documentAdapter(),
    host = doc.createElement("section");
  doc.body.append(host);
  const challenged = [],
    captured = [],
    claims = [];
  let allowed = options.allowed ?? true;
  const callbacks = {
    onCaptured: async (...a) => captured.push(a),
    onChallenge: async (b) => {
      challenged.push(b);
      return { battleId: "local-panel-win", winner: "player" };
    },
    onClaim: async (...a) => {
      claims.push(a);
      return { ok: true };
    },
    onDiscard: async () => ({ ok: true }),
    ...(options.omitGate ? {} : { isLocalImportAllowed: () => allowed }),
    ...options.callbacks,
  };
  const handle = mountRaidPanel(host, callbacks, options.resume);
  t.after(() => handle.dispose());
  return {
    doc,
    host,
    handle,
    challenged,
    captured,
    claims,
    workers: WorkerAdapter.instances,
    setAllowed: (v) => (allowed = v),
    button: (label) =>
      host.querySelectorAll("button").find((n) => n.textContent === label),
    meta: () => host.querySelector(".raid-meta").textContent,
  };
}
async function begin(ui, html = '<h1>Local heading</h1><a href="/">Menu</a>') {
  const input = ui.host
    .querySelectorAll("input")
    .find((n) => n.type === "file");
  assert.ok(input, "local HTML picker mounted");
  input.files = [localFile(html)];
  input.dispatchEvent(new Event("change"));
  ui.button("ローカルHTMLを近似再構成").click();
  await settle();
  return ui.workers.at(-1);
}
async function deliver(worker) {
  const reply = await processLocalImportMessage(worker.sent[0].value);
  worker.reply(reply.result);
  await settle();
}
function claimFirst(ui) {
  const canvas = ui.host.querySelector(".raid-canvas"),
    component = canvas.querySelector("[data-component-id]");
  assert.ok(component);
  const event = new Event("click");
  Object.defineProperty(event, "target", { value: component });
  canvas.dispatchEvent(event);
}

test("panel omits local picker unless the owner explicitly opts into live eligibility", async (t) => {
  const ui = mount(t, { omitGate: true });
  await until(() => ui.meta());
  assert.equal(
    ui.host.querySelectorAll("input").filter((n) => n.type === "file").length,
    0,
  );
  assert.match(ui.meta(), /付属/);
});

test("local file creates a labeled approximation without URL capture, energy hook or rewards on selection", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw Error("unexpected source request");
  });
  const ui = mount(t);
  await until(() => ui.meta());
  const previous = ui.meta(),
    worker = await begin(ui);
  assert.ok(worker);
  assert.equal(ui.meta(), previous);
  assert.equal(ui.captured.length, 0);
  assert.equal(ui.challenged.length, 0);
  assert.equal(ui.claims.length, 0);
  await deliver(worker);
  await until(() => /ローカルHTML/.test(ui.meta()));
  assert.match(ui.meta(), /ローカルHTML/);
  assert.match(ui.meta(), /近似/);
  assert.equal(ui.captured.length, 0);
  const reference = ui.button("元HTMLの比較は利用できません");
  assert.ok(reference?.disabled);
  assert.equal(ui.host.querySelectorAll("iframe").length, 0);
  ui.button("このページに挑戦").click();
  await settle();
  assert.equal(ui.challenged.length, 1);
  assert.equal(ui.challenged[0].source.kind, "local-file");
  claimFirst(ui);
  await settle();
  assert.equal(ui.claims.length, 1);
  ui.setAllowed(false);
  ui.button("このページに挑戦").dispatchEvent(new Event("click"));
  await settle();
  assert.equal(
    ui.challenged.length,
    1,
    "claimed local opponent must not be rechallenged outside lab",
  );
  assert.equal(
    requests,
    0,
    "local selection/battle/claim never uses the URL capture API",
  );
});

test("cancelled, failed, and stale local imports preserve selected fixture and never call URL hooks", async (t) => {
  const ui = mount(t);
  await until(() => ui.meta());
  const old = ui.meta();
  let worker = await begin(ui);
  worker.reply({ ok: false, code: "invalid-utf8", error: "UTF-8" });
  await settle();
  assert.equal(ui.meta(), old);
  worker = await begin(ui);
  ui.button("ローカル読込を中止").click();
  await settle();
  assert.equal(ui.meta(), old);
  assert.equal(worker.terminated, 1);
  worker = await begin(ui);
  const late = worker.handlers.get("message");
  ui.button("取得を中止").click();
  late({
    data: {
      type: "local-import-result",
      requestId: worker.sent[0].value.requestId,
      result: { ok: true, value: await localBlueprint() },
    },
  });
  await settle();
  assert.equal(ui.meta(), old);
  assert.equal(ui.captured.length, 0);
  assert.equal(ui.claims.length, 0);
});

test("resumed local reward remains pending and cannot claim or replace selection outside lab", async (t) => {
  const b = await localBlueprint(),
    ui = mount(t, {
      allowed: false,
      resume: { blueprint: b, battleId: "saved-local", winner: "player" },
    });
  await until(() => ui.meta());
  assert.match(ui.meta(), /ローカルHTML/);
  claimFirst(ui);
  await settle();
  assert.equal(ui.claims.length, 0);
  assert.equal(ui.button("今回は回収を見送る").hidden, false);
  ui.setAllowed(true);
  claimFirst(ui);
  await settle();
  assert.equal(ui.claims.length, 1);
  ui.setAllowed(false);
  ui.button("このページに挑戦").dispatchEvent(new Event("click"));
  await settle();
  assert.equal(ui.challenged.length, 0);
});

test("pending reward prevents native or synthetic new local selection and preserves its claim", async (t) => {
  const b = await localBlueprint(),
    ui = mount(t, {
      resume: { blueprint: b, battleId: "saved-local", winner: "player" },
    });
  await until(() => ui.meta());
  const before = ui.meta();
  const input = ui.host
    .querySelectorAll("input")
    .find((n) => n.type === "file");
  assert.ok(input);
  input.files = [localFile()];
  input.dispatchEvent(new Event("change"));
  ui.button("ローカルHTMLを近似再構成").dispatchEvent(new Event("click"));
  await settle();
  assert.equal(ui.workers.length, 0);
  assert.equal(ui.meta(), before);
  claimFirst(ui);
  await settle();
  assert.equal(ui.claims.length, 1);
});

test("synthetic fixture clicks cannot supersede a pending resumed reward verification", async (t) => {
  const blueprint = await localBlueprint(),
    held = deferred(),
    digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  let calls = 0;
  t.mock.method(globalThis.crypto.subtle, "digest", (...args) =>
    ++calls === 1 ? held.promise.then(() => digest(...args)) : digest(...args),
  );
  const ui = mount(t, {
      resume: { blueprint, battleId: "saved-race", winner: "player" },
    }),
    fixture = ui.host
      .querySelectorAll("button")
      .find((n) => n.dataset.raidFixture === "commerce");
  assert.equal(fixture.disabled, true);
  fixture.dispatchEvent(new Event("click"));
  await settle();
  try {
    assert.equal(
      calls,
      1,
      "disabled fixture must not even begin hashing during reward restoration",
    );
  } finally {
    held.resolve();
  }
  await until(() => ui.meta());
  assert.match(ui.meta(), /ローカルHTML/);
  assert.equal(ui.button("今回は回収を見送る").hidden, false);
});

test("new file selection during successful registry hashing cannot replace the previous opponent", async (t) => {
  const b = await localBlueprint(),
    ui = mount(t);
  await until(() => ui.meta());
  const previous = ui.meta(),
    worker = await begin(ui);
  const held = deferred(),
    digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  let calls = 0,
    registrationStarted = false;
  t.mock.method(globalThis.crypto.subtle, "digest", (...args) => {
    calls++;
    if (calls === b.components.length + 2) {
      registrationStarted = true;
      return held.promise.then(() => digest(...args));
    }
    return digest(...args);
  });
  worker.reply({ ok: true, value: b });
  await until(() => registrationStarted);
  const html = ui.host.querySelectorAll("input").find((n) => n.type === "file");
  html.files = [localFile("<h1>New source</h1>")];
  html.dispatchEvent(new Event("change"));
  held.resolve();
  await settle();
  assert.equal(ui.meta(), previous);
  assert.equal(ui.captured.length, 0);
  ui.button("このページに挑戦").click();
  await settle();
  assert.equal(ui.challenged[0]?.source.kind, "fixture");
});

test("editing the URL cancels pending local source selection without fetching it", async (t) => {
  const ui = mount(t);
  await until(() => ui.meta());
  const previous = ui.meta(),
    worker = await begin(ui);
  const input = ui.host.querySelectorAll("input").find((n) => n.type === "url");
  input.value = "https://example.com/";
  input.dispatchEvent(new Event("input"));
  assert.equal(worker.terminated, 1);
  await settle();
  assert.equal(ui.meta(), previous);
  assert.equal(ui.captured.length, 0);
});

test("a legitimate fixture switch terminates pending local work and keeps the fixed comparison available", async (t) => {
  const b = await localBlueprint(),
    ui = mount(t);
  await until(() => ui.meta());
  const worker = await begin(ui),
    late = worker.handlers.get("message"),
    button = ui.host
      .querySelectorAll("button")
      .find((n) => n.dataset.raidFixture === "commerce");
  button.click();
  assert.equal(worker.terminated, 1);
  await until(() => ui.meta().startsWith(button.textContent));
  const selected = ui.meta();
  late({
    data: {
      type: "local-import-result",
      requestId: worker.sent[0].value.requestId,
      result: { ok: true, value: b },
    },
  });
  await settle();
  assert.equal(ui.meta(), selected);
  const compare = ui.button("静的ページと比較");
  assert.equal(compare.disabled, false);
  compare.click();
  const frame = ui.host.querySelector("iframe");
  assert.ok(frame);
  assert.equal(frame.getAttribute("sandbox"), "");
  assert.match(frame.src, /fixtures\/raid\/commerce\.html$/);
  assert.equal(ui.captured.length, 0);
});
