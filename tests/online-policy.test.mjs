import test from "node:test";
import assert from "node:assert/strict";
import * as service from "../server/arena/service.js";
import D from "../src/data.js";
import R from "../src/run.js";
test("online reward catalogue never admits experimental or fusion-only parts", () => {
  assert.equal(
    typeof service.onlineRewardPool,
    "function",
    "online loot must share explicit eligibility policy",
  );
  const run = R.newRun("campaign");
  for (let stage = 0; stage < 8; stage++) {
    run.stage = stage;
    const pool = service.onlineRewardPool(run);
    assert.ok(pool.length >= 3);
    for (const type of pool) {
      assert.notEqual(D.PARTS[type].status, "experimental");
      assert.ok(!D.PARTS[type].fused);
      assert.ok(D.PARTS[type].price <= R.priceCap(run) + 1);
    }
  }
});

test("changed online economy configuration cannot match a previous rules pool", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "arena-rules-")),
    filePath = join(dir, "store.json");
  let arena = new service.ArenaService({ filePath });
  let i = 0;
  const command = (s, kind, extra = {}) =>
    arena.command(s.token, {
      commandId: `config${++i}`,
      expectedRevision: arena.view(s.token).revision,
      kind,
      ...extra,
    });
  const prepare = (s) => {
    const type = s.view.run.shop.find((p) =>
      ["ab_link", "ab_nav"].includes(p.type),
    ).type;
    command(s, "purchase", { type });
    const p = arena.view(s.token).run.owned[0];
    command(s, "placement", {
      items: [{ id: p.id, x: 32, y: 24, w: p.w, h: p.h }],
    });
    command(s, "publish");
  };
  try {
    const a = arena.openSession();
    prepare(a);
    const old = arena.view(a.token).online.rulesVersion;
    arena.close();
    arena = new service.ArenaService({ filePath, rules: { startingCash: 20 } });
    assert.equal(
      arena.view(a.token).online.requiresNewRun,
      true,
      "old economy run is visibly incompatible",
    );
    assert.throws(() => command(a, "reroll"), /VERSION_MISMATCH/);
    const b = arena.openSession();
    prepare(b);
    assert.notEqual(
      b.view.online.rulesVersion,
      old,
      "economy changes require a distinct effective rules version",
    );
    assert.equal(command(b, "match").outcome.code, "NO_OPPONENT");
  } finally {
    arena.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
