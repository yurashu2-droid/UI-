import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import D from "../src/data.js";
import E from "../src/engine.js";
import R from "../src/run.js";
import { BUILDS } from "../src/builds.js";
import { board, resources } from "../src/buildlab.js";
import { runReachableCounter } from "../scripts/reachable-counter-benchmark.js";
import { assessCandidate, duel } from "../scripts/open-build-search.js";

// A missing fixture or any drift in its exact frozen geometries/administrators
// must fail without requiring the ignored original search report in a fresh clone.
test("the portable shortlist preserves all twelve frozen legal candidate definitions", () => {
  const file = new URL(
    "../fixtures/balance/reachable-finalists.json",
    import.meta.url,
  );
  assert.ok(
    existsSync(file),
    "the exact comparison shortlist ships with the repository",
  );
  const fixture = JSON.parse(readFileSync(file, "utf8"));
  const candidates = fixture.finalists.map((f) => f.candidate);
  assert.equal(candidates.length, 12);
  assert.equal(new Set(candidates.map((c) => c.id)).size, 12);
  assert.equal(
    createHash("sha256").update(JSON.stringify(candidates)).digest("hex"),
    "feb7a98900e2b764fddfd5584f7d2c82a6ba4072cb578522c561777e282d7cfb",
    "exact ordered candidate definitions from the frozen source report",
  );
  assert.equal(
    fixture.provenance.sourceReportSha256,
    "a9959d17d655a78f41ca27db4f647badc082425125fd63d0e799f71dbccf873c",
  );
  assert.equal(fixture.provenance.seed, 303);
  assert.equal(fixture.provenance.rulesVersion, "combat-v4");
  assert.deepEqual(fixture.limits, {
    budget: 40,
    capacity: 17,
    hp: 300,
    adminSlots: 2,
    footprint: 652800,
    productionOnly: true,
    maxLoad: 17,
  });
  for (const candidate of candidates) {
    assert.ok(assessCandidate(candidate, fixture.limits).legal);
    assert.ok(
      assessCandidate(
        { ...candidate, admin: [] },
        { ...fixture.limits, adminSlots: 0 },
      ).legal,
    );
  }
});

// These assertions fail if the player example disappears, silently receives free
// admins, enters the numeric enemy list, or its real directional replay breaks.
test("the ordinary navigation example is player-only and its marquee actually replays across the gap", () => {
  const build = BUILDS.find((b) => b.id === "b_navigation_replay");
  assert.ok(build, "a paid ordinary navigation example is available");
  assert.deepEqual(build.admin, []);
  assert.equal(build.labOpponent, false);
  assert.equal(R.labEnemies().length, 35);
  assert.ok(!R.labEnemies().some((b) => b.id === build.id));
  assert.equal(R.newRun("lab", build.id).owned.length, 8);
  assert.equal(resources(build.layout).acquisitionValue, 28);
  assert.equal(resources(build.layout).load, 9);
  assert.ok(build.layout.every(([type]) => !D.PARTS[type].fused));
  assert.match(build.how.join(" "), /\$28/);
  const items = board(build.layout, "nav");
  const info = E.analyze(items);
  const marquee = items.find((p) => p.type === "ab_marquee");
  assert.deepEqual(
    info.near[marquee.id],
    [],
    "this is directional replay, not adjacency",
  );
  assert.deepEqual(info.groups.map((g) => g.kind).sort(), [
    "nav-menu",
    "nav-row",
  ]);
  const search = BUILDS.find((b) => b.id === "b_search_documents");
  const battle = new E.Battle(items, board(search.layout, "search"), {
    playerHp: 300,
    enemyHp: 300,
    playerCapacity: 17,
    enemyCapacity: 17,
  });
  const echoes = [];
  while (!battle.result)
    echoes.push(
      ...battle
        .step(0.05)
        .filter((e) => e.kind === "echo" && e.side === "player"),
    );
  assert.equal(battle.result.winner, "player");
  assert.equal(battle.metrics.player.replays, 3);
  assert.equal(echoes.length, 3);
  assert.ok(echoes.every((e) => e.id === marquee.id && e.to === "nav0"));
});

// Changing target selection to the previous compact default would violate both
// geometry and paid-route evidence; a finished target never stands in for its inventory.
test("the existing report selects navigation and records its real round-four paid witness", () => {
  const report = runReachableCounter(110, 1, [], "navigation");
  assert.equal(report.target.id, "b_navigation_replay");
  assert.equal(report.summary.exactTargetLayouts, 1);
  const witness = report.completions[0];
  assert.deepEqual(
    [
      witness.round,
      witness.partSpend,
      witness.serverSpend,
      witness.rerollSpend,
    ],
    [4, 30, 0, 6],
  );
  assert.deepEqual(
    [witness.inventorySize, witness.load, witness.capacity],
    [9, 12, 12],
  );
  assert.deepEqual(witness.actualAdmin, ["cdn"]);
  assert.equal(
    report.rows[0].transactions.some((t) => t.kind === "fusion"),
    false,
  );
  assert.equal(
    report.rows[0].cash,
    10 +
      report.rows[0].rewards -
      report.rows[0].partSpend -
      report.rows[0].serverSpend -
      report.rows[0].rerollSpend,
  );
});

test("fixed link-defense evidence distinguishes a paid partial subset from the more expensive whole board", () => {
  const defense = runReachableCounter(124, 1, [], "link-defense");
  const navigation = runReachableCounter(110, 1, [], "navigation");
  assert.equal(defense.resources.acquisitionValue, 40);
  assert.equal(defense.resources.load, 14);
  assert.equal(defense.summary.exactTargetLayouts, 0);
  const reached = defense.rows[0].rounds.find((r) => r.outputsOwned === 11);
  assert.equal(reached.round, 6);
  assert.deepEqual(reached.missing, [{ type: "ab_link", count: 1 }]);
  const actual = {
    id: "actual-paid-board",
    origin: "paid-witness",
    admin: [],
    layout: reached.board.map((p) => [p.type, p.x, p.y, p.w, p.h]),
  };
  const subset = {
    id: "actual-target-subset",
    origin: "paid-witness",
    admin: [],
    layout: defense.target.layout.filter(([type, x, y, w, h]) =>
      reached.board.some(
        (p) =>
          p.type === type && p.x === x && p.y === y && p.w === w && p.h === h,
      ),
    ),
  };
  assert.deepEqual(
    [resources(actual.layout).acquisitionValue, resources(actual.layout).load],
    [43, 15],
  );
  assert.deepEqual(
    [resources(subset.layout).acquisitionValue, resources(subset.layout).load],
    [37, 13],
  );
  const opponent = { ...navigation.target, origin: "navigation" };
  assert.equal(duel(subset, opponent, defense.conditions).winner, "a");
  assert.equal(duel(opponent, subset, defense.conditions).winner, "b");
});

test("removing directional replay is a separately reported cheaper target with a narrower search win", () => {
  const compact = BUILDS.find((b) => b.id === "b_search_documents");
  const opponent = { ...compact, origin: "compact" };
  const full = runReachableCounter(110, 1, [opponent], "navigation");
  const cheaper = runReachableCounter(
    110,
    1,
    [opponent],
    "navigation-no-marquee",
  );
  assert.deepEqual(
    [cheaper.resources.acquisitionValue, cheaper.resources.load],
    [21, 7],
  );
  assert.equal(
    cheaper.target.layout.some(([type]) => type === "ab_marquee"),
    false,
  );
  assert.equal(cheaper.matches[0].forward.winner, "a");
  assert.equal(full.matches[0].forward.winner, "a");
  assert.ok(cheaper.matches[0].forward.hpA < full.matches[0].forward.hpA);
  assert.equal(cheaper.summary.seatMismatches, 0);
  const navigation = { ...full.target, origin: "navigation" };
  const higherHp = { ...full.conditions, hp: 440 };
  assert.equal(duel(navigation, opponent, higherHp).winner, "b");
  assert.equal(duel(opponent, navigation, higherHp).winner, "a");
});
