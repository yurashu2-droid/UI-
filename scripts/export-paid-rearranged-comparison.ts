/** Node-only deterministic projection of the unchanged public API replay. No import-time writes. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replayPaidRearrangedRoute } from "./paid-rearranged-counter-witness.js";
import { arenaCatalogDefinition } from "../src/online/catalog.js";
import route from "../fixtures/balance/paid-rearranged-counter-route.json";
import opponents from "../fixtures/balance/paid-counter-opponents.json";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const pins = {
  original: "67038ae40eaa04b6c6500cd2032efb6e901cd153f0342c072173ae7e002e125f",
  rearranged:
    "4425ad75cf0aae3ba341f339109047e23302f5051355b1cbb2e2e9b9fe15529e",
  sequence: "9ea3f00f9edb095147d7807bf27575dda0d1fe472e4540428cf78870f95a35cb",
  catalog: "5ae7f15b99800961281723849d5c74b681c7cff3b6f4d92879f9be6323db6ece",
  opponents: "aca70950375815010add344e85f9b2a51009e642bda187760134ee8f13cd12a5",
};

export function exportPaidRearrangedComparison() {
  const replay = replayPaidRearrangedRoute();
  assert.equal(hash(replay.acquiredRun), pins.original);
  assert.equal(hash(replay.finalRun), pins.rearranged);
  assert.equal(route.actions.at(-1)![2], pins.original);
  assert.equal(route.rearrangement.at(-1)![2], pins.rearranged);
  assert.equal(hash([route.actions, route.rearrangement]), pins.sequence);
  assert.equal(hash(arenaCatalogDefinition()), pins.catalog);
  assert.equal(hash(opponents), pins.opponents);
  return {
    schemaVersion: 1,
    seed: 308,
    source: "legacy-eight-round-route",
    combatVersion: "combat-v4",
    initialCash: 10,
    itemCount: 14,
    stageBaseHp: 460,
    priorWins: 7,
    lives: 3,
    inventoryValue: 57,
    acquisitionEventCount: replay.acquisitionEventCount,
    rearrangementMoveCount: replay.rearrangementMoves.length,
    budget: replay.budget,
    pins: { ...pins },
    options: {
      foeIds: opponents.opponents.map((foe) => foe.id),
      commonBaseHp: [396, 440, 460, 484],
      phaseSeconds: [-0.5, 0, 0.5],
      step: 0.05,
      maxTicks: 2400,
    },
    original: replay.acquiredRun,
    rearranged: replay.finalRun,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--output" || !args[1]))
    throw new Error(
      "Usage: export-paid-rearranged-comparison.ts [--output FILE]",
    );
  const json = JSON.stringify(exportPaidRearrangedComparison(), null, 2) + "\n";
  if (args.length) writeFileSync(resolve(args[1]), json, "utf8");
  else process.stdout.write(json);
}
