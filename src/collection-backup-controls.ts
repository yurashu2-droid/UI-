import { COLLECTION_BACKUP_LIMITS } from "./collection-backup.js";
import type { createProfileStore } from "./profile-store.js";

type BackupStore = Pick<ReturnType<typeof createProfileStore>,
  "exportCollectionBackup" | "inspectCollectionBackup" | "restoreCollectionBackup">;
type Preview = Awaited<ReturnType<BackupStore["inspectCollectionBackup"]>>;
type Restored = Awaited<ReturnType<BackupStore["restoreCollectionBackup"]>>;

export interface CollectionBackupControlsOptions {
  store: BackupStore;
  isCurrent?: () => boolean;
  onRestored?: (result: Restored, isCurrent: () => boolean) => void | Promise<void>;
}

/** Local appearance archives are separate from run/story saves and raid claims. */
export function mountCollectionBackupControls(
  host: HTMLElement,
  options: CollectionBackupControlsOptions,
): { dispose(): void } {
  const doc = host.ownerDocument;
  const section = doc.createElement("section");
  section.className = "collection-acquisition collection-backup";
  const title = doc.createElement("h3"); title.textContent = "取得外観のバックアップ";
  const scope = doc.createElement("p");
  scope.textContent = "取得済みの外観と由来だけを、この端末のJSONファイルへ保存・復元します。Run（ラン）・物語の進行、未受取のURLレイド報酬は別保存です。外部への送信は行いません。";
  const limits = doc.createElement("p");
  limits.textContent = `上限は16 MiB・外観${COLLECTION_BACKUP_LIMITS.trophies}件・キャプチャ${COLLECTION_BACKUP_LIMITS.captures}件。上限を超えた場合は切り捨てず拒否します。既存データの上書きや一部だけの復元は行いません。整合性の検証は実際の勝利の証明ではありません。`;
  const actions = doc.createElement("div"); actions.className = "modal-footer";
  const exportButton = doc.createElement("button"); exportButton.type = "button"; exportButton.textContent = "取得外観を書き出す";
  const importButton = doc.createElement("button"); importButton.type = "button"; importButton.textContent = "取得外観を読み込む";
  const restoreButton = doc.createElement("button"); restoreButton.type = "button"; restoreButton.textContent = "追加して復元";
  const input = doc.createElement("input"); input.type = "file"; input.accept = ".json,application/json"; input.hidden = true;
  input.setAttribute("aria-label", "取得外観のバックアップファイル");
  const summary = doc.createElement("p"); summary.hidden = true;
  const status = doc.createElement("p"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); status.setAttribute("aria-atomic", "true");
  status.textContent = "読み込み後に件数を確認し、「追加して復元」で保存します。";
  actions.append(exportButton, importButton, restoreButton);
  section.append(title, scope, limits, actions, input, summary, status);
  host.replaceChildren(section);

  let disposed = false, generation = 0;
  let phase: "idle" | "reading" | "inspecting" | "exporting" | "restoring" = "idle";
  let preview: Preview | undefined;
  const live = (): boolean => !disposed && host.isConnected && section.parentElement === host && section.isConnected && (options.isCurrent?.() ?? true);
  const current = (token: number): boolean => generation === token && live();
  const message = (error: unknown, fallback: string): string => error instanceof Error ? error.message : fallback;
  const update = (): void => {
    const busy = phase !== "idle";
    exportButton.disabled = importButton.disabled = input.disabled = busy;
    restoreButton.disabled = busy || !preview || preview.conflicts.length > 0;
    section.setAttribute("aria-busy", String(busy));
  };
  const finish = (token: number): void => { if (current(token)) { phase = "idle"; update(); } };
  update();

  exportButton.onclick = async () => {
    if (!live() || phase !== "idle") return;
    const token = ++generation; phase = "exporting"; update(); status.textContent = "保存済みの取得外観を検証しています…";
    try {
      const archive = await options.store.exportCollectionBackup();
      if (!current(token)) return;
      const url = URL.createObjectURL(new Blob([archive.text], { type: "application/json;charset=utf-8" }));
      const anchor = doc.createElement("a"); anchor.href = url; anchor.download = "ui-raid-collection-backup.json"; anchor.hidden = true;
      try {
        section.append(anchor); anchor.click();
        status.textContent = `外観 ${archive.trophyCount}件・キャプチャ ${archive.captureCount}件のダウンロードを開始しました。保存先はブラウザで確認してください。`;
      } finally {
        anchor.remove();
        // Let the browser consume the link before releasing it, even if the
        // dialog is closed immediately after clicking download.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      if (current(token)) status.textContent = message(error, "書き出しできませんでした。もう一度お試しください。");
    } finally { finish(token); }
  };

  importButton.onclick = () => {
    if (!live() || phase !== "idle") return;
    input.value = "";
    input.click();
  };
  const cancel = (): void => { if (live()) input.value = ""; };
  input.addEventListener("cancel", cancel);
  input.onchange = async () => {
    if (!live()) return;
    const file = input.files?.[0]; input.value = "";
    if (!file || phase === "exporting" || phase === "restoring") return;
    // Native controls are disabled while busy, but a newer file completion
    // must supersede any older read/hash instead of inheriting its intent.
    const token = ++generation; preview = undefined; summary.textContent = ""; summary.hidden = true;
    phase = "reading"; update(); status.textContent = "バックアップファイルを読み込んでいます…";
    try {
      if (file.size > COLLECTION_BACKUP_LIMITS.bytes) throw new Error("16 MiBを超えるファイルは読み込めません。データは変更していません。");
      const text = await file.text();
      if (!current(token)) return;
      phase = "inspecting"; status.textContent = "内容と保存済みの取得外観との整合性を検証しています…";
      const inspected = await options.store.inspectCollectionBackup(text);
      if (!current(token)) return;
      preview = inspected; summary.hidden = false;
      summary.textContent = `外観 ${inspected.trophyCount}件・キャプチャ ${inspected.captureCount}件。追加予定 ${inspected.addCount}件・同一の保存済み外観 ${inspected.unchangedCount}件・競合 ${inspected.conflicts.length}件。`;
      status.textContent = inspected.conflicts.length
        ? "既存データとの競合があるため復元できません。上書きは行いません。別のファイルを読み込めます。"
        : "まだ保存していません。件数を確認し、「追加して復元」を押してください。復元時に競合をもう一度確認します。";
    } catch (error) {
      if (current(token)) status.textContent = message(error, "ファイルを読み込めませんでした。もう一度お試しください。");
    } finally { finish(token); }
  };

  restoreButton.onclick = async () => {
    if (!live() || phase !== "idle" || !preview || preview.conflicts.length) return;
    const candidate = preview.candidate, token = ++generation;
    const isCurrent = (): boolean => current(token);
    phase = "restoring"; update(); status.textContent = "競合を再確認し、取得外観を追加しています…";
    try {
      const result = await options.store.restoreCollectionBackup(candidate, { isCurrent });
      if (!isCurrent()) return;
      preview = undefined; summary.hidden = true; summary.textContent = "";
      status.textContent = `取得外観を復元しました。追加 ${result.added}件・同一の保存済み外観 ${result.unchanged}件。`;
      try { await options.onRestored?.(result, isCurrent); }
      catch (error) {
        if (isCurrent()) status.textContent = `復元は保存済みですが、表示を更新できませんでした。コレクションを開き直してください。${message(error, "")}`;
      }
    } catch (error) {
      if (isCurrent()) status.textContent = message(error, "復元できませんでした。もう一度お試しください。");
    } finally { finish(token); }
  };

  return {
    dispose() {
      if (disposed) return;
      disposed = true; generation++; preview = undefined;
      exportButton.onclick = importButton.onclick = restoreButton.onclick = input.onchange = null;
      input.removeEventListener("cancel", cancel);
    },
  };
}
