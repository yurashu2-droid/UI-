/** Isolated story-authoring experiment. Never changes production files or engine rules. */
import { writeFileSync } from "node:fs";
import D from "../src/data.js";
import { STORY_STAGES } from "../src/story/content.js";
import {
  simulateStoryPath,
  type StoryPolicy,
} from "./story-progression-benchmark.js";

const boss = STORY_STAGES[1].encounters[1].enemy;
const original = structuredClone(boss);
// Preserve the pre-tuning comparison even after the authored candidate is promoted.
const beforeTuning = structuredClone(D.ENEMIES[3]);
const sixTypes = new Set([
  "am_product",
  "am_quantity",
  "am_buy",
  "am_wish",
  "am_coupon",
  "am_cart",
]);
const six = beforeTuning.layout
  .filter((row) => sixTypes.has(row[0]))
  .filter((row, i, all) => all.findIndex((other) => other[0] === row[0]) === i);
const candidates = [
  {
    id: "before-tuning-ten-three-admin",
    admin: beforeTuning.admin,
    layout: beforeTuning.layout,
  },
  { id: "ten-server", admin: ["server"], layout: beforeTuning.layout },
  { id: "ten-adnet", admin: ["adnet"], layout: beforeTuning.layout },
  { id: "ten-no-admin", admin: [], layout: beforeTuning.layout },
  { id: "six-server", admin: ["server"], layout: six },
  { id: "six-adnet", admin: ["adnet"], layout: six },
  { id: "six-no-admin", admin: [], layout: six },
];
const count = Number(
  process.argv.find((arg) => arg.startsWith("--seeds="))?.split("=")[1] ?? 30,
);
const policies: StoryPolicy[] = ["navigation", "commerce", "mixed"];
const rows: ({ candidate: string } & ReturnType<typeof simulateStoryPath>)[] =
  [];
try {
  for (const candidate of candidates) {
    boss.admin = candidate.admin;
    boss.layout = candidate.layout;
    for (let n = 0; n < count; n++)
      for (const policy of policies)
        rows.push({
          candidate: candidate.id,
          ...simulateStoryPath(101 + n, policy),
        });
  }
} finally {
  Object.assign(boss, original);
}
const summary = candidates.flatMap((candidate) =>
  policies.map((policy) => {
    const group = rows.filter(
      (r) => r.candidate === candidate.id && r.policy === policy,
    );
    return {
      candidate: candidate.id,
      policy,
      paths: group.length,
      stage2Clears: group.filter((r) => r.wins >= 4).length,
      fullClears: group.filter((r) => r.complete).length,
      stage2FirstAttemptWins: group.filter(
        (r) =>
          r.rounds.find((x) => x.encounter === "delivery-contract")?.winner ===
          "player",
      ).length,
      laterDeaths: group
        .filter((r) => r.wins >= 4 && !r.complete)
        .map((r) => ({ seed: r.seed, stage: r.stage, wins: r.wins })),
      totalLosses: group.reduce((n, r) => n + r.losses, 0),
    };
  }),
);
writeFileSync(
  ".verification/story-ramp-candidates.json",
  JSON.stringify(
    {
      note: "Isolated candidate content; all runs pay real costs and use unchanged canonical combat. Not a population win rate.",
      candidates,
      summary,
      rows,
    },
    null,
    2,
  ),
);
console.table(
  summary.map(({ laterDeaths, ...row }) => ({
    ...row,
    laterDeaths: laterDeaths.length,
  })),
);
