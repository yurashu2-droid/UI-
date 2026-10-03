import type { BattleSide, Mode } from "./types.js";

/** Only the player's observed CPU fields are needed; no enemy-capacity inference. */
export interface CpuConditionsContext {
  mode: Mode;
  storyActive: boolean;
  /** R.capacity(run): the purchased capacity for campaign/story previews. */
  runCapacity: number;
  /** The explicit laboratory pressure selection, or null for standard/audience. */
  pressureCapacity: 15 | 26 | 38 | null;
  battle?: {
    player: Pick<BattleSide, "load" | "capacity" | "lag">;
    pressure?: { player: { readonly work: number } } | null;
  } | null;
}

function validLoad(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Display only. Mirrors launch capacity and engine CPU lag, never part periods. */
export function cpuConditionsGuidance(
  info: { load: number },
  context: CpuConditionsContext,
) {
  const live = context.battle;
  const laboratory = context.mode === "lab" && !context.storyActive;
  const rawCapacity = live
    ? live.player.capacity
    : laboratory
      ? (context.pressureCapacity ?? Infinity)
      : context.runCapacity;
  const capacityState = rawCapacity === Infinity
    ? "unbounded"
    : Number.isFinite(rawCapacity) && rawCapacity > 0
      ? "finite"
      : "invalid";
  const capacity = capacityState === "invalid" ? null : rawCapacity;
  const baseLoad = validLoad(live ? live.player.load : info.load);
  const transientLoad = validLoad(live?.pressure ? live.pressure.player.work : 0);
  const load = baseLoad === null || transientLoad === null
    ? null : validLoad(baseLoad + transientLoad);
  const known = capacity !== null && load !== null;
  // During battle, use the actual engine multiplier, including pressure refreshes.
  // Invalid live data must not silently fall back to the preview's healthy values.
  const calculatedLag = !known ? null : capacityState === "unbounded" ? 1
    : 1 + Math.max(0, load / capacity - 1) * 0.6;
  const rawLag = !known ? null : live ? live.player.lag : calculatedLag;
  // A real finite-capacity calculation can overflow. Other nonfinite live
  // multipliers are corrupt observations, not evidence of zero CPU speed.
  const lag = typeof rawLag === "number" && rawLag >= 1 &&
    (Number.isFinite(rawLag) || calculatedLag === Infinity) ? rawLag : null;
  const cpuSpeed = lag === null ? null : 1 / lag;
  const overloaded = known ? load > capacity : null;
  const finiteRatio = known && capacityState === "finite";
  return {
    source: live ? "battle" as const : "preview" as const,
    capacityState,
    capacity,
    baseLoad,
    transientLoad,
    load,
    lag,
    cpuSpeed,
    overloaded,
    // Null means there is no meaningful finite capacity ratio to draw.
    barPercent: finiteRatio ? Math.min(100, (load / capacity) * 100) : null,
    overloadBarPercent: finiteRatio
      ? Math.min(60, Math.max(0, ((load - capacity) / capacity) * 100)) : null,
  };
}

/** Existing topbar classes, with CPU-only labels and no invented unbounded meter. */
export function renderCpuConditionsGuidance(
  view: ReturnType<typeof cpuConditionsGuidance>,
) {
  const capacityText = view.capacityState === "unbounded" ? "無制限"
    : view.capacity === null ? "確認不可" : String(view.capacity);
  const loadText = view.load === null ? "確認不可" : String(view.load);
  const speedText = view.cpuSpeed === null ? "CPU速度を確認できません"
    : view.cpuSpeed === 1 ? "CPU速度 100%"
      : `CPU速度 約${Math.round(view.cpuSpeed * 100)}%`;
  const stateText = view.capacityState === "invalid" ? "容量を確認できません。"
    : view.load === null ? "CPU負荷を確認できません。"
      : view.overloaded ? "CPU過負荷：UIの発動が遅くなり、HPの離脱損失が生じます。"
        : view.capacityState === "unbounded" ? "CPU容量は無制限。CPU負荷による低下はありません。"
          : "CPU容量内です。";
  const workText = view.transientLoad !== null && view.transientLoad > 0
    ? `基本${view.baseLoad ?? "確認不可"} + 一時${view.transientLoad}。` : "";
  const title = `${view.source === "battle" ? "対戦中のCPU条件。" : "次の対戦のCPU条件。"}${stateText}${workText}CPU速度はCPU負荷だけの倍率です。ナビの注目分散・部品ごとの補正による発動間隔は別です。CPU容量とHPは別です。`;
  const bar = view.barPercent === null ? ""
    : `<div class="load-bar" aria-hidden="true"><i style="width:${view.barPercent}%"></i>${view.overloaded ? `<em style="width:${view.overloadBarPercent}%"></em>` : ""}</div>`;
  return `<div class="tb-load cpu-conditions${view.overloaded ? " over" : ""}" title="${title}"><small>CPU負荷 / 容量</small>${bar}<b>${loadText} / ${capacityText}</b><span class="tb-speed">${speedText}</span></div>`;
}
