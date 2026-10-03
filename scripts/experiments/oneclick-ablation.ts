/** Diagnostic ablations only; no canonical stat, cadence, capacity or fusion change. */
import E from "../../src/engine.js";
import type { BattlePart, BattleSide, Item } from "../../src/types.js";
export interface OneClickDials {
  conversion15?: boolean;
  naturalBase9?: boolean;
  period3?: boolean;
  restoreInputLoad?: boolean;
  noIncomeGrowth?: boolean;
  noConversionDamage?: boolean;
  noNaturalDamage?: boolean;
  sharedIncomeGrowth?: boolean;
  /** Candidate intervention: one/two copies can remain exactly canonical. */
  repeatCadence?: { freeCopies: number; extraWeight: number };
}
export class OneClickAblationBattle extends E.Battle {
  private converting: string | null = null;
  constructor(
    a: Item[],
    b: Item[],
    options: ConstructorParameters<typeof E.Battle>[2],
    readonly dials: OneClickDials,
  ) {
    // Historical evidence is a v3 counterfactual; never double-apply the production v4 rule.
    if (options?.combatVersion === "combat-v4")
      throw new Error(
        "Historical ablation probes require explicit v2/v3 or the default v3 baseline",
      );
    super(a, b, {
      ...options,
      combatVersion: options?.combatVersion ?? "combat-v3",
    });
    for (const side of [this.player, this.enemy]) {
      const count = side.parts.filter((p) => p.type === "am_oneclick").length;
      if (dials.restoreInputLoad && count) {
        side.load += 2 * count;
        const lag =
          Number.isFinite(side.capacity) && side.capacity > 0
            ? 1 + Math.max(0, side.load / side.capacity - 1) * 0.6
            : 1;
        for (const p of side.parts) {
          p.period *= lag / side.lag;
          p.remaining *= lag / side.lag;
        }
        side.lag = lag;
      }
      if (dials.period3)
        for (const p of side.parts.filter((p) => p.type === "am_oneclick")) {
          p.period *= 3 / 2.4;
          p.remaining *= 3 / 2.4;
        }
      if (dials.repeatCadence) {
        const multiplier =
          1 +
          dials.repeatCadence.extraWeight *
            Math.max(0, count - dials.repeatCadence.freeCopies);
        for (const p of side.parts.filter((p) => p.type === "am_oneclick")) {
          p.period *= multiplier;
          p.remaining *= multiplier;
        }
      }
    }
  }
  override _convert(side: BattleSide, target: BattleSide, p: BattlePart) {
    const old = this.converting;
    this.converting = p.type === "am_oneclick" ? p.id : null;
    try {
      super._convert(side, target, p);
    } finally {
      this.converting = old;
    }
  }
  override _hit(
    side: BattleSide,
    target: BattleSide,
    p: Pick<BattlePart, "damage"> & Partial<Pick<BattlePart, "id">>,
    value: number,
    pierce = 0,
    admin?: string,
  ) {
    if (this.dials.conversion15 && p.id === this.converting) value *= 15 / 20;
    if (this.dials.noConversionDamage && p.id === this.converting) value = 0;
    super._hit(side, target, p, value, pierce, admin);
  }
  override _attack(
    side: BattleSide,
    target: BattleSide,
    p: BattlePart,
    scale: number,
  ) {
    if (p.type === "am_oneclick") {
      const growth = Math.min(8, Math.floor(side.income / 5));
      const effectiveGrowth = this.dials.noIncomeGrowth
        ? 0
        : this.dials.sharedIncomeGrowth
          ? growth / side.parts.filter((q) => q.type === "am_oneclick").length
          : growth;
      scale *=
        ((this.dials.naturalBase9 ? 9 : 12) + effectiveGrowth) / (12 + growth);
      if (this.dials.noNaturalDamage) scale = 0;
    }
    super._attack(side, target, p, scale);
  }
}
