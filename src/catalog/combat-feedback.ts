import { CONTROL } from "../combat-rules.js";

export interface VisibleCombatState {
  coveredUntil: number;
  immuneUntil: number;
  cache: boolean;
  cacheAt: number;
  target?: string;
}

/** Presentation follows battle ticks, never wall-clock time or animation completion. */
export function combatFeedback(type: string, charge: number, ticks: number, state: VisibleCombatState | undefined, targetName: string, shield: number, rate?: { budget: number; limited: number }) {
  const covered = !!state && state.coveredUntil > ticks;
  const remainingTicks = covered ? state!.coveredUntil - ticks : 0;
  let stateText = "";
  if (type === "go_cache") stateText = state?.cache ? "準備完了" : `${Math.max(0, ((state?.cacheAt ?? ticks) - ticks) / 20).toFixed(1)}秒で再充填`;
  if (type === "ad_popup") stateText = charge >= CONTROL.cost ? "出稿準備完了" : "出稿待ち";
  if (type === "yt_tip") stateText = shield >= 60 && charge >= CONTROL.cost ? "シールド満杯・待機" : charge >= CONTROL.cost ? "応援準備完了" : "応援を受付中";
  return {
    covered,
    recovering: !covered && !!state && state.immuneUntil > ticks,
    remaining: (remainingTicks / 20).toFixed(1),
    progress: covered ? 1 - remainingTicks / CONTROL.durationTicks : 0,
    stateText,
    targetText: targetName ? `対象：${targetName}` : "接続対象なし",
    chargeText: String(Math.round(charge * 100) / 100),
    rateBudgetText: String(Math.round((rate?.budget ?? 0) * 10) / 10),
    rateTotalText: String(Math.round((rate?.limited ?? 0) * 10) / 10),
  };
}

/** An in-page status surface, not a browser modal, dialog or interactive advertisement. */
export function applyCombatFeedback(host: HTMLElement, view: ReturnType<typeof combatFeedback>): void {
  host.classList.toggle("is-covered", view.covered);
  host.classList.toggle("is-control-recovering", view.recovering);
  let cover = host.querySelector<HTMLElement>(":scope > .native-popup-cover");
  if (view.covered) {
    if (!cover) {
      cover = host.ownerDocument.createElement("div");
      cover.className = "native-popup-cover";
      cover.setAttribute("role", "status");
      cover.setAttribute("aria-label", "広告によってこのUIの発動を一時停止しています");
      cover.innerHTML = '<small>スポンサー</small><strong>表示をお待ちください</strong><span class="popup-cover-countdown" aria-hidden="true"></span><i aria-hidden="true"></i>';
      host.append(cover);
    }
    const countdown = cover.querySelector(".popup-cover-countdown");
    if (countdown) countdown.textContent = `${view.remaining}秒`;
    cover.style.setProperty("--cover-progress", String(view.progress));
  } else cover?.remove();
  const state = host.querySelector<HTMLElement>(".popup-state, .cache-state");
  if (state && view.stateText) {
    state.textContent = view.stateText;
    state.title = view.targetText;
  }
  const support = host.querySelector<HTMLElement>(".native-support");
  if (support) support.title = view.stateText;
  const charge = host.querySelector(".state-charge");
  if (charge) charge.textContent = view.chargeText;
  const budget = host.querySelector(".rate-budget");
  if (budget) budget.textContent = view.rateBudgetText;
  const limited = host.querySelector(".rate-total");
  if (limited) limited.textContent = view.rateTotalText;
}
