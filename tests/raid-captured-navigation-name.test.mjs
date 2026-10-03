import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { transformSync } from "esbuild";
import { IDBFactory } from "fake-indexeddb";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";
import C from "../src/document.js";
import D from "../src/data.js";
import R from "../src/run.js";
import V from "../src/components.js";
import { previewCatalogueAction } from "../src/catalog/preview.js";
import { createProfileStore } from "../src/profile-store.js";
import { prepareRaidChallenge } from "../src/raid-challenge.js";
import { reconstructStaticCode } from "../server/site-ingest/code.js";
import * as raid from "../src/raid/index.js";

// Real production encounter, persistence, markup and preview code at the DOM
// boundary. These tests do not establish browser layout, activation or AT acceptance.
// Missing/stale names, descendant/blanket relabeling, anchor lifting, native DOM
// replacement, changed navigation behavior or saved identities must fail here.
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fixture = (name) =>
  readFile(new URL(`../fixtures/raid/${name}`, import.meta.url), "utf8");
const [html, css, legacyJson, appSource] = await Promise.all([
  fixture("public-source/books.html"),
  fixture("public-source/books.css"),
  fixture("compatibility/books-before-child-selectors.json"),
  readFile(new URL("../src/app.ts", import.meta.url), "utf8"),
]);
const source = (html) => ({
  requestedUrl: "https://books.toscrape.com/",
  html,
  sourceHash: hash(html),
  bytes: Buffer.byteLength(html),
  capturedAt: "2026-10-03T03:20:00.000Z",
  extraction: { title: "Books", candidates: [] },
  stylesheets: [
    {
      css,
      sourceHash: hash(css),
      url: "https://books.toscrape.com/static/oscar/css/styles.css",
    },
  ],
});
const books = await reconstructStaticCode(source(html));
const navigation = books.components.find(
  (part) => part.componentId === "component-01",
);
const anchorSelector = ':scope > a.native-old-link[data-ui="link"]';
const component = (host, id) =>
  host
    .querySelectorAll(".raid-component")
    .find((node) => node.dataset.componentId === id);
const start = appSource.indexOf("function previewAction(e: MouseEvent)");
const end = appSource.indexOf("\n/* ---------- Events ---------- */", start);
assert.ok(
  start >= 0 && end > start,
  "extract the real production preview handler",
);
const previewCode = transformSync(appSource.slice(start, end), {
  loader: "ts",
  target: "es2022",
}).code;

function withDocument(t) {
  const prior = Object.fromEntries(
    ["document", "Element"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const document = {
    createElement(tag) {
      return new ElementAdapter(this, tag);
    },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.document = document;
  globalThis.Element = ElementAdapter;
  t.after(() => {
    V.setAppearanceRenderer(null);
    for (const key of Object.keys(prior)) {
      if (prior[key]) Object.defineProperty(globalThis, key, prior[key]);
      else delete globalThis[key];
    }
  });
  return document;
}
async function until(check) {
  const deadline = Date.now() + 2000;
  while (!check()) {
    assert.ok(Date.now() < deadline, "production async draw did not finish");
    await new Promise((resolve) => setImmediate(resolve));
  }
}
function itemFor(part = navigation, label) {
  return {
    ...C.makeItem("ab_nav", "captured-navigation", 24, 24),
    appearanceId: part.appearanceId,
    ...(label === undefined ? {} : { label }),
  };
}
function nativeState(anchor) {
  return {
    attrs: [...anchor.attrs].filter(([name]) => name !== "aria-label"),
    className: anchor.className,
    dataset: { ...anchor.dataset },
    style: { ...anchor.style },
    children: [...anchor.children],
    text: anchor.textContent,
    tabIndex: anchor.tabIndex,
  };
}
async function register(blueprint = books) {
  assert.equal((await raid.registerRaidBlueprint(blueprint)).ok, true);
  V.setAppearanceRenderer(raid.applyRaidAppearance);
}

test("recorded Books win, pending reload, panel keyboard claim and trophy reload name the original navigation anchor", async (t) => {
  const doc = withDocument(t),
    before = structuredClone(books);
  assert.equal(
    hash(html),
    "9fdd63da34161ebd13408d7a85105f83ec3c9f351c5d77cd0aa578790e121c1e",
  );
  assert.equal(
    hash(css),
    "d497d4a0d52686ccd30f5941b02867075870372cdfe37adbcb0be74fdeed94cf",
  );
  assert.equal(
    books.captureId,
    "capture_b51a0697f50e53fd012abd53d1225079e61099a4f71884658397e90dd5624fd5",
  );
  assert.equal(
    navigation.appearanceId,
    "appearance_d30ff827a1c2daac79828e388dcde19e9a9681c6aa2cc7545b9d06ea5a95ce2a",
  );
  assert.equal(navigation.canonicalType, "ab_nav");
  assert.equal(
    navigation.appearance.primitives.find((p) => p.kind === "text").text,
    "Books",
  );
  const run = R.newRun("lab"),
    runBefore = structuredClone(run),
    battleId = "recorded-navigation-name";
  const prepared = prepareRaidChallenge(run, books);
  for (let ticks = 0; ticks < 1800 && !prepared.battle.result; ticks++)
    prepared.battle.step(0.05);
  assert.deepEqual(prepared.battle.result, {
    winner: "player",
    time: 10.5,
    income: 32,
  });
  const factory = new IDBFactory(),
    store = createProfileStore(factory);
  await store.recordRaidVictory(books, battleId);
  const reopened = createProfileStore(factory),
    [pending] = await reopened.listPendingRaids();
  assert.deepEqual(pending.blueprint, books);
  const host = doc.createElement("div"),
    claims = [];
  const panel = raid.mountRaidPanel(
    host,
    {
      onChallenge: async () => {
        throw Error("must resume the real persisted victory");
      },
      onClaim: async (reward) => {
        claims.push(reward);
        await reopened.claimRaidReward(run, reward, pending.blueprint);
        return { ok: true };
      },
    },
    {
      blueprint: pending.blueprint,
      battleId,
      winner: prepared.battle.result.winner,
    },
  );
  t.after(() => panel.dispose());
  await until(() => component(host, navigation.componentId));
  const ready = component(host, navigation.componentId);
  assert.equal(ready.getAttribute("role"), "button");
  assert.equal(ready.tabIndex, 0);
  assert.equal(
    ready.getAttribute("aria-label"),
    `Books（${D.PARTS.ab_nav.name}）（近似再構成のUI）を回収`,
  );
  let prevented = 0;
  await host.querySelector(".raid-canvas").dispatch("keydown", {
    target: ready,
    key: "Enter",
    preventDefault() {
      prevented++;
    },
  });
  await until(() =>
    component(host, navigation.componentId)?.classList.contains("raid-claimed"),
  );
  assert.equal(prevented, 1);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].componentId, navigation.componentId);
  assert.equal(
    component(host, navigation.componentId).getAttribute("aria-label"),
    `Books（${D.PARTS.ab_nav.name}）（近似再構成のUI） / 回収済みのUI`,
  );
  const reloaded = createProfileStore(factory),
    [trophy] = await reloaded.listTrophies();
  const saved = await reloaded.getBlueprint(books.captureId),
    trophyBefore = structuredClone(trophy);
  assert.deepEqual(await reloaded.listPendingRaids(), []);
  assert.deepEqual(saved, before);
  assert.equal(trophy.item.appearanceId, navigation.appearanceId);
  assert.equal(trophy.item.provenanceId, books.captureId);
  await register(saved);
  const installed = V.create(trophy.item),
    anchor = installed.querySelector(anchorSelector);
  assert.equal(anchor.getAttribute("aria-label"), "Books");
  assert.equal(anchor.textContent, "プロフィール");
  assert.equal(anchor.getAttribute("href"), "#");
  assert.equal(anchor.dataset.ui, "link");
  assert.equal(anchor.classList.contains("raid-live-layer"), false);
  assert.equal(
    installed.querySelector(".raid-skin").getAttribute("aria-hidden"),
    "true",
  );
  assert.equal(
    installed.querySelector(".raid-skin").style.pointerEvents,
    "none",
  );
  assert.deepEqual(await reloaded.listTrophies(), [trophyBefore]);
  assert.deepEqual(await reloaded.getBlueprint(books.captureId), before);
  assert.deepEqual(run, runBefore);
  assert.deepEqual(books, before);
});

test("same-host source, blank/no-text and source reapplication replace stale names while preserving all native state", async (t) => {
  const doc = withDocument(t);
  await register();
  const item = itemFor(),
    itemBefore = structuredClone(item),
    host = V.create(item);
  const anchor = host.querySelector(anchorSelector),
    state = doc.createElement("span");
  state.className = "state-charge";
  state.textContent = "5";
  anchor.append(state);
  anchor.classList.add("visited");
  anchor.tabIndex = 2;
  anchor.value = "PRIVATE NATIVE VALUE";
  host.classList.add("is-firing");
  const before = nativeState(anchor),
    nativeChildren = host.children.filter(
      (child) => !child.classList.contains("raid-skin"),
    );
  let handled = 0;
  anchor.addEventListener("custom-native-event", () => {
    handled++;
  });
  assert.equal(anchor.getAttribute("aria-label"), "Books");
  for (const text of [
    " \t\n ",
    "\u202e\u2069",
    null,
    " \tBooks\n shelf\u202e ",
    D.PARTS.ab_nav.name,
  ]) {
    const { captureId, ...draft } = structuredClone(books);
    const part = draft.components.find(
      (part) => part.componentId === navigation.componentId,
    );
    if (text === null)
      part.appearance.primitives = part.appearance.primitives.filter(
        (p) => p.kind !== "text",
      );
    else part.appearance.primitives.find((p) => p.kind === "text").text = text;
    const changed = await raid.sealRaidBlueprint(draft),
      saved = structuredClone(changed);
    await register(changed);
    const changedItem = itemFor(
      changed.components.find(
        (part) => part.componentId === navigation.componentId,
      ),
    );
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.equal(raid.applyRaidAppearance(host, changedItem), true);
      assert.equal(
        anchor.getAttribute("aria-label"),
        text?.includes("Books") ? "Books shelf" : D.PARTS.ab_nav.name,
      );
      assert.equal(host.querySelector(anchorSelector), anchor);
      assert.deepEqual(nativeState(anchor), before);
      assert.deepEqual(
        host.children.filter((child) => !child.classList.contains("raid-skin")),
        nativeChildren,
      );
      assert.equal(anchor.value, "PRIVATE NATIVE VALUE");
      assert.equal(host.classList.contains("is-firing"), true);
      assert.equal(host.querySelectorAll(":scope > .raid-skin").length, 1);
      assert.equal(
        host.querySelector(".raid-skin").getAttribute("aria-hidden"),
        "true",
      );
      assert.equal(
        host.querySelector(".raid-skin").style.pointerEvents,
        "none",
      );
      assert.equal(raid.applyRaidAppearance(host, item), true);
      assert.equal(anchor.getAttribute("aria-label"), "Books");
      assert.deepEqual(nativeState(anchor), before);
    }
    assert.deepEqual(changed, saved);
    assert.deepEqual(
      raid.getRaidAppearance(changedItem.appearanceId),
      part.appearance,
    );
  }
  await anchor.dispatch("custom-native-event");
  assert.equal(handled, 1);
  assert.equal(state.textContent, "5");
  assert.deepEqual(item, itemBefore);
});

test("captured navigation names do not overwrite edited native text or wrapper identity", async (t) => {
  withDocument(t);
  await register();
  for (const label of [
    "自分の本棚",
    "",
    "<b>本棚</b> & home",
    "  edited\n label  ",
  ]) {
    const item = itemFor(navigation, label),
      before = structuredClone(item);
    V.setAppearanceRenderer(null);
    const plain = V.create(item),
      expected = nativeState(plain.querySelector(anchorSelector));
    V.setAppearanceRenderer(raid.applyRaidAppearance);
    const host = V.create(item),
      anchor = host.querySelector(anchorSelector);
    assert.equal(anchor.getAttribute("aria-label"), "Books");
    assert.deepEqual(nativeState(anchor).attrs, expected.attrs);
    assert.equal(anchor.textContent, label || "プロフィール");
    assert.equal(
      host.getAttribute("aria-label"),
      plain.getAttribute("aria-label"),
    );
    assert.equal(host.getAttribute("title"), plain.getAttribute("title"));
    assert.equal(
      host.querySelector("b"),
      null,
      "edited label remains literal text",
    );
    assert.deepEqual(item, before);
  }
});

test("hostile captured navigation text stays literal and excludes hidden and live form values", async (t) => {
  withDocument(t);
  const hostile = '<img src=x onerror="bad()"> & Books';
  const changed = await reconstructStaticCode(
    source(
      '<a href="/catalogue/">&lt;img src=x onerror="bad()"&gt; &amp; Books</a><input value="PRIVATE FORM VALUE"><span hidden>PRIVATE HIDDEN TEXT</span>',
    ),
  );
  const part = changed.components.find(
    (part) => part.evidence === "navigation",
  );
  assert.ok(part);
  assert.ok(!JSON.stringify(changed).includes("PRIVATE"));
  const before = structuredClone(changed);
  await register(changed);
  const item = raid.createRaidLootItem(
    raid
      .prepareRaidRewards(changed, "hostile-navigation")
      .find((reward) => reward.componentId === part.componentId),
    "p1",
  );
  const host = V.create(item),
    anchor = host.querySelector(anchorSelector);
  assert.equal(anchor.getAttribute("aria-label"), hostile);
  assert.equal(anchor.textContent, "プロフィール");
  assert.equal(anchor.getAttribute("href"), "#");
  assert.equal(host.querySelectorAll("img,script,iframe").length, 0);
  assert.ok(host.querySelector(".raid-skin").textContent.includes(hostile));
  assert.deepEqual(changed, before);
});

test("only the direct original navigation anchor is named, never nested or unrelated controls", async (t) => {
  const doc = withDocument(t);
  await register();
  const item = itemFor(),
    host = V.create(item),
    direct = host.querySelector(anchorSelector);
  const nested = doc.createElement("div");
  nested.innerHTML =
    '<a class="native-old-link" href="#nested" data-ui="link" aria-label="Nested identity">nested</a>';
  host.append(nested);
  host.children = [
    nested,
    ...host.children.filter((child) => child !== nested),
  ];
  const nestedAnchor = nested.querySelector("a"),
    nestedBefore = nativeState(nestedAnchor);
  direct.setAttribute("aria-label", "stale direct identity");
  raid.applyRaidAppearance(host, item);
  assert.equal(direct.getAttribute("aria-label"), "Books");
  assert.equal(nestedAnchor.getAttribute("aria-label"), "Nested identity");
  assert.deepEqual(nativeState(nestedAnchor), nestedBefore);
  direct.remove();
  raid.applyRaidAppearance(host, item);
  assert.equal(
    nestedAnchor.getAttribute("aria-label"),
    "Nested identity",
    "absent direct anchor must not adopt a nested control",
  );
  for (const markup of [
    '<a href="#" data-ui="link" aria-label="Unrelated anchor">other</a>',
    '<a class="native-old-link" href="#" data-ui="header" aria-label="Header action">header</a>',
    '<button class="native-old-link" data-ui="link" aria-label="Button action">button</button>',
  ]) {
    const edge = doc.createElement("div");
    edge.innerHTML = markup;
    const control = edge.children[0],
      before = nativeState(control),
      name = control.getAttribute("aria-label");
    raid.applyRaidAppearance(edge, item);
    assert.equal(control.getAttribute("aria-label"), name);
    assert.deepEqual(nativeState(control), before);
  }
  for (const type of ["ab_link", "ab_mail"]) {
    const other = {
      ...C.makeItem(type, type, 24, 24),
      appearanceId: navigation.appearanceId,
    };
    V.setAppearanceRenderer(null);
    const node = V.create(other),
      anchor = node.querySelector(anchorSelector),
      before = nativeState(anchor);
    assert.equal(anchor.getAttribute("aria-label"), null);
    for (const name of [null, "Authored unrelated name"]) {
      if (name !== null) anchor.setAttribute("aria-label", name);
      raid.applyRaidAppearance(node, other);
      assert.equal(anchor.getAttribute("aria-label"), name, type);
      assert.deepEqual(nativeState(anchor), before, type);
    }
  }
});

test("captured navigation uses the actual local preview handler and keeps native navigation prevention gates", async (t) => {
  const doc = withDocument(t);
  await register();
  const item = itemFor(),
    before = structuredClone(item),
    host = V.create(item),
    anchor = host.querySelector(anchorSelector);
  const paper = doc.createElement("div");
  paper.className = "browser-paper";
  paper.append(host);
  const child = doc.createElement("span");
  child.textContent = "native child";
  anchor.append(child);
  const original = nativeState(anchor);
  for (const [preview, battle, expectedNotice] of [
    [true, null, true],
    [false, null, false],
    [true, { running: true }, false],
  ]) {
    const notices = [],
      pulses = [];
    let prevented = 0;
    const handler = new Function(
      "Element",
      "preview",
      "battle",
      "storyActive",
      "storySession",
      "fx",
      "previewCatalogueAction",
      "toast",
      `${previewCode}; return previewAction;`,
    )(
      ElementAdapter,
      preview,
      battle,
      false,
      null,
      {
        pulse(node) {
          pulses.push(node);
        },
      },
      previewCatalogueAction,
      (message) => notices.push(message),
    );
    handler({
      target: child,
      preventDefault() {
        prevented++;
      },
    });
    assert.equal(
      prevented,
      1,
      "local anchors cannot navigate in preview, edit or battle mode",
    );
    assert.deepEqual(
      notices,
      expectedNotice
        ? ["ページ内のプレビューです。外部には移動しません。"]
        : [],
    );
    assert.deepEqual(pulses, expectedNotice ? [host] : []);
    assert.equal(anchor.getAttribute("aria-label"), "Books");
    assert.deepEqual(nativeState(anchor), original);
  }
  assert.deepEqual(item, before);
});

test("legacy and current recorded navigation trophies coexist with unchanged capture, appearance and provenance identities", async (t) => {
  withDocument(t);
  const legacy = JSON.parse(legacyJson),
    legacyBefore = structuredClone(legacy),
    currentBefore = structuredClone(books);
  assert.equal(
    hash(JSON.stringify(legacy)),
    "df768a21e42f6bfda965c4237e3074e18e6830a363707d7c755bd2b8ec2151e8",
  );
  assert.equal((await raid.verifyRaidBlueprint(legacy)).ok, true);
  assert.notEqual(legacy.captureId, books.captureId);
  const oldPart = legacy.components.find(
    (part) => part.componentId === navigation.componentId,
  );
  assert.notEqual(oldPart.appearanceId, navigation.appearanceId);
  const factory = new IDBFactory(),
    store = createProfileStore(factory),
    run = R.newRun("lab"),
    runBefore = structuredClone(run);
  // Compatibility receipts exercise both saved formats, not additional engine-win claims.
  for (const [blueprint, battleId] of [
    [legacy, "legacy-navigation-compatibility"],
    [books, "current-navigation-compatibility"],
  ]) {
    await store.recordRaidVictory(blueprint, battleId);
    const reward = raid
      .prepareRaidRewards(blueprint, battleId)
      .find((reward) => reward.componentId === navigation.componentId);
    await store.claimRaidReward(run, reward, blueprint);
  }
  const reloaded = createProfileStore(factory),
    trophies = await reloaded.listTrophies(),
    trophiesBefore = structuredClone(trophies);
  assert.equal(trophies.length, 2);
  for (const blueprint of [legacy, books])
    await register(await reloaded.getBlueprint(blueprint.captureId));
  for (const trophy of trophies) {
    const expected =
      trophy.item.provenanceId === books.captureId ? navigation : oldPart;
    assert.equal(trophy.item.appearanceId, expected.appearanceId);
    assert.deepEqual(
      raid.getRaidAppearance(expected.appearanceId),
      expected.appearance,
    );
    assert.equal(
      V.create(trophy.item)
        .querySelector(anchorSelector)
        .getAttribute("aria-label"),
      "Books",
    );
  }
  assert.deepEqual(await reloaded.listTrophies(), trophiesBefore);
  assert.deepEqual(await reloaded.getBlueprint(legacy.captureId), legacyBefore);
  assert.deepEqual(await reloaded.getBlueprint(books.captureId), currentBefore);
  assert.deepEqual(legacy, legacyBefore);
  assert.deepEqual(books, currentBefore);
  assert.deepEqual(run, runBefore);
});

test("plain navigation and missing appearances keep canonical native fallback without adding a skin or name", (t) => {
  withDocument(t);
  V.setAppearanceRenderer(raid.applyRaidAppearance);
  for (const appearanceId of [undefined, "appearance_" + "f".repeat(64)]) {
    const item = {
        ...C.makeItem("ab_nav", "missing-navigation", 24, 24),
        appearanceId,
      },
      before = structuredClone(item);
    const host = V.create(item),
      anchor = host.querySelector(anchorSelector),
      state = nativeState(anchor);
    assert.equal(raid.applyRaidAppearance(host, item), false);
    assert.equal(anchor.getAttribute("aria-label"), null);
    assert.equal(anchor.textContent, "プロフィール");
    assert.equal(host.querySelector(".raid-skin"), null);
    assert.deepEqual(nativeState(anchor), state);
    assert.deepEqual(item, before);
  }
});
