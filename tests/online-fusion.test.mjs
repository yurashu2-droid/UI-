import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArenaService } from "../server/arena/service.js";
import R from "../src/run.js";

test("selected online fusion retains composition neighbours and does not fuse another available recipe", () => {
  const dir = mkdtempSync(join(tmpdir(), "arena-fusion-composition-")),
    filePath = join(dir, "store.json");
  let service = new ArenaService({ filePath });
  try {
    const player = service.openSession();
    service.close();
    // Isolated test-only legal mid-run checkpoint; production never imports browser ownership.
    const store = JSON.parse(readFileSync(filePath, "utf8")),
      run = R.newRun("campaign");
    run.stage = 5;
    run.wins = 3;
    run.cash = 50;
    run.shop = [
      "go_search",
      "am_quantity",
      "go_suggest",
      "gov_check",
      "gov_submit",
    ].map((type) => ({ type, sold: false }));
    for (const offer of run.shop)
      assert.equal(R.purchase(run, offer.type).ok, true);
    const [search, quantity, suggest, check, submit] = run.owned;
    assert.equal(R.move(run, search.id, 32, 32, 300, 64), true);
    assert.equal(R.move(run, quantity.id, 332, 32, 112, 64), true);
    assert.equal(R.move(run, suggest.id, 444, 32, 300, 64), true);
    assert.equal(R.move(run, check.id, 32, 200, 300, 44), true);
    assert.equal(R.move(run, submit.id, 32, 244, 300, 44), true);
    assert.equal(R.validateRun(run), true);
    assert.ok(
      R.fusionPairs(run.owned).some(
        (p) => p.a.id === search.id && p.b.id === suggest.id,
      ),
    );
    store.runs[player.view.online.id].state = run;
    writeFileSync(filePath, JSON.stringify(store));
    service = new ArenaService({ filePath });
    const next = service.command(player.token, {
      commandId: "choose-one-composite",
      expectedRevision: 0,
      kind: "fuse",
      a: search.id,
      b: suggest.id,
    });
    assert.equal(
      next.run.owned.filter((p) => p.type === "go_instant").length,
      1,
    );
    assert.ok(next.run.owned.some((p) => p.id === quantity.id));
    assert.ok(next.run.owned.some((p) => p.id === check.id));
    assert.ok(next.run.owned.some((p) => p.id === submit.id));
    assert.ok(
      !next.run.owned.some((p) => p.id === search.id || p.id === suggest.id),
    );
    assert.equal(R.validateRun(next.run), true);
  } finally {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("online player can choose the second competing recipe without consuming the first recipe partner", () => {
  const dir = mkdtempSync(join(tmpdir(), "arena-fusion-choice-")),
    filePath = join(dir, "store.json");
  let service = new ArenaService({ filePath });
  try {
    const player = service.openSession();
    service.close();
    const store = JSON.parse(readFileSync(filePath, "utf8")),
      run = R.newRun("campaign");
    run.stage = 5;
    run.wins = 3;
    run.cash = 50;
    run.shop = ["gov_check", "gov_submit", "go_voice"].map((type) => ({
      type,
      sold: false,
    }));
    for (const offer of run.shop)
      assert.equal(R.purchase(run, offer.type).ok, true);
    const [check, submit, voice] = run.owned;
    assert.equal(R.move(run, check.id, 32, 32, 284, 44), true);
    assert.equal(R.move(run, submit.id, 316, 32, 216, 44), true);
    assert.equal(R.move(run, voice.id, 32, 76, 100, 44), true);
    assert.equal(R.validateRun(run), true);
    store.runs[player.view.online.id].state = run;
    writeFileSync(filePath, JSON.stringify(store));
    service = new ArenaService({ filePath });
    const next = service.command(player.token, {
      commandId: "choose-second",
      expectedRevision: 0,
      kind: "fuse",
      a: check.id,
      b: voice.id,
    });
    assert.ok(next.run.owned.some((p) => p.type === "go_recaptcha"));
    assert.ok(next.run.owned.some((p) => p.id === submit.id));
    assert.ok(
      !next.run.owned.some((p) => p.id === check.id || p.id === voice.id),
    );
    assert.equal(R.validateRun(next.run), true);
  } finally {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
