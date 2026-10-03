import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const modulePath = new URL("../server/arena/service.ts", import.meta.url);
test("online service implements durable server-owned asynchronous runs", async () => {
  assert.ok(
    existsSync(modulePath),
    "ArenaService must exist before online runs can be played",
  );
  const { ArenaService } = await import(modulePath.href);
  const dir = mkdtempSync(join(tmpdir(), "ui-raid-online-"));
  let service = new ArenaService({ filePath: join(dir, "arena.json") });
  try {
    const a = service.openSession();
    const b = service.openSession();
    assert.notEqual(a.token, b.token);
    assert.equal(a.view.run.cash, 10);
    assert.equal(a.view.run.lives, 3);
    assert.equal(a.view.run.stage, 0);
    assert.equal(a.view.online.roundLimit, 8);
    let seq = 0;
    function cmd(token, kind, extra = {}) {
      return service.command(token, {
        commandId: `test-${++seq}`,
        expectedRevision: service.view(token).revision,
        kind,
        ...extra,
      });
    }
    function prepare(token) {
      const view = service.view(token);
      const stock = view.run.shop.find(
        (s) => !s.sold && ["ab_heading", "ab_link", "ab_nav"].includes(s.type),
      );
      assert.ok(stock, "server shop has an affordable starting attacker");
      const bought = cmd(token, "purchase", { type: stock.type });
      const part = bought.run.owned.at(-1);
      cmd(token, "placement", {
        items: [{ id: part.id, x: 32, y: 24, w: part.w, h: part.h }],
      });
    }
    prepare(a.token);
    prepare(b.token);
    const cash = service.view(a.token).run.cash;
    const empty = cmd(a.token, "match");
    assert.equal(empty.outcome.code, "NO_OPPONENT");
    assert.equal(empty.run.cash, cash);
    assert.equal(empty.run.lives, 3);
    assert.equal(empty.run.stage, 0);
    assert.ok(empty.online.publishedSnapshotId);
    // A can now leave: no live session/presence is required for B's opponent.
    service.close();
    service = new ArenaService({ filePath: join(dir, "arena.json") });
    const started = cmd(b.token, "match");
    assert.equal(started.outcome.code, "MATCH_READY");
    assert.equal(
      started.match.opponent.ownerRunId,
      service.view(a.token).online.id,
    );
    assert.equal(started.match.opponent.source, "player");
    const matchId = started.match.id;
    const digest = started.match.replayHash;
    const repeated = cmd(b.token, "match");
    assert.equal(repeated.match.id, matchId);
    assert.equal(repeated.match.replayHash, digest);
    const beforeA = service.view(a.token);
    const beforeB = service.view(b.token);
    const settlement = {
      commandId: "settle-fixed",
      expectedRevision: beforeB.revision,
      kind: "settle",
      matchId,
    };
    const settled = service.command(b.token, settlement);
    const again = service.command(b.token, settlement);
    assert.equal(again.run.cash, settled.run.cash);
    assert.equal(again.run.lives, settled.run.lives);
    assert.deepEqual(
      service.view(a.token).run,
      beforeA.run,
      "ghost owner progression is untouched",
    );
    assert.equal(settled.run.history.length, 1);
    if (settled.run.phase === "reward") {
      const loot = settled.run.pending.loot[0];
      const claim = {
        commandId: "claim-fixed",
        expectedRevision: settled.revision,
        kind: "claim",
        choice: loot,
        matchId,
      };
      const claimed = service.command(b.token, claim);
      const replayClaim = service.command(b.token, claim);
      assert.equal(claimed.run.stage, 1);
      assert.deepEqual(replayClaim.run.owned, claimed.run.owned);
    } else assert.equal(settled.run.stage, 1);
    assert.throws(() => cmd(a.token, "settle", { matchId }), /MATCH_NOT_OWNED/);
    assert.throws(
      () => cmd(a.token, "purchase", { type: "yt_embed" }),
      /COMMAND_REJECTED/,
    );
    assert.throws(
      () =>
        cmd(a.token, "placement", {
          items: [{ id: "p999", x: 0, y: 0, w: 100, h: 30 }],
        }),
      /INVALID_PLACEMENT/,
    );
    assert.throws(
      () =>
        cmd(a.token, "placement", {
          items: [
            {
              id: service.view(a.token).run.owned[0].id,
              x: -1,
              y: 0,
              w: 100,
              h: 30,
            },
          ],
        }),
      /INVALID_PLACEMENT/,
    );
    assert.throws(
      () => cmd(a.token, "result", { winner: "player", income: 999999 }),
      /UNKNOWN_COMMAND/,
    );
    assert.throws(
      () =>
        service.command(a.token, {
          commandId: "stale",
          expectedRevision: 0,
          kind: "reroll",
        }),
      /STALE_REVISION/,
    );
    service.close();
    service = new ArenaService({ filePath: join(dir, "arena.json") });
    assert.equal(service.getMatch(b.token, matchId).replayHash, digest);
    assert.equal(service.view(b.token).run.history.length, 1);
  } finally {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("routing validation rejects self references atomically", async () => {
  const { ArenaService } = await import(modulePath.href);
  const dir = mkdtempSync(join(tmpdir(), "ui-raid-route-"));
  const service = new ArenaService({ filePath: join(dir, "arena.json") });
  try {
    const a = service.openSession();
    let seq = 0;
    const cmd = (kind, extra = {}) =>
      service.command(a.token, {
        commandId: `r${++seq}`,
        expectedRevision: service.view(a.token).revision,
        kind,
        ...extra,
      });
    const stock = a.view.run.shop.find((s) =>
      ["ab_heading", "ab_link", "ab_nav"].includes(s.type),
    );
    cmd("purchase", { type: stock.type });
    const p = service.view(a.token).run.owned[0],
      before = service.view(a.token);
    assert.throws(
      () =>
        cmd("placement", {
          items: [{ id: p.id, x: 32, y: 24, w: p.w, h: p.h, routeTo: p.id }],
        }),
      /INVALID_PLACEMENT/,
    );
    assert.deepEqual(service.view(a.token), before);
  } finally {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("match records both sides statistics and canonical gameplay input identity", async () => {
  const { ArenaService } = await import(modulePath.href);
  const dir = mkdtempSync(join(tmpdir(), "ui-raid-stats-"));
  const service = new ArenaService({ filePath: join(dir, "arena.json") });
  try {
    const sessions = [service.openSession(), service.openSession()];
    let seq = 0;
    const cmd = (a, kind, extra = {}) =>
      service.command(a.token, {
        commandId: `stat${++seq}`,
        expectedRevision: service.view(a.token).revision,
        kind,
        ...extra,
      });
    for (const a of sessions) {
      const stock = a.view.run.shop.find((s) =>
        ["ab_heading", "ab_link", "ab_nav"].includes(s.type),
      );
      cmd(a, "purchase", { type: stock.type });
      const p = service.view(a.token).run.owned[0];
      cmd(a, "placement", {
        items: [{ id: p.id, x: 32, y: 24, w: p.w, h: p.h }],
      });
      cmd(a, "publish");
    }
    const m = cmd(sessions[1], "match").match;
    assert.ok(
      m.statistics?.player && m.statistics?.enemy,
      "both participants need final statistics",
    );
    assert.equal(m.statistics.player.income, m.summary.rawIncome);
    assert.ok(Number.isFinite(m.statistics.enemy.hp));
    assert.equal(m.statistics.enemy.parts.length, m.opponent.items.length);
  } finally {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
