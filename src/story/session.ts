import D from "../data.js";
import C from "../document.js";
import E from "../engine.js";
import R from "../run.js";
import type { BattleSummary, Item, Run } from "../types.js";
import type { StoragePort } from "../persistence.js";
import type { RaidBlueprint } from "../raid/types.js";
import {
  validateRaidBlueprint,
  verifyRaidBlueprint,
} from "../raid/blueprint.js";
import { STORY_STAGES } from "./content.js";
import {
  createStoryState,
  currentStoryEncounter,
  currentStoryStage,
  transitionStory,
  validateStoryState,
} from "./state.js";
import type { StoryCommand, StoryEffect, StoryState } from "./types.js";

export const STORY_SAVE_KEY = "ui-raid-last-browser-v1";
export interface StoryDelivery {
  id: string;
  type: string;
  reason: "loot" | "fusion-kit";
}
export interface StorySession {
  version: 1;
  story: StoryState;
  run: Run;
  inbox: StoryDelivery[];
  protectedKitIds: string[];
  reward: { matchId: string; encounterId: string; choices: string[] } | null;
  endingLinkId: string | null;
  cancelledMatches: string[];
  analysisCache?: RaidBlueprint[];
}
export type StorySessionResult =
  | { ok: true; session: StorySession; effects: StoryEffect[] }
  | { ok: false; session: StorySession; effects: []; error: string };
const failure = (session: StorySession, error: string): StorySessionResult => ({
  ok: false,
  session,
  effects: [],
  error,
});
const success = (
  session: StorySession,
  effects: StoryEffect[] = [],
): StorySessionResult => ({ ok: true, session, effects });
function allEncounters() {
  return STORY_STAGES.flatMap((stage) => stage.encounters);
}
function market(s: StorySession) {
  const chapter = currentStoryStage(s.story),
    factions = new Set(
      STORY_STAGES.slice(0, chapter.number).flatMap((stage) =>
        stage.encounters.map((e) => e.enemy.faction),
      ),
    );
  let seed =
    (s.run.seed +
      s.run.rerolls * 71 +
      s.story.resolvedMatches.length * 953 +
      chapter.number * 7919) >>>
    0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pool = Object.values(D.PARTS).filter(
    (p) =>
      !p.fused &&
      p.status !== "experimental" &&
      factions.has(p.faction) &&
      p.price <= 5 + chapter.number,
  );
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  s.run.shop = pool
    .slice(0, chapter.number < 3 ? 4 : 5)
    .map((p) => ({ type: p.id, sold: false }));
  s.run.shop.push({
    type: `plan:${chapter.number < 3 ? "srv_s" : chapter.number < 6 ? "srv_m" : "srv_l"}`,
    sold: false,
  });
}
export function createStorySession(): StorySession {
  const run = R.newRun("campaign");
  run.page.name = "";
  run.cash = 11;
  run.tutorial = 0;
  run.tutorialAck = true;
  run.shop = ["ab_heading", "ab_link", "ab_nav", "ab_hr", "plan:srv_s"].map(
    (type) => ({ type, sold: false }),
  );
  return {
    version: 1,
    story: createStoryState(),
    run,
    inbox: [],
    protectedKitIds: [],
    reward: null,
    endingLinkId: null,
    cancelledMatches: [],
    analysisCache: [],
  };
}
export function validateStorySession(value: unknown): value is StorySession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const s = value as StorySession;
  if (
    s.version !== 1 ||
    !validateStoryState(s.story) ||
    !R.validateRun(s.run) ||
    s.run.mode !== "campaign" ||
    !["build", "gameover"].includes(s.run.phase) ||
    s.run.stage !== currentStoryStage(s.story).number - 1 ||
    s.run.page.name !== s.story.pageName
  )
    return false;
  if (
    !Array.isArray(s.inbox) ||
    s.inbox.length > 128 ||
    s.inbox.some(
      (d) =>
        !d ||
        typeof d.id !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,179}$/.test(d.id) ||
        typeof d.type !== "string" ||
        !Object.hasOwn(D.PARTS, d.type) ||
        !["loot", "fusion-kit"].includes(d.reason),
    ) ||
    new Set(s.inbox.map((d) => d.id)).size !== s.inbox.length
  )
    return false;
  if (
    !Array.isArray(s.protectedKitIds) ||
    s.protectedKitIds.length > 2 ||
    new Set(s.protectedKitIds).size !== s.protectedKitIds.length ||
    s.protectedKitIds.some(
      (id) =>
        !s.run.owned.some(
          (p) => p.id === id && ["ab_mail", "am_coupon"].includes(p.type),
        ),
    )
  )
    return false;
  if (
    !Array.isArray(s.cancelledMatches) ||
    s.cancelledMatches.length > 4096 ||
    s.cancelledMatches.some(
      (id) =>
        typeof id !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/.test(id),
    ) ||
    new Set(s.cancelledMatches).size !== s.cancelledMatches.length
  )
    return false;
  if (
    s.story.pendingEncounter &&
    s.cancelledMatches.includes(s.story.pendingEncounter.matchId)
  )
    return false;
  if (
    s.endingLinkId !== null &&
    (typeof s.endingLinkId !== "string" || !/^p\d+$/.test(s.endingLinkId))
  )
    return false;
  if (s.story.endingLinkPlaced !== (s.endingLinkId !== null)) return false;
  if (
    s.story.endingLinkPlaced &&
    s.story.phase !== "complete" &&
    !s.run.owned.some(
      (p) => p.id === s.endingLinkId && p.type === "ab_link" && C.placed(p),
    )
  )
    return false;
  if (
    s.analysisCache !== undefined &&
    (!Array.isArray(s.analysisCache) ||
      s.analysisCache.length > 8 ||
      s.analysisCache.some((bp) => !validateRaidBlueprint(bp).ok) ||
      new Set(s.analysisCache.map((bp) => bp.captureId)).size !==
        s.analysisCache.length)
  )
    return false;
  if (s.reward !== null) {
    if (
      !s.reward ||
      typeof s.reward !== "object" ||
      !s.story.resolvedMatches.includes(s.reward.matchId) ||
      !s.story.completedEncounters.includes(s.reward.encounterId) ||
      !Array.isArray(s.reward.choices) ||
      s.reward.choices.length < 1 ||
      s.reward.choices.length > 3 ||
      s.reward.choices.some((type) => !D.PARTS[type])
    )
      return false;
    const encounter = allEncounters().find(
      (e) => e.id === s.reward!.encounterId,
    );
    if (
      !encounter ||
      s.reward.choices.some(
        (type) => !encounter.enemy.layout.some((row) => row[0] === type),
      )
    )
      return false;
  }
  return true;
}
function deliver(
  s: StorySession,
  type: string,
  id: string,
  reason: StoryDelivery["reason"],
) {
  if (s.run.owned.length >= D.MAX_ITEMS) {
    if (s.inbox.length >= 128) return false;
    s.inbox.push({ id, type, reason });
    return true;
  }
  const item = R.nextItem(s.run, type);
  s.run.owned.push(item);
  if (reason === "fusion-kit") s.protectedKitIds.push(item.id);
  return true;
}
export function commandStorySession(
  input: StorySession,
  command: StoryCommand,
): StorySessionResult {
  if (!validateStorySession(input))
    return failure(input, "物語とページの保存状態を確認できません。");
  if (
    command.type === "start-encounter" ||
    command.type === "resolve-encounter" ||
    command.type === "witness-fusion"
  )
    return failure(input, "この操作には実際の対戦・合成の確認が必要です。");
  if (input.reward && command.type === "advance-stage")
    return failure(input, "先に回収するUIを選んでください。");
  const out = transitionStory(input.story, command);
  if (!out.ok) return failure(input, out.error);
  const s = structuredClone(input);
  s.story = out.state;
  for (const effect of out.effects) {
    if (effect.type === "page-named") s.run.page.name = effect.name;
    if (effect.type === "stage-unlocked") {
      s.run.stage = currentStoryStage(s.story).number - 1;
      s.run.wins = s.run.stage;
      s.run.rerolls = 0;
      s.run.lives = Math.min(3, s.run.lives + 1);
      market(s);
    }
    if (effect.type === "fusion-kit")
      for (const type of effect.types)
        if (!deliver(s, type, `kit-${type}`, "fusion-kit"))
          return failure(
            input,
            "受取箱に2つ空きを作ってください。支給品と段階の進行は保全されています。",
          );
    if (effect.type === "ending-link-granted") {
      if (s.run.owned.length >= D.MAX_ITEMS)
        return failure(
          input,
          "手持ちに1つ空きを作ってください。リンクも復元状態も失われません。",
        );
      const item = R.nextItem(s.run, "ab_link");
      item.label = effect.label;
      const spot = C.findSpace(s.run.owned, item);
      if (!spot)
        return failure(
          input,
          "ページに青いリンク1つ分の空きを作ってください。まだリンクは消費していません。",
        );
      item.x = spot.x;
      item.y = spot.y;
      s.run.owned.push(item);
      s.endingLinkId = item.id;
    }
  }
  if (command.type === "cancel-encounter")
    s.cancelledMatches.push(command.matchId);
  return validateStorySession(s)
    ? success(s, out.effects)
    : failure(input, "保存条件に合わないため、操作を取り消しました。");
}
export function updateStoryBuild(
  input: StorySession,
  build: Run,
): StorySessionResult {
  const s = structuredClone(input);
  s.run = structuredClone(build);
  // Renaming in the existing editor remains part of the story's same page.
  const name = s.run.page.name.normalize("NFC").trim();
  if (!name || name.length > 40 || /[\u0000-\u001f\u007f-\u009f]/.test(name))
    return failure(input, "ページ名を40文字以内で入力してください。");
  s.run.page.name = name;
  s.story.pageName = name;
  if (
    !s.story.fusionWitnessed &&
    input.protectedKitIds.some((id) => !build.owned.some((p) => p.id === id))
  )
    return failure(
      input,
      "初回の異種合成に使う支給品は、合成するまで残してください。",
    );
  return validateStorySession(s)
    ? success(s)
    : failure(
        input,
        "物語の構成として保存できません。元の構成を保っています。",
      );
}
export function storyEnemyBoard(s: StorySession) {
  const encounter =
    currentStoryEncounter(s.story) ??
    currentStoryStage(s.story).encounters.at(-1)!;
  return encounter.enemy.layout.map(([type, x, y, w, h, shape, label], i) =>
    Object.assign(
      C.makeItem(type, `e${i}`, x, y, w, h),
      shape ? { shape } : {},
      label ? { label } : {},
    ),
  );
}
export function prepareStoryBattle(input: StorySession, matchId: string) {
  const fail = (error: string) => ({
    ok: false as const,
    error,
    session: input,
  });
  if (!validateStorySession(input))
    return fail("物語の保存状態を確認できません。");
  if (input.run.phase !== "build" || input.run.lives <= 0)
    return fail("この旅のライフが尽きています。");
  if (input.reward) return fail("先に回収するUIを選んでください。");
  if (input.cancelledMatches.includes(matchId))
    return fail("中断済みの接続IDは再利用できません。");
  if (
    !input.run.owned.some(
      (p) => C.placed(p) && D.PARTS[p.type].kind === "attack",
    )
  )
    return fail("攻撃するUIを最低1つ、自分のページに置いてください。");
  const encounter = currentStoryEncounter(input.story);
  if (!encounter)
    return fail(
      "この段階の対戦は終わっています。作業場で記録を確認してください。",
    );
  const result = transitionStory(input.story, {
    type: "start-encounter",
    encounterId: encounter.id,
    matchId,
  });
  if (!result.ok) return fail(result.error);
  const session = structuredClone(input);
  session.story = result.state;
  const battle = new E.Battle(input.run.owned, storyEnemyBoard(input), {
    playerHp: R.playerHp(input.run),
    enemyHp: encounter.enemy.hp,
    playerAdmin: input.run.admin,
    enemyAdmin: encounter.enemy.admin,
    playerCapacity: R.capacity(input.run),
  });
  return { ok: true as const, session, battle, encounter, matchId };
}
function fusionWitness(
  s: StorySession,
  fusions: ReturnType<typeof R.fuse>,
): StoryEffect[] {
  if (
    !fusions.some(
      (f) => D.PARTS[f.from[0]].faction !== D.PARTS[f.from[1]].faction,
    )
  )
    return [];
  const result = transitionStory(s.story, { type: "witness-fusion" });
  if (!result.ok) return [];
  s.story = result.state;
  s.protectedKitIds = [];
  return result.effects;
}
export function settleStoryBattle(
  input: StorySession,
  matchId: string,
  battle: InstanceType<typeof E.Battle>,
) {
  if (input.story.resolvedMatches.includes(matchId))
    return {
      ...success(input),
      summary: input.run.history.at(-1),
      fusions: [],
    };
  if (
    !validateStorySession(input) ||
    !battle.result ||
    input.cancelledMatches.includes(matchId)
  )
    return failure(input, "この対戦を精算できません。");
  const pending = input.story.pendingEncounter,
    encounter = allEncounters().find((e) => e.id === pending?.id);
  if (!pending || pending.matchId !== matchId || !encounter)
    return failure(input, "対戦の接続IDと記録が一致しません。");
  const resolved = transitionStory(input.story, {
    type: "resolve-encounter",
    matchId,
    winner: battle.result.winner,
  });
  if (!resolved.ok) return failure(input, resolved.error);
  const s = structuredClone(input);
  s.story = resolved.state;
  const win = battle.result.winner === "player",
    income = Math.min(10, Math.floor(battle.player.income / 2));
  const summary: BattleSummary = {
    winner: battle.result.winner,
    time: battle.elapsed,
    enemy: encounter.enemy.pageName,
    round: null,
    base: 6,
    bonus: win ? 4 : 0,
    income,
    rawIncome: battle.player.income,
    total: 6 + (win ? 4 : 0) + income,
    stage: s.run.stage,
    damage: Math.round(battle.player.damage),
    hp: Math.ceil(battle.player.hp),
    maxHp: battle.player.maxHp,
    stats: battle.player.parts
      .map((p) => ({
        type: p.type,
        id: p.id,
        damage: Math.round(p.damage),
        earned: p.earned,
        shield: p.protected,
        heal: p.healed,
        fires: p.fires,
      }))
      .sort((a, b) => b.damage - a.damage),
  };
  s.run.cash += summary.total;
  s.run.history.push(summary);
  s.run.history = s.run.history.slice(-30);
  s.run.phase = "build";
  s.run.pending = null;
  if (!win) {
    s.run.lives--;
    if (s.run.lives <= 0) s.run.phase = "gameover";
  } else
    s.reward = {
      matchId,
      encounterId: encounter.id,
      choices: [...new Set(encounter.enemy.layout.map((row) => row[0]))].slice(
        0,
        3,
      ),
    };
  const fusions = s.run.phase === "gameover" ? [] : R.fuse(s.run);
  const effects = [...resolved.effects, ...fusionWitness(s, fusions)];
  market(s);
  return validateStorySession(s)
    ? { ...success(s, effects), summary, fusions }
    : failure(input, "精算結果を保存できません。元の対戦を保っています。");
}
export function claimStoryReward(
  input: StorySession,
  choice: string | null,
): StorySessionResult {
  if (!validateStorySession(input))
    return failure(input, "物語の保存状態を確認できません。");
  if (!input.reward) return success(input);
  if (choice !== null && !input.reward.choices.includes(choice))
    return failure(input, "この報酬は回収候補にありません。");
  const s = structuredClone(input);
  if (
    choice !== null &&
    !deliver(s, choice, `loot-${s.reward!.matchId}`, "loot")
  )
    return failure(
      input,
      "受取箱がいっぱいです。回収候補はそのまま残っています。",
    );
  s.reward = null;
  return validateStorySession(s)
    ? success(s)
    : failure(input, "回収結果を保存できません。");
}
export function collectStoryDelivery(
  input: StorySession,
  id: string,
): StorySessionResult {
  if (!validateStorySession(input))
    return failure(input, "物語の保存状態を確認できません。");
  const delivery = input.inbox.find((d) => d.id === id);
  if (!delivery) return failure(input, "受取品が見つかりません。");
  if (input.run.owned.length >= D.MAX_ITEMS)
    return failure(
      input,
      "手持ちに空きを作ってください。支給品は受取箱に残っています。",
    );
  const s = structuredClone(input);
  s.inbox = s.inbox.filter((d) => d.id !== id);
  deliver(s, delivery.type, delivery.id, delivery.reason);
  return success(s);
}
export function rehearseStoryFusion(input: StorySession) {
  if (
    !validateStorySession(input) ||
    input.run.phase !== "build" ||
    input.story.phase !== "hub"
  )
    return failure(input, "編集できる状態で試験公開してください。");
  const s = structuredClone(input),
    fusions = R.fuse(s.run);
  if (!fusions.length)
    return failure(
      input,
      "支給されたメールリンクとクーポンを隣に置いてください。未受取なら作業場の受取箱から取り出せます。",
    );
  const effects = fusionWitness(s, fusions);
  return validateStorySession(s)
    ? { ...success(s, effects), fusions }
    : failure(input, "合成結果を保存できません。");
}
export function rerollStoryMarket(input: StorySession): StorySessionResult {
  if (
    !validateStorySession(input) ||
    input.run.phase !== "build" ||
    input.story.phase === "encounter"
  )
    return failure(input, "今は品ぞろえを更新できません。");
  if (input.run.cash < R.REROLL)
    return failure(input, `品ぞろえの更新には$${R.REROLL}必要です。`);
  const s = structuredClone(input);
  s.run.cash -= R.REROLL;
  s.run.rerolls++;
  market(s);
  return success(s);
}
export function createStorySessionPersistence(storage: StoragePort) {
  let blocked = false;
  let lastRaw: string | null = null;
  const load = () => {
    let raw: string | null;
    try {
      raw = storage.getItem(STORY_SAVE_KEY);
    } catch {
      blocked = true;
      return {
        status: "unavailable" as const,
        error: "物語の保存領域を読み込めません。",
      };
    }
    if (raw === null) {
      lastRaw = null;
      blocked = false;
      return { status: "empty" as const };
    }
    try {
      const session: unknown = JSON.parse(raw);
      if (validateStorySession(session)) {
        lastRaw = raw;
        blocked = false;
        return { status: "loaded" as const, session };
      }
    } catch {}
    blocked = true;
    return {
      status: "corrupt" as const,
      raw,
      error: "物語の保存データを確認できません。元データは保護されています。",
    };
  };
  load();
  const save = (session: StorySession) => {
    if (blocked)
      return {
        ok: false as const,
        error:
          "元の物語データが保護されています。書き出してから復旧してください。",
      };
    if (!validateStorySession(session))
      return {
        ok: false as const,
        error: "物語とページを一緒に保存できません。",
      };
    try {
      if (storage.getItem(STORY_SAVE_KEY) !== lastRaw)
        return {
          ok: false as const,
          error:
            "別の画面で物語が更新されました。作業場を開き直して最新の記録を読み込んでください。",
        };
      const raw = JSON.stringify(session);
      storage.setItem(STORY_SAVE_KEY, raw);
      lastRaw = raw;
      return { ok: true as const };
    } catch {
      return {
        ok: false as const,
        error:
          "物語を保存できません。構成を書き出してバックアップしてください。",
      };
    }
  };
  const recover = (session: StorySession) => {
    if (!validateStorySession(session))
      return { ok: false as const, error: "復旧する物語を確認できません。" };
    try {
      const raw = storage.getItem(STORY_SAVE_KEY);
      if (raw !== null) storage.setItem(STORY_SAVE_KEY + "-recovery", raw);
      lastRaw = raw;
      blocked = false;
      return save(session);
    } catch {
      return {
        ok: false as const,
        error: "元データを保全できないため、置き換えを中止しました。",
      };
    }
  };
  return { load, save, recover };
}

/** Validated acquisition and its energy receipt form the same atomic story save payload. */
export async function cacheStoryAnalysis(
  input: StorySession,
  blueprint: RaidBlueprint,
  kind: "new" | "reanalyze",
): Promise<StorySessionResult> {
  input = structuredClone(input);
  if (!validateStorySession(input))
    return failure(input, "物語の保存状態を確認できません。");
  blueprint = structuredClone(blueprint);
  const verified = await verifyRaidBlueprint(blueprint);
  if (!verified.ok) return failure(input, verified.error);
  const receiptId = `analysis_${blueprint.captureId}`;
  if (input.story.analysisReceipts.includes(receiptId)) return success(input);
  const result = transitionStory(input.story, {
    type: "spend-analysis",
    receiptId,
    kind,
  });
  if (!result.ok) return failure(input, result.error);
  const s = structuredClone(input);
  s.story = result.state;
  s.analysisCache = [
    ...(s.analysisCache ?? []).filter(
      (bp) => bp.captureId !== blueprint.captureId,
    ),
    blueprint,
  ].slice(-8);
  return validateStorySession(s)
    ? success(s)
    : failure(input, "解析結果とエネルギーを保存できません。");
}
export function findStoryCapture(
  input: StorySession,
  url: string,
): RaidBlueprint | undefined {
  const normalize = (value: string) => {
    try {
      const parsed = new URL(value);
      parsed.hash = "";
      return parsed.href;
    } catch {
      return value;
    }
  };
  const match = [...(input.analysisCache ?? [])]
    .reverse()
    .find((bp) => normalize(bp.source.displayUrl) === normalize(url));
  return match ? structuredClone(match) : undefined;
}
