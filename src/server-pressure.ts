/** Deterministic, local-only laboratory work. No destinations or external requests. */
export const SERVER_PRESSURE = Object.freeze({cost: 3, storage: 6, work: 6, lifetimeTicks: 100, cap: 12, capacity: 26});
export class ServerPressure {
  lots: {work: number; expires: number}[] = [];
  sources = new Map<string, {attempts: number; blocked: number; accepted: number}>();
  get work() { return this.lots.reduce((sum, lot) => sum + lot.work, 0); }
  accept(work: number, tick: number) {
    const accepted = Math.max(0, Math.min(work, SERVER_PRESSURE.cap - this.work));
    if (accepted) this.lots.push({work: accepted, expires: tick + SERVER_PRESSURE.lifetimeTicks});
    return accepted;
  }
  expire(tick: number) {
    const before = this.work;
    this.lots = this.lots.filter(lot => lot.expires > tick);
    return before - this.work;
  }
  record(id: string, accepted: number) {
    const source = this.sources.get(id) ?? {attempts: 0, blocked: 0, accepted: 0};
    source.attempts++; source.accepted += accepted;
    if (accepted < SERVER_PRESSURE.work) source.blocked++;
    this.sources.set(id, source);
  }
  snapshot(tick: number) {
    return {work: this.work, cap: SERVER_PRESSURE.cap,
      nextExpiry: this.lots.length ? Math.max(0, Math.min(...this.lots.map(lot => lot.expires)) - tick) / 20 : 0};
  }
}
