import type { EnemyDefinition } from "../types.js";

export interface SiteTemplate extends EnemyDefinition {
  status: "experimental" | "balance-approved";
  inspiredBy: string;
  references: string[];
  counterplay: string;
  /** A player-only laboratory lesson preserves the existing opponent indices. */
  labOpponent?: boolean;
}
