import type { EnemyDefinition } from "../types.js";

export interface SiteTemplate extends EnemyDefinition {
  status: "experimental" | "balance-approved";
  inspiredBy: string;
  references: string[];
  counterplay: string;
}
