import { ARCHIVE_COORDINATES, STORY_STAGES } from "./content.js";
import type {
  StoryCommand,
  StoryEffect,
  StoryState,
  StoryTransition,
} from "./types.js";

const PHASES = [
  "naming",
  "hub",
  "encounter",
  "record",
  "archive",
  "restoration",
  "link",
  "complete",
];
const ALL_ENCOUNTERS = STORY_STAGES.flatMap((s) =>
  s.encounters.map((e) => e.id),
);
const ALL_RECORDS = STORY_STAGES.map((s) => s.record.id);
const MAX_RECEIPTS = 4096;
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/.test(value);
const cleanName = (name: string) => name.normalize("NFC").trim();
const validName = (name: unknown): name is string =>
  typeof name === "string" &&
  cleanName(name).length > 0 &&
  cleanName(name).length <= 40 &&
  !/[\u0000-\u001f\u007f-\u009f]/.test(name);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length <= MAX_RECEIPTS &&
  v.every(validId) &&
  new Set(v).size === v.length;
const prefix = (values: string[], expected: string[]) =>
  values.every((value, i) => value === expected[i]);
export function createStoryState(): StoryState {
  return {
    version: 1,
    campaignId: "the-last-browser",
    stageId: "salvage",
    phase: "naming",
    pageName: "",
    junkMet: false,
    machineInspected: false,
    fusionWitnessed: false,
    completedEncounters: [],
    records: [],
    readRecords: [],
    pendingEncounter: null,
    resolvedMatches: [],
    analysisReceipts: [],
    analysisEnergy: 3,
    archiveOpened: false,
    restored: false,
    endingLinkPlaced: false,
    restoredVisits: 0,
  };
}
export function currentStoryStage(state: StoryState) {
  const stage = STORY_STAGES.find((s) => s.id === state.stageId);
  if (!stage) throw new Error("物語の段階を確認できません。");
  return stage;
}
export function currentStoryEncounter(state: StoryState) {
  return (
    currentStoryStage(state).encounters.find(
      (e) => !state.completedEncounters.includes(e.id),
    ) ?? null
  );
}
export function analysisCost(kind: "new" | "cached" | "reanalyze") {
  return kind === "cached" ? 0 : kind === "reanalyze" ? 2 : 1;
}
/** Treat persisted progress as untrusted, and enforce narrative order as well as property shapes. */
export function validateStoryState(value: unknown): value is StoryState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const s = value as StoryState;
  if (
    s.version !== 1 ||
    s.campaignId !== "the-last-browser" ||
    !PHASES.includes(s.phase)
  )
    return false;
  const index = STORY_STAGES.findIndex((stage) => stage.id === s.stageId);
  if (index < 0) return false;
  if (index > 1 && s.fusionWitnessed !== true) return false;
  for (const key of [
    "junkMet",
    "machineInspected",
    "fusionWitnessed",
    "archiveOpened",
    "restored",
    "endingLinkPlaced",
  ] as const)
    if (typeof s[key] !== "boolean") return false;
  for (const key of [
    "completedEncounters",
    "records",
    "readRecords",
    "resolvedMatches",
    "analysisReceipts",
  ] as const)
    if (!strings(s[key])) return false;
  if (
    !Number.isSafeInteger(s.analysisEnergy) ||
    s.analysisEnergy < 0 ||
    s.analysisEnergy > 99 ||
    ![0, 1].includes(s.restoredVisits)
  )
    return false;
  if (
    !prefix(s.completedEncounters, ALL_ENCOUNTERS) ||
    !prefix(s.records, ALL_RECORDS) ||
    !prefix(s.readRecords, s.records)
  )
    return false;
  const before = STORY_STAGES.slice(0, index).reduce(
    (n, stage) => n + stage.encounters.length,
    0,
  );
  const count = STORY_STAGES[index].encounters.length;
  if (
    s.completedEncounters.length < before ||
    s.completedEncounters.length > before + count
  )
    return false;
  const stageDone = s.completedEncounters.length === before + count;
  if (
    s.records.length !== index + Number(stageDone) ||
    s.readRecords.length < index
  )
    return false;
  if (s.phase === "naming") {
    if (
      index !== 0 ||
      s.pageName !== "" ||
      s.completedEncounters.length ||
      s.pendingEncounter !== null ||
      s.resolvedMatches.length ||
      s.junkMet ||
      s.machineInspected ||
      s.fusionWitnessed
    )
      return false;
  } else if (!validName(s.pageName) || s.pageName !== cleanName(s.pageName))
    return false;
  if (s.phase === "encounter") {
    const p = s.pendingEncounter;
    if (
      !p ||
      typeof p !== "object" ||
      !validId(p.matchId) ||
      p.id !== currentStoryEncounter(s)?.id ||
      s.resolvedMatches.includes(p.matchId)
    )
      return false;
  } else if (s.pendingEncounter !== null) return false;
  if (
    s.phase === "record" &&
    (!stageDone || s.readRecords.includes(STORY_STAGES[index].record.id))
  )
    return false;
  if (
    stageDone &&
    !s.readRecords.includes(STORY_STAGES[index].record.id) &&
    s.phase !== "record"
  )
    return false;
  const ending = index === 7 && stageDone && s.readRecords.length === 8;
  if (
    ["archive", "restoration", "link", "complete"].includes(s.phase) &&
    !ending
  )
    return false;
  if (
    ending &&
    !["archive", "restoration", "link", "complete"].includes(s.phase)
  )
    return false;
  if (s.archiveOpened !== ["restoration", "link", "complete"].includes(s.phase))
    return false;
  if (s.restored !== ["link", "complete"].includes(s.phase)) return false;
  if (s.endingLinkPlaced && !s.restored) return false;
  if (s.restoredVisits === 1 && (!s.endingLinkPlaced || s.phase !== "complete"))
    return false;
  if (s.phase === "complete" && (!s.endingLinkPlaced || s.restoredVisits !== 1))
    return false;
  return true;
}
export function transitionStory(
  input: StoryState,
  command: StoryCommand,
): StoryTransition {
  const fail = (error: string): StoryTransition => ({
    ok: false,
    state: input,
    effects: [],
    error,
  });
  if (!validateStoryState(input))
    return fail(
      "物語の保存データを確認できません。元の記録は変更していません。",
    );
  const s = structuredClone(input),
    effects: StoryEffect[] = [];
  const done = (): StoryTransition => ({ ok: true, state: s, effects });
  if (command.type === "name-page") {
    if (s.phase !== "naming") return fail("このページには名前が付いています。");
    if (!validName(command.name))
      return fail(
        "ページ名は40文字以内で入力してください（絵文字などは2文字分です）。制御文字は使えません。",
      );
    s.pageName = cleanName(command.name);
    s.phase = "hub";
    effects.push({ type: "page-named", name: s.pageName });
    return done();
  }
  if (s.phase === "naming")
    return fail("まず、自分のページに名前をつけてください。");
  if (command.type === "talk-junk") {
    s.junkMet = true;
    return done();
  }
  if (command.type === "inspect-machine") {
    s.machineInspected = true;
    return done();
  }
  if (command.type === "witness-fusion") {
    if (!s.fusionWitnessed) {
      s.fusionWitnessed = true;
      effects.push({ type: "fusion-reaction" });
    }
    return done();
  }
  if (command.type === "resolve-encounter") {
    if (
      !validId(command.matchId) ||
      !["player", "enemy", "draw"].includes(command.winner)
    )
      return fail("対戦結果を確認できません。");
    if (s.resolvedMatches.includes(command.matchId)) return done();
    if (
      s.phase !== "encounter" ||
      s.pendingEncounter?.matchId !== command.matchId
    )
      return fail("進行中の対戦と一致しません。");
    const id = s.pendingEncounter.id;
    s.resolvedMatches.push(command.matchId);
    s.pendingEncounter = null;
    s.phase = "hub";
    effects.push({
      type: "match-settled",
      encounterId: id,
      matchId: command.matchId,
      winner: command.winner,
    });
    if (command.winner === "player") {
      s.completedEncounters.push(id);
      if (!currentStoryEncounter(s)) {
        const record = currentStoryStage(s).record;
        s.records.push(record.id);
        s.phase = "record";
        effects.push({ type: "record-collected", recordId: record.id });
      }
    }
    return done();
  }
  if (command.type === "start-encounter") {
    if (
      s.phase !== "hub" ||
      command.encounterId !== currentStoryEncounter(s)?.id ||
      !validId(command.matchId) ||
      s.resolvedMatches.includes(command.matchId)
    )
      return fail("この接続先には、まだ挑戦できません。");
    if (s.resolvedMatches.length >= MAX_RECEIPTS)
      return fail(
        "この旅の対戦記録が上限に達しました。記録を書き出してください。",
      );
    s.pendingEncounter = { id: command.encounterId, matchId: command.matchId };
    s.phase = "encounter";
    s.machineInspected = true;
    effects.push({
      type: "encounter-ready",
      encounterId: command.encounterId,
      matchId: command.matchId,
    });
    return done();
  }
  if (command.type === "cancel-encounter") {
    if (
      s.phase !== "encounter" ||
      s.pendingEncounter?.matchId !== command.matchId
    )
      return fail("中断する接続が見つかりません。");
    s.pendingEncounter = null;
    s.phase = "hub";
    return done();
  }
  if (command.type === "collect-record") {
    const id = currentStoryStage(s).record.id;
    if (s.readRecords.includes(id)) return done();
    if (s.phase !== "record" || !s.records.includes(id))
      return fail("まだ回収していない記録です。");
    s.readRecords.push(id);
    s.phase = s.stageId === "last-browser" ? "archive" : "hub";
    return done();
  }
  if (command.type === "advance-stage") {
    const index = STORY_STAGES.findIndex((stage) => stage.id === s.stageId);
    if (
      s.phase !== "hub" ||
      !s.readRecords.includes(currentStoryStage(s).record.id) ||
      index >= 7
    )
      return fail("今の段階の攻略と記録の確認を終えてください。");
    if (s.stageId === "delivery" && !s.fusionWitnessed)
      return fail(
        "保証支給のメールリンクとクーポンを隣に置き、異種合成を一度試してください。作業場で試験公開できます。",
      );
    s.stageId = STORY_STAGES[index + 1].id;
    s.analysisEnergy = Math.min(99, s.analysisEnergy + 2);
    effects.push({ type: "stage-unlocked", stageId: s.stageId });
    if (s.stageId === "delivery")
      effects.push({ type: "fusion-kit", types: ["ab_mail", "am_coupon"] });
    return done();
  }
  if (command.type === "spend-analysis") {
    if (
      !["hub", "complete"].includes(s.phase) ||
      !validId(command.receiptId) ||
      !["new", "cached", "reanalyze"].includes(command.kind)
    )
      return fail("今は追加解析できません。");
    if (s.analysisReceipts.includes(command.receiptId)) return done();
    if (s.analysisReceipts.length >= MAX_RECEIPTS)
      return fail("解析記録が上限に達しました。");
    const cost = analysisCost(command.kind);
    if (s.analysisEnergy < cost)
      return fail(
        `解析用エネルギーが${cost}必要です。本編の接続には支給分を使えます。`,
      );
    s.analysisEnergy -= cost;
    s.analysisReceipts.push(command.receiptId);
    return done();
  }
  if (command.type === "open-archive") {
    if (s.archiveOpened) return done();
    if (
      s.phase !== "archive" ||
      command.url !== ARCHIVE_COORDINATES.url ||
      command.date !== ARCHIVE_COORDINATES.date
    )
      return fail("回収記録に残されたURLと日付を使ってください。");
    s.archiveOpened = true;
    s.phase = "restoration";
    return done();
  }
  if (command.type === "restore-archive") {
    if (s.restored) return done();
    if (s.phase !== "restoration")
      return fail("先に過去の保存記録を開いてください。");
    s.restored = true;
    s.phase = "link";
    return done();
  }
  if (command.type === "place-ending-link") {
    if (s.endingLinkPlaced) return done();
    if (s.phase !== "link" || !s.restored)
      return fail("現在のネットワークへ復元してからリンクを置いてください。");
    s.endingLinkPlaced = true;
    effects.push({
      type: "ending-link-granted",
      label: "あの人のホームページ",
      target: ARCHIVE_COORDINATES.restoredUrl,
    });
    return done();
  }
  if (command.type === "visit-restored-page") {
    if (s.restoredVisits === 1) return done();
    if (s.phase !== "link" || !s.endingLinkPlaced)
      return fail("自分のページへリンクを置いてから開いてください。");
    s.restoredVisits = 1;
    s.phase = "complete";
    effects.push({ type: "counter-increment", value: 1 });
    return done();
  }
  return fail("この操作には対応していません。");
}
