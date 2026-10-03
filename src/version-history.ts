/** Experimental latest-loss history. The page owns one revision, not one per control. */
export const HISTORY_RULES = Object.freeze({
  fraction: 0.5,
  cap: 12,
  lifetimeTicks: 100,
});
export interface HistoryRevision {
  sourceId: string;
  sourceName: string;
  loss: number;
  recordAt: number;
  expiresAt: number;
  consumed: boolean;
}
export class VersionHistory {
  revision: HistoryRevision | null = null;
  private expiryReported = false;
  capture(loss: number, sourceId: string, sourceName: string, tick: number) {
    this.expiryReported = false;
    this.revision =
      loss > 0
        ? {
            sourceId,
            sourceName,
            loss,
            recordAt: tick,
            expiresAt: tick + HISTORY_RULES.lifetimeTicks,
            consumed: false,
          }
        : null;
  }
  expire(tick: number) {
    if (
      !this.revision ||
      this.revision.consumed ||
      this.expiryReported ||
      tick < this.revision.expiresAt
    )
      return false;
    this.expiryReported = true;
    return true;
  }
  visible(tick: number, hp: number, maxHp: number) {
    const r = this.revision;
    if (!r) return null;
    const available = !r.consumed && tick < r.expiresAt && hp > 0;
    return {
      ...r,
      recoverable: available
        ? Math.max(
            0,
            Math.min(
              maxHp - hp,
              HISTORY_RULES.cap,
              r.loss * HISTORY_RULES.fraction,
            ),
          )
        : 0,
    };
  }
  consume(tick: number, hp: number, maxHp: number) {
    const view = this.visible(tick, hp, maxHp);
    if (!view || view.consumed || tick >= view.expiresAt || hp <= 0) return 0;
    this.revision!.consumed = true;
    return view.recoverable;
  }
}
