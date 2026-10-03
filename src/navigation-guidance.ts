import D from "./data.js";
import type { AnalysisWithCaps } from "./engine.js";
import type { Item } from "./types.js";

type NavigationAnalysis = Pick<
  AnalysisWithCaps,
  "board" | "freeRatio" | "navigation"
>;
type SelectionState = "eligible" | "unhighlighted" | "stashed" | "not-link";

/** Presentation only. Coverage comes from this battle's analysis, including legacy rules. */
export function navigationGuidance(info: NavigationAnalysis, selected?: Item) {
  const links = info.board.filter((part) => part.type === "ab_link");
  const targets = (
    info.navigation
      ? info.navigation.highlightedLinks.flatMap((id) =>
          links.filter((part) => part.id === id),
        )
      : links
  ).map((part) => ({
    id: part.id,
    name: part.label || D.PARTS[part.type].name,
  }));
  // Matches engine whitespaceBonus; never compute a tier from the displayed percentage.
  const tierBonus = Math.min(3, Math.floor(info.freeRatio * 5));
  const selectedPart =
    selected && info.board.find((part) => part.id === selected.id);
  const state: SelectionState = !selectedPart
    ? "stashed"
    : selectedPart.type !== "ab_link"
      ? "not-link"
      : targets.some((part) => part.id === selectedPart.id)
        ? "eligible"
        : "unhighlighted";
  return {
    freeRatio: info.freeRatio,
    // Truncation cannot label a just-below-threshold layout as having reached it.
    freePercentText: `${(Math.floor(info.freeRatio * 100_000) / 1000).toFixed(3)}%`,
    tierBonus,
    appliedBonus: targets.length ? tierBonus : 0,
    targets,
    nextThresholdPercent:
      targets.length && tierBonus < 3 && (!selected || state === "eligible")
        ? (tierBonus + 1) * 20
        : null,
    selected: selected
      ? { id: selected.id, state, bonus: state === "eligible" ? tierBonus : 0 }
      : null,
    attention:
      info.navigation && info.navigation.entries > 0
        ? {
            entries: info.navigation.entries,
            slowdown: info.navigation.slowdown,
          }
        : null,
  };
}

function escape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Standalone fragment for the selection card or the page's synergy panel. */
export function renderNavigationGuidance(
  view: ReturnType<typeof navigationGuidance>,
) {
  const selected = view.selected;
  const selection = !selected
    ? ""
    : selected.state === "eligible"
      ? `このUI：余白加算 +${selected.bonus} / 回（威力倍率の前）`
      : selected.state === "stashed"
        ? "このUIは未配置：余白加算 +0"
        : selected.state === "not-link"
          ? "余白強調は青いハイパーリンク専用：このUIの余白加算 +0"
          : "このUIは現在の余白強調の対象外：余白加算 +0";
  return `<div class="navigation-guidance"><div class="link-row"><b>リンクの余白加算</b><span>余白 ${escape(view.freePercentText)}</span><small>対象の基礎値 +${view.appliedBonus} / 回（威力倍率の前）</small></div>
<p class="muted">余白率は小数第3位まで切り捨て。加算後に「威力」倍率を適用し、シールドなどで実際のHP減少は変わります。</p>
${selection ? `<p class="muted">${selection}</p>` : ""}
${view.targets.length ? `<div class="sel-connect"><b>余白強調の対象リンク</b><ul class="sel-bonus">${view.targets.map((part) => `<li>${escape(part.name)}</li>`).join("")}</ul></div>` : '<p class="muted">対象の青リンクは未配置。余白加算は適用されていません。</p>'}
${view.nextThresholdPercent === null ? "" : `<p class="muted">次の段階：余白${view.nextThresholdPercent}%以上で +${view.tierBonus + 1} / 回（対象リンクのみ）</p>`}
${view.attention ? `<div class="link-row navigation-attention"><b>ナビの注目分散</b><small>攻撃ナビ${view.attention.entries}個：発動間隔 ×${view.attention.slowdown.toFixed(2)}（余白加算とは別）</small></div>` : ""}</div>`;
}
