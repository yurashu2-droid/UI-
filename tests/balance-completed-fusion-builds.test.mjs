import test from "node:test";
import assert from "node:assert/strict";
let F;
try {
  F = await import("../scripts/completed-fusion-builds.js");
} catch {}
test("completed counter probes construct real onestop and oneclick recipes at their stated investment", () => {
  assert.equal(typeof F?.completedFusionBuilds, "function");
  const r = F.completedFusionBuilds();
  for (const [id, cost, load, n] of [
    ["six-onestop", 73, 19, 6],
    ["four-oneclick", 72, 21, 4],
  ]) {
    const p = r.find((r) => r.entrant.id === id);
    assert.ok(p);
    assert.equal(p.resources.acquisitionValue, cost);
    assert.equal(p.resources.load, load);
    assert.equal(p.recipes.length, n);
    assert.equal(p.resources.legal, true);
    assert.equal(p.donorResources.acquisitionValue, cost);
  }
});
test("native link defense uses ordinary font controls and real neighboring attack text", () => {
  assert.equal(typeof F?.completedFusionBuilds, "function");
  const p = F.completedFusionBuilds().find(
    (r) => r.entrant.id === "native-link-defense",
  );
  assert.equal(p.resources.acquisitionValue, 74);
  assert.equal(p.resources.load, 24);
  assert.ok(
    p.entrant.layout
      .filter((r) => r[0] === "gov_font")
      .every((r) => r[4] === 36),
  );
  assert.equal(p.recipes.length, 0);
  assert.equal(p.resources.legal, true);
  assert.ok(p.separatorNeighbors.every((r) => r.attackText.length === 2));
});
