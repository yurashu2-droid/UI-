export type Mode = "lab" | "campaign";
export type Phase = "build" | "battle" | "reward" | "complete" | "gameover";
export type SideName = "player" | "enemy";
export type Winner = SideName | "draw";
export type Theme = "mixed" | "youtube" | "amazon" | "google" | "retro" | "gov";
export type Faction = Exclude<Theme, "mixed">;

export interface Item {
  id: string;
  type: string;
  x: number | null;
  y: number | null;
  w: number;
  h: number;
  shape: string;
  label: string;
}
export type PlacedItem = Item & { x: number; y: number };

export interface PartDefinition {
  id: string;
  name: string;
  faction: Faction;
  kind: string;
  tags: string[];
  layout: string;
  w: number;
  h: number;
  cd: number;
  value: number;
  load: number;
  price: number;
  desc: string;
  added: boolean;
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
  container?: boolean;
  padding?: [number, number, number, number];
  /** Only obtainable by fusing two UIs (src/fusion.ts); never in shops or loot. */
  fused?: boolean;
}

export type LayoutEntry = [
  string,
  number | null,
  number | null,
  number?,
  number?,
  (string | null)?,
  string?,
];
export type DecorEntry = [string, number, number, number, number];
export interface EnemyDefinition {
  id: string;
  faction: Faction;
  name: string;
  pageName: string;
  address: string;
  hp: number;
  fee: number;
  reward: number;
  tip: string;
  admin: string[];
  loot: string[];
  layout: LayoutEntry[];
  decor: DecorEntry[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface ItemRect {
  x: number | null;
  y: number | null;
  w: number;
  h: number;
}
export interface CompositionNode {
  id: string;
  kind: string;
  type?: string;
  items: string[];
  box: Rect;
  children: CompositionNode[];
}
export interface DocumentAnalysis {
  board: PlacedItem[];
  roots: CompositionNode[];
  groups: CompositionNode[];
  nodes: Record<string, CompositionNode>;
  parents: Record<string, string>;
  member: Record<string, CompositionNode[]>;
  near: Record<string, string[]>;
  load: number;
  freeRatio: number;
}
export interface Modifier {
  speed: number;
  power: number;
  pierce: number;
  notes: string[];
}
export interface Relation {
  from: string;
  to: string;
  kind: string;
  label: string;
}
export interface BattleAnalysis extends DocumentAnalysis {
  mods: Record<string, Modifier>;
  relations: Relation[];
  counts: Record<string, number>;
  sets: { faction: string; count: number; text: string }[];
}
export interface BattlePart extends PlacedItem {
  period: number;
  remaining: number;
  power: number;
  speed: number;
  pierce: number;
  fires: number;
  watch: number;
  charge: number;
  damage: number;
  earned: number;
  protected: number;
  healed: number;
}
export interface AdminState {
  moderator?: number;
  sns?: number;
  trollBlocked?: number;
  captcha?: number;
  troll?: number;
  cdn?: number;
  restored?: boolean;
  exposed?: boolean;
}
export interface BattleSide {
  name: SideName;
  board: PlacedItem[];
  info: BattleAnalysis;
  maxHp: number;
  hp: number;
  shield: number;
  income: number;
  lastBonus: number;
  parts: BattlePart[];
  damage: number;
  admin: Set<string>;
  adminState: AdminState;
  bots: number;
  load: number;
  capacity: number;
  lag: number;
  lagLoss?: number;
}
export interface BattleResult {
  winner: Winner;
  time: number;
  income: number;
}
export type BattleEvent =
  | {
      kind: "fire";
      time: number;
      side: SideName;
      id: string;
      type: string;
      echo?: boolean;
    }
  | {
      kind: "damage";
      time: number;
      side: SideName;
      target: SideName;
      id?: string;
      value: number;
      hit: number;
      blocked: number;
      pierce: boolean;
      admin?: string;
    }
  | {
      kind: "income" | "shield" | "heal";
      time: number;
      side: SideName;
      id: string;
      value: number;
    }
  | { kind: "echo"; time: number; side: SideName; id: string; to: string }
  | { kind: "lag" | "overload"; time: number; side: SideName; value: number }
  | {
      kind: "admin";
      time: number;
      side: SideName;
      admin: string;
      value?: number;
      blocked?: boolean;
      target?: SideName;
      exposed?: boolean;
    }
  | ({ kind: "end"; time: number } & BattleResult);
export type BattleEventInput = BattleEvent extends infer Event
  ? Event extends BattleEvent
    ? Omit<Event, "time">
    : never
  : never;
export interface BattleOptions {
  playerHp?: number;
  enemyHp?: number;
  playerAdmin?: string[];
  enemyAdmin?: string[];
  playerCapacity?: number;
  enemyCapacity?: number;
}

export interface BattleStat {
  type: string;
  id: string;
  damage: number;
  earned: number;
  shield: number;
  heal: number;
  fires: number;
}
export interface BattleSummary {
  winner: Winner;
  time: number;
  enemy: string;
  round: number | null;
  base: number;
  bonus: number;
  income: number;
  rawIncome: number;
  total: number;
  stage: number;
  damage: number;
  hp: number;
  maxHp: number;
  stats: BattleStat[];
  visitors?: {
    player: number;
    enemy: number;
    base: number;
    max: number;
  } | null;
}
export interface Run {
  version: number;
  mode: Mode;
  cash: number;
  stage: number;
  lives: number;
  wins: number;
  nextId: number;
  seed: number;
  rerolls: number;
  phase: Phase;
  owned: Item[];
  shop: { type: string; sold: boolean }[];
  pending: { loot: string[]; summary: BattleSummary } | null;
  history: BattleSummary[];
  page: { name: string; theme: Theme };
  admin: string[];
  tutorial?: number;
  tutorialAck?: boolean;
  capacity?: number;
}
export type TransactionFailure = { ok: false; error: string };
