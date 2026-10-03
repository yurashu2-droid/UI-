import type {
  BattleEvent,
  BattleSummary,
  BattleStat,
  Item,
  Run,
  Winner,
} from "../types.js";

export interface ArenaRules {
  version: string;
  rounds: number;
  lives: number;
  startingCash: number;
  baseReward: number;
  winBonus: number;
  incomeDivisor: number;
  incomeCap: number;
  initialRating: number;
  ratingStep: number;
  snapshotMaxAgeMs: number;
}
export interface BuildSnapshot {
  id: string;
  ownerRunId: string;
  source: "player";
  createdAt: number;
  rulesVersion: string;
  combatVersion: string;
  catalogHash: string;
  round: number;
  wins: number;
  rating: number;
  resourceTier: number;
  items: Item[];
  admin: string[];
  capacity: number;
  hp: number;
  buildHash: string;
}
export interface OnlineSideStatistics {
  hp: number;
  maxHp: number;
  income: number;
  damage: number;
  parts: BattleStat[];
}
export interface OnlineMatch {
  id: string;
  runId: string;
  round: number;
  createdAt: number;
  rulesVersion: string;
  combatVersion: string;
  catalogHash: string;
  player: BuildSnapshot;
  opponent: BuildSnapshot;
  inputHash: string;
  winner: Winner;
  finalTick: number;
  replayHash: string;
  events: BattleEvent[];
  statistics: { player: OnlineSideStatistics; enemy: OnlineSideStatistics };
  summary: BattleSummary;
  rewardChoices: string[];
  rewardItems: Record<string, Item>;
  settled: boolean;
  claimed: boolean;
}
export interface OnlineView {
  revision: number;
  online: {
    id: string;
    roundLimit: number;
    rating: number;
    rulesVersion: string;
    requiresNewRun: boolean;
    publishedSnapshotId: string | null;
    pendingMatchId: string | null;
    inbox: Item[];
  };
  run: Run;
  rules: ArenaRules;
  match: OnlineMatch | null;
  outcome?: { code: string; message: string };
}
export type Placement = Pick<Item, "id" | "x" | "y" | "w" | "h"> & {
  routeTo?: string;
};
export type ArenaCommand = { commandId: string; expectedRevision: number } & (
  | { kind: "purchase"; type: string }
  | { kind: "sell"; id: string }
  | { kind: "placement"; items: Placement[] }
  | { kind: "reroll" | "publish" | "match" | "new-run" | "inbox" }
  | { kind: "fuse"; a: string; b: string }
  | { kind: "settle"; matchId: string }
  | { kind: "claim"; matchId: string; choice: string | null }
);
