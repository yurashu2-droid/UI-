import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parseFragment } from "parse5";
import C from "../src/document.js";
import D from "../src/data.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import V from "../src/components.js";
import { Editor } from "../src/editor.js";
import Effects from "../src/effects.js";
import { createRunPersistence } from "../src/persistence.js";

const types = ["yt_play", "yt_embed"];
// Original empty-label native markup, captured before this render-only correction.
const defaults = {
  yt_play: ["THE INTERNET<br>IS STILL YOURS.", "9b726faf172f22f297648c854d3853ec092339f71e0b5bc6d54f5b9826be374a"],
  yt_embed: ["ONE PLAYER,<br>EVERY PAGE.", "2ccae9a819810b3e5c90467d00ea56abf2deea72bfd383f45a42e7bc52f738a0"],
};
const walk = node => [node, ...(node.childNodes ?? []).flatMap(walk)];
const nodeText = node => node?.nodeName === "#text" ? node.value : (node?.childNodes ?? []).map(nodeText).join("");
const attr = (node, name) => node?.attrs?.find(a => a.name === name)?.value;
const hasClass = (node, name) => (attr(node, "class") ?? "").split(/\s+/).includes(name);
function titleIn(html) {
  const copy = walk(parseFragment(html)).find(node => hasClass(node, "video-copy"));
  return copy?.childNodes.find(node => node.tagName === "strong");
}

// DOM boundary adapter only: actual Components.render/Editor/Effects code runs.
// Selectors and text mutations are adapted; no pixels or browser clicks are claimed.
class NativeHost {
  constructor(document, tag) {
    Object.assign(this, { ownerDocument: document, tagName: tag.toUpperCase(),
      children: [], dataset: {}, attrs: {}, className: "", tabIndex: -1, vars: new Map() });
    this.style = { setProperty: (key, value) => this.vars.set(key, value) };
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => names.forEach(name => this.classList.toggle(name, true)),
      remove: (...names) => names.forEach(name => this.classList.toggle(name, false)),
      toggle: (name, force) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        const on = force ?? !names.has(name);
        if (on) names.add(name); else names.delete(name);
        this.className = [...names].join(" ");
        return on;
      },
    };
  }
  setAttribute(name, value) {
    this.attrs[name] = String(value);
    if (name === "class") this.className = value;
    if (name.startsWith("data-")) this.dataset[name.slice(5)] = value;
  }
  getAttribute(name) { return name === "class" ? this.className : this.attrs[name] ?? null; }
  append(...children) { children.forEach(child => { child.parentElement = this; this.children.push(child); }); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  set textContent(value) { this.children = [{ textContent: value }]; }
  get textContent() { return this.children.map(child => child.textContent).join(""); }
  set innerHTML(html) {
    const convert = node => {
      if (node.nodeName === "#text") return { textContent: node.value };
      const el = this.ownerDocument.createElement(node.tagName);
      for (const a of node.attrs ?? []) el.setAttribute(a.name, a.value);
      el.append(...(node.childNodes ?? []).map(convert));
      return el;
    };
    this.replaceChildren(...parseFragment(html).childNodes.map(convert));
  }
  matches(selector) {
    return selector.split(",").some(value => {
      const simple = value.trim().replace(/^:scope > /, "");
      if (simple.startsWith(".")) return this.classList.contains(simple.slice(1));
      return this.tagName === simple.toUpperCase();
    });
  }
  querySelectorAll(selector) {
    return this.children.filter(child => child instanceof NativeHost).flatMap(child => [
      ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

function withDocument(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const document = { createElement(tag) { return new NativeHost(this, tag); },
    addEventListener() {}, querySelector() { return null; } };
  globalThis.document = document;
  t.after(() => previous ? Object.defineProperty(globalThis, "document", previous) : delete globalThis.document);
  return document;
}

function videoRun(type) {
  const run = R.newRun("lab");
  run.owned = [R.nextItem(run, "yt_play", 24, 24, 240, 144)];
  if (type === "yt_embed") {
    const first = run.owned[0];
    first.appearanceId = "appearance_" + "a".repeat(64);
    first.provenanceId = "capture_" + "b".repeat(64);
    run.owned.push(R.nextItem(run, "yt_progress", 24, 168, 240, 20));
    assert.equal(R.fuse(run).length, 1);
    assert.equal(run.owned[0].type, type);
  }
  assert.equal(R.validateRun(run), true);
  return run;
}

for (const type of types) {
  test(`${type} keeps byte-identical empty-label artwork and blank fallback`, () => {
    const p = C.makeItem(type, "p1", 24, 24), html = V.markup(p);
    assert.equal(createHash("sha256").update(html).digest("hex"), defaults[type][1]);
    assert.ok(html.includes(`<strong>${defaults[type][0]}</strong>`));
    for (const label of ["", " \t\n "]) assert.equal(V.markup({ ...p, label }), html);
  });

  test(`${type} renders full escaped edited titles without changing native controls`, () => {
    const p = C.makeItem(type, "p1", 24, 24), blank = V.markup(p);
    const outsideCopy = html => html.replace(/<div class="video-copy[^]*?<\/div>/, "");
    for (const label of ["My edited film", `<img src=x onerror="bad()"> & 'film'`, "長".repeat(80), "😀".repeat(40), "  My film  "]) {
      assert.ok(label.length <= 80);
      const html = V.markup({ ...p, label }), title = titleIn(html);
      assert.equal(nodeText(title), label, "edited display text is visible in the native title");
      assert.equal(attr(title, "title"), label, "the full title remains available when visually clamped");
      assert.ok(walk(parseFragment(html)).some(node => hasClass(node, "has-custom-title")));
      assert.equal(outsideCopy(html), outsideCopy(blank), "play/time/seek/caption/artwork hooks remain unchanged");
      assert.equal(walk(parseFragment(html)).some(node => ["img", "script", "iframe"].includes(node.tagName)), false);
      assert.equal(walk(parseFragment(html)).some(node => node.attrs?.some(a => a.name.startsWith("on"))), false);
    }
  });

  test(`${type} actual Editor.update persists and renders titles through undo, redo, reload and clear`, t => {
    const document = withDocument(t), host = document.createElement("div"), run = videoRun(type);
    const itemId = run.owned[0].id, baseline = structuredClone(run), storage = new Map();
    const persistence = createRunPersistence({ getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value) }, "video-v3-");
    let changes = 0;
    const editor = new Editor({ getRun: () => run, getHost: () => host, getOverlay: () => null,
      enabled: () => true, onChange() { changes++; assert.equal(persistence.save(run).ok, true); V.render(host, run.owned); },
      onSelect() {}, onToast() {}, paint() {} });
    const title = () => host.querySelector(".video-copy").querySelector("strong");
    V.render(host, run.owned);
    editor.selection.add(itemId);
    const label = "資料".repeat(39) + "甲A";
    editor.update({ label });
    assert.equal(changes, 1);
    assert.equal(title().textContent, label);
    assert.equal(title().getAttribute("title"), label);
    assert.deepEqual(run, { ...baseline, owned: baseline.owned.map(item => ({ ...item, label })) });
    const loaded = persistence.load("lab");
    assert.equal(loaded.status, "loaded");
    assert.deepEqual(loaded.run, run);
    V.render(host, loaded.run.owned, { interactive: true });
    assert.equal(title().textContent, label);
    assert.equal(host.querySelector(".video-play").tabIndex, 0);
    editor.undo();
    assert.deepEqual(run, baseline);
    assert.equal(title().textContent, defaults[type][0].replace("<br>", ""));
    editor.redo();
    assert.equal(title().textContent, label);
    editor.selection.add(itemId);
    const beforeRejected = structuredClone(run);
    editor.update({ label: "x".repeat(81) });
    assert.deepEqual(run, beforeRejected);
    assert.equal(changes, 3);
    editor.update({ label: "" });
    assert.equal(title().textContent, defaults[type][0].replace("<br>", ""));
    editor.update({ label: "   " });
    assert.equal(run.owned[0].label, "   ", "fallback must not normalize the save");
    assert.equal(title().textContent, defaults[type][0].replace("<br>", ""));
    assert.deepEqual(run.owned[0].lineage, baseline.owned[0].lineage);
  });

  test(`${type} repeated real Effects updates keep title while time, seek and captions stay live`, t => {
    const document = withDocument(t), host = document.createElement("div"), p = C.makeItem(type, "p1", 24, 24, 240, 144);
    p.label = "Runtime <film> & credits";
    const board = [p, C.makeItem("yt_caption", "p2", 24, 188), C.makeItem("yt_progress", "p3", 24, 168, 240, 20)];
    V.render(host, board, { interactive: true });
    const part = id => host.querySelectorAll(".web-node").find(el => el.dataset.id === id);
    const frame = document.createElement("div");
    document.querySelector = selector => selector === "#player-frame" ? frame : null;
    const battle = new E.Battle(board, [], { playerHp: 10000, enemyHp: 10000, playerCapacity: 99 });
    const fx = Object.create(Effects.prototype), flags = [];
    Object.assign(fx, { part: (_side, id) => part(id), renderLog() {}, flag: (...args) => flags.push(args) });
    fx.act(part(p.id), type);
    assert.deepEqual(flags.map(([, flag, duration]) => [flag, duration]), [["is-playing", 1500]]);
    for (let i = 0; i < 2; i++) {
      for (let tick = 0; tick < 65; tick++) battle.step(.05);
      const before = structuredClone({ ticks: battle.ticks, parts: battle.player.parts, metrics: battle.metrics, states: battle.states });
      fx.update(battle); fx.update(battle);
      assert.equal(part(p.id).querySelector("strong").textContent, p.label);
      assert.equal(part(p.id).querySelector("strong").getAttribute("title"), p.label);
      assert.ok(part(p.id).querySelector(".video-caption").textContent.length > 0);
      if (type === "yt_play") assert.equal(part(p.id).querySelector(".video-time").textContent, `0:0${Math.floor(battle.elapsed)}`);
      else assert.ok(part(p.id).querySelector(".embed-seek"));
      assert.equal(part("p3").vars.get("--seek"), String((battle.elapsed % 8) / 8));
      assert.deepEqual({ ticks: battle.ticks, parts: battle.player.parts, metrics: battle.metrics, states: battle.states }, before);
    }
  });
}

test("custom video titles have bounded two-line geometry without altering default or acquired appearance visibility (source-only)", () => {
  const file = new URL("../src/styles/video-titles.css", import.meta.url);
  assert.ok(existsSync(file), "custom title containment stylesheet exists");
  const css = readFileSync(file, "utf8");
  const rule = selector => css.slice(css.indexOf(selector) + selector.length).match(/^\s*\{([^}]+)\}/)?.[1] ?? "";
  const copy = rule(".native-video .video-copy.has-custom-title"), title = rule(".native-video .video-copy.has-custom-title strong");
  const compactCopy = rule(".compact-ui .native-video .video-copy.has-custom-title"), compactTitle = rule(".compact-ui .native-video .video-copy.has-custom-title strong");
  assert.match(copy, /right:\s*calc\(22% \+ 70px\)/);
  assert.match(copy, /top:\s*min\(36%, calc\(100% - 140px\)\)/);
  assert.match(title, /-webkit-line-clamp:\s*2/);
  assert.match(title, /overflow:\s*hidden/);
  assert.match(title, /overflow-wrap:\s*anywhere/);
  assert.match(title, /max-width:\s*100%/);
  assert.match(title, /max-height:\s*56px/);
  assert.match(title, /line-height:\s*28px/);
  assert.match(compactCopy, /right:\s*calc\(12% \+ 47px\)/);
  assert.match(compactCopy, /top:\s*min\(34%, calc\(100% - 104px\)\)/);
  assert.match(compactTitle, /line-height:\s*20px/);
  assert.match(compactTitle, /max-height:\s*40px/);
  for (const selector of css.replace(/\/\*[^]*?\*\//g, "").matchAll(/([^{}]+)\{/g)) assert.ok(selector[1].includes(".has-custom-title"));
  assert.doesNotMatch(css, /visibility\s*:|pointer-events\s*:|z-index\s*:|@import|url\(/);
  for (const [w, h] of [[240, 144], [240, 200], [360, 200], [560, 280], [560, 300]]) {
    const compact = w < 360 || h < 200;
    const textRight = w - (compact ? w * .12 + 47 : w * .22 + 70);
    const playLeft = w - (compact ? w * .12 + 35 : w * .22 + 54);
    const copyTop = compact ? Math.min(h * .34, h - 104) : Math.min(h * .36, h - 140);
    const copyBottom = copyTop + (compact ? 8 + 6 + 40 : 10 + 10 + 56);
    const captionTop = h - (compact ? 29 + 13.5 : 41 + 18);
    assert.ok(textRight <= playLeft - (compact ? 12 : 16));
    assert.ok(copyBottom < captionTop, `${w}×${h}: source title budget leaves the caption lane`);
    assert.ok(textRight > (compact ? 16 : 26));
  }
  for (const type of types) assert.deepEqual([D.PARTS[type].minW, D.PARTS[type].minH], [240, 144]);
});
