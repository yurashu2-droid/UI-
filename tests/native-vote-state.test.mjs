import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import C from "../src/document.js";
import Editor from "../src/editor.js";
import V from "../src/components.js";
import Effects from "../src/effects.js";
import { previewCatalogueAction } from "../src/catalog/preview.js";
import { ElementAdapter } from "./support/raid-dom-adapter.mjs";

// Node DOM substitution only: production markup and the exact application
// handler, not browser keyboard, pixels, or assistive-technology acceptance.
// Removing either initial pressed state must fail before any preview click.
const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const start = source.indexOf("function previewAction(e: MouseEvent)");
const end = source.indexOf("\n/* ---------- Events ---------- */", start);
assert.ok(start >= 0 && end > start);
const handlerCode = transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code;

function fixture(t, labels = ["質問", "回答"]) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const document = {
    createElement(tag) { return new ElementAdapter(this, tag); },
    querySelector(selector) { return selector === "#effect-layer" ? layer : null; },
  };
  const layer = document.createElement("div");
  const prior = new Map(["document", "matchMedia"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  Object.defineProperty(globalThis, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
  t.after(() => {
    for (const [key, descriptor] of prior)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  });
  const fx = new Effects(), paper = document.createElement("div");
  paper.className = "browser-paper";
  const votes = labels.map((label, i) => {
    const item = C.makeItem("rd_vote", `vote-${i}`, 24 + i * 64, 24);
    assert.equal(Editor.patchItem([item], item.id, { label }), true);
    const node = V.create(item), up = node.querySelector('[data-ui="vote-up"]'), down = node.querySelector('[data-ui="vote-down"]');
    paper.append(node);
    return { item, node, up, down, score: node.querySelector(".vote-score"), label: node.querySelector("small") };
  });
  const click = (target, { preview = true, battle = null } = {}) => {
    const handler = new Function("Element", "preview", "battle", "storyActive", "storySession", "fx", "previewCatalogueAction", `${handlerCode}; return previewAction;`)(
      ElementAdapter, preview, battle, false, null, fx, previewCatalogueAction,
    );
    handler({ target, preventDefault() { throw new Error("vote buttons must not navigate"); } });
  };
  return { document, votes, fx, click };
}

test("both native vote buttons declare an unselected toggle state before interaction", t => {
  const labels = ["", "質問", "回答", '<img src=x onerror="bad()"> & 投票', "  投票\nの見本  "];
  const f = fixture(t, labels);
  for (const [i, vote] of f.votes.entries()) {
    for (const [button, action, name, glyph] of [
      [vote.up, "vote-up", "投稿に賛成する", "⇧"],
      [vote.down, "vote-down", "投稿に反対する", "⇩"],
    ]) {
      assert.equal(button.tagName, "BUTTON");
      assert.equal(button.getAttribute("type"), "button");
      assert.equal(button.getAttribute("data-ui"), action);
      assert.equal(button.getAttribute("aria-label"), name);
      assert.equal(button.getAttribute("aria-pressed"), "false", `${action} starts explicitly unselected`);
      assert.equal(button.textContent, glyph);
    }
    assert.equal(vote.score.textContent, "128");
    assert.equal(vote.label.textContent, labels[i] || "vote");
    assert.equal(vote.node.querySelector("img,script,iframe"), null);
  }
});

test("real vote preview selects, switches and clears one column while preserving native controls", async t => {
  const f = fixture(t), [first, second] = f.votes;
  const saved = structuredClone(f.votes.map(vote => vote.item));
  const children = [...first.node.querySelector(".native-vote-column").children];
  let received = 0;
  first.up.addEventListener("custom-native-event", () => { received++; });
  for (const [button, up, down, score] of [
    [first.up, true, false, 129],
    [first.down, false, true, 127],
    [first.down, false, false, 128],
    [first.up, true, false, 129],
    [first.up, false, false, 128],
  ]) {
    f.click(button);
    assert.equal(first.up.getAttribute("aria-pressed"), String(up));
    assert.equal(first.down.getAttribute("aria-pressed"), String(down));
    assert.equal(first.score.textContent, String(score));
    assert.equal(first.label.textContent, "質問");
    assert.deepEqual(first.node.querySelector(".native-vote-column").children, children);
    assert.equal(second.up.getAttribute("aria-pressed"), "false");
    assert.equal(second.down.getAttribute("aria-pressed"), "false");
    assert.equal(second.score.textContent, "128");
    t.mock.timers.tick(520);
  }
  f.click(second.down);
  assert.equal(second.down.getAttribute("aria-pressed"), "true");
  assert.equal(second.score.textContent, "127");
  assert.equal(first.score.textContent, "128");
  await first.up.dispatch("custom-native-event");
  assert.equal(received, 1);
  assert.deepEqual(f.votes.map(vote => vote.item), saved);
});

test("vote preview preserves edit, battle and disabled-control gates", t => {
  const f = fixture(t), vote = f.votes[0];
  const snapshot = () => ({ up: [...vote.up.attrs], down: [...vote.down.attrs], text: vote.node.textContent, classes: vote.node.className });
  const before = snapshot();
  f.click(vote.up, { preview: false });
  assert.deepEqual(snapshot(), before);
  f.click(vote.up, { battle: Object.freeze({ ticks: 8 }) });
  assert.deepEqual(snapshot(), before);
  vote.up.disabled = true;
  f.click(vote.up);
  assert.deepEqual(snapshot(), before);
});

test("fresh vote markup retains repeated one-way native battle feedback", t => {
  const f = fixture(t), vote = f.votes[0], saved = structuredClone(vote.item);
  const children = [...vote.node.querySelector(".native-vote-column").children];
  for (let repeat = 0; repeat < 2; repeat++) {
    f.fx.act(vote.node, "rd_vote");
    assert.equal(vote.up.getAttribute("aria-pressed"), "true");
    assert.equal(vote.down.getAttribute("aria-pressed"), "false");
    assert.equal(vote.score.textContent, "128", "act preserves the separate combat-counter update");
    assert.equal(vote.label.textContent, "質問");
    assert.deepEqual(vote.node.querySelector(".native-vote-column").children, children);
  }
  assert.deepEqual(vote.item, saved);
});

test("the battle renderer clears local vote selection before native combat feedback", t => {
  const f = fixture(t), vote = f.votes[0], saved = structuredClone(vote.item);
  f.click(vote.down);
  assert.equal(vote.down.getAttribute("aria-pressed"), "true");
  assert.equal(vote.score.textContent, "127");
  const host = f.document.createElement("div");
  host.append(vote.node);
  V.render(host, [vote.item], { side: "player", theme: "qanda", interactive: false });
  const battleNode = host.querySelector(".web-node");
  const up = battleNode.querySelector('[data-ui="vote-up"]'), down = battleNode.querySelector('[data-ui="vote-down"]');
  assert.notEqual(battleNode, vote.node);
  assert.equal(up.getAttribute("aria-pressed"), "false");
  assert.equal(down.getAttribute("aria-pressed"), "false");
  assert.equal(battleNode.querySelector(".vote-score").textContent, "128");
  assert.equal(up.tabIndex, -1);
  assert.equal(down.tabIndex, -1);
  f.fx.act(battleNode, "rd_vote");
  assert.equal(up.getAttribute("aria-pressed"), "true");
  assert.equal(down.getAttribute("aria-pressed"), "false");
  assert.deepEqual(vote.item, saved);
});
