import type { RaidBlueprint } from "./types.js";

/** Describes recorded approximation metadata, never source pixels or completeness. */
export function raidAnalysisSummary(blueprint: RaidBlueprint): string {
  const analysis = blueprint.analysis;
  if (
    blueprint.source.kind === "fixture" ||
    blueprint.fidelity !== "code-approximation" ||
    !analysis ||
    !Number.isSafeInteger(analysis.candidateCount) ||
    !Number.isSafeInteger(analysis.selectedCount) ||
    analysis.selectedCount < 1 ||
    analysis.candidateCount < analysis.selectedCount
  )
    return "";

  const { candidateCount, selectedCount, css } = analysis;
  const parts = [
    `対応する見出し・リンク等の候補 ${candidateCount}件から戦闘UI ${selectedCount}件を選択（${candidateCount - selectedCount}件は未採用）。ページの全要素数や、元の見た目の再現率ではありません。`,
  ];
  if (css) {
    parts.push(
      `CSSは対応範囲のみ：${css.rules}規則（セレクター単位、インライン指定を除く）。`,
    );
    if (css.limited) parts.push("CSS解析上限による省略があります。");
  }
  return parts.join(" ");
}
