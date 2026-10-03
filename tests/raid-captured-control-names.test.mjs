import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseFragment } from "parse5";
import { IDBFactory } from "fake-indexeddb";
import C from "../src/document.js";
import D from "../src/data.js";
import R from "../src/run.js";
import V from "../src/components.js";
import { previewCatalogueAction } from "../src/catalog/preview.js";
import { createProfileStore } from "../src/profile-store.js";
import { prepareRaidChallenge } from "../src/raid-challenge.js";
import { reconstructStaticCode } from "../server/site-ingest/code.js";
import * as raid from "../src/raid/index.js";

// Production rendering, encounter and persistence run against a DOM-boundary
// adapter. This does not establish browser visuals or assistive-technology acceptance.
// Canonical-only scene/reward labels, blanket native relabeling, textContent
// replacement, or presentation changes to saved identities must fail these tests.
class ElementAdapter {
  constructor(document, tag) {
    Object.assign(this, {
      ownerDocument: document,
      tagName: tag.toUpperCase(),
      parentElement: null,
      children: [],
      attrs: new Map(),
      dataset: {},
      className: "",
      tabIndex: -1,
      ownText: "",
      events: new Map(),
      clientWidth: 960,
      style: {
        setProperty(name, value) {
          this[name] = value;
        },
      },
    });
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      add: (...names) =>
        names.forEach((name) => this.classList.toggle(name, true)),
      remove: (...names) =>
        names.forEach((name) => this.classList.toggle(name, false)),
      toggle: (name, force) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        const on = force ?? !names.has(name);
        if (on) names.add(name);
        else names.delete(name);
        this.className = [...names].join(" ");
        return on;
      },
    };
  }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
    if (name === "class") this.className = String(value);
    if (name.startsWith("data-"))
      this.dataset[
        name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      ] = String(value);
  }
  getAttribute(name) {
    if (name === "class") return this.className;
    if (name.startsWith("data-"))
      return (
        this.dataset[
          name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        ] ?? null
      );
    return this.attrs.get(name) ?? null;
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter(
        (child) => child !== this,
      );
    this.parentElement = null;
  }
  append(...children) {
    children.forEach((child) => {
      child.remove();
      child.parentElement = this;
      this.children.push(child);
    });
  }
  replaceChildren(...children) {
    this.children.forEach((child) => {
      child.parentElement = null;
    });
    this.children = [];
    this.ownText = "";
    this.append(...children);
  }
  get textContent() {
    return (
      this.ownText + this.children.map((child) => child.textContent).join("")
    );
  }
  set textContent(value) {
    this.replaceChildren();
    this.ownText = String(value);
  }
  set innerHTML(html) {
    this.htmlSource = html;
    const convert = (node) => {
      const el = this.ownerDocument.createElement(node.tagName ?? "#text");
      for (const attr of node.attrs ?? [])
        el.setAttribute(attr.name, attr.value);
      if (node.nodeName === "#text") el.ownText = node.value;
      el.append(...(node.childNodes ?? []).map(convert));
      return el;
    };
    this.replaceChildren(...parseFragment(html).childNodes.map(convert));
  }
  matches(selector) {
    return selector.split(",").some((value) => {
      const simple = value.trim();
      const tag = simple.match(/^[a-z][\w-]*/i)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      if (
        [...simple.matchAll(/\.([\w-]+)/g)].some(
          ([, name]) => !this.classList.contains(name),
        )
      )
        return false;
      return [
        ...simple.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/g),
      ].every(([, name, expected]) =>
        expected === undefined
          ? this.getAttribute(name) !== null
          : this.getAttribute(name) === expected,
      );
    });
  }
  querySelectorAll(selector) {
    if (selector.startsWith(":scope > "))
      return this.children.filter((child) => child.matches(selector.slice(9)));
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  closest(selector) {
    return this.matches(selector)
      ? this
      : (this.parentElement?.closest(selector) ?? null);
  }
  addEventListener(name, callback) {
    const list = this.events.get(name) ?? [];
    list.push(callback);
    this.events.set(name, list);
  }
  removeEventListener(name, callback) {
    this.events.set(
      name,
      (this.events.get(name) ?? []).filter((fn) => fn !== callback),
    );
  }
  async dispatch(name, event = {}) {
    for (const callback of this.events.get(name) ?? [])
      await callback({ target: this, preventDefault() {}, ...event });
  }
}
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
    for (const key of Object.keys(prior))
      if (prior[key]) Object.defineProperty(globalThis, key, prior[key]);
      else delete globalThis[key];
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
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fixture = (name) =>
  readFile(new URL(`../fixtures/raid/${name}`, import.meta.url), "utf8");
const [html, css, legacyJson] = await Promise.all([
  fixture("public-source/books.html"),
  fixture("public-source/books.css"),
  fixture("compatibility/books-before-child-selectors.json"),
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
const purchase = books.components.find(
  (part) => part.componentId === "component-05",
);
const sourceCaption = "Add to basket（カートに入れる）";
const component = (host, id) =>
  host
    .querySelectorAll(".raid-component")
    .find((node) => node.dataset.componentId === id);
const forbiddenMarkup = (host) =>
  host.querySelectorAll("img,script,iframe").length;

function checkBooksIdentity(blueprint) {
  assert.equal(
    hash(html),
    "9fdd63da34161ebd13408d7a85105f83ec3c9f351c5d77cd0aa578790e121c1e",
  );
  assert.equal(
    hash(css),
    "d497d4a0d52686ccd30f5941b02867075870372cdfe37adbcb0be74fdeed94cf",
  );
  assert.equal(
    blueprint.captureId,
    "capture_b51a0697f50e53fd012abd53d1225079e61099a4f71884658397e90dd5624fd5",
  );
  assert.deepEqual(
    blueprint.components.map((part) => [part.componentId, part.appearanceId]),
    [
      [
        "component-00",
        "appearance_40d2e571c79a1b21e3cea71ca0ee48fc9d4d3194def3e560b9d33fc415917544",
      ],
      [
        "component-01",
        "appearance_d30ff827a1c2daac79828e388dcde19e9a9681c6aa2cc7545b9d06ea5a95ce2a",
      ],
      [
        "component-02",
        "appearance_c2f99d13fb631b5e279e4406de1fb17d036ef0aefb3917c590310c09defd484b",
      ],
      [
        "component-03",
        "appearance_13f2fba47eba3c5624f2dc9edc47bf886a7e496afafac1cd6eb06d43c42130db",
      ],
      [
        "component-04",
        "appearance_ce381866f7f92a506af8671f37744d11f4bff478e4964a8c1bee5536b0adf43a",
      ],
      [
        "component-05",
        "appearance_2bc659d6b8bd15a3e0638bd69134a491b9f1ff163e99d812898bb05da979e825",
      ],
      [
        "component-06",
        "appearance_ff65c3fed6a3c28d211ae3429d8d6b40438f49050ba82002b587afede5f97479",
      ],
      [
        "component-07",
        "appearance_2bc659d6b8bd15a3e0638bd69134a491b9f1ff163e99d812898bb05da979e825",
      ],
    ],
  );
}

test("recorded Books scene and actual ready, won and claimed panel keep captured and canonical identity", async (t) => {
  const doc = withDocument(t),
    host = doc.createElement("div"),
    before = structuredClone(books);
  checkBooksIdentity(books);
  const scene = doc.createElement("div");
  raid.renderRaidScene(scene, books);
  assert.equal(
    component(scene, purchase.componentId).getAttribute("aria-label"),
    `${sourceCaption} / ${D.PARTS.am_buy.desc}`,
  );
  const claims = [];
  const panel = raid.mountRaidPanel(
    host,
    {
      onChallenge: async () => ({
        battleId: "panel-captured-names",
        winner: "player",
      }),
      onClaim: async (reward) => {
        claims.push(reward);
        return { ok: true };
      },
    },
    undefined,
    {
      kind: "cached",
      url: "https://books.toscrape.com/",
      cachedBlueprint: books,
    },
  );
  t.after(() => panel.dispose());
  await until(() => component(host, purchase.componentId));
  assert.equal(
    component(host, purchase.componentId).getAttribute("aria-label"),
    `${sourceCaption} / ${D.PARTS.am_buy.desc}`,
  );
  assert.ok(
    host
      .querySelector(".raid-mapping")
      .textContent.includes(`${sourceCaption} / CPU ${D.PARTS.am_buy.load}`),
  );
  await host
    .querySelectorAll("button")
    .find((button) => button.textContent === "このページに挑戦")
    .dispatch("click");
  const won = component(host, purchase.componentId);
  assert.equal(
    won.getAttribute("aria-label"),
    `${sourceCaption}（近似再構成のUI）を回収`,
  );
  assert.equal(won.getAttribute("role"), "button");
  assert.equal(won.tabIndex, 0);
  let prevented = false;
  await host.querySelector(".raid-canvas").dispatch("keydown", {
    target: won,
    key: "Enter",
    preventDefault() {
      prevented = true;
    },
  });
  await until(() =>
    component(host, purchase.componentId)?.classList.contains("raid-claimed"),
  );
  assert.equal(
    component(host, purchase.componentId).getAttribute("aria-label"),
    `${sourceCaption}（近似再構成のUI） / 回収済みのUI`,
  );
  assert.equal(prevented, true);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].componentId, purchase.componentId);
  assert.deepEqual(books, before);
});

test("real Books victory, pending reload, claim and trophy reload repair only the native purchase name", async (t) => {
  withDocument(t);
  checkBooksIdentity(books);
  const run = R.newRun("lab"),
    before = structuredClone(run),
    battleId = "recorded-control-identity";
  const prepared = prepareRaidChallenge(run, books);
  for (let ticks = 0; ticks < 1800 && !prepared.battle.result; ticks++)
    prepared.battle.step(0.05);
  assert.deepEqual(prepared.battle.result, {
    winner: "player",
    time: 10.5,
    income: 32,
  });
  assert.deepEqual(
    run,
    before,
    "the actual engine challenge does not alter the source run",
  );
  const factory = new IDBFactory(),
    store = createProfileStore(factory);
  await store.recordRaidVictory(books, battleId);
  const reopened = createProfileStore(factory),
    [pending] = await reopened.listPendingRaids();
  assert.deepEqual(pending.blueprint, books);
  const reward = raid
    .prepareRaidRewards(pending.blueprint, battleId)
    .find((value) => value.componentId === purchase.componentId);
  await reopened.claimRaidReward(run, reward, pending.blueprint);
  const reloaded = createProfileStore(factory),
    [trophy] = await reloaded.listTrophies(),
    saved = await reloaded.getBlueprint(books.captureId);
  assert.deepEqual(saved, books);
  assert.deepEqual(await reloaded.listPendingRaids(), []);
  assert.equal((await raid.registerRaidBlueprint(saved)).ok, true);
  V.setAppearanceRenderer(raid.applyRaidAppearance);
  const node = V.create(trophy.item),
    control = node.querySelector(".native-button");
  assert.equal(control.getAttribute("aria-label"), "Add to basket");
  assert.equal(control.textContent, "カートに入れる");
  assert.equal(control.dataset.ui, "buy");
  assert.equal(
    node.querySelector(".raid-skin").getAttribute("aria-hidden"),
    "true",
  );
  assert.equal(trophy.item.appearanceId, purchase.appearanceId);
  assert.equal(trophy.item.provenanceId, books.captureId);
  const trophyBefore = structuredClone(trophy);
  const legacy = JSON.parse(legacyJson),
    legacyBefore = structuredClone(legacy);
  assert.equal(
    hash(JSON.stringify(legacy)),
    "df768a21e42f6bfda965c4237e3074e18e6830a363707d7c755bd2b8ec2151e8",
  );
  assert.equal((await raid.verifyRaidBlueprint(legacy)).ok, true);
  // Compatibility receipt exercises the old saved artifact, not an engine win claim.
  await reloaded.recordRaidVictory(legacy, "legacy-control-compatibility");
  const oldPart = legacy.components.find(
    (part) => part.evidence === "navigation",
  );
  const oldReward = raid
    .prepareRaidRewards(legacy, "legacy-control-compatibility")
    .find((value) => value.componentId === oldPart.componentId);
  await reloaded.claimRaidReward(run, oldReward, legacy);
  const last = createProfileStore(factory);
  await raid.registerRaidBlueprint(await last.getBlueprint(legacy.captureId));
  const trophies = await last.listTrophies();
  assert.equal(trophies.length, 2);
  assert.deepEqual(
    trophies.find((value) => value.rewardId === trophy.rewardId),
    trophyBefore,
  );
  assert.deepEqual(await last.getBlueprint(legacy.captureId), legacyBefore);
  assert.deepEqual(await last.getBlueprint(books.captureId), books);
  assert.deepEqual(
    raid.getRaidAppearance(oldPart.appearanceId),
    oldPart.appearance,
  );
  assert.deepEqual(
    raid.getRaidAppearance(purchase.appearanceId),
    purchase.appearance,
  );
  assert.equal(
    V.create(trophy.item)
      .querySelector(".native-button")
      .getAttribute("aria-label"),
    "Add to basket",
  );
  assert.deepEqual(run, before);
  assert.deepEqual(legacy, legacyBefore);
});

test("reapplying captured names preserves native objects, handlers, children and live state without relabeling unrelated actions", async (t) => {
  const doc = withDocument(t);
  await raid.registerRaidBlueprint(books);
  V.setAppearanceRenderer(raid.applyRaidAppearance);
  const item = {
      ...C.makeItem("am_buy", "purchase", 24, 24),
      appearanceId: purchase.appearanceId,
    },
    before = structuredClone(item);
  const node = V.create(item),
    button = node.querySelector(".native-button"),
    originalChildren = [...button.children];
  const state = doc.createElement("span");
  state.className = "state-charge";
  state.textContent = "5";
  button.append(state);
  button.disabled = true;
  button.value = "PRIVATE BUTTON VALUE";
  let clicks = 0;
  button.addEventListener("click", () => {
    clicks++;
    state.textContent = "6";
  });
  node.classList.add("is-added");
  for (let count = 0; count < 3; count++) {
    assert.equal(raid.applyRaidAppearance(node, item), true);
    assert.equal(node.querySelector(".native-button"), button);
    assert.deepEqual(button.children, [...originalChildren, state]);
    assert.equal(button.disabled, true);
    assert.equal(button.value, "PRIVATE BUTTON VALUE");
    assert.equal(button.getAttribute("aria-label"), "Add to basket");
    assert.equal(node.classList.contains("is-added"), true);
    assert.equal(node.querySelectorAll(":scope > .raid-skin").length, 1);
  }
  await button.dispatch("click");
  assert.equal(clicks, 1);
  assert.equal(state.textContent, "6");
  assert.deepEqual(item, before);
  for (const type of [
    "go_search",
    "gov_check",
    "am_quantity",
    "yt_like",
    "yt_notify",
    "ui_support",
  ]) {
    if (!D.PARTS[type]) continue;
    const unrelated = {
        ...C.makeItem(type, type, 24, 24),
        appearanceId: purchase.appearanceId,
      },
      host = V.create(unrelated);
    const controls = host.querySelectorAll("button,input,select"),
      native = host.children.filter(
        (child) => !child.classList.contains("raid-skin"),
      );
    for (const control of controls) {
      control.value = "PRIVATE FORM VALUE";
      control.checked = true;
      control.disabled = true;
      control.selectedIndex = 2;
    }
    const labels = controls.map((control) =>
      control.getAttribute("aria-label"),
    );
    raid.applyRaidAppearance(host, unrelated);
    assert.deepEqual(host.querySelectorAll("button,input,select"), controls);
    assert.deepEqual(
      host.children.filter((child) => !child.classList.contains("raid-skin")),
      native,
    );
    assert.deepEqual(
      controls.map((control) => control.getAttribute("aria-label")),
      labels,
    );
    for (const control of controls) {
      assert.equal(control.value, "PRIVATE FORM VALUE");
      assert.equal(control.checked, true);
      assert.equal(control.disabled, true);
      assert.equal(control.selectedIndex, 2);
    }
    assert.ok(!host.textContent.includes("PRIVATE"));
    assert.ok(labels.every((label) => !label?.includes("PRIVATE")));
    for (const control of controls.filter((control) =>
      control.classList.contains("native-button"),
    ))
      assert.notEqual(
        control.getAttribute("aria-label"),
        "Add to basket",
        type,
      );
  }
  const supportType = Object.keys(D.PARTS).find((type) =>
    V.markup(C.makeItem(type, "x", 24, 24)).includes('data-ui="support"'),
  );
  const supportItem = {
      ...C.makeItem(supportType, "support", 24, 24),
      appearanceId: purchase.appearanceId,
    },
    support = V.create(supportItem);
  const supportButton = support.querySelector(".native-button"),
    feedback = support.querySelector(".support-feedback"),
    charge = support.querySelector(".state-charge");
  assert.equal(previewCatalogueAction(supportButton, support), true);
  charge.textContent = "4";
  raid.applyRaidAppearance(support, supportItem);
  assert.equal(support.querySelector(".support-feedback"), feedback);
  assert.equal(feedback.textContent, "応援のプレビュー · 決済なし");
  assert.equal(support.querySelector(".state-charge"), charge);
  assert.equal(charge.textContent, "4");
  assert.equal(supportButton.getAttribute("aria-label"), null);
  const [gameCss, raidCss] = await Promise.all([
    readFile(new URL("../src/styles/game.css", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/raid.css", import.meta.url), "utf8"),
  ]);
  assert.match(
    gameCss,
    /\.is-added \.buy-button::after\{content:'✓ カートに追加'/,
  );
  assert.match(
    raidCss,
    /\.web-node\.has-raid-skin\.is-added[^{}]*raid-live-layer\[data-raid-live="button"\]/,
  );
});

test("hostile captured text stays literal and scene/reward captions never read hidden content or form values", async (t) => {
  const doc = withDocument(t),
    hostile = '<img src=x onerror="bad()"> & Add to basket';
  const changed = await reconstructStaticCode(
    source(
      '<button>&lt;img src=x onerror="bad()"&gt; &amp; Add to basket</button><input value="PRIVATE FORM VALUE"><span hidden>PRIVATE HIDDEN TEXT</span>',
    ),
  );
  const part = changed.components.find((part) => part.evidence === "purchase");
  assert.ok(part);
  assert.ok(!JSON.stringify(changed).includes("PRIVATE"));
  const before = structuredClone(changed),
    host = doc.createElement("div");
  const panel = raid.mountRaidPanel(
    host,
    {
      onChallenge: async () => {
        throw Error("unused");
      },
      onClaim: async () => ({ ok: true }),
    },
    { blueprint: changed, battleId: "hostile-caption", winner: "player" },
  );
  t.after(() => panel.dispose());
  await until(() => component(host, part.componentId));
  assert.equal(
    component(host, part.componentId).getAttribute("aria-label"),
    `${hostile}（カートに入れる）（近似再構成のUI）を回収`,
  );
  assert.equal(forbiddenMarkup(host), 0);
  assert.ok(host.querySelector(".raid-mapping").textContent.includes(hostile));
  V.setAppearanceRenderer(raid.applyRaidAppearance);
  const item = raid.createRaidLootItem(
    raid.prepareRaidRewards(changed, "hostile-caption")[0],
    "p1",
  );
  const installed = V.create(item);
  assert.equal(
    installed.querySelector(".native-button").getAttribute("aria-label"),
    hostile,
  );
  assert.equal(forbiddenMarkup(installed), 0);
  await host
    .querySelector(".raid-canvas")
    .dispatch("click", { target: component(host, part.componentId) });
  await until(() =>
    component(host, part.componentId)?.classList.contains("raid-claimed"),
  );
  assert.equal(
    component(host, part.componentId).getAttribute("aria-label"),
    `${hostile}（カートに入れる）（近似再構成のUI） / 回収済みのUI`,
  );
  assert.deepEqual(changed, before);
});

test("blank, canonical and missing captured names retain canonical fallback without changing saved descriptors", async (t) => {
  const doc = withDocument(t);
  V.setAppearanceRenderer(raid.applyRaidAppearance);
  for (const text of [
    " \t\n ",
    "\u202e\u2069",
    D.PARTS.am_buy.name,
    " \tAdd\n to basket\u202e ",
    null,
  ]) {
    const draft = structuredClone(books),
      part = draft.components.find(
        (part) => part.componentId === purchase.componentId,
      );
    if (text === null)
      part.appearance.primitives = part.appearance.primitives.filter(
        (primitive) => primitive.kind !== "text",
      );
    else
      part.appearance.primitives.find(
        (primitive) => primitive.kind === "text",
      ).text = text;
    const { captureId, ...unsealed } = draft;
    const sealed = await raid.sealRaidBlueprint(unsealed),
      before = structuredClone(sealed);
    await raid.registerRaidBlueprint(sealed);
    const scene = doc.createElement("div");
    raid.renderRaidScene(scene, sealed);
    const normalized = text?.includes("Add")
      ? "Add to basket"
      : D.PARTS.am_buy.name;
    const caption =
      normalized === D.PARTS.am_buy.name
        ? normalized
        : `${normalized}（${D.PARTS.am_buy.name}）`;
    assert.equal(
      component(scene, part.componentId).getAttribute("aria-label"),
      `${caption} / ${D.PARTS.am_buy.desc}`,
    );
    const current = sealed.components.find(
        (value) => value.componentId === part.componentId,
      ),
      item = {
        ...C.makeItem("am_buy", "fallback", 24, 24),
        appearanceId: current.appearanceId,
      };
    const native = V.create(item).querySelector(".native-button");
    assert.equal(
      native.getAttribute("aria-label") ?? native.textContent,
      normalized,
    );
    assert.deepEqual(sealed, before);
  }
  const missing = {
    ...C.makeItem("am_buy", "missing", 24, 24),
    appearanceId: "appearance_" + "f".repeat(64),
  };
  const node = V.create(missing);
  assert.equal(node.querySelector(".raid-skin"), null);
  assert.equal(
    node.querySelector(".native-button").getAttribute("aria-label"),
    null,
  );
});

test("same-host purchase skin changes clear stale captured names without replacing native state", async (t) => {
  const doc = withDocument(t);
  await raid.registerRaidBlueprint(books);
  V.setAppearanceRenderer(raid.applyRaidAppearance);
  const item = {
    ...C.makeItem("am_buy", "same-host", 24, 24),
    appearanceId: purchase.appearanceId,
  };
  const host = V.create(item),
    button = host.querySelector(".native-button");
  const state = doc.createElement("span");
  state.className = "state-charge";
  state.textContent = "5";
  button.append(state);
  const children = [...button.children];
  button.disabled = true;
  button.value = "PRIVATE VALUE";
  assert.equal(button.getAttribute("aria-label"), "Add to basket");
  for (const missing of [false, true]) {
    const { captureId, ...draft } = structuredClone(books);
    const part = draft.components.find(
      (value) => value.componentId === purchase.componentId,
    );
    if (missing)
      part.appearance.primitives = part.appearance.primitives.filter(
        (primitive) => primitive.kind !== "text",
      );
    else
      part.appearance.primitives.find(
        (primitive) => primitive.kind === "text",
      ).text = " \t\n ";
    const blank = await raid.sealRaidBlueprint(draft),
      before = structuredClone(blank);
    await raid.registerRaidBlueprint(blank);
    const changed = {
      ...item,
      appearanceId: blank.components.find(
        (value) => value.componentId === part.componentId,
      ).appearanceId,
    };
    assert.equal(raid.applyRaidAppearance(host, changed), true);
    assert.equal(
      button.getAttribute("aria-label"),
      D.PARTS.am_buy.name,
      "blank source must not retain the previous skin's identity",
    );
    assert.equal(host.querySelector(".native-button"), button);
    assert.deepEqual(button.children, children);
    assert.equal(button.disabled, true);
    assert.equal(button.value, "PRIVATE VALUE");
    assert.equal(state.textContent, "5");
    assert.deepEqual(blank, before);
    raid.applyRaidAppearance(host, item);
    assert.equal(button.getAttribute("aria-label"), "Add to basket");
  }
});
