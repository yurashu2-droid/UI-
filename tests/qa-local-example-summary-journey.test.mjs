import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { parseFragment } from "parse5";
import { IDBFactory } from "fake-indexeddb";
import R from "../src/run.js";
import { createDeferredMount } from "../src/feature-loader.js";
import { createProfileStore } from "../src/profile-store.js";
import {
  sealRaidBlueprint,
  verifyRaidBlueprint,
} from "../src/raid/blueprint.js";
import { processLocalImportMessage } from "../src/raid/local-import-worker.js";
import * as raidPanelModule from "../src/raid/panel.js";
import {
  ElementAdapter,
  WorkerAdapter,
  localFile,
  settle,
  until,
} from "./helpers/local-import-dom.mjs";

// Actual app host, local controls/client, parser, validation, transient selection,
// and summary rendering. Native DOM, file IO, Worker delivery and IDB are adapted;
// this does not exercise native pickers, real browser rendering or browser IO.
const app = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const declaration = (name) => {
  const match = app.match(
    new RegExp(`^(?:async )?function ${name}[^]*?^}`, "m"),
  )?.[0];
  assert.ok(match, `actual app declaration: ${name}`);
  return match;
};
const start = app.indexOf("let modalFeatureDispose:"),
  end = app.indexOf("/* ---------- Isolated story profile", start);
assert.ok(start >= 0 && end > start);
const hostCode = transformSync(
  [
    app.slice(start, end),
    declaration("deferredModalFeature"),
    declaration("localRaidEditingAllowed"),
    declaration("raidPanel"),
  ].join("\n"),
  { loader: "ts", target: "es2022" },
).code.replace('import("./raid/panel.js")', "loadRaidModule()");

class HostElement extends ElementAdapter {
  matches(selector) {
    return selector.startsWith("#")
      ? this.id === selector.slice(1)
      : super.matches(selector);
  }
  setAttribute(name, value) {
    super.setAttribute(name, value);
    if (name === "id") this.id = value;
    if (name === "class") this.className = value;
  }
  set innerHTML(markup) {
    assert.equal(
      this.id,
      "modal-content",
      "only the app-owned modal shell uses HTML",
    );
    assert.doesNotMatch(
      markup,
      /こもれび|paper-texture|example\.css|<form|<script/i,
    );
    const convert = (node) => {
      const el = this.ownerDocument.createElement(node.tagName ?? "span");
      if (node.nodeName === "#text") el.textContent = node.value;
      for (const attr of node.attrs ?? [])
        el.setAttribute(attr.name, attr.value);
      el.append(...(node.childNodes ?? []).map(convert));
      return el;
    };
    this.replaceChildren(...parseFragment(markup).childNodes.map(convert));
  }
}

function mountHost(store) {
  const doc = new EventTarget();
  doc.createElement = (tag) => new HostElement(tag, doc);
  doc.body = doc.createElement("body");
  doc.querySelector = (selector) => doc.body.querySelector(selector);
  const modal = doc.createElement("dialog"),
    content = doc.createElement("div");
  modal.id = "modal";
  content.id = "modal-content";
  doc.body.append(modal);
  modal.append(content);
  modal.open = false;
  modal.showModal = () => {
    modal.open = true;
  };
  modal.close = () => {
    modal.open = false;
    modal.dispatchEvent(new Event("close"));
  };
  const context = {
    Error,
    Promise,
    AbortController,
    structuredClone,
    document: doc,
    createDeferredMount,
    run: R.newRun("lab"),
    storyActive: false,
    storySession: null,
    battle: null,
    preview: false,
    settling: false,
    pendingStorySettlement: null,
    profileStore: store,
    profileWrites: Promise.resolve(),
    view: "self",
    render() {},
    renderSide() {},
    toast() {},
    $: (selector) => {
      const el = doc.querySelector(selector);
      assert.ok(el, selector);
      return el;
    },
    modalHead: () => "<button data-close-modal>閉じる</button>",
    loadRaidModule: async () => raidPanelModule,
    playRaidChallenge: () => assert.fail("selection must not start a battle"),
  };
  vm.runInNewContext(
    hostCode +
      "\nglobalThis.api={raidPanel,closeModal,readLocal:()=>localRaidReturn?.selection.read()};",
    context,
  );
  return {
    context,
    doc,
    modal,
    open: () => context.api.raidPanel(),
    close: () => context.api.closeModal(),
    selected: () => context.api.readLocal(),
    get host() {
      return doc.querySelector("#raid-feature-host");
    },
    get summary() {
      return this.host.querySelector(".raid-analysis-summary");
    },
    get meta() {
      return this.host.querySelector(".raid-meta").textContent;
    },
    button(label) {
      const b = this.host
        .querySelectorAll("button")
        .find((el) => el.textContent === label);
      assert.ok(b, label);
      return b;
    },
    choose(kind, file) {
      const input = this.host
        .querySelectorAll("input")
        .filter((el) => el.type === "file")[kind === "html" ? 0 : 1];
      assert.ok(input);
      input.files = [file];
      input.dispatchEvent(new Event("change"));
    },
    async begin() {
      const previous = WorkerAdapter.instances.length;
      this.button("ローカルHTMLを近似再構成").click();
      await until(() => WorkerAdapter.instances.length === previous + 1);
      const worker = WorkerAdapter.instances.at(-1);
      await until(() => worker.sent.length === 1);
      return worker;
    },
  };
}

test("real two-file example reaches the app summary, with explicit resume and no stale or invented source claims", async (t) => {
  const old = {
    Worker: globalThis.Worker,
    Element: globalThis.Element,
    document: globalThis.document,
  };
  globalThis.Worker = WorkerAdapter;
  globalThis.Element = ElementAdapter;
  WorkerAdapter.instances = [];
  t.after(() => {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  t.mock.method(globalThis, "fetch", () =>
    assert.fail("local source must not use a network request"),
  );
  const store = createProfileStore(
      new IDBFactory(),
      "qa-local-example-summary-journey",
    ),
    ui = mountHost(store);
  globalThis.document = ui.doc;
  t.after(() => ui.close());
  const html = readFileSync(
      new URL("../examples/local-raid/example.html", import.meta.url),
      "utf8",
    ),
    css = readFileSync(
      new URL("../examples/local-raid/example.css", import.meta.url),
      "utf8",
    ),
    htmlFile = localFile(html, { name: "example.html" }),
    cssFile = localFile(css, { name: "example.css" });
  await ui.open();
  await until(() => ui.meta);
  assert.equal(ui.summary.hidden, true);
  ui.choose("html", htmlFile);
  ui.choose("css", cssFile);
  await settle();
  assert.equal(
    htmlFile.reads + cssFile.reads,
    0,
    "choosing files does not analyze them",
  );
  assert.equal(WorkerAdapter.instances.length, 0);
  const beforeRun = JSON.stringify(ui.context.run);
  const worker = await ui.begin(),
    request = worker.sent[0].value;
  assert.equal(request.stylesheet.name, "example.css");
  assert.deepEqual(
    new Uint8Array(request.html),
    new TextEncoder().encode(html),
  );
  assert.deepEqual(
    new Uint8Array(request.stylesheet.bytes),
    new TextEncoder().encode(css),
  );
  assert.equal(worker.sent[0].transfer.length, 2);
  const parsed = await processLocalImportMessage(request);
  assert.equal(parsed.result.ok, true, parsed.result.error);
  const blueprint = parsed.result.value;
  worker.reply(parsed.result);
  await until(() => /ローカルHTML/.test(ui.meta) && ui.selected());
  const expectedSummary =
    "対応する見出し・リンク等の候補 6件から戦闘UI 6件を選択（0件は未採用）。ページの全要素数や、元の見た目の再現率ではありません。 CSSは対応範囲のみ：10規則（セレクター単位、インライン指定を除く）。";
  assert.equal(ui.summary.textContent, expectedSummary);
  assert.equal(ui.summary.hidden, false);
  assert.equal(ui.summary.children.length, 0);
  assert.deepEqual(
    blueprint.components.map((c) => [
      c.evidence,
      c.canonicalType,
      c.appearance.primitives.find((p) => p.kind === "text").text,
    ]),
    [
      ["heading", "ab_heading", "こもれび文具室"],
      ["navigation", "ab_nav", "紙のたより"],
      ["navigation", "ab_nav", "この見本について"],
      ["search", "go_search", "文具を探す 検索（見本）"],
      ["checkbox", "gov_check", "紙の手ざわりを楽しむ"],
      ["purchase", "am_buy", "便せんをカートに追加（見本）"],
    ],
  );
  const painted = ui.host.querySelectorAll("[data-component-id]");
  assert.equal(painted.length, 6);
  for (const component of blueprint.components) {
    const node = painted.find(
      (n) => n.dataset.componentId === component.componentId,
    );
    assert.ok(node);
    assert.ok(
      node.textContent.includes(
        component.appearance.primitives.find((p) => p.kind === "text").text,
      ),
    );
    assert.equal(component.sourceRect, null);
  }
  assert.equal(blueprint.components[4].sourceNode.tag, "label");
  assert.deepEqual(blueprint.components[4].sourceNode.classes, [
    "check-caption",
  ]);
  assert.equal(
    blueprint.analysis.sourceHash,
    createHash("sha256").update(html).digest("hex"),
  );
  assert.equal(ui.button("元HTMLの比較は利用できません").disabled, true);
  for (const tag of ["iframe", "script", "img", "style", "link"])
    assert.equal(
      ui.host.querySelectorAll(tag).length,
      0,
      `no source ${tag} inserted`,
    );
  assert.equal(htmlFile.reads, 1);
  assert.equal(cssFile.reads, 1);
  assert.equal(worker.terminated, 1);
  assert.doesNotMatch(
    JSON.stringify(ui.selected()),
    /example\.html|example\.css|paper-texture|<!doctype|<form/,
  );
  assert.equal(await store.getBlueprint(blueprint.captureId), undefined);
  assert.deepEqual(await store.listTrophies(), []);
  assert.deepEqual(await store.listPendingRaids(), []);
  assert.equal(JSON.stringify(ui.context.run), beforeRun);

  // A parsed but cancelled reply must not replace the six-control capture.
  ui.choose("html", localFile("<h1>Cancelled source</h1>"));
  ui.button("CSSなしに戻す").click();
  const cancelled = await ui.begin(),
    cancelledReply = await processLocalImportMessage(cancelled.sent[0].value);
  ui.button("ローカル読込を中止").click();
  cancelled.reply(cancelledReply.result);
  await settle();
  assert.equal(ui.summary.textContent, expectedSummary);
  assert.equal(ui.selected().captureId, blueprint.captureId);

  // An actual CSS-name parse failure retains the current source and summary.
  ui.choose("html", htmlFile);
  ui.choose("css", localFile(css, { name: "mismatch.css" }));
  const failed = await ui.begin(),
    failedReply = await processLocalImportMessage(failed.sent[0].value);
  assert.equal(failedReply.result.ok, false);
  assert.equal(failedReply.result.code, "stylesheet-unmatched");
  failed.reply(failedReply.result);
  await settle();
  assert.equal(ui.summary.textContent, expectedSummary);
  assert.equal(ui.selected().captureId, blueprint.captureId);

  // Fixture switching and reopening never keep the old source count on screen.
  ui.host
    .querySelectorAll("button")
    .find((b) => b.dataset.raidFixture === "commerce")
    .click();
  await until(() => /付属の検証用ページ/.test(ui.meta));
  assert.equal(ui.summary.textContent, "");
  assert.equal(ui.summary.hidden, true);
  ui.close();
  await ui.open();
  await until(() => ui.meta);
  assert.equal(ui.summary.textContent, "");
  assert.equal(ui.summary.hidden, true);
  const workerCount = WorkerAdapter.instances.length,
    htmlReads = htmlFile.reads;
  ui.button("前のローカル近似を再開").click();
  await until(() => /ローカルHTML/.test(ui.meta));
  assert.equal(ui.summary.textContent, expectedSummary);
  assert.equal(WorkerAdapter.instances.length, workerCount);
  assert.equal(htmlFile.reads, htmlReads);

  // Schema-valid sealed metadata is not proof of coherent candidate totals.
  ui.choose("html", htmlFile);
  ui.choose("css", cssFile);
  const inconsistentWorker = await ui.begin(),
    clone = structuredClone(blueprint);
  clone.analysis.candidateCount = 1;
  const { captureId, ...draft } = clone;
  const inconsistent = await sealRaidBlueprint(draft);
  assert.equal((await verifyRaidBlueprint(inconsistent)).ok, true);
  inconsistentWorker.reply({ ok: true, value: inconsistent });
  await until(() => ui.selected()?.captureId === inconsistent.captureId);
  assert.equal(
    ui.summary.textContent,
    "",
    "old six-control count is cleared, not reused or made negative",
  );
  assert.equal(ui.summary.hidden, true);
  assert.equal(ui.host.querySelectorAll("[data-component-id]").length, 6);
  assert.equal(JSON.stringify(ui.context.run), beforeRun);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});
