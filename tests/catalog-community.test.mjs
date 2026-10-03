import test from "node:test";
import assert from "node:assert/strict";
import D from "../src/data.js";
import C from "../src/document.js";
import E from "../src/engine.js";
import V from "../src/components.js";
import { SITE_TEMPLATES } from "../src/catalog/index.js";

const ids = ["nc_player", "nc_comment", "nc_tag", "rd_post", "rd_vote", "rd_thread"];

test("community additions are canonical experiments with explicit video-only comment replay", () => {
  for (const id of ids) { assert.ok(D.PARTS[id], id); assert.equal(D.PARTS[id].status, "experimental"); }
  assert.deepEqual(D.PARTS.nc_comment.replayTags, ["video"]);
  assert.ok(D.PARTS.nc_player.tags.includes("video"));
  assert.equal(D.PARTS.rd_thread.container, true);
  assert.equal(D.PARTS.rd_vote.tags.includes("text"), false, "votes are not a second written contribution");
});

test("new video source retains native player composition, snapping and semantic support", () => {
  assert.ok(D.PARTS.nc_player);
  const player = C.makeItem("nc_player", "video", 32, 32, 560, 280);
  const seek = C.makeItem("yt_progress", "seek", 32, 312, 560, 22);
  const speed = C.makeItem("yt_speed", "speed", 32, 334, 104, 40);
  const comment = C.makeItem("nc_comment", "comment", 136, 334, 288, 40);
  const caption = C.makeItem("yt_caption", "caption", 424, 334, 88, 40);
  const notify = C.makeItem("yt_notify", "notify", 512, 334, 72, 40);
  const board = [player, seek, speed, comment, caption, notify];
  for (const p of board) assert.ok(C.canPlace(board, p, p.x, p.y));
  assert.equal(C.snap([player], C.makeItem("yt_progress", "new"), 33, 313).target, "video");
  const info = E.analyze(board);
  assert.ok(info.groups.some((g) => g.kind === "media-stack" && g.items.includes("video")));
  assert.equal(info.mods.video.speed, 2);
  assert.equal(info.mods.video.pierce, .25);
  assert.ok(info.mods.video.notes.some((n) => n.includes("シークバー")));
  assert.ok(info.mods.comment.speed < 2, "playback speed does not accelerate comment controller");
});

test("comments never replay a nearer earlier text attack instead of a video", () => {
  assert.ok(D.PARTS.nc_comment);
  const board = [C.makeItem("ab_link", "text", 400, 0, 192, 24), C.makeItem("nc_player", "video", 24, 24, 360, 180), C.makeItem("nc_comment", "comments", 400, 24, 360, 36)];
  const battle = new E.Battle(board, [C.makeItem("ab_link", "enemy", 24, 24)], { playerHp: 10000, enemyHp: 10000 });
  const echoes = [];
  for (let i = 0; i < 300; i++) echoes.push(...battle.step(.05).filter((e) => e.kind === "echo" && e.id === "comments"));
  assert.ok(echoes.length > 0);
  assert.ok(echoes.every((e) => e.to === "video"));
});

test("community templates are separate legal pages with original local-only UI", () => {
  for (const [id, name] of [["site_niconico", /ニコニコ風/], ["site_reddit", /Reddit風/]]) {
    const template = SITE_TEMPLATES.find((t) => t.id === id);
    assert.ok(template, id);
    assert.match(template.name, name);
    assert.ok(D.PRESETS[id]);
    const board = template.layout.map(([type, x, y, w, h], i) => C.makeItem(type, `${id}-${i}`, x, y, w, h));
    for (const p of board) assert.ok(C.canPlace(board, p, p.x, p.y), `${id}:${p.type}`);
    assert.ok(template.loot.every((type) => board.some((p) => p.type === type)));
  }
  for (const type of ids) {
    const p = C.makeItem(type, type, 0, 0); p.label = '<img src="https://bad.invalid/x" onerror="alert(1)">';
    const html = V.markup(p);
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /<iframe|<video[^>]+src=|<img|<script|onclick=/i);
  }
  assert.match(V.markup(C.makeItem("nc_player", "v", 0, 0)), /nico-comments/);
  assert.match(V.markup(C.makeItem("rd_thread", "t", 0, 0)), /container-slot/);
});

test('vote control declares native button sizing inside its smallest supported box (source contract)', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../src/styles/catalog.css', import.meta.url), 'utf8');
  const rule = css.match(/\.native-vote-column\s*>?\s*button\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(rule, /padding\s*:\s*0\s*[;}]/);
  assert.match(rule, /height\s*:\s*24px\s*[;}]/);
  assert.match(rule, /box-sizing\s*:\s*border-box\s*[;}]/);
});
