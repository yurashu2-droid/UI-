import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parse } from "parse5";
import { IDBFactory } from "fake-indexeddb";
import {
  analyzeStaticCode,
  reconstructStaticCode,
} from "../server/site-ingest/code.js";
import {
  createSafeStyleReader,
  CSS_LIMITS,
} from "../server/site-ingest/css.js";
import { prepareRaidRewards, verifyRaidBlueprint } from "../src/raid/index.js";
import { createProfileStore } from "../src/profile-store.js";
import R from "../src/run.js";

const PAGE = "https://books.toscrape.com/";
const SHEET = PAGE + "static/oscar/css/styles.css";
const [html, css, oldJson] = await Promise.all(
  [
    "public-source/books.html",
    "public-source/books.css",
    "compatibility/books-before-child-selectors.json",
  ].map((name) =>
    readFile(new URL(`../fixtures/raid/${name}`, import.meta.url), "utf8"),
  ),
);
const before = JSON.parse(oldJson);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const source = {
  requestedUrl: PAGE,
  html,
  sourceHash: hash(html),
  bytes: Buffer.byteLength(html),
  capturedAt: "2026-10-03T03:20:00.000Z",
  extraction: { title: "Books", candidates: [] },
  stylesheets: [{ css, url: SHEET, sourceHash: hash(css) }],
};
const label = (part) =>
  part.appearance.primitives.find((p) => p.kind === "text");
function targetIn(html) {
  const doc = parse(html),
    pending = [doc];
  while (pending.length) {
    const node = pending.pop();
    if (node.attrs?.some((a) => a.name === "id" && a.value === "target"))
      return node;
    pending.push(...(node.childNodes ?? []));
  }
  throw Error("missing test target");
}

test("recorded Books child padding changes only the direct Books link appearance", async () => {
  assert.equal(
    hash(html),
    "9fdd63da34161ebd13408d7a85105f83ec3c9f351c5d77cd0aa578790e121c1e",
  );
  assert.equal(
    hash(css),
    "d497d4a0d52686ccd30f5941b02867075870372cdfe37adbcb0be74fdeed94cf",
  );
  assert.match(css, /\.nav > li > a \{[^}]*padding: 10px 15px;/);
  const result = await reconstructStaticCode(source);
  assert.equal(label(result.components[1]).text, "Books");
  assert.deepEqual(label(result.components[1]).rect, {
    x: 15,
    y: 10,
    w: 162,
    h: 20,
  });
  assert.equal(result.components.length, before.components.length);
  for (let i = 0; i < before.components.length; i++) {
    assert.deepEqual(
      result.components[i].combatRect,
      before.components[i].combatRect,
    );
    if (i !== 1) assert.deepEqual(result.components[i], before.components[i]);
  }
  assert.equal(result.analysis.sourceHash, before.analysis.sourceHash);
  assert.deepEqual(
    result.analysis.css.stylesheetHashes,
    before.analysis.css.stylesheetHashes,
  );
  assert.equal(result.analysis.css.limited, false);
  assert.ok(result.analysis.css.rules <= CSS_LIMITS.rules);
  assert.equal(
    result.captureId,
    "capture_b51a0697f50e53fd012abd53d1225079e61099a4f71884658397e90dd5624fd5",
  );
  assert.equal(
    result.components[1].appearanceId,
    "appearance_d30ff827a1c2daac79828e388dcde19e9a9681c6aa2cc7545b9d06ea5a95ce2a",
  );
  assert.equal(result.fidelity, "code-approximation");
  assert.ok(result.components.every((c) => c.sourceRect === null));
  assert.equal((await verifyRaidBlueprint(result)).ok, true);
});

test("the genuine pre-child snapshot and old claimed or pending rewards survive a new capture", async () => {
  assert.equal(
    before.captureId,
    "capture_094a736bbe69ed43d3f86fce66ca79264af13f519a5ca6193fd5b3ae8c595d2d",
  );
  assert.equal(
    before.components[1].appearanceId,
    "appearance_b1b9ded9742f514c6dde3c717820d091d220ffdd18e0e8a1e260d6011eb88446",
  );
  assert.equal(before.analysis.sourceHash, hash(html));
  assert.deepEqual(before.analysis.css.stylesheetHashes, [hash(css)]);
  assert.equal((await verifyRaidBlueprint(before)).ok, true);
  const factory = new IDBFactory(),
    store = createProfileStore(factory),
    run = R.newRun("lab");
  const reward = (b, id) =>
    prepareRaidRewards(b, id).find((r) => r.componentId === "component-01");
  await store.recordRaidVictory(before, "old-books-claimed");
  await store.claimRaidReward(run, reward(before, "old-books-claimed"), before);
  await store.recordRaidVictory(before, "old-books-pending");
  const savedCapture = JSON.stringify(
    await store.getBlueprint(before.captureId),
  );
  const savedTrophies = JSON.stringify(await store.listTrophies());
  const savedPending = JSON.stringify(await store.listPendingRaids());
  const after = await reconstructStaticCode(source);
  assert.notEqual(after.captureId, before.captureId);
  await store.recordRaidVictory(after, "new-books-pending");
  const reopened = createProfileStore(factory);
  assert.equal(
    JSON.stringify(await reopened.getBlueprint(before.captureId)),
    savedCapture,
  );
  assert.equal(JSON.stringify(await reopened.listTrophies()), savedTrophies);
  const pending = await reopened.listPendingRaids();
  assert.equal(
    JSON.stringify(pending.filter((p) => p.battleId === "old-books-pending")),
    savedPending,
  );
  const claim = await reopened.claimRaidReward(
    run,
    reward(before, "old-books-pending"),
    before,
  );
  assert.equal(claim.created, true);
  assert.equal(
    claim.trophy.item.appearanceId,
    before.components[1].appearanceId,
  );
  assert.equal(claim.trophy.item.provenanceId, before.captureId);
  assert.notEqual(
    claim.trophy.item.appearanceId,
    after.components[1].appearanceId,
  );
  assert.equal(
    JSON.stringify(await reopened.getBlueprint(before.captureId)),
    savedCapture,
  );
  assert.equal(JSON.stringify(before, null, 2) + "\n", oldJson);
});

test("child relationships require an immediate parent and accept supported whitespace forms", () => {
  const direct = targetIn(
    '<ul class="nav"><li><a id="target">Direct</a><ul><li><a>Nested</a></li></ul></li></ul>',
  );
  const nested = targetIn(
    '<ul class="nav"><li><ul><li><a id="target">Nested</a></li></ul></li></ul>',
  );
  for (const selector of [
    ".nav>li>a",
    ".nav > li > a",
    ".nav> li >a",
    ".nav\n>\tli > a",
  ]) {
    const reader = createSafeStyleReader([`${selector}{padding:10px 15px}`]);
    assert.deepEqual(
      reader.styleFor(direct).padding,
      [10, 15, 10, 15],
      selector,
    );
    assert.equal(reader.styleFor(nested).padding, undefined, selector);
  }
  assert.deepEqual(
    createSafeStyleReader([".nav li a{padding:10px 15px}"]).styleFor(nested)
      .padding,
    [10, 15, 10, 15],
  );
});

test("mixed child and descendant selectors can match beyond a nearer nonmatching ancestor", () => {
  const target = targetIn(
    '<main class="a"><section class="b"><div class="x"><div class="b"><a id="target">Visible</a></div></div></section></main>',
  );
  const reader = createSafeStyleReader([
    ".a > .b a{color:#123456}.a > .b > a{color:#abcdef}",
  ]);
  assert.equal(reader.styleFor(target).color, "#123456");
  assert.equal(
    createSafeStyleReader([".a>.b .b>a{color:#123456}"]).styleFor(target).color,
    "#123456",
  );
});

test("descendant-only near misses keep linear parent traversal instead of child backtracking", () => {
  const reader = createSafeStyleReader([
    ".absent .b .target{padding:10px 15px}",
  ]);
  let traversals = 0;
  const node = (className, parent) => ({
    nodeName: "div",
    tagName: "div",
    attrs: [{ name: "class", value: className }],
    get parentNode() {
      traversals++;
      return parent;
    },
  });
  let parent = node("root", null);
  reader.styleFor(parent);
  const depth = 58;
  for (let i = 0; i < depth; i++) {
    parent = node("b", parent);
    reader.styleFor(parent);
  }
  // Inheritance is already cached; count only this target's lookup and match.
  traversals = 0;
  assert.equal(reader.styleFor(node("target", parent)).padding, undefined);
  assert.ok(
    traversals <= 4 * depth,
    `descendant-only matching traversed parents ${traversals} times at depth ${depth}`,
  );
});

test("internal matcher stress keeps stack depth bounded while the source analyzer still rejects deep HTML", () => {
  // Prewarm inheritance one node at a time, isolating selector matching from
  // style inheritance. The ingestion path separately caps HTML depth at 64.
  const reader = createSafeStyleReader([".a > .b .target{padding:10px 15px}"]);
  let parent = {
    nodeName: "main",
    tagName: "main",
    attrs: [{ name: "class", value: "a" }],
    parentNode: null,
  };
  reader.styleFor(parent);
  for (let i = 0; i < 12000; i++) {
    parent = {
      nodeName: "div",
      tagName: "div",
      attrs: [{ name: "class", value: "b" }],
      parentNode: parent,
    };
    reader.styleFor(parent);
  }
  const target = {
    nodeName: "a",
    tagName: "a",
    attrs: [{ name: "class", value: "target" }],
    parentNode: parent,
  };
  assert.deepEqual(reader.styleFor(target).padding, [10, 15, 10, 15]);
  assert.throws(
    () =>
      analyzeStaticCode(
        "<div>".repeat(65) + "<h1>Too deep</h1>" + "</div>".repeat(65),
      ),
    /source-too-large/,
    "the acquisition analyzer must keep its existing depth limit",
  );
});

test("child selectors keep four simple parts and reject malformed or unsupported combinators", () => {
  const target = targetIn(
    '<main class="a"><section class="b"><div class="c"><a id="target">Visible</a></div></section></main>',
  );
  assert.equal(
    createSafeStyleReader([".a>.b>.c>a{color:#123456}"]).styleFor(target).color,
    "#123456",
  );
  for (const selector of [
    "a >",
    "> a",
    "a >> b",
    "a > > b",
    "a + b",
    "a ~ b",
    "a || b",
    "[id]",
    "a:hover",
    "* > a",
    "main .a>.b>.c>a",
  ]) {
    const reader = createSafeStyleReader([`${selector}{color:#123456}`]);
    assert.equal(reader.rules, 0, selector);
    assert.equal(reader.styleFor(target).color, undefined, selector);
  }
});

test("child-based hiding excludes hidden descendants even after an unsupported display reset", () => {
  const parsed = analyzeStaticCode(
    '<style>.secret > div{display:none}.secret > div{display:block}</style><section class="secret"><div><h1>HIDDEN TITLE</h1><article><h3>HIDDEN BOOK</h3><button>Add to cart</button></article></div></section><h1>Visible title</h1>',
  );
  assert.deepEqual(
    parsed.candidates.map((c) => c.label),
    ["Visible title"],
  );
  assert.doesNotMatch(JSON.stringify(parsed), /HIDDEN|Add to cart/);
});
