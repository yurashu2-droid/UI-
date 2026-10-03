import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import E from "../src/engine.js";
import { simulatePath } from "./progression-benchmark.js";
type Path = ReturnType<typeof simulatePath>;
function compare(a: Path, b: Path) {
  return a.rounds.flatMap((left) => {
    const right = b.rounds.find((r) => r.round === left.round);
    if (!right) return [];
    const battle = new E.Battle(left.board, right.board, {
      playerHp: left.baseHp,
      enemyHp: right.baseHp,
      playerCapacity: left.capacity,
      enemyCapacity: right.capacity,
      playerAdmin: left.admin,
      enemyAdmin: right.admin,
    });
    while (!battle.result) battle.step(0.05);
    return [
      {
        round: left.round,
        winner: battle.result.winner,
        time: battle.elapsed,
        margin:
          battle.player.hp / battle.player.maxHp -
          battle.enemy.hp / battle.enemy.maxHp,
        limited: battle.metrics.player.rateLimited,
        paidLimiter: left.board.some((p) => p.type === "gov_rate_limit"),
        paidPdf: right.board.some((p) => p.type === "gov_pdf"),
      },
    ];
  });
}
export function compareAcquisitionPaths(firstSeed = 101, count = 30) {
  if (
    !Number.isInteger(firstSeed) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 100
  )
    throw new Error("Choose 1–100 integer seed cases");
  const rows = Array.from({ length: count }, (_, i) => {
    const seed = firstSeed + i,
      pressure = simulatePath(seed, "pressure"),
      limiter = simulatePath(seed, "guard", { candidateOffer: true }),
      piercing = simulatePath(seed, "guard", {
        candidateOffer: true,
        candidatePart: "gov_pdf",
      });
    return {
      seed,
      pressure,
      limiter,
      piercing,
      limiterVsPressure: compare(limiter, pressure),
      limiterVsPiercing: compare(limiter, piercing),
    };
  });
  return {
    note: "Hypothetical paid offers replace a real shop opportunity after price tier unlock. Not live eligibility, population win rate or optimal play. Later wealth/outcomes diverge legitimately; one PDF purchase does not make the pressure backbone a heavy-pierce build.",
    rows,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = compareAcquisitionPaths();
  if (process.argv.includes("--json"))
    console.log(JSON.stringify(report, null, 2));
  else
    for (const key of ["limiterVsPressure", "limiterVsPiercing"] as const) {
      const matches = report.rows
        .flatMap((r) => r[key])
        .filter(
          (m) => m.paidLimiter && (key !== "limiterVsPiercing" || m.paidPdf),
        );
      console.log(key, {
        matches: matches.length,
        wins: matches.filter((m) => m.winner === "player").length,
        losses: matches.filter((m) => m.winner === "enemy").length,
        draws: matches.filter((m) => m.winner === "draw").length,
      });
    }
}
