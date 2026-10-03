import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import D from "../src/data.js";
import { ArenaService } from "../server/arena/service.js";

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "arena-owner-pool-"));
  const filePath = join(dir, "store.json");
  let service = new ArenaService({ filePath });
  let sequence = 0;
  const command = (guest, kind, extra = {}) => service.command(guest.token, {
    commandId: `pool-${++sequence}`,
    expectedRevision: service.view(guest.token).revision,
    kind,
    ...extra,
  });
  const guests = Array.from({ length: 3 }, () => service.openSession());
  for (const guest of guests) {
    const stock = guest.view.run.shop.find(s => D.PARTS[s.type].kind === "attack" && D.PARTS[s.type].price <= guest.view.run.cash);
    assert.ok(stock);
    const part = command(guest, "purchase", { type: stock.type }).run.owned[0];
    command(guest, "placement", { items: [{ id: part.id, x: 32, y: 24, w: part.w, h: part.h }] });
    command(guest, "publish");
  }
  const read = () => JSON.parse(readFileSync(filePath, "utf8"));
  const rewrite = (change = () => {}) => {
    service.close();
    const data = read();
    change(data);
    writeFileSync(filePath, JSON.stringify(data));
    service = new ArenaService({ filePath });
  };
  t.after(() => { service.close(); rmSync(dir, { recursive: true, force: true }); });
  return { guests, command, read, rewrite, view: guest => service.view(guest.token) };
}

function addHistoricalRun(data, guest, suffix, changes = {}) {
  // Explicitly test-only history fixture, cloned from a real paid/published build.
  // Production does not create players or import these checkpoints.
  const original = data.runs[guest.view.online.id];
  const id = `historical-${suffix}`;
  const snapshot = structuredClone(data.snapshots[original.publishedSnapshotId]);
  snapshot.id = `snapshot-${suffix}`;
  snapshot.ownerRunId = id;
  Object.assign(snapshot, changes);
  data.snapshots[snapshot.id] = snapshot;
  const run = structuredClone(original);
  run.id = id;
  run.state.phase = "complete";
  run.state.stage = run.rules.rounds;
  run.publishedSnapshotId = null;
  data.runs[id] = run;
  return snapshot;
}

function chooseLotteryEnd(t) {
  // Control only the lottery index, not candidates, ownership, simulation or storage.
  // The final eligible slot must remain reachable without probabilistic assertions.
  t.mock.method(crypto, "randomInt", max => max - 1);
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

test("one guest's historical runs cannot crowd another guest out of the candidate lottery", t => {
  const f = fixture(t);
  const [player, prolific, other] = f.guests;
  f.rewrite(data => {
    const now = Date.now();
    data.snapshots[data.runs[other.view.online.id].publishedSnapshotId].createdAt = now - 1000;
    data.snapshots[data.runs[prolific.view.online.id].publishedSnapshotId].createdAt = now;
    for (let i = 0; i < 25; i++) addHistoricalRun(data, prolific, `many-${i}`, { createdAt: now - i });
  });
  chooseLotteryEnd(t);
  const match = f.command(player, "match").match;
  assert.equal(match.opponent.ownerRunId, other.view.online.id,
    "another equally eligible owner must have a lottery slot after one owner publishes many runs");
});

test("recent opponent avoidance covers all historical runs owned by that guest", t => {
  const f = fixture(t);
  const [player, recent, other] = f.guests;
  f.rewrite(data => {
    data.runs[player.view.online.id].recentOpponents = [recent.view.online.id];
    addHistoricalRun(data, recent, "recent-owner");
    // The fresh owner is eligible but a weaker rating fit: owner-level recency wins.
    data.snapshots[data.runs[other.view.online.id].publishedSnapshotId].rating += 200;
  });
  const match = f.command(player, "match").match;
  assert.equal(match.opponent.ownerRunId, other.view.online.id);
});

test("recent owners remain available when no different eligible owner exists", t => {
  const f = fixture(t);
  const [player, recent, other] = f.guests;
  f.rewrite(data => {
    data.runs[player.view.online.id].recentOpponents = [recent.view.online.id];
    delete data.snapshots[data.runs[other.view.online.id].publishedSnapshotId];
    addHistoricalRun(data, recent, "fallback");
  });
  const result = f.command(player, "match");
  assert.equal(result.outcome.code, "MATCH_READY");
  const data = f.read();
  assert.equal(data.runs[result.match.opponent.ownerRunId].owner, data.runs[recent.view.online.id].owner);
});

test("a snapshot without its owning run cannot become a phantom eligible player", t => {
  const f = fixture(t);
  const [player, removed, other] = f.guests;
  f.rewrite(data => {
    delete data.runs[removed.view.online.id];
    delete data.snapshots[data.runs[other.view.online.id].publishedSnapshotId];
  });
  const before = f.view(player);
  const result = f.command(player, "match");
  assert.equal(result.outcome.code, "NO_OPPONENT");
  assert.equal(result.match, null);
  assert.equal(result.run.cash, before.run.cash);
  assert.equal(result.run.stage, before.run.stage);
  assert.equal(result.run.lives, before.run.lives);
});
