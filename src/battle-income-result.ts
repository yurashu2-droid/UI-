import type { CombatMetrics } from "./combat-rules.js";
import type { BattlePart, BattleResult } from "./types.js";

/** A finished Battle fits this read-only input without importing the engine. */
export interface FinishedIncomeSource {
  readonly result: Readonly<BattleResult> | null;
  readonly player: {
    readonly income: number;
    readonly parts: readonly Readonly<Pick<BattlePart, "charge">>[];
  };
  readonly metrics: {
    readonly player: Readonly<Pick<CombatMetrics, "routed" | "spent" | "unconverted">>;
  };
}

export interface BattleIncomeResultView {
  grossIncome: number;
  routed: number;
  spent: number;
  retained: number;
  unconverted: number;
}

const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * Snapshot the player's actual finished ledger. Never derive missing counters
 * from gross income, current editor wiring, settlement payout or old history.
 * Unconverted includes both absent destinations and full receiver surplus.
 */
export function battleIncomeResult(
  battle: FinishedIncomeSource | null | undefined,
): BattleIncomeResultView | null {
  if (!battle?.result) return null;
  const grossIncome = battle.player?.income;
  const metrics = battle.metrics?.player;
  const parts = battle.player?.parts;
  if (!isAmount(grossIncome) || !isAmount(metrics?.routed) ||
      !isAmount(metrics?.spent) || !isAmount(metrics?.unconverted) ||
      !Array.isArray(parts)) return null;
  let retained = 0;
  for (const part of parts) {
    if (!isAmount(part?.charge)) return null;
    retained += part.charge;
  }
  if (!isAmount(retained)) return null;
  return {
    grossIncome,
    routed: metrics.routed,
    spent: metrics.spent,
    retained,
    unconverted: metrics.unconverted,
  };
}

/** Native collapsed details keep genuine zero-income results to one short line. */
export function renderBattleIncomeResult(view: BattleIncomeResultView | null): string {
  if (!view) return "";
  const rows: [string, number][] = [
    ["戦闘中の総収益", view.grossIncome],
    ["受け入れたチャージ", view.routed],
    ["消費したチャージ", view.spent],
    ["終了時のチャージ残量", view.retained],
    ["チャージに入らなかった収益", view.unconverted],
  ];
  return `<details class="sel-more battle-income-result"><summary>あなたの収益とチャージ：総収益 $${view.grossIncome}</summary>
<div class="res-money">${rows.map(([label, amount]) => `<div><span>${label}</span><b>$${amount}</b></div>`).join("")}</div>
<p class="muted">チャージに入らなかった収益には、接続先がない場合や受け皿が満杯だった場合を含みます。</p>
<p class="muted">この対戦中の記録です。チャージの消費は、精算する収益から差し引きません。所持金への加算額とは別です。</p></details>`;
}
