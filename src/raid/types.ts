import type { Item, Rect, Winner } from "../types.js";
import type { LocalRaidSelection } from "./local-selection.js";

export const RAID_LIMITS = Object.freeze({
  width: 960,
  height: 680,
  components: 12,
  primitives: 256,
  label: 80,
  manifestBytes: 300_000,
});
export type RaidResult<T> =
  { ok: true; value: T } | { ok: false; code: string; error: string };
export type RaidPrimitive =
  | {
      kind: "text";
      rect: Rect;
      text: string;
      color: string;
      size: number;
      weight: "normal" | "bold";
      font: "sans" | "serif" | "mono";
      align: "left" | "center" | "right";
    }
  | {
      kind: "rect";
      rect: Rect;
      fill: string;
      radius: number;
      borderColor: string;
      borderWidth: number;
    };
export interface RaidAppearance {
  width: number;
  height: number;
  background: string;
  primitives: RaidPrimitive[];
}
export interface RaidComponent {
  componentId: string;
  canonicalType: string;
  sourceRect: Rect | null;
  sourceNode?: {
    tag: string;
    path: string;
    order: number;
    group: number;
    classes: string[];
  };
  combatRect: Rect;
  appearanceId: string;
  appearance: RaidAppearance;
  evidence:
    | "search"
    | "navigation"
    | "heading"
    | "purchase"
    | "product"
    | "rating"
    | "quantity"
    | "notice"
    | "pdf"
    | "checkbox";
}
export interface RaidBlueprint {
  schemaVersion: 1;
  extractorVersion: "static-v1" | "code-v1";
  mapperVersion: "canonical-v1";
  captureId: string;
  viewport: { width: 960; height: 680 };
  source: {
    kind: "fixture" | "static-public" | "local-file";
    name: string;
    displayUrl: string;
    capturedAt: string;
  };
  fidelity:
    "controlled-fixture" | "static-reconstruction" | "code-approximation";
  analysis?: {
    sourceHash: string;
    layout: "inferred-flow";
    confidence: "low";
    styles: "inline-and-embedded-subset" | "safe-css-subset-v1";
    css?: { rules: number; limited: boolean; stylesheetHashes: string[] };
    candidateCount: number;
    selectedCount: number;
    omitted: ["external-stylesheets" | "unsupported-css", "images", "scripts"];
  };
  warnings: string[];
  background: string;
  decor: RaidPrimitive[];
  components: RaidComponent[];
}
export type RaidItem = Item & { appearanceId?: string; provenanceId?: string };
export interface RaidReward {
  kind: "raid-ui";
  rewardId: string;
  battleId: string;
  captureId: string;
  componentId: string;
  canonicalType: string;
  appearanceId: string;
  provenanceId: string;
  width: number;
  height: number;
}
export interface RaidResume {
  blueprint: RaidBlueprint;
  battleId: string;
  winner: "player";
}
export interface RaidInitialRequest {
  url: string;
  kind: "new" | "cached" | "reanalyze";
  cachedBlueprint?: RaidBlueprint;
}
export interface RaidPanelCallbacks {
  /** Live lab-only gate; absent, throwing or false disables local acquisition. */
  isLocalImportAllowed?(): boolean;
  /** Same live laboratory/profile only; no source files or persistent storage. */
  localSelection?: LocalRaidSelection;
  /** Leave the current panel to edit the player's board before an explicit return. */
  onEditLocal?(): void;
  /** Integration persists acquisition/energy receipts before the new opponent is selected. */
  onCaptured?(
    blueprint: RaidBlueprint,
    kind: "new" | "reanalyze",
  ): Promise<void>;
  onChallenge(
    blueprint: RaidBlueprint,
  ): Promise<{ battleId: string; winner: Winner }>;
  onDiscard?(
    battleId: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  onClaim(
    reward: RaidReward,
    blueprint: RaidBlueprint,
  ): Promise<{ ok: true; message?: string } | { ok: false; error: string }>;
}
