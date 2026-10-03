import test from "node:test";
import assert from "node:assert/strict";
import D from "../src/data.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import { BUILDS } from "../src/builds.js";
import { board, resources, fusedEntrant } from "../src/buildlab.js";
const ids = ["b_fort_native", "b_documents_heavy", "b_video_checkout"];
test("measured production-only alternatives can actually be loaded and fought in the lab", () => {
  for (const id of ids) {
    const b = BUILDS.find((b) => b.id === id);
    assert.ok(b, id);
    const r = R.newRun("lab", id);
    assert.equal(r.owned.length, b.layout.length);
    assert.ok(R.labEnemies().some((e) => e.id === id));
    assert.equal(resources(b.layout).legal, true);
    assert.ok(
      b.layout.every((row) => D.PARTS[row[0]].status !== "experimental"),
    );
  }
});
test("integrated examples show the real investment and preserve legal fusion input accounting", () => {
  for (const [id, cost, cpu] of [
    ["b_fort_native", 74, 32],
    ["b_documents_heavy", 75, 27],
    ["b_video_checkout", 74, 29],
  ]) {
    const b = BUILDS.find((b) => b.id === id);
    assert.ok(b, id);
    const r = resources(b.layout);
    assert.equal(r.acquisitionValue, cost);
    assert.equal(r.load, cpu);
    assert.ok(b.how.join(" ").includes("$" + cost));
    assert.ok(b.how.join(" ").includes("過負荷を避けるには"));
    assert.ok(b.weakness.length > 30);
    const f = fusedEntrant({ ...b, build: true });
    assert.equal(resources(f.entrant.layout).legal, true);
    assert.equal(resources(f.entrant.layout).acquisitionValue, cost);
  }
});
test("integrated document and media examples have actual support connections", () => {
  const d = BUILDS.find((b) => b.id === "b_documents_heavy");
  assert.ok(d);
  const a = E.analyze(board(d.layout, "doc"));
  for (const p of a.board.filter((p) => p.type === "gov_pdf"))
    assert.ok(Math.abs(a.mods[p.id].power - 2.1) < 1e-9);
  const v = BUILDS.find((b) => b.id === "b_video_checkout");
  assert.ok(v);
  const info = E.analyze(board(v.layout, "vid"));
  for (const p of info.board.filter((p) => p.type === "yt_embed"))
    assert.equal(info.mods[p.id].speed, 2);
});
