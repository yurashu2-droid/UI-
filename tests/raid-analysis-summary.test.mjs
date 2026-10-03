import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { reconstructStaticCode } from "../src/raid/code.ts";
import { reconstructLocalCode } from "../src/raid/local-code.ts";
import { processLocalImportMessage } from "../src/raid/local-import-worker.ts";
import { createFixtureRaid } from "../src/raid/fixtures.ts";
import {
  sealRaidBlueprint,
  verifyRaidBlueprint,
} from "../src/raid/blueprint.ts";
import { mountRaidPanel } from "../src/raid/panel.ts";
import {
  documentAdapter,
  localFile,
  WorkerAdapter,
  settle,
  until,
} from "./helpers/local-import-dom.mjs";

// RED fails on the absent summary behavior rather than module discovery.
const summaryModule = await import("../src/raid/analysis-summary.ts").catch(
  () => ({}),
);
function summary(blueprint) {
  assert.equal(typeof summaryModule.raidAnalysisSummary, "function");
  return summaryModule.raidAnalysisSummary(blueprint);
}
const capturedAt = "2026-10-03T03:20:00.000Z";
const hash = (text) => createHash("sha256").update(text).digest("hex");
const sourceFile = (name) =>
  readFile(new URL(`../fixtures/raid/${name}`, import.meta.url), "utf8");
const [booksHtml, booksCss, historicalJson] = await Promise.all([
  sourceFile("public-source/books.html"),
  sourceFile("public-source/books.css"),
  sourceFile("compatibility/books-before-child-selectors.json"),
]);
const books = await reconstructStaticCode({
  requestedUrl: "https://books.toscrape.com/",
  html: booksHtml,
  sourceHash: hash(booksHtml),
  capturedAt,
  stylesheets: [
    {
      css: booksCss,
      sourceHash: hash(booksCss),
      url: "https://books.toscrape.com/static/oscar/css/styles.css",
    },
  ],
});
async function local(html) {
  const result = await reconstructLocalCode({
    html: new TextEncoder().encode(html),
    capturedAt,
  });
  assert.equal(result.ok, true, result.error);
  return result.value;
}
async function reseal(blueprint) {
  const { captureId, ...draft } = blueprint;
  return sealRaidBlueprint(draft);
}

test("recorded Books explains recognized candidates and selected combat UI without changing its capture", () => {
  const before = JSON.stringify(books);
  assert.equal(books.analysis.candidateCount, 95);
  assert.equal(books.analysis.selectedCount, 8);
  assert.equal(books.analysis.css.rules, 576);
  assert.equal(books.analysis.css.limited, false);
  assert.equal(
    summary(books),
    "対応する見出し・リンク等の候補 95件から戦闘UI 8件を選択（87件は未採用）。ページの全要素数や、元の見た目の再現率ではありません。 CSSは対応範囲のみ：576規則（セレクター単位、インライン指定を除く）。",
  );
  assert.equal(JSON.stringify(books), before);
  assert.equal(
    books.captureId,
    "capture_b51a0697f50e53fd012abd53d1225079e61099a4f71884658397e90dd5624fd5",
  );
});

test("actual local analysis counts semantic candidates before quota and rules per selector without inline declarations", async () => {
  const blueprint = await local(`
    <title>Private source title</title>
    <style>h1, a { color: red } a:hover { color: blue }</style>
    <h1 style="background:#123456;padding:8px">Heading</h1>
    <nav>${Array.from({ length: 14 }, (_, i) => `<a>Menu ${i}</a>`).join("")}</nav>
    <div>Ordinary DOM element</div><button>Generic button</button>
    <h2 hidden>Hidden heading</h2><script>neverRun()</script>`);
  assert.equal(blueprint.analysis.candidateCount, 15);
  assert.equal(blueprint.analysis.selectedCount, 5);
  assert.deepEqual(blueprint.analysis.css, {
    rules: 2,
    limited: false,
    stylesheetHashes: [],
  });
  assert.equal(blueprint.components[0].appearance.background, "#123456");
  const text = summary(blueprint);
  assert.match(text, /候補 15件から戦闘UI 5件を選択（10件は未採用）/);
  assert.match(
    text,
    /CSSは対応範囲のみ：2規則（セレクター単位、インライン指定を除く）/,
  );
  assert.doesNotMatch(
    text,
    /解析上限|Private|Ordinary|Generic|Hidden|neverRun|<|>/,
  );
});

test("inline-only appearance keeps an explicit zero stylesheet-rule count, not a no-style claim", async () => {
  const blueprint = await local(
    '<h1 style="color:red;background:#123456">Heading</h1>',
  );
  assert.equal(blueprint.components[0].appearance.background, "#123456");
  assert.equal(blueprint.analysis.css.rules, 0);
  assert.match(summary(blueprint), /戦闘UI 1件を選択（0件は未採用）/);
  assert.match(
    summary(blueprint),
    /CSSは対応範囲のみ：0規則（セレクター単位、インライン指定を除く）/,
  );
  assert.doesNotMatch(summary(blueprint), /解析上限|スタイルなし|CSSなし/);
});

test("real selector and block budget truncation are disclosed without completeness or authenticity claims", async () => {
  for (const [css, rules] of [
    [
      Array.from({ length: 1025 }, (_, i) => `.rule${i}{color:red}`).join(""),
      1024,
    ],
    [".ignored{unsupported:value}".repeat(4097), 0],
  ]) {
    const blueprint = await local(
      `<style>${css}</style><h1>Budget source</h1>`,
    );
    assert.equal(blueprint.analysis.css.rules, rules);
    assert.equal(blueprint.analysis.css.limited, true);
    assert.match(
      summary(blueprint),
      new RegExp(`CSSは対応範囲のみ：${rules}規則`),
    );
    assert.match(summary(blueprint), /CSS解析上限による省略があります。$/);
    assert.doesNotMatch(summary(blueprint), /完全|真正|正当|保証|100%/);
  }
  const exactLimit = await local(
    `<style>${"h1{color:red}".repeat(1024)}</style><h1>Exact rule limit</h1>`,
  );
  assert.equal(exactLimit.analysis.css.limited, false);
  assert.doesNotMatch(summary(exactLimit), /解析上限/);
});

test("public stylesheet byte-budget truncation is disclosed even when zero rules survive", async () => {
  const html = `<style>/*${"x".repeat(262144)}*/h1{color:red}</style><h1>Bounded public source</h1>`;
  const blueprint = await reconstructStaticCode({
    html,
    sourceHash: hash(html),
    capturedAt,
    requestedUrl: "https://example.com/",
  });
  assert.equal(blueprint.analysis.css.rules, 0);
  assert.equal(blueprint.analysis.css.limited, true);
  assert.match(summary(blueprint), /CSSは対応範囲のみ：0規則/);
  assert.match(summary(blueprint), /CSS解析上限による省略があります。$/);
});

test("historical recorded metadata stays unchanged and missing CSS or analysis adds no invented claim", async () => {
  const historical = JSON.parse(historicalJson),
    before = JSON.stringify(historical);
  assert.equal((await verifyRaidBlueprint(historical)).ok, true);
  assert.match(summary(historical), /CSSは対応範囲のみ：424規則/);
  assert.equal(JSON.stringify(historical), before);

  // Exercise the still-valid historical schema, without pretending this
  // generated compatibility case is an original historical capture.
  const oldSchema = structuredClone(books);
  oldSchema.analysis.styles = "inline-and-embedded-subset";
  oldSchema.analysis.omitted[0] = "external-stylesheets";
  delete oldSchema.analysis.css;
  const verifiedOld = await reseal(oldSchema);
  assert.equal((await verifyRaidBlueprint(verifiedOld)).ok, true);
  assert.match(summary(verifiedOld), /候補 95件から戦闘UI 8件/);
  assert.doesNotMatch(summary(verifiedOld), /CSS|規則|上限/);
  assert.equal(summary({ ...books, analysis: undefined }), "");
  for (const fixture of ["archive", "commerce"])
    assert.equal(summary(await createFixtureRaid(fixture)), "");
});

test("coherently sealed inconsistent candidate totals never produce negative omissions or corrected counts", async () => {
  const blueprint = structuredClone(books);
  blueprint.analysis.candidateCount = 1;
  const inconsistent = await reseal(blueprint);
  assert.equal((await verifyRaidBlueprint(inconsistent)).ok, true);
  const before = JSON.stringify(inconsistent);
  assert.equal(summary(inconsistent), "");
  assert.equal(JSON.stringify(inconsistent), before);
});

function mount(t, { resume, initialRequest, allowed = true } = {}) {
  const originalWorker = globalThis.Worker;
  globalThis.Worker = WorkerAdapter;
  WorkerAdapter.instances = [];
  t.after(() => {
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
  });
  t.mock.method(globalThis, "fetch", () => {
    throw Error("No external requests allowed");
  });
  const doc = documentAdapter(),
    host = doc.createElement("section");
  doc.body.append(host);
  const handle = mountRaidPanel(
    host,
    {
      isLocalImportAllowed: () => allowed,
      onChallenge: async () => ({ battleId: "summary-win", winner: "player" }),
      onClaim: async () => ({ ok: true }),
      onDiscard: async () => ({ ok: true }),
    },
    resume,
    initialRequest,
  );
  t.after(() => handle.dispose());
  return {
    host,
    handle,
    meta: () => host.querySelector(".raid-meta").textContent,
    summary: () => host.querySelector(".raid-analysis-summary"),
    button: (label) =>
      host
        .querySelectorAll("button")
        .find((node) => node.textContent === label),
  };
}
async function beginLocal(ui, html) {
  const input = ui.host
    .querySelectorAll("input")
    .find((node) => node.type === "file");
  input.files = [localFile(html)];
  input.dispatchEvent(new Event("change"));
  ui.button("ローカルHTMLを近似再構成").click();
  await until(() => WorkerAdapter.instances.at(-1)?.sent.length);
  return WorkerAdapter.instances.at(-1);
}

test("panel paints source-derived summary using text only, retains it on failure, and clears it for fixtures", async (t) => {
  const ui = mount(t);
  assert.ok(ui.summary(), "dedicated approximation summary is mounted");
  assert.equal(ui.summary().hidden, true);
  await until(() => ui.meta());
  assert.equal(ui.summary().textContent, "");
  const worker = await beginLocal(
    ui,
    "<h1>&lt;img src=x onerror=neverRun()&gt;</h1><a>Menu</a>",
  );
  const reply = await processLocalImportMessage(worker.sent[0].value);
  assert.equal(reply.result.ok, true);
  worker.reply(reply.result);
  await until(() => /ローカルHTML/.test(ui.meta()));
  assert.equal(ui.summary().hidden, false);
  assert.equal(ui.summary().textContent, summary(reply.result.value));
  assert.equal(ui.summary().children.length, 0);
  assert.doesNotMatch(ui.summary().textContent, /<|>|img|neverRun/);
  const before = ui.summary().textContent;
  const failed = await beginLocal(ui, "<h1>Failed replacement</h1>");
  failed.reply({ ok: false, code: "invalid-utf8", error: "UTF-8" });
  await settle();
  assert.equal(ui.summary().textContent, before);
  ui.host
    .querySelectorAll("button")
    .find((node) => node.dataset.raidFixture === "commerce")
    .click();
  await until(() => /付属の検証用ページ/.test(ui.meta()));
  assert.equal(ui.summary().hidden, true);
  assert.equal(ui.summary().textContent, "");
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("cached public summary follows the selected capture through a win and pending priority", async (t) => {
  const ui = mount(t, {
    initialRequest: {
      kind: "cached",
      url: books.source.displayUrl,
      cachedBlueprint: books,
    },
  });
  await until(() => ui.meta());
  assert.equal(ui.summary()?.textContent, summary(books));
  ui.button("このページに挑戦").click();
  await until(() => !ui.button("今回は回収を見送る").hidden);
  ui.host
    .querySelectorAll("button")
    .find((node) => node.dataset.raidFixture === "commerce")
    .dispatchEvent(new Event("click"));
  await settle();
  assert.equal(ui.summary().textContent, summary(books));
  assert.equal(ui.summary().hidden, false);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("pending local restore summary takes priority over a cached public request even outside local eligibility", async (t) => {
  const blueprint = await local("<h1>Saved local heading</h1><a>Menu</a>");
  const ui = mount(t, {
    resume: { blueprint, battleId: "summary-pending", winner: "player" },
    initialRequest: {
      kind: "cached",
      url: books.source.displayUrl,
      cachedBlueprint: books,
    },
    allowed: false,
  });
  await until(() => ui.meta());
  assert.equal(ui.summary()?.textContent, summary(blueprint));
  assert.match(ui.meta(), /ローカルHTML/);
  assert.equal(ui.button("このページに挑戦").disabled, true);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});
