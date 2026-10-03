import test from "node:test";
import assert from "node:assert/strict";
import * as raid from "../src/raid/index.ts";

function element(tag, doc) {
  return {
    tagName: tag,
    ownerDocument: doc,
    style: {},
    dataset: {},
    children: [],
    textContent: "",
    attributes: {},
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    setAttribute(key, value) {
      this.attributes[key] = value;
    },
    set innerHTML(_) {
      throw new Error("untrusted markup sink used");
    },
  };
}
function host() {
  const doc = {
    createElement(tag) {
      return element(tag, doc);
    },
  };
  return element("div", doc);
}
const all = (node) => [node, ...node.children.flatMap(all)];

test("safe renderer paints source text literally and uses no imported markup", async () => {
  const b = await raid.createFixtureRaid("archive");
  const a = structuredClone(b.components[0].appearance);
  a.primitives[0].text = "<img src=x onerror=alert(1)>";
  const target = host();
  raid.renderRaidAppearance(target, a);
  assert.ok(
    all(target).some((n) => n.textContent === "<img src=x onerror=alert(1)>"),
    "source text must be rendered as text",
  );
  assert.equal(
    all(target).some((n) =>
      ["img", "script", "iframe", "style"].includes(n.tagName),
    ),
    false,
  );
});

test("safe renderer rejects arbitrary URL/CSS fields before touching the live host", async () => {
  const b = await raid.createFixtureRaid("archive");
  const bad = structuredClone(b.components[0].appearance);
  bad.background = "url(https://bad.example)";
  const target = host();
  const sentinel = element("sentinel", target.ownerDocument);
  target.append(sentinel);
  assert.throws(() => raid.renderRaidAppearance(target, bad), /外観データ/);
  assert.equal(target.children[0], sentinel);
});

test("reconstructed scene exposes exact component identity and canonical ability", async () => {
  const b = await raid.createFixtureRaid("commerce");
  const target = host();
  raid.renderRaidScene(target, b);
  const components = all(target).filter((n) => n.dataset.componentId);
  assert.equal(components.length, b.components.length);
  for (const c of b.components) {
    const el = components.find((n) => n.dataset.componentId === c.componentId);
    assert.equal(el.dataset.canonicalType, c.canonicalType);
    assert.equal(el.dataset.appearanceId, c.appearanceId);
    assert.equal(el.style.left, c.combatRect.x + "px");
  }
});
