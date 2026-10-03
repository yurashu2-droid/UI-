import test from "node:test";
import assert from "node:assert/strict";
import { mountRaidPanel } from "../src/raid/panel.ts";
import { createLocalRaidSelection } from "../src/raid/local-selection.ts";
import { reconstructLocalCode } from "../src/raid/local-code.ts";
import { processLocalImportMessage } from "../src/raid/local-import-worker.ts";
import { createFixtureRaid } from "../src/raid/fixtures.ts";
import {
  documentAdapter,
  ElementAdapter,
  WorkerAdapter,
  localFile,
  deferred,
  settle,
  until,
} from "./helpers/local-import-dom.mjs";

// Source/event adapters exercise production selection and ownership callbacks;
// these are not native file-picker, browser-layout, focus or AT acceptance tests.
const blueprint = async (title = "Rematch page") => {
  const result = await reconstructLocalCode({
    html: new TextEncoder().encode(
      `<title>${title}</title><h1>Heading</h1><a href='/'>Menu</a>`,
    ),
    capturedAt: "2026-10-03T13:00:00.000Z",
  });
  assert.equal(result.ok, true);
  return result.value;
};
function environment(t) {
  const originals = { Worker: globalThis.Worker, Element: globalThis.Element };
  globalThis.Worker = WorkerAdapter;
  globalThis.Element = ElementAdapter;
  WorkerAdapter.instances = [];
  t.after(() => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  return documentAdapter();
}
function mount(t, doc, slot, options = {}) {
  const host = doc.createElement("section");
  doc.body.append(host);
  let allowed = true;
  const calls = { captured: [], challenged: [], claimed: [], edits: 0 };
  const handle = mountRaidPanel(
    host,
    {
      localSelection: slot,
      isLocalImportAllowed: () => allowed,
      onCaptured: async (...args) => {
        calls.captured.push(args);
      },
      onChallenge: async (b) => {
        calls.challenged.push(b);
        return { battleId: "rematch-test", winner: "enemy" };
      },
      onClaim: async (...args) => {
        calls.claimed.push(args);
        return { ok: true };
      },
      onDiscard: async () => ({ ok: true }),
      onEditLocal: () => {
        calls.edits++;
        handle.dispose();
        host.remove();
      },
      ...options.callbacks,
    },
    options.resume,
  );
  t.after(() => handle.dispose());
  return {
    host,
    handle,
    calls,
    setAllowed: (value) => {
      allowed = value;
    },
    action: (name) => host.querySelector(`[data-local-selection="${name}"]`),
    button: (label) =>
      host
        .querySelectorAll("button")
        .find((node) => node.textContent === label),
    meta: () => host.querySelector(".raid-meta").textContent,
    status: () => host.querySelector(".raid-status").textContent,
  };
}
async function importLocal(ui, title = "Rematch page") {
  const file = localFile(
    `<title>${title}</title><h1>Heading</h1><a href='/'>Menu</a>`,
  );
  const input = ui.host
    .querySelectorAll("input")
    .find((node) => node.type === "file");
  input.files = [file];
  input.dispatchEvent(new Event("change"));
  ui.button("ローカルHTMLを近似再構成").click();
  await until(() => WorkerAdapter.instances.at(-1)?.sent.length);
  const worker = WorkerAdapter.instances.at(-1),
    reply = await processLocalImportMessage(worker.sent[0].value);
  worker.reply(reply.result);
  await until(() => ui.meta().startsWith(title));
  await until(() => !ui.button("ローカルHTMLを近似再構成").disabled);
  return { file, worker };
}

test("loss → edit → explicit same-tab resume reuses the verified opponent without file reads or rewards", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw Error("no refetch");
  });
  const doc = environment(t),
    slot = createLocalRaidSelection(),
    ui = mount(t, doc, slot);
  await until(() => ui.meta());
  const { file } = await importLocal(ui),
    localId = slot.read()?.captureId;
  assert.ok(
    localId,
    "accepted local selection is retained for the return journey",
  );
  ui.button("このページに挑戦").click();
  await settle();
  assert.equal(ui.calls.challenged.length, 1);
  const edit = ui.action("edit");
  assert.ok(edit && !edit.disabled && !edit.hidden);
  edit.click();
  assert.equal(ui.calls.edits, 1);
  const next = mount(t, doc, slot);
  await until(() => next.meta());
  assert.match(
    next.meta(),
    /付属/,
    "return is an explicit choice, not automatic source selection",
  );
  next.action("resume").click();
  await until(() => next.meta().startsWith("Rematch page"));
  next.button("このページに挑戦").click();
  await settle();
  assert.equal(next.calls.challenged[0].captureId, localId);
  assert.equal(file.reads, 1);
  assert.equal(WorkerAdapter.instances.length, 1);
  assert.equal(requests, 0);
  assert.equal(
    ui.calls.captured.length +
      next.calls.captured.length +
      ui.calls.claimed.length +
      next.calls.claimed.length,
    0,
  );
});

test("native-owner disposal keeps accepted return memory but never automatically resumes or awards it", async (t) => {
  const doc = environment(t),
    slot = createLocalRaidSelection(),
    ui = mount(t, doc, slot);
  await until(() => ui.meta());
  await importLocal(ui);
  ui.handle.dispose();
  ui.host.remove();
  assert.ok(slot.read());
  const next = mount(t, doc, slot);
  await until(() => next.meta());
  assert.match(next.meta(), /付属/);
  assert.equal(next.calls.challenged.length + next.calls.claimed.length, 0);
  assert.ok(next.action("resume") && !next.action("resume").hidden);
});

test("pending saved win keeps priority and rejects synthetic resume, clear, and edit actions", async (t) => {
  const doc = environment(t),
    slot = createLocalRaidSelection(),
    local = await blueprint();
  await slot.remember(local, () => true);
  const fixture = await createFixtureRaid("archive"),
    ui = mount(t, doc, slot, {
      resume: {
        blueprint: fixture,
        battleId: "pending-fixture",
        winner: "player",
      },
    });
  await until(() => ui.meta());
  for (const name of ["resume", "clear", "edit"]) {
    const control = ui.action(name);
    assert.ok(control, `return control ${name} exists but is unavailable`);
    assert.ok(control.disabled || control.hidden);
    control.dispatchEvent(new Event("click"));
  }
  await settle();
  assert.equal(slot.read().captureId, local.captureId);
  assert.match(ui.meta(), /付属/);
  assert.equal(ui.calls.edits + ui.calls.challenged.length, 0);
  assert.equal(ui.button("今回は回収を見送る").hidden, false);
});

test("clear removes only return memory, keeps the displayed opponent, and does not recache on redraw or edit", async (t) => {
  const doc = environment(t),
    slot = createLocalRaidSelection(),
    ui = mount(t, doc, slot);
  await until(() => ui.meta());
  await importLocal(ui);
  const before = ui.meta(),
    clear = ui.action("clear"),
    edit = ui.action("edit");
  assert.ok(clear);
  clear.click();
  assert.equal(slot.read(), undefined);
  assert.equal(ui.meta(), before);
  assert.match(ui.status(), /表示中の相手/);
  ui.button("戦闘用に再構成").click();
  edit.dispatchEvent(new Event("click"));
  assert.equal(ui.calls.edits, 0);
  assert.equal(slot.read(), undefined);
  ui.button("このページに挑戦").click();
  await settle();
  assert.equal(ui.calls.challenged[0].source.kind, "local-file");
  assert.equal(slot.read(), undefined);
});

test("closed, detached, and wrong-owner controls cannot read, clear, resume, or edit local memory", async (t) => {
  const doc = environment(t),
    slot = createLocalRaidSelection();
  await slot.remember(await blueprint(), () => true);
  for (const mode of ["gate", "detach", "dispose"]) {
    const ui = mount(t, doc, slot);
    await until(() => ui.meta());
    const controls = ["resume", "clear", "edit"].map((name) => ui.action(name));
    assert.ok(controls.every(Boolean));
    if (mode === "gate") ui.setAllowed(false);
    else if (mode === "detach") ui.host.remove();
    else ui.handle.dispose();
    const read = t.mock.method(slot, "read"),
      clear = t.mock.method(slot, "clear");
    for (const control of controls) control.dispatchEvent(new Event("click"));
    await settle();
    assert.equal(read.mock.callCount() + clear.mock.callCount(), 0);
    assert.equal(ui.calls.edits, 0);
    read.mock.restore();
    clear.mock.restore();
  }
  assert.ok(slot.read());
});

test("a delayed explicit resume cannot supersede a newer fixture selection", async (t) => {
  const doc = environment(t),
    slot = createLocalRaidSelection();
  await slot.remember(await blueprint(), () => true);
  const ui = mount(t, doc, slot);
  await until(() => ui.meta());
  const held = deferred(),
    digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  let first = true;
  t.mock.method(globalThis.crypto.subtle, "digest", (...args) => {
    if (first) {
      first = false;
      return held.promise.then(() => digest(...args));
    }
    return digest(...args);
  });
  assert.ok(ui.action("resume"));
  ui.action("resume").click();
  const fixture = ui.host
    .querySelectorAll("button")
    .find((node) => node.dataset.raidFixture === "commerce");
  fixture.click();
  await until(() => ui.meta().startsWith(fixture.textContent));
  const current = ui.meta();
  held.resolve();
  await settle();
  assert.equal(ui.meta(), current);
  assert.equal(ui.calls.challenged.length, 0);
});

test("failed retention never advertises an edit-and-return path", async (t) => {
  const doc = environment(t),
    slot = createLocalRaidSelection();
  t.mock.method(slot, "remember", async () => ({
    ok: false,
    code: "retention-failed",
    error: "一時保持できませんでした。",
  }));
  const ui = mount(t, doc, slot);
  await until(() => ui.meta());
  await importLocal(ui);
  assert.equal(slot.read(), undefined);
  assert.ok(ui.action("edit")?.hidden || ui.action("edit")?.disabled);
  assert.match(ui.status(), /一時保持できません/);
  ui.action("edit").dispatchEvent(new Event("click"));
  assert.equal(ui.calls.edits, 0);
});

test("temporary owner ineligibility while resuming settles busy state without selecting stale local data", async (t) => {
  const doc = environment(t),
    slot = createLocalRaidSelection(),
    local = await blueprint();
  await slot.remember(local, () => true);
  const ui = mount(t, doc, slot);
  await until(() => ui.meta());
  const previous = ui.meta(),
    held = deferred(),
    digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  let first = true;
  const digests = [];
  t.mock.method(globalThis.crypto.subtle, "digest", (...args) => {
    const result = first
      ? held.promise.then(() => digest(...args))
      : digest(...args);
    first = false;
    digests.push(result);
    return result;
  });
  ui.action("resume").click();
  ui.setAllowed(false);
  held.resolve();
  await until(() => digests.length === local.components.length + 1);
  await Promise.all(digests);
  await settle();
  ui.setAllowed(true);
  ui.button("戦闘用に再構成").click();
  assert.equal(ui.meta(), previous);
  assert.equal(
    ui.button("このページに挑戦").disabled,
    false,
    "completed rejected resume must release its own busy flag",
  );
  ui.button("このページに挑戦").click();
  await settle();
  assert.equal(ui.calls.challenged[0].source.kind, "fixture");
});

test("clearing during return verification cancels the old selection without losing current opponent", async (t) => {
  const doc = environment(t),
    slot = createLocalRaidSelection();
  await slot.remember(await blueprint(), () => true);
  const ui = mount(t, doc, slot);
  await until(() => ui.meta());
  const previous = ui.meta(),
    held = deferred(),
    digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  let first = true;
  t.mock.method(globalThis.crypto.subtle, "digest", (...args) => {
    if (first) {
      first = false;
      return held.promise.then(() => digest(...args));
    }
    return digest(...args);
  });
  ui.action("resume").click();
  ui.action("clear").click();
  held.resolve();
  await settle();
  assert.equal(ui.meta(), previous);
  assert.equal(slot.read(), undefined);
  assert.equal(ui.button("このページに挑戦").disabled, false);
  assert.match(ui.status(), /一時保持だけを消去/);
});

for (const action of ["clear", "cancel", "dispose"])
  test(`accepted opponent is painted before retention waits, and ${action} rejects late return memory`, async (t) => {
    const doc = environment(t),
      slot = createLocalRaidSelection();
    await slot.remember(await blueprint("Prior source"), () => true);
    const ui = mount(t, doc, slot);
    await until(() => ui.meta());
    const held = deferred(),
      remember = slot.remember.bind(slot);
    let started = false;
    t.mock.method(slot, "remember", async (...args) => {
      started = true;
      await held.promise;
      return remember(...args);
    });
    const input = ui.host
      .querySelectorAll("input")
      .find((node) => node.type === "file");
    input.files = [localFile("<title>New source</title><h1>New heading</h1>")];
    input.dispatchEvent(new Event("change"));
    ui.button("ローカルHTMLを近似再構成").click();
    await until(() => WorkerAdapter.instances.at(-1)?.sent.length);
    const worker = WorkerAdapter.instances.at(-1),
      reply = await processLocalImportMessage(worker.sent[0].value);
    worker.reply(reply.result);
    await until(() => started);
    try {
      assert.match(
        ui.meta(),
        /^New source/,
        "painted opponent agrees with the already accepted encounter during retention",
      );
      if (action === "clear") ui.action("clear").click();
      else if (action === "cancel") ui.button("ローカル読込を中止").click();
      else {
        ui.handle.dispose();
        ui.host.remove();
      }
    } finally {
      held.resolve();
    }
    await settle();
    if (action === "clear") assert.equal(slot.read(), undefined);
    else assert.equal(slot.read().source.name, "Prior source");
    assert.match(ui.meta(), /^New source/);
    ui.button("このページに挑戦").click();
    await settle();
    if (action === "dispose") assert.equal(ui.calls.challenged.length, 0);
    else assert.equal(ui.calls.challenged[0].source.name, "New source");
  });
