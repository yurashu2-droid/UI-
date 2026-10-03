import type { EnemyDefinition, Winner } from "../types.js";

export type StoryStageId =
  | "salvage"
  | "delivery"
  | "playback"
  | "search"
  | "reply"
  | "permission"
  | "hidden"
  | "last-browser";
export type StoryPhase =
  | "naming"
  | "hub"
  | "encounter"
  | "record"
  | "archive"
  | "restoration"
  | "link"
  | "complete";
export interface StoryRecord {
  id: string;
  title: string;
  text: string[];
  junk: string[];
}
export interface StoryEncounter {
  id: string;
  title: string;
  boss: boolean;
  enemy: EnemyDefinition;
  briefing: string;
}
export interface StoryStage {
  id: StoryStageId;
  number: number;
  title: string;
  objective: string;
  intro: string[];
  encounters: StoryEncounter[];
  record: StoryRecord;
}
/** Narrative progress only. Build inventory, cash, life and battle settlement belong to the host run. */
export interface StoryState {
  version: 1;
  campaignId: "the-last-browser";
  stageId: StoryStageId;
  phase: StoryPhase;
  pageName: string;
  junkMet: boolean;
  machineInspected: boolean;
  fusionWitnessed: boolean;
  completedEncounters: string[];
  records: string[];
  readRecords: string[];
  pendingEncounter: { id: string; matchId: string } | null;
  resolvedMatches: string[];
  analysisReceipts: string[];
  analysisEnergy: number;
  archiveOpened: boolean;
  restored: boolean;
  endingLinkPlaced: boolean;
  restoredVisits: number;
}
export type StoryCommand =
  | { type: "name-page"; name: string }
  | { type: "talk-junk" }
  | { type: "inspect-machine" }
  | { type: "witness-fusion" }
  | { type: "start-encounter"; encounterId: string; matchId: string }
  | { type: "resolve-encounter"; matchId: string; winner: Winner }
  | { type: "cancel-encounter"; matchId: string }
  | { type: "collect-record" }
  | { type: "advance-stage" }
  | {
      type: "spend-analysis";
      receiptId: string;
      kind: "new" | "cached" | "reanalyze";
    }
  | { type: "open-archive"; url: string; date: string }
  | { type: "restore-archive" }
  | { type: "place-ending-link" }
  | { type: "visit-restored-page" };
export type StoryEffect =
  | { type: "page-named"; name: string }
  | { type: "encounter-ready"; encounterId: string; matchId: string }
  | {
      type: "match-settled";
      encounterId: string;
      matchId: string;
      winner: Winner;
    }
  | { type: "record-collected"; recordId: string }
  | { type: "stage-unlocked"; stageId: StoryStageId }
  | { type: "fusion-reaction" }
  | { type: "fusion-kit"; types: ["ab_mail", "am_coupon"] }
  | { type: "ending-link-granted"; label: string; target: string }
  | { type: "counter-increment"; value: number };
export type StoryTransition =
  | { ok: true; state: StoryState; effects: StoryEffect[] }
  | { ok: false; state: StoryState; effects: []; error: string };
export interface StoryHubCallbacks {
  getState(): StoryState;
  onCommand(command: StoryCommand): StoryTransition | Promise<StoryTransition>;
  onEdit(target?: "page" | "shop" | "server"): void;
  /** The host owns real battle start/settlement; the panel cannot manufacture a victory. */
  onBattle(encounter: StoryEncounter): void | Promise<void>;
  onOptionalRaid?(
    url: string,
    kind: "new" | "cached" | "reanalyze",
  ): void | Promise<void>;
  /** Local rehearsal invokes the real fusion rules; no network or extra story victory. */
  onPracticeFusion?(): void | Promise<void>;
  /** Paint only the owned local components, never remote markup. */
  renderOwnPage?(host: HTMLElement): void;
  onClose?(): void;
}
