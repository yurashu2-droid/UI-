import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as raid from "../src/raid/index.ts";

// This is a render-contract adapter. It does not claim browser layout or pixels.
function element(doc) {
  const classes = new Set();
  return {
    ownerDocument: doc,
    children: [],
    style: {},
    dataset: {},
    attributes: {},
    textContent: "",
    value: "",
    checked: false,
    classList: {
      add(...names) {
        names.forEach((n) => classes.add(n));
      },
      contains(n) {
        return classes.has(n);
      },
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    replaceChildren(...nodes) {
      this.children = nodes;
    },
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    querySelector(s) {
      return this.selectors?.[s] ?? null;
    },
  };
}
function nativeHost(type) {
  const doc = {
      createElement() {
        return element(doc);
      },
    },
    host = element(doc);
  const root = element(doc),
    control = element(doc);
  const selector = {
    go_search: ".native-search",
    gov_check: ".native-gov-check",
    am_quantity: ".native-quantity",
    yt_progress: ".native-seek",
    yt_play: ".native-video",
    am_buy: ".native-button",
  }[type];
  host.selectors = { [selector]: root };
  root.selectors = {
    'input[type="search"]': control,
    'input[type="checkbox"]': control,
    select: control,
  };
  root.append(control);
  host.append(root);
  return { host, root, control };
}

for (const [type, kind] of [
  ["go_search", "search"],
  ["gov_check", "checkbox"],
  ["am_quantity", "select"],
  ["yt_progress", "progress"],
  ["yt_play", "video"],
  ["am_buy", "button"],
]) {
  test(`imported ${kind} keeps its original game-owned live control above the artwork`, async () => {
    const b = await raid.createFixtureRaid("archive");
    await raid.registerRaidBlueprint(b);
    const { host, root, control } = nativeHost(type);
    control.value = "game query";
    control.checked = true;
    const item = { type, appearanceId: b.components[0].appearanceId };
    assert.equal(raid.applyRaidAppearance(host, item), true);
    assert.equal(
      host.children[0],
      root,
      "do not clone or replace engine state",
    );
    assert.equal(root.children[0], control);
    assert.equal(control.value, "game query");
    assert.equal(control.checked, true);
    assert.equal(root.classList.contains("raid-live-layer"), true);
    assert.equal(root.dataset.raidLive, kind);
    assert.equal(root.style.zIndex, "3");
    assert.equal(host.children.at(-1).style.zIndex, "2");
    if (kind === "search") {
      assert.equal(
        control.placeholder,
        b.components[0].appearance.primitives[0].text,
      );
      assert.equal(control.style.position, "absolute");
      assert.equal(
        control.style.backgroundColor,
        b.components[0].appearance.background,
      );
    }
  });
}

test("live-state styling exposes button changes, progress, and video chrome without imported scripts", () => {
  const css = readFileSync(
    new URL("../src/styles/raid.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\.is-added[^{}]*\.raid-live-layer\[data-raid-live="button"\]/,
  );
  assert.match(css, /\[data-raid-live="video"\][\s\S]*?\.video-copy/);
  assert.match(css, /\[data-raid-live="progress"\]/);
  assert.match(css, /\[data-raid-live="checkbox"\][\s\S]*?input/);
});

test("quantity replaces the frozen value region with the original live select", async () => {
  const b = await raid.createFixtureRaid("commerce");
  await raid.registerRaidBlueprint(b);
  const c = b.components.find((c) => c.canonicalType === "am_quantity");
  const label = c.appearance.primitives.find((p) => p.kind === "text");
  const { host, root, control } = nativeHost("am_quantity");
  control.value = "3";
  control.selectedIndex = 2;
  raid.applyRaidAppearance(host, {
    type: "am_quantity",
    appearanceId: c.appearanceId,
  });
  assert.equal(root.dataset.raidSourceField, "true");
  assert.equal(
    root.style.backgroundColor,
    c.appearance.background,
    "mask frozen source digits behind actual control",
  );
  assert.equal(
    root.style.width,
    `${(label.rect.w / c.appearance.width) * 100}%`,
  );
  assert.equal(root.children[0], control);
  assert.equal(control.value, "3");
  assert.equal(control.selectedIndex, 2);
  assert.equal(control.attributes["aria-label"], "数量");
});

test("checkbox keeps a readable accessible name when the canonical label is visually hidden", async () => {
  const b = await raid.createFixtureRaid("archive");
  await raid.registerRaidBlueprint(b);
  const { host, control } = nativeHost("gov_check");
  raid.applyRaidAppearance(host, {
    type: "gov_check",
    appearanceId: b.components[0].appearanceId,
  });
  assert.equal(
    control.attributes["aria-label"],
    b.components[0].appearance.primitives[0].text,
  );
});

test("keyboard focus is visible on source bounds even when native button opacity is zero", () => {
  const css = readFileSync(
    new URL("../src/styles/raid.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /\.web-node\.has-raid-skin:focus-within\s*\{[^}]*outline:/);
});
