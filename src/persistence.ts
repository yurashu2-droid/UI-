import R from "./run.js";
import type { Mode, Run } from "./types.js";

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export type SaveRead =
  | { status: "loaded"; run: Run }
  | { status: "empty" }
  | { status: "corrupt"; raw: string; error: string }
  | { status: "unavailable"; error: string };
export type SaveWrite = { ok: true } | { ok: false; error: string };

/** localStorage is the synchronous journal while the IndexedDB mirror is committing. */
export function selectRecoveredRun(local: SaveRead, persisted: Run | undefined): Run | undefined {
  return local.status === "loaded" ? local.run : persisted;
}

/** The invalid original is protected until the user explicitly starts recovery. */
export function createRunPersistence(storage: StoragePort, prefix: string) {
  const reads = new Map<Mode, SaveRead>();
  const lastRaw = new Map<Mode, string | null>();
  const conflict = (): SaveWrite => ({ ok: false, error: "別の画面で保存データが変更されました。今の構成を書き出してから、最新の保存を読み直してください。" });
  function load(mode: Mode): SaveRead {
    let raw: string | null;
    try { raw = storage.getItem(prefix + mode); }
    catch {
      const result: SaveRead = { status: "unavailable", error: "ブラウザの保存領域を読み込めません。" };
      reads.set(mode, result);
      return result;
    }
    lastRaw.set(mode, raw);
    if (raw === null) {
      const result: SaveRead = { status: "empty" };
      reads.set(mode, result);
      return result;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (R.validateRun(parsed) && parsed.mode === mode) {
        const result: SaveRead = { status: "loaded", run: parsed };
        reads.set(mode, result);
        return result;
      }
    } catch { /* Preserve the exact original bytes below. */ }
    const result: SaveRead = {
      status: "corrupt", raw,
      error: "保存データを読み込めません。元のデータは保護されています。",
    };
    reads.set(mode, result);
    return result;
  }
  function save(run: Run): SaveWrite {
    const prior = reads.get(run.mode) ?? load(run.mode);
    if (prior.status === "corrupt" || prior.status === "unavailable") return { ok: false, error: prior.error };
    if (!R.validateRun(run)) return { ok: false, error: "保存するデータの検証に失敗しました。" };
    try {
      if (storage.getItem(prefix + run.mode) !== lastRaw.get(run.mode)) return conflict();
      const raw = JSON.stringify(run);
      storage.setItem(prefix + run.mode, raw);
      // The journal has committed even if the optional last-mode pointer fails.
      lastRaw.set(run.mode, raw);
      reads.set(run.mode, { status: "loaded", run: JSON.parse(raw) as Run });
      storage.setItem(prefix + "mode", run.mode);
      return { ok: true };
    } catch {
      return { ok: false, error: "保存できません。構成を書き出してバックアップしてください。" };
    }
  }
  function recover(run: Run): SaveWrite {
    const prior = reads.get(run.mode) ?? load(run.mode);
    if (prior.status === "unavailable") {
      const refreshed = load(run.mode);
      if (refreshed.status === "unavailable") return { ok: false, error: refreshed.error };
      return recover(run);
    }
    if (prior.status === "corrupt") {
      try {
        if (storage.getItem(prefix + run.mode) !== lastRaw.get(run.mode)) return conflict();
        storage.setItem(prefix + run.mode + "-recovery", prior.raw);
      }
      catch { return { ok: false, error: "元データを保全できないため、置き換えを中止しました。" }; }
      reads.set(run.mode, { status: "empty" });
    }
    return save(run);
  }
  return { load, save, recover, status: (mode: Mode) => reads.get(mode) };
}
