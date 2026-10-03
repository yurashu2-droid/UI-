/** Quarantined effect probe. Not imported by app, catalogue, campaign or online.
 * A selected existing notice slot is replaced mechanically, preserving its paid resources.
 * This does NOT validate a proposed Google history item's final geometry or faction. */
import E from "../../src/engine.js";
import type {
  BattlePart,
  BattleSide,
  Item,
  SideName,
} from "../../src/types.js";
export interface RestoreConfig {
  fraction: number;
  cap: number;
  cooldown: number;
  includePierce: boolean;
  zeroClears: boolean;
  stopAtOverload?: boolean;
}
export interface RestoreProbe {
  config: RestoreConfig;
  slots: Record<SideName, string[]>;
}
interface LastLoss {
  eligible: number;
  actual: number;
  source: string;
  tick: number;
  serial: number;
}
const emptyStats = () => ({
  recorded: 0,
  overwritten: 0,
  zeroCleared: 0,
  expired: 0,
  consumed: 0,
  restored: 0,
  attempts: 0,
  eligibleTotal: 0,
  excludedPierce: 0,
});
export class VersionRestoreBattle extends E.Battle {
  readonly restoreStats = { player: emptyStats(), enemy: emptyStats() };
  readonly lastLoss: Record<SideName, LastLoss | null> = {
    player: null,
    enemy: null,
  };
  private serial = 0;
  constructor(
    player: Item[],
    enemy: Item[],
    options: ConstructorParameters<typeof E.Battle>[2],
    readonly probe: RestoreProbe,
  ) {
    super(player, enemy, options);
    const c = probe.config;
    if (
      !Number.isFinite(c.fraction) ||
      c.fraction <= 0 ||
      c.fraction > 1 ||
      !Number.isFinite(c.cap) ||
      c.cap <= 0 ||
      !Number.isFinite(c.cooldown) ||
      c.cooldown <= 0
    )
      throw Error("Invalid restore probe");
    for (const side of [this.player, this.enemy])
      for (const p of side.parts.filter((p) =>
        probe.slots[side.name].includes(p.id),
      )) {
        if (p.type !== "gov_notice")
          throw Error("Prototype requires a priced notice slot");
        p.period = (c.cooldown / p.speed) * side.lag;
        p.remaining = p.period * 0.5;
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
    const deferred = !!this.pendingHits,
      before = target.hp;
    super._hit(side, target, p, value, pierce, admin);
    if (
      deferred ||
      !this.probe.slots[target.name].length ||
      !p.id ||
      !side.parts.some((q) => q.id === p.id) ||
      ((this.probe.config.stopAtOverload ?? true) && this.ticks >= 900)
    )
      return;
    const actual = Math.max(0, before - target.hp),
      state = this.restoreStats[target.name];
    if (!actual) {
      if (this.probe.config.zeroClears && this.lastLoss[target.name]) {
        this.lastLoss[target.name] = null;
        state.zeroCleared++;
      }
      return;
    }
    // Match the original direct portion after CDN; limiter/shield never reduce that portion.
    const direct = value * (target.admin.has("cdn") ? 0.88 : 1) * pierce;
    const excluded = this.probe.config.includePierce
      ? 0
      : Math.min(actual, direct);
    const eligible = Math.max(0, actual - excluded);
    if (this.lastLoss[target.name]) state.overwritten++;
    this.lastLoss[target.name] = {
      eligible,
      actual,
      source: p.id,
      tick: this.ticks,
      serial: ++this.serial,
    };
    state.recorded++;
    state.eligibleTotal += eligible;
    state.excludedPierce += excluded;
  }
  override _activate(side: BattleSide, target: BattleSide, p: BattlePart) {
    if (!this.probe.slots[side.name].includes(p.id)) {
      super._activate(side, target, p);
      return;
    }
    const stats = this.restoreStats[side.name],
      record = this.lastLoss[side.name];
    stats.attempts++;
    if (!record) return;
    if (
      ((this.probe.config.stopAtOverload ?? true) && this.ticks >= 900) ||
      this.ticks - record.tick >= 100
    ) {
      this.lastLoss[side.name] = null;
      stats.expired++;
      return;
    }
    if (side.hp <= 0) return;
    // Shared and single-use: another history control cannot consume the same loss again.
    this.lastLoss[side.name] = null;
    stats.consumed++;
    const value = Math.min(
      this.probe.config.cap,
      record.eligible * this.probe.config.fraction,
    );
    const gain = Math.max(0, Math.min(side.maxHp - side.hp, value));
    side.hp += gain;
    p.healed += gain;
    stats.restored += gain;
    this.metrics[side.name].healing += gain;
    this.metrics[side.name].overheal += value - gain;
    if (gain > 0) {
      p.fires++;
      this.emit({ kind: "fire", side: side.name, id: p.id, type: p.type });
      this.emit({ kind: "heal", side: side.name, id: p.id, value: gain });
      this._notify(side, target, p);
    }
  }
}
