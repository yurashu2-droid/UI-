import R from "./run.js";
import type { Item, Mode, Run } from "./types.js";
import { contentHash, createRaidLootItem, prepareRaidRewards, verifyRaidBlueprint } from "./raid/blueprint.js";
import type { RaidBlueprint, RaidReward } from "./raid/types.js";

export interface RaidTrophy {
  rewardId: string;
  battleId: string;
  captureId: string;
  componentId: string;
  item: Item;
  acquiredAt: number;
}
interface StoredRaidEncounter { battleId: string; captureId: string; winner: "player"; claimed?: string; discarded?: boolean }
export function createProfileStore(factory: IDBFactory, name = "ui-raid-studio-v4") {
  const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(name, 2);
    request.onupgradeneeded = () => {
      for (const store of ["profiles", "captures", "trophies", "receipts", "encounters"])
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("保存領域を開けません。"));
    request.onblocked = () => reject(new Error("別の画面が保存領域の更新を使用しています。"));
  });
  async function read<T>(store: string, key: string): Promise<T | undefined> {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  }
  async function loadRun(mode: Mode): Promise<Run | undefined> {
    const value = await read<unknown>("profiles", mode);
    if (value === undefined) return undefined;
    if (!R.validateRun(value) || value.mode !== mode) throw new Error("保存された構成を検証できません。元データは保護されています。");
    return value;
  }
  async function writeRun(run: Run, migrate: boolean): Promise<void> {
    if (!R.validateRun(run)) throw new Error("保存する構成を検証できません。");
    const snapshot = structuredClone(run), db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("profiles", "readwrite"), store = tx.objectStore("profiles");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("保存できません。"));
      tx.onabort = () => reject(tx.error ?? new Error("保存を中止しました。"));
      if (!migrate) { store.put(snapshot, run.mode); return; }
      const previous = store.get(run.mode);
      previous.onsuccess = () => {
        if (previous.result === undefined) {
          store.put(snapshot, run.mode);
          store.put(snapshot, `legacy:${run.mode}`);
        }
      };
    });
  }
  async function claimRaidReward(run: Run, reward: RaidReward, blueprint: RaidBlueprint, options: { writeRunProfile?: boolean } = {}): Promise<{ created: boolean; trophy: RaidTrophy }> {
    const writeRunProfile = options.writeRunProfile !== false;
    // Callers may keep editing while hashing awaits: validate and use only our copies.
    run = structuredClone(run);
    reward = structuredClone(reward);
    blueprint = structuredClone(blueprint);
    if (!R.validateRun(run)) throw new Error("現在の構成を保存できません。");
    const verified = await verifyRaidBlueprint(blueprint);
    if (!verified.ok) throw new Error(verified.error);
    const expected = prepareRaidRewards(blueprint, reward.battleId).find(r => r.rewardId === reward.rewardId);
    if (!expected || await contentHash(expected) !== await contentHash(reward)) throw new Error("報酬が対戦のスナップショットと一致しません。");
    const trophy: RaidTrophy = {
      rewardId: reward.rewardId, battleId: reward.battleId, captureId: reward.captureId,
      componentId: reward.componentId, item: createRaidLootItem(reward, "p0"), acquiredAt: Date.now(),
    };
    const snapshot = structuredClone(run), capture = structuredClone(blueprint), db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["profiles", "captures", "trophies", "receipts", "encounters"], "readwrite");
      let result = { created: true, trophy }, failure: Error | undefined;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(failure ?? tx.error ?? new Error("報酬を保存できません。"));
      tx.onabort = () => reject(failure ?? tx.error ?? new Error("報酬の保存を中止しました。"));
      const encounters = tx.objectStore("encounters"), proof = encounters.get(reward.battleId);
      proof.onsuccess = () => {
        const encounter = proof.result as StoredRaidEncounter | undefined;
        if (!encounter || encounter.winner !== "player" || encounter.captureId !== capture.captureId || encounter.discarded) {
          failure = new Error("この報酬に対応する勝利を確認できません。"); tx.abort(); return;
        }
        const receipts = tx.objectStore("receipts"), previous = receipts.get(reward.battleId);
        previous.onsuccess = () => {
        const existing = previous.result as RaidTrophy | undefined;
        if (existing) {
          if (existing.rewardId !== reward.rewardId) {
            failure = new Error("この対戦の報酬は選択済みです。"); tx.abort(); return;
          }
          result = { created: false, trophy: existing }; return;
        }
        // A URL trophy never changes run economy. Preserve any newer tab's profile.
        if (writeRunProfile) {
        const profiles = tx.objectStore("profiles"), current = profiles.get(run.mode);
        current.onsuccess = () => {
          if (current.result === undefined) profiles.put(snapshot, run.mode);
          else if (!R.validateRun(current.result)) {
            failure = new Error("現在の保存構成を検証できません。"); tx.abort();
          }
        };
        }
        tx.objectStore("captures").put(capture, capture.captureId);
        tx.objectStore("trophies").put(trophy, trophy.rewardId);
        receipts.put(trophy, reward.battleId);
        encounters.put({ ...encounter, claimed: reward.rewardId }, reward.battleId);
        };
      };
    });
  }
  async function listTrophies(): Promise<RaidTrophy[]> {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const request = db.transaction("trophies").objectStore("trophies").getAll();
      request.onsuccess = () => resolve(request.result as RaidTrophy[]);
      request.onerror = () => reject(request.error);
    });
  }
  async function recordRaidVictory(blueprint: RaidBlueprint, battleId: string): Promise<void> {
    const capture = structuredClone(blueprint);
    const checked = await verifyRaidBlueprint(capture);
    if (!checked.ok) throw new Error(checked.error);
    prepareRaidRewards(capture, battleId); // Validate the exact encounter identity.
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["captures", "encounters"], "readwrite");
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error("勝利を保存できません。"));
      const encounters = tx.objectStore("encounters"), existing = encounters.get(battleId);
      existing.onsuccess = () => {
        if (existing.result) return;
        tx.objectStore("captures").put(capture, capture.captureId);
        encounters.put({ battleId, captureId: capture.captureId, winner: "player" } satisfies StoredRaidEncounter, battleId);
      };
    });
  }
  async function listPendingRaids(): Promise<{ blueprint: RaidBlueprint; battleId: string; winner: "player" }[]> {
    const db = await dbPromise;
    const encounters = await new Promise<StoredRaidEncounter[]>((resolve, reject) => {
      const request = db.transaction("encounters").objectStore("encounters").getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const pending = [];
    for (const encounter of encounters.filter(e => !e.claimed && !e.discarded)) {
      const blueprint = await read<RaidBlueprint>("captures", encounter.captureId);
      if (!blueprint) throw new Error("未受取報酬の取得データが見つかりません。");
      pending.push({ blueprint, battleId: encounter.battleId, winner: "player" as const });
    }
    return pending;
  }
  async function discardRaidVictory(battleId: string): Promise<void> {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("encounters", "readwrite"), store = tx.objectStore("encounters"), request = store.get(battleId);
      request.onsuccess = () => { if (request.result) store.put({ ...request.result, discarded: true }, battleId); };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  }
  return {
    loadRun, saveRun: (run: Run) => writeRun(run, false),
    migrateLegacy: (run: Run) => writeRun(run, true), claimRaidReward, listTrophies,
    recordRaidVictory, listPendingRaids, discardRaidVictory,
    getBlueprint: (captureId: string) => read<RaidBlueprint>("captures", captureId),
  };
}
