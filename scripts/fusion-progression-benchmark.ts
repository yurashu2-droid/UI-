/** Real paid campaigns pursuing repeated fusions, with optional held administrator slots. */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  simulateTargetPath,
  type TargetPolicy,
} from "./paid-target-benchmark.js";
export function runFusionProgression(seeds = 50) {
  const policies: TargetPolicy[] = [
    "cart-fused",
    "fortress",
    "documents",
    "onestop",
    "native-links",
    "oneclick-battery",
  ];
  const rows = Array.from({ length: seeds }, (_, i) =>
    [false, true].flatMap((prefer) =>
      policies.map((policy) =>
        simulateTargetPath(
          101 + i,
          policy,
          prefer ? { preferredAdmins: ["server", "backup"] } : {},
        ),
      ),
    ),
  ).flat();
  const summary = [false, true].flatMap((prefer) =>
    policies.map((policy) => {
      const selected = rows.filter(
        (r) => r.policy === policy && !!r.preferredAdmins === prefer,
      );
      return {
        policy,
        preferredPair: prefer,
        paths: selected.length,
        wins: selected.reduce((s, r) => s + r.wins, 0),
        round8: selected.filter((r) => r.rounds.some((s) => s.round === 8))
          .length,
        completeInputs: selected.filter((r) =>
          r.rounds.some((s) => s.targetFilled === s.targetTotal),
        ).length,
        bothAdmins: selected.filter((r) =>
          r.rounds.some((s) =>
            ["server", "backup"].every((a) => s.admin.includes(a)),
          ),
        ).length,
        fusions: selected
          .flatMap((r) => r.transactions)
          .filter((t) => t.kind === "fusion").length,
        maxPlacedFusions: Math.max(
          ...selected.flatMap((r) =>
            r.rounds.map(
              (s) =>
                s.board.filter(
                  (p) =>
                    p.x !== null &&
                    ["gov_onestop", "am_oneclick"].includes(p.type),
                ).length,
            ),
          ),
        ),
        partSpend: selected.reduce((s, r) => s + r.partSpend, 0),
        serverSpend: selected.reduce((s, r) => s + r.serverSpend, 0),
        rerollSpend: selected.reduce((s, r) => s + r.rerollSpend, 0),
        blocked: selected.filter((r) => r.blocked).length,
      };
    }),
  );
  return {
    note: "All parts come from real market purchases or offered loot; public R.fuse consumes actual adjacent inputs after a real battle. No catalogue/shop injection. The preference branch may forgo a part reward to claim server/backup and decline other admins, so it measures that opportunity cost rather than granting the pair. Exact target completion is not guaranteed. Heuristic cohorts are not optimal-play/population probabilities.",
    summary,
    rows,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(runFusionProgression(), null, 2));
