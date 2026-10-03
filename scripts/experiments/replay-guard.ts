/** Isolated ETag-inspired replay-guard probe. No catalogue or canonical engine change.
 * Selected $7/CPU3 rate-limit parts are inert resource/geometry placeholders here;
 * they do NOT also receive429 prevention. Their government family is a stated limitation. */
import D from "../../src/data.js";
import E from "../../src/engine.js";
import type {
  BattlePart,
  BattleSide,
  Item,
  SideName,
} from "../../src/types.js";
const P = D.PARTS;
export interface ReplayGuardConfig {
  fraction: number;
  capacity: number;
  refillPerSecond: number;
}
export interface ReplayOrigin {
  sourceId: string;
  controllerId: string;
  naturalRevision: number;
}
export interface ReplayGuardProbe {
  config: ReplayGuardConfig;
  slots: Record<SideName, string[]>;
}
type HitPart = Pick<BattlePart, "damage"> & Partial<Pick<BattlePart, "id">>;
export class ReplayGuardBattle extends E.Battle {
  readonly naturalRevisions: Record<SideName, Map<string, number>> = {
    player: new Map(),
    enemy: new Map(),
  };
  readonly guardBudget: Record<SideName, number> = { player: 0, enemy: 0 };
  readonly guardStats = {
    player: { prevented: 0, eligible: 0, packets: 0 },
    enemy: { prevented: 0, eligible: 0, packets: 0 },
  };
  readonly replayPackets: (ReplayOrigin & {
    side: SideName;
    target: SideName;
    tick: number;
    direct: number;
    ordinary: number;
    prevented: number;
    remaining: number;
  })[] = [];
  constructor(
    a: Item[],
    b: Item[],
    options: ConstructorParameters<typeof E.Battle>[2],
    readonly probe: ReplayGuardProbe,
  ) {
    super(a, b, options);
    const c = probe.config;
    if (
      ![c.fraction, c.capacity, c.refillPerSecond].every(Number.isFinite) ||
      c.fraction < 0 ||
      c.fraction > 1 ||
      c.capacity < 0 ||
      c.refillPerSecond < 0
    )
      throw Error("Invalid replay guard probe");
    for (const side of [this.player, this.enemy]) {
      this.guardBudget[side.name] = c.capacity;
      for (const id of probe.slots[side.name])
        if (
          !["gov_rate_limit", "go_etag"].includes(
            side.parts.find((p) => p.id === id)?.type ?? "",
          )
        )
          throw Error("Expected priced rate-limit placeholder");
    }
  }
  override _tick() {
    for (const name of ["player", "enemy"] as const)
      this.guardBudget[name] = Math.min(
        this.probe.config.capacity,
        this.guardBudget[name] + this.probe.config.refillPerSecond / 20,
      );
    super._tick();
  }
  override _attack(
    side: BattleSide,
    target: BattleSide,
    p: BattlePart,
    scale: number,
  ) {
    this.naturalRevisions[side.name].set(
      p.id,
      (this.naturalRevisions[side.name].get(p.id) ?? 0) + 1,
    );
    super._attack(side, target, p, scale);
  }
  override _replay(
    side: BattleSide,
    target: BattleSide,
    source: BattlePart,
    p: BattlePart,
    scale: number,
  ) {
    const state = this.states[side.name].get(p.id)!;
    if (!state.payload || state.coveredUntil > this.ticks) return;
    this.metrics[side.name].replays++;
    this.emit({ kind: "echo", side: side.name, id: source.id, to: p.id });
    this.emit({
      kind: "fire",
      side: side.name,
      id: p.id,
      type: p.type,
      echo: true,
    });
    const origin = Object.freeze({
      sourceId: p.id,
      controllerId: source.id,
      naturalRevision: this.naturalRevisions[side.name].get(p.id) ?? 0,
    });
    this._queueHit(
      side,
      target,
      p,
      Math.round(state.payload.value * scale * 10) / 10,
      state.payload.pierce,
      undefined,
      origin,
    );
  }
  override _hit(
    side: BattleSide,
    target: BattleSide,
    p: HitPart,
    value: number,
    pierce = 0,
    admin?: string,
  ) {
    this._queueHit(side, target, p, value, pierce, admin, null);
  }
  private _queueHit(
    side: BattleSide,
    target: BattleSide,
    p: HitPart,
    value: number,
    pierce: number,
    admin: string | undefined,
    origin: Readonly<ReplayOrigin> | null,
  ) {
    // Origin and value are captured together; later events or source activations cannot rewrite them.
    const apply = () =>
      this._resolveHit(side, target, p, value, pierce, admin, origin);
    if (this.pendingHits) this.pendingHits.push(apply);
    else apply();
  }
  private _resolveHit(
    side: BattleSide,
    target: BattleSide,
    p: HitPart,
    value: number,
    pierce: number,
    admin: string | undefined,
    origin: Readonly<ReplayOrigin> | null,
  ) {
    if (target.admin?.has("cdn")) {
      const saved = value * 0.12;
      value -= saved;
      target.adminState.cdn = (target.adminState.cdn || 0) + saved;
    }
    const direct = value * pierce;
    const limiter = target.parts.find(
      (q) =>
        q.type === "gov_rate_limit" &&
        !this.probe.slots[target.name].includes(q.id),
    );
    const limited = limiter
      ? Math.min(
          P[limiter.type].value,
          value - direct,
          this.rateBudget[target.name],
        )
      : 0;
    if (limiter && limited > 0) {
      value -= limited;
      this.rateBudget[target.name] = Math.max(
        0,
        this.rateBudget[target.name] - limited,
      );
      this.metrics[target.name].rateLimited += limited;
      this.emit({
        kind: "rate-limit",
        side: target.name,
        id: limiter.id,
        from: p.id,
        value: limited,
        remaining: this.rateBudget[target.name],
      });
    }
    // New hypothetical step only: original direct damage is never recomputed from reduced total.
    if (origin) {
      const ordinary = Math.max(0, value - direct),
        active = this.probe.slots[target.name].length > 0;
      const saved = active
        ? Math.min(
            ordinary * this.probe.config.fraction,
            this.guardBudget[target.name],
          )
        : 0;
      if (active) {
        this.guardBudget[target.name] -= saved;
        this.guardStats[target.name].prevented += saved;
        this.guardStats[target.name].eligible += ordinary;
        this.guardStats[target.name].packets++;
      }
      value -= saved;
      this.replayPackets.push({
        ...origin,
        side: side.name,
        target: target.name,
        tick: this.ticks,
        direct,
        ordinary,
        prevented: saved,
        remaining: this.guardBudget[target.name],
      });
    }
    const blocked = Math.min(target.shield, value - direct);
    target.shield -= blocked;
    let hit = value - blocked;
    if (this.audience) {
      const state = this.audience[target.name],
        kept = state.retain(hit, direct, target.hp);
      hit -= kept.reduction;
      if (kept.actual)
        this.emit({
          kind: "audience",
          side: target.name,
          id: target.parts.find((q) => q.type === "yt_sub")?.id,
          from: p.id,
          action: "loyalty-retained",
          value: kept.actual,
          remaining: state.loyalty,
        });
    }
    const actual = Math.min(target.hp, hit),
      m = this.metrics[side.name];
    m.hpDamage += actual;
    m.shieldDamage += blocked;
    m.overkill += Math.max(0, hit - actual);
    if (actual > 0 && m.firstImpact === null) m.firstImpact = this.elapsed;
    target.hp = Math.max(0, target.hp - hit);
    const history = target.parts.find((q) => q.type === "go_history"),
      source = p.id ? side.parts.find((q) => q.id === p.id) : undefined;
    if (history && source) {
      const eligible = Math.max(0, actual - Math.min(actual, direct));
      this.history[target.name].capture(
        eligible,
        source.id,
        P[source.type].name,
        this.ticks,
      );
      this.emit({
        kind: "history",
        side: target.name,
        id: history.id,
        from: source.id,
        action: eligible > 0 ? "record" : "clear",
        value: 0,
      });
    }
    p.damage += value;
    side.damage += value;
    this.emit({
      kind: "damage",
      side: side.name,
      target: target.name,
      id: p.id,
      value,
      hit,
      blocked,
      pierce: pierce > 0,
      admin,
    });
  }
}
