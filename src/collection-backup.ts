import { createRaidLootItem, prepareRaidRewards, validateRaidBlueprint, verifyRaidBlueprint } from "./raid/blueprint.js";
import type { RaidBlueprint } from "./raid/types.js";
import type { RaidTrophy } from "./profile-store.js";

/** These are archive limits, not limits on the user's stored collection. */
export const COLLECTION_BACKUP_LIMITS = Object.freeze({ trophies: 256, captures: 256, bytes: 16 * 1024 * 1024 });
interface CollectionArchive {
  format: "ui-raid-collection";
  version: 1;
  exportedAt: string;
  trophies: RaidTrophy[];
  captures: RaidBlueprint[];
}
declare const candidateBrand: unique symbol;
/** A runtime-checked opaque handle. Rebuilding or cloning this handle is not authorization to restore. */
export interface CollectionBackupCandidate { readonly [candidateBrand]: true }
export interface CollectionBackupConflict { kind: "capture" | "reward" | "battle"; id: string; message: string }
export interface CollectionBackupInspection {
  candidate: CollectionBackupCandidate;
  trophyCount: number;
  captureCount: number;
  addCount: number;
  unchangedCount: number;
  conflicts: CollectionBackupConflict[];
}
export interface CollectionBackupExport { text: string; byteLength: number; trophyCount: number; captureCount: number }
export interface CollectionBackupRestored { added: number; unchanged: number }
const candidates = new WeakMap<CollectionBackupCandidate, CollectionArchive>();
const stores = ["captures", "trophies", "receipts", "encounters"] as const;
type StoreName = typeof stores[number];
type Snapshot = Record<StoreName, Map<IDBValidKey, unknown>>;
const invalid = () => new Error("コレクションの形式・取得物・由来を検証できません。元の保存は変更していません。");
const limitError = () => new Error("コレクションJSONは取得物256件・取得データ256件・UTF-8で16MiBまでです。上限を超える内容は省略せず中止します。");
const record = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  return Reflect.ownKeys(value).every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === "string" && descriptor?.enumerable && Object.hasOwn(descriptor, "value");
  });
};
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const list = (value: unknown): value is unknown[] => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype &&
  Reflect.ownKeys(value).length === value.length + 1 && Array.from({ length: value.length }, (_, i) => Object.getOwnPropertyDescriptor(value, String(i))).every(d => d?.enumerable && Object.hasOwn(d, "value"));
const timestamp = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const isoDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

// Recursion follows the validated expected value. A malformed stored value can
// neither hide extra keys nor force traversal of unbounded/cyclic structures.
function same(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return list(actual) && actual.length === expected.length && expected.every((entry, i) => same(actual[i], entry));
  if (record(expected)) return record(actual) && exact(actual, Object.keys(expected)) && Object.keys(expected).every(key => same(actual[key], expected[key]));
  return Object.is(actual, expected);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) freeze(entry);
    Object.freeze(value);
  }
  return value;
}
// JSON numbers can represent -0, but JSON.stringify silently changes it to 0.
// Existing blueprint geometry permits -0; retain those exact finite primitives.
function archiveJson(value: unknown): string {
  if (Object.is(value, -0)) return "-0";
  if (Array.isArray(value)) return "[" + value.map(archiveJson).join(",") + "]";
  if (record(value)) return "{" + Object.keys(value).map(key => JSON.stringify(key) + ":" + archiveJson(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
function boundedBytes(text: string): number {
  if (text.length > COLLECTION_BACKUP_LIMITS.bytes) throw limitError();
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > COLLECTION_BACKUP_LIMITS.bytes) throw limitError();
  return bytes;
}
function validateArchive(value: unknown): CollectionArchive {
  if (!record(value) || !exact(value, ["format", "version", "exportedAt", "trophies", "captures"]) || value.format !== "ui-raid-collection" || value.version !== 1 || !isoDate(value.exportedAt)) throw invalid();
  // Count gates precede inspecting any item or doing cryptographic work.
  if (!Array.isArray(value.trophies) || !Array.isArray(value.captures)) throw invalid();
  if (value.trophies.length > COLLECTION_BACKUP_LIMITS.trophies || value.captures.length > COLLECTION_BACKUP_LIMITS.captures) throw limitError();
  if (!list(value.trophies) || !list(value.captures)) throw invalid();
  const captures = new Map<string, RaidBlueprint>();
  for (const capture of value.captures) {
    const checked = validateRaidBlueprint(capture);
    if (!checked.ok) throw new Error(checked.error);
    if (captures.has(checked.value.captureId)) throw new Error("取得データのIDが重複しています。");
    captures.set(checked.value.captureId, checked.value);
  }
  const rewards = new Set<string>(), battles = new Set<string>(), referenced = new Set<string>();
  for (const trophy of value.trophies) {
    if (!record(trophy) || !exact(trophy, ["rewardId", "battleId", "captureId", "componentId", "item", "acquiredAt"]) ||
      typeof trophy.rewardId !== "string" || typeof trophy.battleId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(trophy.battleId) ||
      typeof trophy.captureId !== "string" || typeof trophy.componentId !== "string" || !timestamp(trophy.acquiredAt)) throw invalid();
    if (rewards.has(trophy.rewardId) || battles.has(trophy.battleId)) throw new Error("取得物または対戦のIDが重複しています。");
    const capture = captures.get(trophy.captureId);
    if (!capture) throw new Error("取得物に必要な取得データが不足しています。");
    const reward = prepareRaidRewards(capture, trophy.battleId).find(entry => entry.rewardId === trophy.rewardId);
    if (!reward || reward.componentId !== trophy.componentId || !same(trophy.item, createRaidLootItem(reward, "p0"))) throw invalid();
    rewards.add(trophy.rewardId); battles.add(trophy.battleId); referenced.add(trophy.captureId);
  }
  if (referenced.size !== captures.size) throw new Error("取得物から参照されていない取得データが含まれています。");
  return value as unknown as CollectionArchive;
}
async function verifiedArchive(value: unknown): Promise<CollectionArchive> {
  // Structural validation bounds every nested value. Freeze the whole candidate
  // before the first digest yields; hashes check integrity, not proof of victory.
  const archive = freeze(validateArchive(value));
  for (const capture of archive.captures) {
    const checked = await verifyRaidBlueprint(capture);
    if (!checked.ok) throw new Error(checked.error);
  }
  return archive;
}
export async function parseCollectionBackup(text: string): Promise<CollectionBackupCandidate> {
  if (typeof text !== "string") throw invalid();
  boundedBytes(text);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw invalid(); }
  const archive = await verifiedArchive(parsed);
  const candidate = Object.freeze({}) as CollectionBackupCandidate;
  candidates.set(candidate, archive);
  return candidate;
}
function archiveOf(candidate: CollectionBackupCandidate): CollectionArchive {
  const archive = candidates.get(candidate);
  if (!archive) throw new Error("検証済みのコレクション候補をもう一度確認してください。");
  return archive;
}
function claimMarker(trophy: RaidTrophy) {
  return { battleId: trophy.battleId, captureId: trophy.captureId, winner: "player", claimed: trophy.rewardId };
}
function matchesMarker(value: unknown, trophy: RaidTrophy): boolean {
  const expected = claimMarker(trophy);
  return same(value, expected) || same(value, { ...expected, discarded: false });
}

/** All four stores are read in one transaction; the callback must stay synchronous. */
function collectionTransaction<T>(db: IDBDatabase, mode: IDBTransactionMode, apply: (snapshot: Snapshot, tx: IDBTransaction) => T, limitExport = false): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...stores], mode);
    let result: T, failure: Error | undefined;
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(failure ?? tx.error ?? new Error("コレクションの保存・読み込みを中止しました。"));
    const fail = (error: unknown) => { failure = error instanceof Error ? error : invalid(); tx.abort(); };
    const read = () => {
      const snapshot = {} as Snapshot;
      let remaining = stores.length * 2;
      const ready = () => {
        if (--remaining) return;
        try { result = apply(snapshot, tx); } catch (error) { fail(error); }
      };
      for (const name of stores) {
        const store = tx.objectStore(name), values = store.getAll(), keys = store.getAllKeys();
        let records: unknown[] | undefined, identities: IDBValidKey[] | undefined;
        const collect = () => {
          if (records && identities) snapshot[name] = new Map(identities.map((key, i) => [key, records![i]]));
          ready();
        };
        values.onsuccess = () => { records = values.result; collect(); };
        keys.onsuccess = () => { identities = keys.result; collect(); };
      }
    };
    if (!limitExport) { read(); return; }
    const count = tx.objectStore("trophies").count();
    count.onsuccess = () => {
      if (count.result > COLLECTION_BACKUP_LIMITS.trophies) { fail(limitError()); return; }
      read();
    };
  });
}
function conflictsFor(snapshot: Snapshot, archive: CollectionArchive) {
  const conflicts: CollectionBackupConflict[] = [], fresh: RaidTrophy[] = [];
  let unchanged = 0;
  const addConflict = (kind: CollectionBackupConflict["kind"], id: string) => {
    if (!conflicts.some(conflict => conflict.kind === kind && conflict.id === id))
      conflicts.push({ kind, id, message: "既存の取得物・取得データ・受取記録と一致しません。上書きせず復元全体を中止します。" });
  };
  const captures = new Set(archive.captures.map(capture => capture.captureId));
  const rewards = new Set(archive.trophies.map(trophy => trophy.rewardId)), battles = new Set(archive.trophies.map(trophy => trophy.battleId));
  // Detect identities hidden under incorrect keys, including a different reward
  // for the same battle. A direct get alone would miss these inconsistent rows.
  for (const [key, value] of snapshot.captures) if (record(value) && typeof value.captureId === "string" && captures.has(value.captureId) && key !== value.captureId) addConflict("capture", value.captureId);
  for (const name of ["trophies", "receipts"] as const) for (const [key, value] of snapshot[name]) {
    if (!record(value)) continue;
    if ((typeof value.rewardId === "string" && rewards.has(value.rewardId)) || (typeof value.battleId === "string" && battles.has(value.battleId))) {
      const expectedKey = name === "trophies" ? value.rewardId : value.battleId;
      if (key !== expectedKey || !rewards.has(value.rewardId as string) || !battles.has(value.battleId as string)) addConflict("battle", String(value.battleId));
    }
  }
  for (const [key, value] of snapshot.encounters) if (record(value) &&
    ((typeof value.battleId === "string" && battles.has(value.battleId)) || (typeof value.claimed === "string" && rewards.has(value.claimed))) &&
    (key !== value.battleId || !battles.has(value.battleId as string))) addConflict("battle", String(value.battleId));
  for (const capture of archive.captures) if (snapshot.captures.has(capture.captureId) && !same(snapshot.captures.get(capture.captureId), capture)) addConflict("capture", capture.captureId);
  for (const trophy of archive.trophies) {
    const hasTrophy = snapshot.trophies.has(trophy.rewardId), hasReceipt = snapshot.receipts.has(trophy.battleId), hasEncounter = snapshot.encounters.has(trophy.battleId);
    if (!hasTrophy && !hasReceipt && !hasEncounter) { fresh.push(trophy); continue; }
    const exactTrophy = hasTrophy && same(snapshot.trophies.get(trophy.rewardId), trophy);
    const exactReceipt = hasReceipt && same(snapshot.receipts.get(trophy.battleId), trophy);
    const exactEncounter = hasEncounter && matchesMarker(snapshot.encounters.get(trophy.battleId), trophy);
    if (!exactTrophy) addConflict("reward", trophy.rewardId);
    if (!exactReceipt || !exactEncounter) addConflict("battle", trophy.battleId);
    if (!snapshot.captures.has(trophy.captureId)) addConflict("capture", trophy.captureId);
    if (exactTrophy && exactReceipt && exactEncounter && snapshot.captures.has(trophy.captureId)) unchanged++;
  }
  return { conflicts, fresh, unchanged };
}
export async function exportCollectionFromDatabase(db: IDBDatabase): Promise<CollectionBackupExport> {
  const archive = await collectionTransaction(db, "readonly", snapshot => {
    const trophies: RaidTrophy[] = [], captures = new Map<string, RaidBlueprint>();
    for (const [key, value] of snapshot.trophies) {
      if (!record(value) || key !== value.rewardId || typeof value.captureId !== "string") throw invalid();
      trophies.push(value as unknown as RaidTrophy);
      const capture = snapshot.captures.get(value.captureId);
      if (!capture) throw new Error("コレクションの取得データが不足しています。書き出しを中止しました。");
      captures.set(value.captureId, capture as RaidBlueprint);
    }
    const archive = validateArchive({ format: "ui-raid-collection", version: 1, exportedAt: new Date().toISOString(), trophies, captures: [...captures.values()] });
    const plan = conflictsFor(snapshot, archive);
    if (plan.conflicts.length || plan.fresh.length) throw new Error("コレクションの受取記録が一致しません。書き出しを中止しました。");
    // Orphan receipts/claimed encounters also mean an incomplete collection;
    // unclaimed and discarded-only encounters are deliberately outside the file.
    for (const [key, value] of snapshot.receipts) {
      if (!record(value) || key !== value.battleId || !snapshot.trophies.has(value.rewardId as string) || !same(value, snapshot.trophies.get(value.rewardId as string))) throw invalid();
    }
    for (const [key, value] of snapshot.encounters) if (record(value) && value.claimed !== undefined) {
      const trophy = snapshot.trophies.get(value.claimed as string);
      if (key !== value.battleId || !trophy || !same(trophy, snapshot.receipts.get(value.battleId as string))) throw invalid();
    }
    return archive;
  }, true);
  const text = archiveJson(archive), byteLength = boundedBytes(text);
  await verifiedArchive(archive);
  return { text, byteLength, trophyCount: archive.trophies.length, captureCount: archive.captures.length };
}
export async function inspectCollectionDatabase(db: IDBDatabase, candidate: CollectionBackupCandidate): Promise<CollectionBackupInspection> {
  const archive = archiveOf(candidate);
  return collectionTransaction(db, "readonly", snapshot => {
    const plan = conflictsFor(snapshot, archive);
    return { candidate, trophyCount: archive.trophies.length, captureCount: archive.captures.length, addCount: plan.fresh.length, unchangedCount: plan.unchanged, conflicts: plan.conflicts };
  });
}
export async function restoreCollectionDatabase(db: IDBDatabase, candidate: CollectionBackupCandidate, options: { isCurrent?: () => boolean } = {}): Promise<CollectionBackupRestored> {
  const archive = archiveOf(candidate);
  return collectionTransaction(db, "readwrite", (snapshot, tx) => {
    const plan = conflictsFor(snapshot, archive);
    if (plan.conflicts.length) throw new Error("既存のコレクション・受取記録と競合しています。復元全体を中止しました。");
    // Re-evaluate only after earlier overlapping transactions have finished,
    // immediately before this synchronous batch of writes. No awaits in here.
    if (options.isCurrent && !options.isCurrent()) throw new Error("画面が変わったためコレクションの復元を中止しました。");
    for (const capture of archive.captures) if (!snapshot.captures.has(capture.captureId)) tx.objectStore("captures").add(capture, capture.captureId);
    for (const trophy of plan.fresh) {
      tx.objectStore("trophies").add(trophy, trophy.rewardId);
      tx.objectStore("receipts").add(trophy, trophy.battleId);
      tx.objectStore("encounters").add(claimMarker(trophy), trophy.battleId);
    }
    return { added: plan.fresh.length, unchanged: plan.unchanged };
  });
}
