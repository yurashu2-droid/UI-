import test from "node:test";
import assert from "node:assert/strict";
import C from "../src/document.js";
import D from "../src/data.js";
import R from "../src/run.js";
import { RECIPES } from "../src/fusion.js";
import * as P from "../scripts/paid-target-benchmark.js";

const target = (id, layout) => ({
  id,
  name: id,
  build: true,
  admin: [],
  layout,
});
const links = target("small-links", [
  ["ab_link", 24, 24, 96, 24],
  ["ab_nav", 24, 48, 112, 24],
  ["ab_link", 24, 72, 96, 24],
  ["ab_nav", 24, 96, 112, 24],
]);
function verifyLedger(path) {
  const owned = new Map();
  const add = (type, n = 1) => {
    const q = (owned.get(type) ?? 0) + n;
    assert.ok(q >= 0);
    owned.set(type, q);
  };
  const compact = (entries) =>
    [...entries].filter(([, n]) => n).sort(([a], [b]) => a.localeCompare(b));
  for (const round of path.rounds) {
    const tx = path.transactions.filter((t) => t.round === round.round);
    for (const t of tx.filter((t) => t.kind === "buy")) {
      assert.ok(t.offered.includes(t.type));
      if (D.PARTS[t.type]) {
        assert.notEqual(D.PARTS[t.type].fused, true);
        add(t.type);
      }
    }
    const actual = new Map();
    for (const item of round.board)
      actual.set(item.type, (actual.get(item.type) ?? 0) + 1);
    assert.deepEqual(compact(actual), compact(owned));
    assert.ok(
      round.board
        .filter(C.placed)
        .every((p) => C.canPlace(round.board, p, p.x, p.y, p.w, p.h)),
    );
    for (const t of tx.filter(
      (t) => t.kind === "fusion" || t.kind === "loot",
    )) {
      if (t.kind === "fusion") {
        const recipe = RECIPES.find((r) => r.into === t.type);
        assert.deepEqual(t.from, [recipe.a, recipe.b]);
        assert.equal(t.inputIds.length, 2);
        const witnessed = R.fusionPairs(round.board, { pair: t.inputIds });
        assert.ok(
          witnessed.some((p) => p.recipe.into === t.type),
          "consumed pair actually fought adjacent",
        );
        assert.equal(typeof t.outputId, "string");
        for (const type of t.from) add(type, -1);
        add(t.type);
      } else {
        assert.ok(t.offered.includes(t.type));
        if (!t.type.startsWith("admin:")) add(t.type);
      }
    }
  }
  assert.equal(
    path.cash,
    10 + path.rewards - path.partSpend - path.serverSpend - path.rerollSpend,
  );
  assert.equal(path.blocked, null);
}

test("an arbitrary ordinary composition follows paid offers and records exact placed output completion", () => {
  assert.equal(typeof P.simulateCompositionPath, "function");
  const before = structuredClone(links);
  const path = P.simulateCompositionPath(102, links);
  verifyLedger(path);
  assert.deepEqual(links, before);
  assert.deepEqual(path, P.simulateCompositionPath(102, links));
  assert.equal(path.target.id, links.id);
  assert.ok(path.rounds.some((r) => r.targetLayoutComplete));
  assert.ok(
    path.rounds.every(
      (r) =>
        r.outputsTotal === links.layout.length &&
        r.outputsPlaced <= r.outputsOwned &&
        r.outputsOwned <= r.outputsTotal,
    ),
  );
});

test("general composition fusion uses actual adjacent inputs after a battle and does not count ingredients as outputs", () => {
  assert.equal(typeof P.simulateCompositionPath, "function");
  const goal = target("ticker-links", [
    ["ab_ticker", 24, 24, 200, 40],
    ["ab_link", 24, 64, 96, 24],
    ["ab_nav", 24, 88, 112, 24],
  ]);
  const paths = Array.from({ length: 8 }, (_, i) =>
    P.simulateCompositionPath(101 + i, goal),
  );
  for (const path of paths) verifyLedger(path);
  assert.ok(
    paths.some((p) =>
      p.transactions.some((t) => t.kind === "fusion" && t.type === "ab_ticker"),
    ),
  );
  assert.ok(
    paths.some((p) =>
      p.rounds.some(
        (r) =>
          r.targetFilled === r.targetTotal && r.outputsOwned < r.outputsTotal,
      ),
    ),
  );
  assert.ok(paths.some((p) => p.rounds.some((r) => r.targetLayoutComplete)));
});

test("paid arbitrary targets reject experimental, unknown, held and illegal layouts before starting a run", () => {
  assert.equal(typeof P.simulateCompositionPath, "function");
  for (const layout of [
    [],
    [["missing", 24, 24, 100, 40]],
    [["go_jobs", 24, 24, 280, 112]],
    [["ab_link", null, null, 96, 24]],
    [["ab_link", 24, 24, 1, 1]],
  ]) {
    assert.throws(
      () => P.simulateCompositionPath(101, target("invalid", layout)),
      /target/i,
    );
  }
});

test("the compact search/document example is loadable, paid-reachable and connects its real support effects", async () => {
  const { BUILDS } = await import("../src/builds.js");
  const { board, resources } = await import("../src/buildlab.js");
  const E = (await import("../src/engine.js")).default;
  const b = BUILDS.find((b) => b.id === "b_search_documents");
  assert.ok(
    b,
    "a reachable compact composition is exposed alongside ideal late-game examples",
  );
  assert.equal(resources(b.layout).acquisitionValue, 34);
  assert.equal(resources(b.layout).load, 11);
  const run = R.newRun("lab", b.id);
  assert.equal(run.owned.length, 5);
  assert.equal(b.labOpponent, false);
  assert.deepEqual(
    b.admin,
    [],
    "compact baseline does not grant showcase administrators",
  );
  assert.ok(!R.labEnemies().some((e) => e.id === b.id));
  const { SITE_TEMPLATES } = await import("../src/catalog/index.js");
  const original = [
    "retro",
    "gov",
    "google",
    "amazon",
    "youtube",
    "b_video",
    "b_cart",
    "b_text",
    "b_links",
    "b_fort",
    "b_echo",
    "b_fort_native",
    "b_documents_heavy",
    "b_video_checkout",
  ];
  assert.deepEqual(
    R.labEnemies().map((e) => e.id),
    [...original, ...SITE_TEMPLATES.filter((t) => t.labOpponent !== false).map((t) => t.id)],
  );
  const info = E.analyze(board(b.layout, "c"));
  for (const p of info.board.filter((p) =>
    ["gov_pdf", "go_instant"].includes(p.type),
  ))
    assert.equal(info.mods[p.id].power, 2.175);
  const path = P.simulateCompositionPath(115, { ...b, build: true });
  verifyLedger(path);
  assert.ok(path.rounds.some((r) => r.targetLayoutComplete));
  assert.ok(
    path.transactions.some(
      (t) => t.kind === "fusion" && t.type === "go_instant",
    ),
  );
  assert.match(b.how.join(" "), /\$34/);
  assert.match(b.weakness, /回復/);
});

test("legal omitted dimensions normalize once so exact completion uses actual native geometry", () => {
  const goal = target("native-link", [["ab_link", 24, 24]]);
  const path = P.simulateCompositionPath(101, goal);
  assert.ok(path.rounds.some((r) => r.targetLayoutComplete));
  assert.deepEqual(path.target.layout[0].slice(0, 5), [
    "ab_link",
    24,
    24,
    D.PARTS.ab_link.w,
    D.PARTS.ab_link.h,
  ]);
});

test("the compact report isolates layout changes at unchanged part cost, CPU and administrators", async () => {
  const { runReachableCounter } =
    await import("../scripts/reachable-counter-benchmark.js");
  const source = {
    id: "source-search",
    origin: "frozen-source",
    admin: ["server", "backup"],
    layout: [
      ["gov_font", 24, 0, 232, 36],
      ["go_tabs", 264, 0, 440, 36],
      ["gov_pdf", 264, 248, 336, 48],
      ["go_result", 24, 304, 576, 96],
      ["go_instant", 24, 40, 420, 124],
    ],
  };
  const report = runReachableCounter(201, 1, [source]);
  assert.ok(report.beforeRefinement);
  assert.equal(report.beforeRefinement.candidate.id, source.id);
  assert.equal(
    report.beforeRefinement.resources.acquisitionValue,
    report.resources.acquisitionValue,
  );
  assert.equal(report.beforeRefinement.resources.load, report.resources.load);
  assert.ok(
    report.beforeRefinement.resources.footprint > report.resources.footprint,
  );
  assert.deepEqual(report.beforeRefinement.candidate.admin, []);
  assert.equal(report.beforeRefinement.matches[0].forward.winner, "draw");
  assert.equal(report.matches[0].forward.winner, "a");
  assert.equal(report.summary.seatMismatches, 0);
});
