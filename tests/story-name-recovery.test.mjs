import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { mountStoryHub } from "../src/story/hub.ts";
import * as StorySession from "../src/story/session.ts";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";

// Actual app command/commit, session persistence and hub renderer. DOM/storage
// failures and async callback delivery are boundary adapters, not browser QA.
// Removing current-owner draft restoration must fail the recovery assertions.
const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const compiled = transformSync(["commitStorySession", "storyCommand"].map(name => {
  const declaration = source.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"));
  assert.ok(declaration, `actual ${name} exists`);
  return declaration[0];
}).join("\n"), { loader: "ts", target: "es2022" }).code;
const clone = value => structuredClone(value);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function environment() {
  class Element extends ElementAdapter {
    constructor(doc, tag) { super(doc, tag); this.value = ""; }
  }
  const doc = { createElement: tag => new Element(doc, tag) }, host = doc.createElement("div");
  const values = new Map(), commands = [];
  let blocked = false, writes = 0, delivery = null, thrown = null;
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      writes++;
      if (blocked) throw new DOMException("Quota exhausted", "QuotaExceededError");
      values.set(key, value);
    },
  };
  const initial = StorySession.createStorySession();
  const persistence = StorySession.createStorySessionPersistence(storage);
  assert.equal(persistence.save(initial).ok, true);
  const c = {
    StorySession, clone, Error, JSON, storyPersistence: persistence,
    storySession: clone(initial), run: clone(initial.run),
    editor: { reset() {} }, render() {}, renderStorageNotice() {},
  };
  vm.runInNewContext(compiled, c);
  const callbacks = {
    getState: () => c.storySession.story,
    onCommand(command) {
      commands.push(command);
      if (thrown) throw thrown;
      const result = c.storyCommand(command);
      return delivery ? delivery.promise.then(() => result) : result;
    },
    onEdit() {}, onBattle() {},
  };
  let panel = mountStoryHub(host, callbacks);
  return {
    c, host, commands,
    get panel() { return panel; }, get writes() { return writes; },
    field: () => host.querySelector('[data-story-field="page-name"]'),
    form: () => host.querySelector('[data-story-form="name"]'),
    status: () => host.querySelector(".story-status").textContent,
    saved: () => JSON.parse(values.get(StorySession.STORY_SAVE_KEY)),
    failWrites(value) { blocked = value; }, delay(value) { delivery = value; },
    throwCommand(value) { thrown = value; },
    replace(session) { c.storySession = session; c.run = clone(session.run); panel.render(); },
    remount(session) {
      panel.dispose(); c.storySession = session; c.run = clone(session.run);
      panel = mountStoryHub(host, callbacks);
    },
  };
}
const submit = form => form.dispatch("submit");

test("failed story naming keeps the draft and retries the real write without retyping", async () => {
  const h = environment(), before = h.saved(), live = h.c.storySession;
  const name = "取り戻したホームページ", initialWrites = h.writes;
  h.field().value = name; h.failWrites(true);
  await submit(h.form());
  assert.deepEqual(h.saved(), before);
  assert.equal(h.c.storySession, live);
  assert.equal(h.c.run.page.name, "");
  assert.match(h.status(), /物語を保存できません/);
  assert.equal(h.field().required, true);
  assert.equal(h.field().value, name, "rejected write must retain the input needed for retry");
  assert.equal(h.writes, initialWrites + 1);
  h.failWrites(false);
  assert.equal(h.commands.length, 1, "storage recovery alone never submits");
  await submit(h.form());
  assert.equal(h.commands.length, 2);
  assert.deepEqual(h.commands.map(command => command.name), [name, name]);
  assert.equal(h.saved().story.pageName, name);
  assert.equal(h.c.storySession.story.pageName, name);
  assert.equal(h.c.run.page.name, name);
  assert.equal(h.field(), null);
  assert.equal(h.status(), "");
  assert.equal(h.writes, initialWrites + 2);
});

test("a pending rejected name keeps later typed edits and does not duplicate a submission", async () => {
  const h = environment(), wait = deferred(), before = h.saved();
  h.field().value = "First attempt"; h.failWrites(true); h.delay(wait);
  const form = h.form(), pending = submit(form);
  h.field().value = "Updated while waiting";
  await submit(form);
  assert.equal(h.commands.length, 1);
  assert.deepEqual(h.saved(), before);
  wait.resolve(); await pending;
  assert.equal(h.field().value, "Updated while waiting");
  h.delay(null); h.failWrites(false);
  await submit(h.form());
  assert.equal(h.saved().story.pageName, "Updated while waiting");
});

test("thrown naming callbacks and domain rejection preserve editable drafts without committing names", async () => {
  const h = environment(), before = h.saved();
  h.field().value = "Retry me"; h.throwCommand(new Error("temporarily unavailable"));
  await submit(h.form());
  assert.equal(h.field().value, "Retry me");
  assert.equal(h.status(), "temporarily unavailable");
  assert.deepEqual(h.saved(), before);
  h.throwCommand(null); h.field().value = "   ";
  await submit(h.form());
  assert.equal(h.field().value, "   ");
  assert.ok(h.status());
  assert.deepEqual(h.saved(), before);
  h.field().value = "  Corrected name  ";
  await submit(h.form());
  assert.equal(h.saved().story.pageName, "Corrected name");
});

test("repainted and replaced naming forms cannot submit obsolete drafts", async () => {
  const h = environment();
  h.field().value = "Old draft";
  const oldForm = h.form(), oldInput = h.field();
  h.panel.render();
  assert.equal(h.field().value, "Old draft");
  oldInput.value = "Stale edit";
  await submit(oldForm);
  assert.equal(h.commands.length, 0);
  assert.equal(h.field().value, "Old draft");
  const replacedForm = h.form();
  h.replace(StorySession.createStorySession());
  assert.equal(h.field().value, "", "draft belongs only to the exact naming owner");
  await submit(replacedForm);
  assert.equal(h.commands.length, 0);
  assert.equal(h.c.storySession.story.pageName, "");
});

test("a failed draft never replaces a committed name or reappears after leaving naming", async () => {
  const h = environment(); h.failWrites(true); h.field().value = "Rejected draft";
  const oldForm = h.form(); await submit(oldForm);
  const oldOwner = h.c.storySession;
  const named = StorySession.commandStorySession(StorySession.createStorySession(), { type: "name-page", name: "Already committed" });
  assert.equal(named.ok, true);
  h.replace(named.session);
  assert.equal(h.field(), null);
  await submit(oldForm);
  assert.equal(h.c.storySession.story.pageName, "Already committed");
  assert.equal(h.commands.length, 1);
  h.replace(oldOwner);
  assert.equal(h.field().value, "", "an old owner does not resurrect a retired draft");
});

test("late rejection and old controls after disposal do not change the replacement hub", async () => {
  const h = environment(), wait = deferred();
  h.field().value = "Former journey"; h.failWrites(true); h.delay(wait);
  const oldForm = h.form(), pending = submit(oldForm);
  h.remount(StorySession.createStorySession());
  h.field().value = "New journey";
  const replacementForm = h.form();
  wait.resolve(); await pending; await submit(oldForm);
  assert.equal(h.commands.length, 1);
  assert.equal(h.form(), replacementForm);
  assert.equal(h.field().value, "New journey");
  assert.equal(h.status(), "");
  h.delay(null); h.failWrites(false);
  await submit(h.form());
  assert.equal(h.saved().story.pageName, "New journey");
});
