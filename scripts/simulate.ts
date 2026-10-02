import D from "../src/data.js";
import R from "../src/run.js";

type SimulationRow = {
  preset: string;
  opponent: string;
  winner: string;
  seconds: number;
  hp: number;
  income: number;
};

const rows: SimulationRow[] = [];
for (const preset of Object.keys(D.PRESETS)) {
  for (let stage = 0; stage < D.ENEMIES.length; stage++) {
    const run = R.newRun("lab", preset);
    run.stage = stage;
    const started = R.startBattle(run);
    if (!started.ok || !("battle" in started)) {
      throw new Error(`Cannot start ${preset}/${stage}`);
    }
    const battle = started.battle;
    // The engine ends a match within 1,200 fixed ticks (60 seconds).
    for (let tick = 0; tick < 1201 && !battle.result; tick++) battle.step(0.05);
    if (!battle.result)
      throw new Error(`Battle did not end: ${preset}/${stage}`);
    const settled = R.settleBattle(run, battle);
    if (!settled.ok || !("summary" in settled))
      throw new Error("Settlement failed");
    const summary = settled.summary;
    rows.push({
      preset,
      opponent: summary.enemy,
      winner: summary.winner,
      seconds: Number(summary.time.toFixed(2)),
      hp: summary.hp,
      income: summary.rawIncome,
    });
  }
}
if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 2));
else console.table(rows);
