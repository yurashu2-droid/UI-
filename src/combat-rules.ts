/** Increment whenever combat semantics change. Kept separate from cosmetics/catalogue. */
export const BATTLE_RULES_VERSION = "combat-v4";
export const SUPPORTED_COMBAT_VERSIONS = [
  "combat-v2",
  "combat-v3",
  BATTLE_RULES_VERSION,
] as const;
export type CombatRulesVersion = (typeof SUPPORTED_COMBAT_VERSIONS)[number];
export function isSupportedCombatVersion(
  value: unknown,
): value is CombatRulesVersion {
  return (
    typeof value === "string" &&
    SUPPORTED_COMBAT_VERSIONS.some((version) => version === value)
  );
}
/** Pagewide game abstraction, not a claim about real checkout/network behavior. */
export const ONECLICK_CONTENTION = Object.freeze({
  freeCopies: 2,
  extraCopyWeight: 0.25,
});
export const CONTROL = Object.freeze({
  cost: 3,
  durationTicks: 16,
  immunityTicks: 60,
  cacheTicks: 160,
});
export const RATE_LIMIT = Object.freeze({ capacity: 24, refillPerTick: 1.2 });
export type CombatEvent =
  | {
      kind: "history";
      time: number;
      side: "player" | "enemy";
      id: string;
      from?: string;
      action: "record" | "clear" | "restore" | "expire";
      value: number;
    }
  | {
      kind: "audience";
      time: number;
      side: "player" | "enemy";
      id?: string;
      from?: string;
      action:
        "churn" | "loyalty-earned" | "loyalty-retained" | "loyalty-expired";
      value: number;
      remaining: number;
    }
  | {
      kind: "control";
      time: number;
      side: "player" | "enemy";
      id: string;
      target: "player" | "enemy";
      to: string;
      action: "cover" | "blocked" | "release" | "cache-ready";
      duration?: number;
    }
  | {
      kind: "rate-limit";
      time: number;
      side: "player" | "enemy";
      id: string;
      from?: string;
      value: number;
      remaining: number;
    }
  | {
      kind: "conversion";
      time: number;
      side: "player" | "enemy";
      id: string;
      to: string;
      value: number;
      action: "route" | "spend";
    };
export interface CombatMetrics {
  hpDamage: number;
  shieldDamage: number;
  overkill: number;
  healing: number;
  overheal: number;
  shielding: number;
  shieldWaste: number;
  naturalAttacks: number;
  replays: number;
  firstImpact: number | null;
  routed: number;
  spent: number;
  unconverted: number;
  prevented: number;
  rateLimited: number;
}
export function emptyMetrics(): CombatMetrics {
  return {
    hpDamage: 0,
    shieldDamage: 0,
    overkill: 0,
    healing: 0,
    overheal: 0,
    shielding: 0,
    shieldWaste: 0,
    naturalAttacks: 0,
    replays: 0,
    firstImpact: null,
    routed: 0,
    spent: 0,
    unconverted: 0,
    prevented: 0,
    rateLimited: 0,
  };
}
