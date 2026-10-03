import D from "../data.js";
import C from "../document.js";
import R from "../run.js";
import V from "../components.js";
import E from "../engine.js";
import { incomeRouteGuidance } from "../income-route-guidance.js";
import { isSupportedCombatVersion } from "../combat-rules.js";
import { createOnlineClient, OnlineError } from "./client.js";
import { placeItem, placementPayload, onlineFusionChoices } from "./layout.js";
import type { Item, BattleEvent } from "../types.js";
import {
  applyOnlineReplayFeedback,
  onlineEventText,
  verifyOnlineReplay,
  createOnlineReplayBattle,
} from "./replay.js";
import type { OnlineView } from "./types.js";
import stylesheetUrl from "../styles/online.css?url";
import { loadFeatureStylesheet } from "../feature-styles.js";

export const loadStyles = () => loadFeatureStylesheet(stylesheetUrl);

const esc = V.esc;
function connectionMessage(error: unknown) {
  if (error instanceof Error && error.name === "TimeoutError")
    return "接続がタイムアウトしました。「結果を確認・再接続」で同じ操作を復旧できます。";
  return error instanceof Error
    ? error.message
    : "オンラインサービスに接続できませんでした。";
}
function outcomeMessage(next: OnlineView, fallback: string) {
  // A recovered receipt can accompany a newer view. Describe its search as
  // historical; current publication is shown separately from the view below.
  return next.outcome?.code === "NO_OPPONENT"
    ? "前回の検索では、条件に合うほかのプレイヤーの公開ビルドが見つかりませんでした。この検索で資金・残機は減っていません。"
    : next.outcome?.message || fallback;
}
type Command = Parameters<ReturnType<typeof createOnlineClient>["command"]>[0];
type HistoryEffect =
  | { kind: "record"; board: Item[] }
  | { kind: "move"; back: boolean; board: Item[] }
  | { kind: "clear" | "preserve" };
type PendingHistory = {
  runId: string;
  revision: number;
  effect: HistoryEffect;
};
/** Independent online screen: local campaign state is never read or written. */
export function mountOnlinePanel(
  host: HTMLElement,
  options: { baseUrl: string; onClose: () => void },
) {
  const client = createOnlineClient(options.baseUrl),
    events = new AbortController();
  let view: OnlineView | null = null,
    disposed = false,
    busy = false,
    message = "サーバーに接続しています…",
    error = false;
  let guestExpired = false;
  let routeFocus: { runId: string; sourceId: string } | null = null;
  let pendingHistory: PendingHistory | null = null;
  let selected: string | null = null,
    draft: Item[] | null = null,
    undo: Item[][] = [],
    redo: Item[][] = [];
  let drag: {
    id: string;
    board: Item[];
    startX: number;
    startY: number;
    x: number;
    y: number;
    pointer: number;
  } | null = null;
  let replay: InstanceType<typeof E.Battle> | null = null,
    raf = 0,
    last = 0,
    paused = false,
    replaySpeed = 1,
    replayAccumulator = 0;
  let replayLog: string[] = [];
  let replayEpoch = 0;
  const root = document.createElement("section");
  root.className = "arena-panel";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "非同期オンライン対戦");
  host.replaceChildren(root);
  const locked = () => busy || pendingHistory !== null;
  const editable = () =>
    !!view &&
    view.run.phase === "build" &&
    !locked() &&
    !view.online.requiresNewRun;
  function stopReplay() {
    replayEpoch++;
    cancelAnimationFrame(raf);
    raf = 0;
    replay = null;
  }
  function reconcileHistory(
    next: OnlineView,
    completed: PendingHistory | null = null,
  ) {
    // A receipt contains the latest server view, which can already include a
    // different tab's work. Only the one known revision has our history effect.
    if (
      completed &&
      view?.online.id === completed.runId &&
      view.revision === completed.revision &&
      next.online.id === completed.runId &&
      next.revision === completed.revision + 1
    ) {
      const effect = completed.effect;
      if (effect.kind === "record") {
        undo = [...undo, effect.board].slice(-20);
        redo = [];
      } else if (effect.kind === "move") {
        const from = effect.back ? undo : redo,
          to = effect.back ? redo : undo;
        from.pop();
        to.push(effect.board);
      } else if (effect.kind === "clear") {
        undo = [];
        redo = [];
      }
    } else if (
      completed ||
      (view &&
        (next.online.id !== view.online.id || next.revision !== view.revision))
    ) {
      undo = [];
      redo = [];
    }
  }
  function setView(next: OnlineView, completed: PendingHistory | null = null) {
    if (disposed) return;
    reconcileHistory(next, completed);
    pendingHistory = null;
    guestExpired = false;
    view = next;
    draft = null;
    message = outcomeMessage(next, "サーバーに保存済み");
    error = false;
    render();
  }
  function rejectHistory(e: unknown) {
    // Keep the same in-memory effect for the client's unresolved command.
    // This follows client.ts: 408/429 do not disprove an earlier commit.
    if (
      e instanceof OnlineError &&
      e.status >= 400 &&
      e.status < 500 &&
      e.status !== 408 &&
      e.status !== 429
    ) {
      pendingHistory = null;
      if (e.code === "STALE_REVISION") {
        // The old baseline is already known stale even if its refresh fails.
        undo = [];
        redo = [];
      }
    }
  }
  async function refreshAfterConflict(e: unknown) {
    if (!(e instanceof OnlineError) || e.code !== "STALE_REVISION") return;
    try {
      const next = await client.refresh();
      if (disposed) return;
      reconcileHistory(next);
      view = next;
    } catch {}
  }
  async function action(
    command: Command,
    effect: HistoryEffect = {
      kind:
        command.kind === "publish" || command.kind === "match"
          ? "preserve"
          : "clear",
    },
  ) {
    if (!view || locked() || disposed) return;
    pendingHistory = { runId: view.online.id, revision: view.revision, effect };
    busy = true;
    error = false;
    message = "保存中…";
    render();
    try {
      const next = await client.command(command);
      if (disposed) return;
      setView(next, pendingHistory);
      message =
        effect.kind === "move"
          ? "配置を保存しました。"
          : outcomeMessage(next, "保存しました。");
    } catch (e) {
      if (disposed) return;
      rejectHistory(e);
      error = true;
      if (e instanceof OnlineError && e.code === "SESSION_EXPIRED")
        guestExpired = true;
      message = connectionMessage(e);
      await refreshAfterConflict(e);
    } finally {
      if (!disposed) {
        busy = false;
        draft = null;
        render();
      }
    }
  }
  async function restore() {
    if (busy || disposed) return;
    busy = true;
    render();
    try {
      const next = await (client.current ? client.retry() : client.connect());
      setView(next, pendingHistory);
    } catch (e) {
      if (disposed) return;
      rejectHistory(e);
      error = true;
      if (e instanceof OnlineError && e.code === "SESSION_EXPIRED")
        guestExpired = true;
      message = connectionMessage(e);
      await refreshAfterConflict(e);
    } finally {
      if (!disposed) {
        busy = false;
        render();
      }
    }
  }
  function page(board: Item[], side: string, title: string) {
    return `<div class="arena-browser"><div class="arena-browser-bar"><span>● ● ●</span><b>${esc(title)}</b></div><div class="arena-page-viewport"><div class="arena-paper"><div data-arena-board="${side}" class="page-body"></div></div></div></div>`;
  }
  function render() {
    if (disposed) return;
    const previousClose = root.querySelector<HTMLButtonElement>('[data-arena="close"]');
    const followClose = !!previousClose && document.activeElement === previousClose;
    if (routeFocus) {
      const active = document.activeElement;
      if (
        view?.online.id !== routeFocus.runId ||
        selected !== routeFocus.sourceId ||
        (active &&
          active !== document.body &&
          active !== root.querySelector("[data-arena-route]"))
      )
        routeFocus = null;
    }
    const s = guestExpired ? undefined : view?.run,
      build = s?.phase === "build" && !view?.online.requiresNewRun,
      match = view?.match,
      // Replay status must not hide the unresolved server command's recovery.
      // An ordinary in-flight save is not yet an uncertain result.
      needsRecovery = pendingHistory !== null && !busy,
      confirmedBuild = build && !locked() && !error,
      noOpponent = confirmedBuild && view?.outcome?.code === "NO_OPPONENT",
      published = confirmedBuild && !!view?.online.publishedSnapshotId;
    root.innerHTML = `<header class="arena-header"><div><span class="arena-kicker">ASYNC NETWORK</span><h1>保存されたページと対戦</h1><p>他のプレイヤーの公開ビルドと戦います。相手の接続を待つ必要はありません</p></div><button data-arena="close" aria-label="オンラインを閉じる">閉じる ×</button></header>
      <div class="arena-status ${error || needsRecovery ? "is-error" : ""}" role="status">${esc(message)} ${needsRecovery ? '<span data-arena-pending-command>前の操作の結果はまだ確認できていません。「結果を確認・再接続」で確認してください。</span>' : ""} ${error || needsRecovery ? '<button data-arena="retry">結果を確認・再接続</button>' : ""} ${guestExpired ? '<button data-arena="new-guest">新しいゲストで開始</button>' : ""}</div>
      ${
        !s
          ? '<div class="arena-loading">オンラインサービスを起動して接続してください。接続先: ' +
            esc(options.baseUrl) +
            "</div>"
          : `
      <div class="arena-metrics"><b>ROUND ${Math.min(s.stage + 1, view!.online.roundLimit)} / ${view!.online.roundLimit}</b><span>残機 ${"♥".repeat(s.lives)}${"♡".repeat(Math.max(0, view!.rules.lives - s.lives))}</span><span>資金 $${s.cash}</span><span>${s.wins} 勝</span><span>レート ${view!.online.rating}</span><span>負荷 ${E.analyze(s.owned).load.toFixed(1)} / ${R.capacity(s)}</span></div>
      <div class="arena-workspace">
       <aside class="arena-side"><h2>${build ? "UIショップ" : "ランの記録"}</h2>${
         build
           ? s.shop
               .map((stock) => {
                 const p = D.PARTS[stock.type],
                   plan = stock.type.startsWith("plan:")
                     ? R.PLANS[stock.type.slice(5)]
                     : null;
                 return `<button class="arena-stock" data-arena="buy" data-type="${esc(stock.type)}" ${locked() || stock.sold || s.cash < (p?.price ?? plan?.price ?? 0) ? "disabled" : ""}><b>${esc(p?.name ?? plan?.name ?? stock.type)}</b><span>$${p?.price ?? plan?.price ?? 0} ${stock.sold ? "購入済み" : ""}</span><small>${esc(p?.desc ?? `容量 +${plan?.cap ?? 0}`)}</small></button>`;
               })
               .join("") +
             `<button data-arena="reroll" ${locked() || s.cash < R.REROLL ? "disabled" : ""}>ショップ更新 $${R.REROLL}</button>`
           : `<p>結果はサーバーで確定済みです。表示速度や再読込で勝敗は変わりません。</p>`
       }
       <h2>未配置のUI</h2><div class="arena-stash">${
         s.owned
           .filter((p) => !C.placed(p))
           .map(
             (p) =>
               `<button data-arena="place" data-id="${p.id}" ${!build || locked() ? "disabled" : ""}>＋ ${esc(D.PARTS[p.type]?.name ?? p.type)}</button>`,
           )
           .join("") || "<p>なし</p>"
       }</div>
       ${view!.online.inbox.length ? `<button data-arena="inbox" ${!build || locked() ? "disabled" : ""}>受取箱 ${view!.online.inbox.length}個を移動</button>` : ""}
       <h2>管理設備</h2><p>${s.admin.map((a) => esc(D.ADMIN[a]?.name ?? a)).join(" / ") || "まだありません"}</p><small>報酬で解放 · 次の枠 ${R.adminSlots(s)}</small>
       <details><summary>オンラインの仮ルール</summary><p>8ラウンド・残機3・初期資金10。基本収入6＋勝利4＋戦闘収益の半分（最大10）。引き分けは残機を1消費。レートは勝利+16／敗北−16、引き分け±0。</p><p>このブラウザのゲストとして保存。24時間操作がないと接続が期限切れになります。オフラインのセーブとは独立しています。</p></details></aside>
       <main class="arena-main">${page(!build && match ? match.player.items : (draft ?? s.owned), "self", !build && match ? "対戦時のあなたのページ" : "あなたのページ")}<p class="arena-hint">${build ? "UIをドラッグして配置。TabでUIに移動し、Enter / Spaceでも選択できます。選択したUIのサイズ・接続先を右側で調整できます。" : "自動戦闘の入力は固定されています。"}</p>
       ${match && !build ? `<div class="arena-match-label">対戦相手：ほかのプレイヤーが登録した保存ビルド · ROUND ${match.opponent.round + 1} · ${match.opponent.wins}勝 · 記録時レート${match.opponent.rating}</div>${page(match.opponent.items, "opponent", "保存された相手のページ")}<div class="arena-replay"><button data-arena="replay">▶ リプレイ</button><button data-arena="pause">一時停止 / 再開</button><select data-arena-speed aria-label="リプレイ速度"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select><span data-arena-clock>サーバー結果: ${match.winner === "player" ? "勝利" : match.winner === "enemy" ? "敗北" : "引き分け"} · ${match.summary.time.toFixed(1)}秒</span></div>` : ""}
       </main>
       <aside class="arena-inspector">${build ? selection() : ""}
       ${build ? `<h2>公開して対戦</h2><p>登録されるのは標準UIと配置・性能だけです。URLの画像・取得元・元サイトの文言は送信されません。</p>${published ? "<p data-arena-published>現在のビルドは公開済みです。</p>" : ""}${noOpponent ? "<p data-arena-no-opponent>同じサービスに条件に合う公開ビルドが追加されたら、もう一度対戦相手を探してください。</p>" : ""}<button class="arena-primary" data-arena="match" ${locked() ? "disabled" : ""}>${noOpponent ? "もう一度対戦相手を探す" : "ビルドを公開して対戦"}</button><button data-arena="publish" ${locked() ? "disabled" : ""}>ビルドだけ公開</button><details data-arena-pool-guidance ${noOpponent ? "open" : ""}><summary>対戦相手の条件</summary><p>同じサービスに公開された、同じラウンド・対応ルールのほかのプレイヤーの保存ビルドが必要です。公開した相手が今オンラインでなくても対戦できます。</p><p>同じゲストの別タブを開いても対戦相手は増えません。自動では検索しません。</p><p>「結果を確認・再接続」は前の操作の復旧です。新たに相手を探すときは対戦ボタンを押してください。</p><p>現在の開発版は、このPCのローカル対戦サービスを使います。</p></details><div class="arena-undo"><button data-arena="undo" ${locked() || !undo.length ? "disabled" : ""}>元に戻す</button><button data-arena="redo" ${locked() || !redo.length ? "disabled" : ""}>やり直す</button></div>` : ""}
       ${s.phase === "battle" && match ? `<h2>${match.winner === "player" ? "勝利" : match.winner === "enemy" ? "敗北" : "引き分け"}</h2><p>基本 $${match.summary.base} ＋ 勝利 $${match.summary.bonus} ＋ 収益 $${match.summary.income}</p><button class="arena-primary" data-arena="settle" ${locked() ? "disabled" : ""}>結果を受け取る $${match.summary.total}</button>` : ""}
       ${s.phase === "reward" && s.pending ? `<h2>報酬を一つ選ぶ</h2>${s.pending.loot.map((t) => `<button class="arena-reward" data-arena="claim" data-type="${esc(t)}" ${locked() ? "disabled" : ""}>${esc(t.startsWith("admin:") ? (D.ADMIN[t.slice(6)]?.name ?? t) : (D.PARTS[t]?.name ?? t))}</button>`).join("")}<button data-arena="skip" ${locked() ? "disabled" : ""}>選ばずに次へ</button>` : ""}
       ${s.phase === "complete" || s.phase === "gameover" || (view!.online.requiresNewRun && !view!.online.pendingMatchId) ? `<h2>${view!.online.requiresNewRun ? "ルールが更新されました" : s.phase === "complete" ? "ラン完了" : "残機がなくなりました"}</h2><p>${s.wins}勝 / ${s.history.length}戦。${view!.online.requiresNewRun ? "以前のルールの記録は引き続き閲覧できます。現在の対戦候補に参加するには、新しいランを始めてください。" : "保存ビルドは他のプレイヤーの対戦候補に残ります。"}</p><button class="arena-primary" data-arena="new-run" ${locked() ? "disabled" : ""}>新しいオンラインラン</button>` : ""}
       <h2>対戦履歴</h2><ol class="arena-history">${s.history.map((h) => `<li>R${h.round} ${h.winner === "player" ? "勝利" : h.winner === "draw" ? "引分" : "敗北"} <span>+$${h.total}</span></li>`).join("") || "<li>まだ対戦していません</li>"}</ol></aside>
      </div>`
      }`;
    for (const [side, board] of [
      [
        "self",
        !build && match ? match.player.items : (draft ?? s?.owned ?? []),
      ],
      ["opponent", match?.opponent.items ?? []],
    ] as const) {
      const target = root.querySelector<HTMLElement>(
        `[data-arena-board="${side}"]`,
      );
      if (target) {
        V.render(target, board, {
          side: side === "self" ? "player" : "enemy",
          selected: side === "self" && selected ? [selected] : [],
        });
        target.dataset.arenaBoard = side;
      }
    }
    for (const button of root.querySelectorAll<HTMLElement>(
      '[data-arena="buy"], [data-arena="claim"]',
    )) {
      const type = button.dataset.type;
      if (!type || !D.PARTS[type]) continue;
      const tray = document.createElement("div");
      tray.className = "arena-native-preview";
      tray.inert = true;
      tray.setAttribute("aria-hidden", "true");
      const preview = V.palettePreview(type),
        d = D.PARTS[type],
        scale = Math.min(1, 190 / d.w, 72 / d.h);
      Object.assign(preview.style, {
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        position: "relative",
      });
      tray.style.height = `${d.h * scale + 12}px`;
      tray.append(preview);
      button.before(tray);
    }
    const replayControls = root.querySelector(".arena-replay");
    if (replayControls && !root.querySelector("[data-arena-control-log]")) {
      const log = document.createElement("div");
      log.className = "arena-control-log";
      log.dataset.arenaControlLog = "";
      log.setAttribute("aria-label", "妨害と防御の記録");
      replayControls.after(log);
    }
    resizePages();
    if (routeFocus && !locked() && !drag) {
      const control =
        root.querySelector<HTMLSelectElement>("[data-arena-route]");
      if (
        control &&
        !control.disabled &&
        control.dataset.sourceId === routeFocus.sourceId &&
        document.activeElement === document.body
      )
        control.focus({ preventScroll: true });
      routeFocus = null;
    }
    // Connection readiness can replace the Close just handed off by the host.
    if (followClose && !disposed && root.isConnected && host.contains(root) && document.activeElement === document.body) {
      const dialog = root.closest<HTMLDialogElement>("dialog");
      const close = root.querySelector<HTMLButtonElement>('[data-arena="close"]');
      if ((!dialog || dialog.open) && close?.isConnected && !close.disabled)
        close.focus({ preventScroll: true });
    }
  }
  function routeControls(p: Item) {
    const owned = view!.run.owned;
    const route = incomeRouteGuidance(p, E.analyze(draft ?? owned), {
      owned,
      editable: editable() && !drag,
    });
    if (!route) return "";
    const name = (target: { id: string; name: string }) => {
      const part = owned.find((item) => item.id === target.id);
      return esc(
        target.name +
          (part
            ? C.placed(part)
              ? `（X ${part.x} / Y ${part.y}）`
              : "（未配置）"
            : ""),
      );
    };
    const saved = route.saved;
    const unavailable =
      saved && !saved.available
        ? `<option value="${esc(saved.id)}" selected disabled>${name(saved)}（現在は利用不可）</option>`
        : "";
    const status = !route.placed
      ? "この収益UIは未配置です。ページに配置してから接続先を変更できます。"
      : saved && !saved.available
        ? "指定先が現在の接続候補にないため、自動へフォールバックします。候補に戻ると保存した指定が優先されます。"
        : "近い受け皿だけを選べます。自動では距離やページ上の位置などの規則で1つを選びます。";
    return `<div class="arena-route-guidance"><label>収益の接続先<select data-arena-route data-source-id="${esc(route.sourceId)}" ${route.editable ? "" : "disabled"}><option value="" ${saved ? "" : "selected"}>自動（近い受け皿）</option>${unavailable}${route.candidates.map((target) => `<option value="${esc(target.id)}" ${saved?.id === target.id ? "selected" : ""}>${name(target)}</option>`).join("")}</select></label>
      <p style="overflow-wrap:anywhere">保存した指定：${saved ? name(saved) + (saved.available ? "" : "（現在は利用不可・指定は保持）") : "自動（近い受け皿を優先）"}</p>
      <p style="overflow-wrap:anywhere">実際の接続先：${route.effective ? name(route.effective) : "未接続"}</p>
      <p>${status}</p><p>接続だけでは収益を増やしません。収益の発生条件や受け皿の発動条件は変わりません。同じ収益は二重配分せず、受け皿が満杯でも余りは別の受け皿へ流れません。</p></div>`;
  }
  function selection() {
    const p = (draft ?? view!.run.owned).find((p) => p.id === selected);
    if (!p)
      return "<h2>ページを編集</h2><p>配置済みのUIを選択してください。未配置のUIは左側の＋で追加します。</p>";
    const d = D.PARTS[p.type],
      pairs = onlineFusionChoices(view!.run.owned).filter(
        (q) => q.a.id === p.id || q.b.id === p.id,
      );
    return `<h2>${esc(d.name)}</h2><p>${esc(d.desc)}</p><form data-arena-layout><div class="arena-fields">${(["x", "y", "w", "h"] as const).map((k) => `<label>${k.toUpperCase()}<input name="${k}" type="number" value="${p[k] ?? 0}" step="1"></label>`).join("")}</div><button ${locked() ? "disabled" : ""}>位置・サイズを保存</button></form>${routeControls(p)}<button data-arena="stash" ${locked() ? "disabled" : ""}>未配置に戻す</button><button data-arena="sell" ${locked() ? "disabled" : ""}>売却 $${R.sellValue(view!.run, p.type)}</button>${pairs.map((q) => `<button data-arena="fuse" data-a="${q.a.id}" data-b="${q.b.id}" ${locked() ? "disabled" : ""}>合成 → ${esc(D.PARTS[q.recipe.into].name)}</button>`).join("")}`;
  }
  function resizePages() {
    for (const box of root.querySelectorAll<HTMLElement>(
      ".arena-page-viewport",
    )) {
      const paper = box.firstElementChild as HTMLElement;
      const scale = Math.min(1, box.clientWidth / 960);
      paper.style.transform = `scale(${scale})`;
      box.style.height = `${680 * scale}px`;
    }
  }
  const observer = new ResizeObserver(resizePages);
  observer.observe(root);
  function saveBoard(board: Item[]) {
    if (!view) return;
    void action(
      { kind: "placement", items: placementPayload(board) },
      { kind: "record", board: structuredClone(view.run.owned) },
    );
  }
  async function historyMove(back: boolean) {
    if (!view || locked() || disposed) return;
    const target = (back ? undo : redo).at(-1);
    if (!target) return;
    await action(
      { kind: "placement", items: placementPayload(target) },
      { kind: "move", back, board: structuredClone(view.run.owned) },
    );
  }
  root.addEventListener(
    "click",
    (e) => {
      e.stopPropagation();
      if ((e.target as Element).closest("a")) e.preventDefault();
      const button = (e.target as Element).closest<HTMLElement>("[data-arena]");
      if (!button) return;
      const kind = button.dataset.arena;
      if (kind === "close") {
        options.onClose();
        return;
      }
      if (kind === "retry") {
        void restore();
        return;
      }
      if (kind === "new-guest" && guestExpired && !busy) {
        busy = true;
        render();
        void client
          .newGuest()
          .then(setView)
          .catch((e: unknown) => {
            if (!disposed) {
              error = true;
              message = connectionMessage(e);
            }
          })
          .finally(() => {
            if (!disposed) {
              busy = false;
              render();
            }
          });
        return;
      }
      if (kind === "replay") {
        startReplay();
        return;
      }
      if (kind === "pause") {
        paused = !paused;
        return;
      }
      if (!view || locked()) return;
      if (kind === "undo" || kind === "redo") {
        void historyMove(kind === "undo");
        return;
      }
      if (kind === "buy")
        void action({ kind: "purchase", type: button.dataset.type! });
      else if (
        kind === "reroll" ||
        kind === "publish" ||
        kind === "match" ||
        kind === "new-run" ||
        kind === "inbox"
      ) {
        stopReplay();
        void action({ kind });
      } else if (kind === "settle" && view.match) {
        stopReplay();
        void action({ kind: "settle", matchId: view.match.id });
      } else if ((kind === "claim" || kind === "skip") && view.match)
        void action({
          kind: "claim",
          matchId: view.match.id,
          choice: kind === "skip" ? null : button.dataset.type!,
        });
      else if (kind === "place") {
        const p = view.run.owned.find((p) => p.id === button.dataset.id)!;
        const spot = C.findSpace(view.run.owned, p);
        if (!spot) {
          message =
            "配置できる空間がありません。UIを移動または縮小してください。";
          error = true;
          render();
          return;
        }
        selected = p.id;
        const board = placeItem(view.run.owned, p.id, spot.x, spot.y);
        if (board) saveBoard(board);
      } else if (kind === "stash" && selected) {
        const board = placeItem(view.run.owned, selected, null, null);
        if (board) saveBoard(board);
      } else if (kind === "sell" && selected)
        void action({ kind: "sell", id: selected });
      else if (kind === "fuse")
        void action({
          kind: "fuse",
          a: button.dataset.a!,
          b: button.dataset.b!,
        });
    },
    { signal: events.signal },
  );
  root.addEventListener(
    "submit",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!editable() || !selected || !(e.target instanceof HTMLFormElement))
        return;
      const data = new FormData(e.target);
      const board = placeItem(
        view!.run.owned,
        selected,
        Number(data.get("x")),
        Number(data.get("y")),
        Number(data.get("w")),
        Number(data.get("h")),
      );
      if (board) saveBoard(board);
      else {
        message = "ページの外・重なり・サイズ制限を確認してください。";
        error = true;
        render();
      }
    },
    { signal: events.signal },
  );
  root.addEventListener(
    "change",
    (e) => {
      e.stopPropagation();
      const el = e.target;
      if (!(el instanceof HTMLSelectElement)) return;
      if (el.hasAttribute("data-arena-speed")) {
        replaySpeed = Number(el.value);
        return;
      }
      if (el.hasAttribute("data-arena-route")) {
        if (
          disposed ||
          !editable() ||
          drag ||
          !selected ||
          el.disabled ||
          el !== root.querySelector("[data-arena-route]") ||
          el.dataset.sourceId !== selected
        )
          return;
        const option = el.selectedOptions[0];
        if (!option || option.disabled) return;
        const owned = view!.run.owned;
        const source = owned.find((part) => part.id === selected);
        if (!source) return;
        const route = incomeRouteGuidance(source, E.analyze(owned), {
          owned,
          editable: true,
        });
        if (
          !route?.editable ||
          (el.value &&
            !route.candidates.some((part) => part.id === el.value)) ||
          (source.routeTo ?? "") === el.value
        )
          return;
        const board = structuredClone(owned),
          p = board.find((part) => part.id === source.id)!;
        if (el.value) p.routeTo = el.value;
        else delete p.routeTo;
        routeFocus =
          document.activeElement === el
            ? { runId: view!.online.id, sourceId: source.id }
            : null;
        saveBoard(board);
      }
    },
    { signal: events.signal },
  );
  root.addEventListener(
    "pointerdown",
    (e) => {
      e.stopPropagation();
      if (!editable() || e.button !== 0) return;
      const item = (e.target as Element).closest<HTMLElement>("[data-id]"),
        board = (e.target as Element).closest<HTMLElement>(
          '[data-arena-board="self"]',
        );
      if (!item || !board) return;
      e.preventDefault();
      const p = view!.run.owned.find((p) => p.id === item.dataset.id);
      if (!p || p.x === null || p.y === null) return;
      selected = p.id;
      drag = {
        id: p.id,
        board: structuredClone(view!.run.owned),
        startX: e.clientX,
        startY: e.clientY,
        x: p.x,
        y: p.y,
        pointer: e.pointerId,
      };
      root.setPointerCapture(e.pointerId);
      render();
    },
    { signal: events.signal },
  );
  root.addEventListener(
    "pointermove",
    (e) => {
      if (!drag) return;
      e.preventDefault();
      e.stopPropagation();
      const board = root.querySelector<HTMLElement>(
          '[data-arena-board="self"]',
        )!,
        scale = board.getBoundingClientRect().width / 960;
      draft = placeItem(
        drag.board,
        drag.id,
        Math.round(drag.x + (e.clientX - drag.startX) / scale),
        Math.round(drag.y + (e.clientY - drag.startY) / scale),
      );
      if (draft) {
        V.render(board, draft, { selected: [drag.id] });
        board.dataset.arenaBoard = "self";
      }
    },
    { signal: events.signal },
  );
  root.addEventListener(
    "pointerup",
    (e) => {
      if (!drag) return;
      e.stopPropagation();
      const old = drag;
      drag = null;
      if (root.hasPointerCapture(e.pointerId))
        root.releasePointerCapture(e.pointerId);
      if (
        draft &&
        JSON.stringify(placementPayload(draft)) !==
          JSON.stringify(placementPayload(old.board))
      )
        saveBoard(draft);
      else {
        draft = null;
        render();
      }
    },
    { signal: events.signal },
  );
  function cancelDrag() {
    if (drag) {
      drag = null;
      draft = null;
      render();
    }
  }
  root.addEventListener("pointercancel", cancelDrag, { signal: events.signal });
  window.addEventListener("blur", cancelDrag, { signal: events.signal });
  root.addEventListener(
    "keydown",
    (e) => {
      e.stopPropagation();
      const target = e.target;
      if (
        editable() &&
        !drag &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        !e.isComposing &&
        (e.key === "Enter" || e.key === " ") &&
        target instanceof HTMLElement &&
        target === document.activeElement &&
        !target.isContentEditable &&
        root.isConnected &&
        target.matches('.web-node[data-side="player"]')
      ) {
        const board = root.querySelector('[data-arena-board="self"]');
        const item = view!.run.owned.find(
          (part) => part.id === target.dataset.id,
        );
        const current =
          board &&
          [...board.querySelectorAll<HTMLElement>(".web-node")].find(
            (node) => node.dataset.id === item?.id,
          );
        if (!item || !C.placed(item) || current !== target) return;
        e.preventDefault();
        // A held key must not scroll; reselecting must not erase inspector edits.
        if (e.repeat || selected === item.id) return;
        selected = item.id;
        render();
        // Follow this synchronous replacement only, never a deliberate focus move.
        if (
          !disposed &&
          root.isConnected &&
          host.contains(root) &&
          document.activeElement === document.body
        ) {
          const replacement = [
            ...root.querySelectorAll<HTMLElement>(
              '[data-arena-board="self"] .web-node',
            ),
          ].find((node) => node.dataset.id === item.id);
          replacement?.focus({ preventScroll: true });
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (drag) cancelDrag();
        else options.onClose();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !(e.target instanceof HTMLInputElement)
      ) {
        e.preventDefault();
        void historyMove(!e.shiftKey);
      }
    },
    { signal: events.signal },
  );
  async function startReplay() {
    if (!view?.match) return;
    if (!isSupportedCombatVersion(view.match.combatVersion)) {
      message =
        "この対戦のルール版には対応していません。確定した結果と報酬は復元できますが、再生はできません。";
      error = true;
      render();
      return;
    }
    stopReplay();
    const m = view.match,
      epoch = replayEpoch;
    message = "保存されたカタログと対戦記録を照合しています…";
    error = false;
    render();
    try {
      const verified = await verifyOnlineReplay(m);
      if (disposed || epoch !== replayEpoch || view?.match?.id !== m.id) return;
      if (!verified.ok) {
        error = true;
        message =
          "この画面の戦闘ルールと保存記録が一致しないため、再生を停止しました。確定済みのサーバー結果・報酬はそのまま受け取れます。";
        render();
        return;
      }
    } catch {
      if (disposed || epoch !== replayEpoch) return;
      error = true;
      message =
        "再生記録を検証できませんでした。確定済みの結果は変更されていません。";
      render();
      return;
    }
    message = `保存された記録と一致するリプレイです（${m.combatVersion}）。`;
    render();
    replay = createOnlineReplayBattle(m);
    paused = false;
    replayAccumulator = 0;
    replayLog = [];
    applyOnlineReplayFeedback(root, replay);
    const log = root.querySelector("[data-arena-control-log]");
    if (log) log.textContent = "";
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function tick(now: number) {
    if (disposed || !replay) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused) {
      replayAccumulator += dt * replaySpeed;
      const batch: BattleEvent[] = [];
      while (replayAccumulator + 1e-9 >= 0.05 && !replay.result) {
        replayAccumulator -= 0.05;
        batch.push(...replay.step(0.05));
      }
      for (const event of batch) {
        const line = onlineEventText(event, replay);
        if (line) replayLog = [...replayLog, line].slice(-4);
        if (event.kind === "fire") {
          const side = event.side === "player" ? "self" : "opponent",
            element = root.querySelector<HTMLElement>(
              `[data-arena-board="${side}"] [data-id="${event.id}"]`,
            );
          if (
            element &&
            !matchMedia("(prefers-reduced-motion: reduce)").matches
          ) {
            element.animate(
              [
                { filter: "brightness(1.8)", transform: "scale(1.025)" },
                { filter: "brightness(1)", transform: "scale(1)" },
              ],
              { duration: 220 },
            );
          }
        }
      }
      applyOnlineReplayFeedback(root, replay);
      const log = root.querySelector("[data-arena-control-log]");
      if (log) log.textContent = replayLog.join("\n");
      const clock = root.querySelector("[data-arena-clock]");
      if (clock)
        clock.textContent = `${replay.elapsed.toFixed(1)}秒 · あなたHP ${Math.ceil(replay.player.hp)} / 相手HP ${Math.ceil(replay.enemy.hp)} · シールド ${Math.round(replay.player.shield)} / ${Math.round(replay.enemy.shield)} · 収益 $${replay.player.income.toFixed(1)} / $${replay.enemy.income.toFixed(1)}${replay.result ? " · サーバー結果 " + (view!.match!.winner === "player" ? "勝利" : view!.match!.winner === "enemy" ? "敗北" : "引き分け") : ""}`;
    }
    if (!replay.result) raf = requestAnimationFrame(tick);
  }
  render();
  void client
    .connect()
    .then(setView)
    .catch((e) => {
      if (!disposed) {
        error = true;
        if (e instanceof OnlineError && e.code === "SESSION_EXPIRED")
          guestExpired = true;
        message = connectionMessage(e);
        render();
      }
    });
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      routeFocus = null;
      pendingHistory = null;
      undo = [];
      redo = [];
      stopReplay();
      events.abort();
      observer.disconnect();
      client.dispose();
      root.remove();
    },
  };
}
