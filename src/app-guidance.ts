import D from "./data.js";
import type { BattleAnalysis, Item } from "./types.js";

export const VIDEO_SPEED_HELP = "動画の下に操作列として接続すると、同じ動画プレイヤー構造の動画本体を2倍速に（上限2倍）。文字・購入・再発動UIは対象外";
export const INSTANT_SEARCH_HELP = "自分の内蔵サジェストと、接続した文字攻撃の威力 +45%。同じサジェスト系の効果は重複せず、強い方だけ適用。最終倍率は対象UIの「威力」で確認できます。";

/** Describe outgoing engine connections, not an additional/stacked damage gain. */
export function instantSearchSupport(item: Item, info: BattleAnalysis) {
  if (item.type !== "go_instant") return null;
  const placed = info.board.some(part => part.id === item.id);
  const targetIds = new Set(info.relations
    .filter(relation => relation.from === item.id && relation.kind === "power")
    .map(relation => relation.to));
  return {
    placed,
    targets: placed ? info.board.filter(part => part.id !== item.id && targetIds.has(part.id)) : [],
  };
}

export function isVideoSource(item: Pick<Item, "type">) {
  const part = D.PARTS[item.type];
  return !!part && part.layout === "media" && part.tags.includes("video");
}

/** Consume the engine's actual connection, rather than inferring an effect from proximity. */
export function videoSpeedWorking(item: Item, info: BattleAnalysis) {
  if (item.type !== "yt_speed") return false;
  return info.relations.some(relation => relation.from === item.id && relation.kind === "speed" &&
    info.board.some(target => target.id === relation.to && isVideoSource(target)));
}

export function videoSpeedHint(info: BattleAnalysis): string | undefined {
  if (info.board.some(item => videoSpeedWorking(item, info))) return "接続した動画本体へ2倍速を適用中";
  if (!info.board.some(isVideoSource)) return undefined;
  const mediaStack = info.groups.some(group => group.kind === "media-stack" &&
    info.board.some(item => group.items.includes(item.id) && isVideoSource(item)));
  return mediaStack ? "動画プレイヤーの操作列へつなぐと2倍速" : "動画の下に操作列を作ると2倍速";
}

// These are the five faction bonuses actually implemented by the combat engine.
// New catalogue families must not imply a bonus merely by reaching three parts.
const FACTION_SET_BONUSES = new Set(["youtube", "amazon", "google", "retro", "gov"]);
export function factionSetView(faction: string, count: number) {
  const definition = Object.hasOwn(D.FACTIONS, faction) ? D.FACTIONS[faction] : undefined;
  const hasBonus = FACTION_SET_BONUSES.has(faction);
  const active = hasBonus && count >= 3;
  return {
    active,
    threshold: hasBonus ? 3 : null,
    nextHint: hasBonus && count === 2 ? `${definition!.name}セットまであと1` : undefined,
    status: `${hasBonus ? (active ? "発動中：" : "3つで：") : ""}${definition?.set ?? "系統ボーナスなし"}`,
  };
}

/** Presentation-only: do not treat descriptive catalogue families as implemented bonuses. */
export function activeFactionSets(info: Pick<BattleAnalysis, "counts">) {
  return Object.entries(info.counts)
    .filter(([faction, count]) => factionSetView(faction, count).active)
    .map(([faction, count]) => ({ faction, count }));
}
