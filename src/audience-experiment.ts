/** A bounded exposure/retention hypothesis, instantiated only by explicit lab variants. */
export const AUDIENCE_RULES = Object.freeze({
  moduleExposureCapacity: 2,
  moduleExposurePerSecond: 1,
  pageExposureCapacity: 3,
  pageExposurePerSecond: 2,
  churnPerExcessExposure: 2,
  churnBurst: 3,
  churnPerSecond: 3,
  viewsPerMembership: 3,
  membershipIncome: 1,
  loyaltyPerMembership: 2,
  loyaltyCapacity: 8,
  loyaltyLifetimeTicks: 200,
  retainedRegularFraction: 0.25,
});
export class AudienceState {
  private lastTick = 0;
  private exposure: number = AUDIENCE_RULES.pageExposureCapacity;
  private churnBudget: number = AUDIENCE_RULES.churnBurst;
  private modules = new Map<string, { free: number; tick: number }>();
  private views = 0;
  private expiry = 0;
  private counters = {
    ads: 0,
    excessExposures: 0,
    churn: 0,
    retained: 0,
    loyaltyEarned: 0,
    loyaltySpent: 0,
    loyaltyExpired: 0,
  };
  loyalty = 0;
  advance(tick: number) {
    const dt = Math.max(0, tick - this.lastTick) / 20;
    this.lastTick = Math.max(this.lastTick, tick);
    this.exposure = Math.min(
      AUDIENCE_RULES.pageExposureCapacity,
      this.exposure + dt * AUDIENCE_RULES.pageExposurePerSecond,
    );
    this.churnBudget = Math.min(
      AUDIENCE_RULES.churnBurst,
      this.churnBudget + dt * AUDIENCE_RULES.churnPerSecond,
    );
    if (this.loyalty && tick >= this.expiry) {
      const expired = this.loyalty;
      this.loyalty = 0;
      this.counters.loyaltyExpired += expired;
      return expired;
    }
    return 0;
  }
  ad(module: string, tick: number) {
    this.advance(tick);
    const previous = this.modules.get(module);
    const free = previous
      ? Math.min(
          AUDIENCE_RULES.moduleExposureCapacity,
          previous.free +
            (Math.max(0, tick - previous.tick) / 20) *
              AUDIENCE_RULES.moduleExposurePerSecond,
        )
      : AUDIENCE_RULES.moduleExposureCapacity;
    const allowed = Math.min(1, free, this.exposure);
    this.exposure = Math.max(0, this.exposure - allowed);
    this.modules.set(module, { free: Math.max(0, free - allowed), tick });
    const excess = 1 - allowed;
    this.counters.ads++;
    this.counters.excessExposures += excess;
    const loss = Math.min(
      this.churnBudget,
      excess * AUDIENCE_RULES.churnPerExcessExposure,
    );
    this.churnBudget = Math.max(0, this.churnBudget - loss);
    return loss;
  }
  recordChurn(actual: number) {
    this.counters.churn += actual;
  }
  view(tick: number) {
    this.advance(tick);
    this.views++;
    if (this.views < AUDIENCE_RULES.viewsPerMembership) return 0;
    this.views -= AUDIENCE_RULES.viewsPerMembership;
    const gain = Math.min(
      AUDIENCE_RULES.loyaltyPerMembership,
      AUDIENCE_RULES.loyaltyCapacity - this.loyalty,
    );
    this.loyalty += gain;
    this.counters.loyaltyEarned += gain;
    this.expiry = tick + AUDIENCE_RULES.loyaltyLifetimeTicks;
    return gain;
  }
  retain(hit: number, direct: number, hp: number) {
    const reduction = Math.min(
      this.loyalty,
      Math.max(0, hit - direct) * AUDIENCE_RULES.retainedRegularFraction,
    );
    const actual = Math.max(
      0,
      Math.min(hp, hit) - Math.min(hp, hit - reduction),
    );
    if (!actual) return { reduction: 0, actual: 0 };
    this.loyalty -= reduction;
    this.counters.loyaltySpent += reduction;
    this.counters.retained += actual;
    return { reduction, actual };
  }
  snapshot() {
    return {
      ...this.counters,
      loyalty: this.loyalty,
      loyaltyExpiresAt: this.expiry / 20,
      eligibleViews: this.views,
      freeExposure: this.exposure,
      churnBudget: this.churnBudget,
    };
  }
}
