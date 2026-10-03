/** Fixed read-only witness comparisons. Never launches, settles, imports or saves a user Run. */
import C from "./document.js";
import D from "./data.js";
import E from "./engine.js";
import R from "./run.js";
import { board, resources } from "./buildlab.js";
import { arenaCatalogDefinition, fingerprintJson } from "./online/catalog.js";
import type { Item, LayoutEntry, Run } from "./types.js";
import bundled from "../fixtures/balance/paid-rearranged-comparison.json";
import opponentFixture from "../fixtures/balance/paid-counter-opponents.json";

export const PAID_WITNESS_FOES = Object.freeze([
  Object.freeze({ id: "s3-candidate-1100144", name: "Cart" }),
  Object.freeze({ id: "s0-candidate-432", name: "Six-onestop" }),
] as const);
export const PAID_WITNESS_BASE_HP = Object.freeze([
  396, 440, 460, 484,
] as const);
export const PAID_WITNESS_PHASE_SECONDS = Object.freeze([
  -0.5, 0, 0.5,
] as const);
export type PaidWitnessFoeId = (typeof PAID_WITNESS_FOES)[number]["id"];
export type PaidWitnessSelection = Readonly<{
  foeId: PaidWitnessFoeId;
  commonBaseHp: (typeof PAID_WITNESS_BASE_HP)[number];
  phaseSeconds: (typeof PAID_WITNESS_PHASE_SECONDS)[number];
}>;
export const PAID_WITNESS_DEFAULT_SELECTION: PaidWitnessSelection =
  Object.freeze({
    foeId: "s3-candidate-1100144",
    commonBaseHp: 440,
    phaseSeconds: 0,
  });
export type PaidWitnessSeat = "player" | "enemy";
export type PaidWitnessLayout = "original" | "rearranged";
export type PaidWitnessProgress = Readonly<{
  completed: 0 | 1 | 2 | 3 | 4;
  total: 4;
}>;
export type PaidWitnessScheduler = (resume: () => void) => () => void;
export interface PaidWitnessCompareOptions {
  signal?: AbortSignal;
  onProgress?: (progress: PaidWitnessProgress) => void;
  /** Production default queues a host task. The seam permits deterministic lifecycle tests. */
  schedule?: PaidWitnessScheduler;
}
export interface PaidWitnessConditions {
  combatVersion: "combat-v4";
  step: 0.05;
  /** All pairs are logical paid-side / sampled-foe order, including reverse seat. */
  baseHp: [number, number];
  initialHp: [number, number];
  initialMaxHp: [number, number];
  capacity: [number, number];
  load: [number, number];
  lag: [number, number];
  lagLoss: [number, number];
  admins: [string[], string[]];
}
export interface PaidWitnessRow extends PaidWitnessConditions {
  layout: PaidWitnessLayout;
  paidSeat: PaidWitnessSeat;
  winner: "own" | "foe" | "draw";
  ownHp: number;
  foeHp: number;
  elapsed: number;
}
export interface PaidWitnessComparison {
  selection: PaidWitnessSelection;
  rows: [PaidWitnessRow, PaidWitnessRow, PaidWitnessRow, PaidWitnessRow];
}
interface Geometry {
  x: number | null;
  y: number | null;
  w: number;
  h: number;
}
export interface PaidWitnessInspection {
  selection: PaidWitnessSelection;
  original: Run;
  rearranged: Run;
  foe: {
    id: PaidWitnessFoeId;
    name: string;
    board: Item[];
    capacity: number;
    admin: string[];
  };
  inventory: { id: string; type: string; before: Geometry; after: Geometry }[];
  conditions: PaidWitnessConditions;
  phaseLabel: string;
}
export interface PaidWitnessSummary {
  readonly seed: 308;
  readonly itemCount: 14;
  readonly stageBaseHp: 460;
  readonly sourceFingerprint: string;
  readonly initialCash: 10;
  readonly inventoryValue: 57;
  readonly priorWins: 7;
  readonly lives: 3;
  readonly budget: Readonly<{
    parts: number;
    plans: number;
    rerolls: number;
    total: number;
    rewards: number;
    earnedInventory: number;
    remainingCash: number;
  }>;
  readonly limitations: readonly string[];
}
export interface PaidWitnessModel {
  readonly summary: PaidWitnessSummary;
  inspect(selection: PaidWitnessSelection): PaidWitnessInspection;
  compare(
    selection: PaidWitnessSelection,
    options?: PaidWitnessCompareOptions,
  ): Promise<PaidWitnessComparison>;
}
const PINS = Object.freeze({
  original: "67038ae40eaa04b6c6500cd2032efb6e901cd153f0342c072173ae7e002e125f",
  rearranged:
    "4425ad75cf0aae3ba341f339109047e23302f5051355b1cbb2e2e9b9fe15529e",
  sequence: "9ea3f00f9edb095147d7807bf27575dda0d1fe472e4540428cf78870f95a35cb",
  catalog: "5ae7f15b99800961281723849d5c74b681c7cff3b6f4d92879f9be6323db6ece",
  opponents: "aca70950375815010add344e85f9b2a51009e642bda187760134ee8f13cd12a5",
});
const BUDGET = Object.freeze({
  parts: 51,
  plans: 12,
  rerolls: 13,
  total: 76,
  rewards: 70,
  earnedInventory: 6,
  remainingCash: 4,
});
const META = {
  schemaVersion: 1,
  seed: 308,
  source: "legacy-eight-round-route",
  combatVersion: "combat-v4",
  initialCash: 10,
  itemCount: 14,
  stageBaseHp: 460,
  priorWins: 7,
  lives: 3,
  inventoryValue: 57,
  acquisitionEventCount: 202,
  rearrangementMoveCount: 28,
  budget: BUDGET,
  pins: PINS,
  options: {
    foeIds: PAID_WITNESS_FOES.map((f) => f.id),
    commonBaseHp: PAID_WITNESS_BASE_HP,
    phaseSeconds: PAID_WITNESS_PHASE_SECONDS,
    step: 0.05,
    maxTicks: 2400,
  },
};
function requireEvidence(valid: unknown, message: string): asserts valid {
  if (!valid) throw new Error(`記録の比較を開始できません: ${message}`);
}
function abortError() {
  const error = new Error("配置の比較を中止しました");
  error.name = "AbortError";
  return error;
}
function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}
function selectionCopy(value: PaidWitnessSelection): PaidWitnessSelection {
  requireEvidence(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      JSON.stringify(Object.keys(value).sort()) ===
        JSON.stringify(["commonBaseHp", "foeId", "phaseSeconds"]) &&
      PAID_WITNESS_FOES.some((f) => f.id === value.foeId) &&
      PAID_WITNESS_BASE_HP.includes(value.commonBaseHp) &&
      PAID_WITNESS_PHASE_SECONDS.includes(value.phaseSeconds),
    "選択した相手・HP・位相が固定条件と一致しません",
  );
  return Object.freeze({
    foeId: value.foeId,
    commonBaseHp: value.commonBaseHp,
    phaseSeconds: value.phaseSeconds,
  });
}
function validateRun(value: unknown): asserts value is Run {
  requireEvidence(
    R.validateRun(value),
    "保存スナップショットの形式が一致しません",
  );
  requireEvidence(
    value.mode === "campaign" &&
      value.phase === "build" &&
      value.stage === 7 &&
      value.wins === 7 &&
      value.lives === 3 &&
      value.cash === 4 &&
      value.owned.length === 14 &&
      value.history.length === 7 &&
      value.pending === null &&
      value.seed === 308 &&
      R.capacity(value) === 31 &&
      R.playerHp(value) === 460 &&
      JSON.stringify(value.admin) === '["backup"]',
    "元の取得状態が一致しません",
  );
  requireEvidence(
    value.owned.every(
      (p) =>
        C.placed(p) &&
        p.shape === "source" &&
        !D.PARTS[p.type].fused &&
        D.PARTS[p.type].status !== "experimental" &&
        C.canPlace(value.owned, p, p.x, p.y, p.w, p.h),
    ) && E.analyze(value.owned).load === 23,
    "14個の元の部品または配置が一致しません",
  );
}
const nonGeometry = (run: Run) => ({
  ...run,
  owned: run.owned.map(({ x, y, w, h, ...item }) => item),
});
type Foe = PaidWitnessInspection["foe"];
function newDuel(
  run: Run,
  foe: Foe,
  selection: PaidWitnessSelection,
  paidSeat: PaidWitnessSeat,
) {
  const ownBoard = structuredClone(run.owned),
    foeBoard = structuredClone(foe.board);
  const reverse = paidSeat === "enemy";
  const battle = new E.Battle(
    reverse ? foeBoard : ownBoard,
    reverse ? ownBoard : foeBoard,
    {
      combatVersion: "combat-v4",
      experimentalRules: null,
      playerHp: selection.commonBaseHp,
      enemyHp: selection.commonBaseHp,
      playerCapacity: reverse ? foe.capacity : R.capacity(run),
      enemyCapacity: reverse ? R.capacity(run) : foe.capacity,
      playerAdmin: [...(reverse ? foe.admin : run.admin)],
      enemyAdmin: [...(reverse ? run.admin : foe.admin)],
    },
  );
  const own = reverse ? battle.enemy : battle.player,
    other = reverse ? battle.player : battle.enemy;
  requireEvidence(
    battle.combatVersion === "combat-v4" && battle.experimentalRules === null,
    "戦闘規則が記録と一致しません",
  );
  const conditions: PaidWitnessConditions = {
    combatVersion: "combat-v4",
    step: 0.05,
    baseHp: [selection.commonBaseHp, selection.commonBaseHp],
    initialHp: [own.hp, other.hp],
    initialMaxHp: [own.maxHp, other.maxHp],
    capacity: [own.capacity, other.capacity],
    load: [own.load, other.load],
    lag: [own.lag, other.lag],
    lagLoss: [own.lagLoss ?? 0, other.lagLoss ?? 0],
    admins: [[...own.admin], [...other.admin]],
  };
  const delayed =
    selection.phaseSeconds > 0
      ? own
      : selection.phaseSeconds < 0
        ? other
        : null;
  for (const part of delayed?.parts ?? [])
    if (part.period) part.remaining += Math.abs(selection.phaseSeconds);
  return { battle, own, other, conditions };
}

const scheduleHostTurn: PaidWitnessScheduler = (resume) => {
  const timer = setTimeout(resume, 0);
  return () => clearTimeout(timer);
};
function nextHostTurn(schedule: PaidWitnessScheduler, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    checkAbort(signal);
    let settled = false,
      registering = true,
      resumed = false;
    let cancel: (() => void) | undefined;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const cancelTask = () => {
      try {
        cancel?.();
      } catch {
        /* Cancellation still wins. */
      }
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      cancelTask();
      reject(abortError());
    };
    const resume = () => {
      if (settled) return;
      if (registering) {
        resumed = true;
        return;
      }
      if (signal?.aborted) {
        onAbort();
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const scheduled = schedule(resume);
      requireEvidence(
        typeof scheduled === "function",
        "計算の待機処理を開始できません",
      );
      cancel = scheduled;
      registering = false;
      if (settled) cancelTask();
      else if (resumed) resume();
    } catch (error) {
      if (!settled) {
        settled = true;
        cleanup();
        cancelTask();
        reject(error);
      }
    }
  });
}

/** Consistency hashes are unsigned regression guards, never proof of a player's acquisition. */
export async function preparePaidWitnessComparison({
  signal,
}: { signal?: AbortSignal } = {}): Promise<PaidWitnessModel> {
  checkAbort(signal);
  const snapshot = structuredClone(bundled),
    foeData = structuredClone(opponentFixture);
  const { original, rearranged, ...metadata } = snapshot;
  requireEvidence(
    JSON.stringify(metadata) === JSON.stringify(META),
    "固定条件・取得記録・ハッシュが一致しません",
  );
  validateRun(original);
  validateRun(rearranged);
  requireEvidence(
    JSON.stringify(nonGeometry(original)) ===
      JSON.stringify(nonGeometry(rearranged)),
    "配置以外の状態が異なります",
  );
  requireEvidence(
    typeof globalThis.crypto?.subtle?.digest === "function",
    "この環境ではSHA-256を検証できません",
  );
  let hashes: string[];
  try {
    hashes = await Promise.all(
      [original, rearranged, foeData, arenaCatalogDefinition()].map(
        fingerprintJson,
      ),
    );
  } catch {
    checkAbort(signal);
    throw new Error("記録の比較を開始できません: SHA-256の検証に失敗しました");
  }
  checkAbort(signal);
  requireEvidence(
    JSON.stringify(hashes) ===
      JSON.stringify([
        PINS.original,
        PINS.rearranged,
        PINS.opponents,
        PINS.catalog,
      ]),
    "スナップショット・相手・現在の戦闘定義が記録と一致しません",
  );
  const foes: Foe[] = foeData.opponents.map((entry, index) => {
    const cost = resources(entry.layout as LayoutEntry[]),
      expected = PAID_WITNESS_FOES[index];
    requireEvidence(
      entry.id === expected.id &&
        entry.capacity === [35, 26][index] &&
        cost.legal &&
        cost.load === [28, 19][index] &&
        !cost.experimental.length &&
        JSON.stringify(entry.admin) === '["server","backup"]',
      "固定相手の構成が一致しません",
    );
    return {
      id: expected.id,
      name: expected.name,
      board: board(entry.layout as LayoutEntry[], "opponent"),
      capacity: entry.capacity,
      admin: [...entry.admin],
    };
  });
  const findFoe = (selection: PaidWitnessSelection) =>
    foes.find((f) => f.id === selection.foeId)!;
  const summary: PaidWitnessSummary = Object.freeze({
    seed: 308,
    itemCount: 14,
    stageBaseHp: 460,
    sourceFingerprint: PINS.sequence,
    initialCash: 10,
    inventoryValue: 57,
    priorWins: 7,
    lives: 3,
    budget: BUDGET,
    limitations: Object.freeze([
      "旧8ラウンド遠征の固定経路1件。本編15対戦・8段階の取得証明ではありません。",
      "相手は完成済み構成2件の標本で、有償入手・同額比較の証明はありません。",
      "位相は片側全体の周期時計だけをずらします。全HP・最適性・確実な買い方は保証しません。",
      "取得途中の第5・6戦には過負荷があります。第7戦の報酬確定後に文字サイズを購入しています。",
      "合法な配置・寸法ですが、特殊な高さを含む見た目・実ブラウザ操作は未確認です。",
    ]),
  });
  return Object.freeze({
    summary,
    inspect(input: PaidWitnessSelection): PaidWitnessInspection {
      const selection = selectionCopy(input),
        foe = findFoe(selection);
      const geometry = ({ x, y, w, h }: Item): Geometry => ({ x, y, w, h });
      return {
        selection,
        original: structuredClone(original),
        rearranged: structuredClone(rearranged),
        foe: structuredClone(foe),
        inventory: original.owned.map((p, i) => ({
          id: p.id,
          type: p.type,
          before: geometry(p),
          after: geometry(rearranged.owned[i]),
        })),
        conditions: newDuel(original, foe, selection, "player").conditions,
        phaseLabel:
          selection.phaseSeconds < 0
            ? "相手の全周期時計を0.5秒遅らせる"
            : selection.phaseSeconds > 0
              ? "有償側の全周期時計を0.5秒遅らせる"
              : "自然な開始位相",
      };
    },
    async compare(
      input: PaidWitnessSelection,
      {
        signal,
        onProgress,
        schedule = scheduleHostTurn,
      }: PaidWitnessCompareOptions = {},
    ): Promise<PaidWitnessComparison> {
      checkAbort(signal);
      const selection = selectionCopy(input),
        foe = structuredClone(findFoe(selection));
      const cases = (["original", "rearranged"] as const).flatMap((layout) =>
        (["player", "enemy"] as const).map((paidSeat) => ({
          layout,
          paidSeat,
          run: structuredClone(layout === "original" ? original : rearranged),
        })),
      );
      const rows: PaidWitnessRow[] = [];
      const report = () => {
        checkAbort(signal);
        onProgress?.(
          Object.freeze({
            completed: rows.length as PaidWitnessProgress["completed"],
            total: 4,
          }),
        );
        checkAbort(signal);
      };
      report();
      for (const { layout, paidSeat, run } of cases) {
        await nextHostTurn(schedule, signal);
        checkAbort(signal);
        const { battle, own, other, conditions } = newDuel(
          run,
          foe,
          selection,
          paidSeat,
        );
        let ticks = 0;
        while (!battle.result && ticks < 2400) {
          const start = performance.now();
          let chunk = 0;
          while (!battle.result && ticks < 2400 && chunk < 100) {
            checkAbort(signal);
            battle.step(0.05);
            ticks++;
            chunk++;
            if (performance.now() - start >= 8) break;
          }
          checkAbort(signal);
          if (!battle.result && ticks < 2400) {
            await nextHostTurn(schedule, signal);
            checkAbort(signal);
          }
        }
        requireEvidence(
          battle.result,
          "2400刻み（120秒）以内に比較が完了しませんでした",
        );
        checkAbort(signal);
        rows.push({
          ...conditions,
          layout,
          paidSeat,
          winner:
            battle.result.winner === "draw"
              ? "draw"
              : battle.result.winner === own.name
                ? "own"
                : "foe",
          ownHp: own.hp,
          foeHp: other.hp,
          elapsed: battle.elapsed,
        });
        report();
      }
      checkAbort(signal);
      requireEvidence(
        rows.length === 4,
        "4対戦すべての結果を取得できませんでした",
      );
      return { selection, rows: rows as PaidWitnessComparison["rows"] };
    },
  });
}
