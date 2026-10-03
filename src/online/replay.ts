import D from "../data.js";
import E, { type Battle } from "../engine.js";
import { BATTLE_RULES_VERSION } from "../combat-rules.js";
import { arenaCatalogDefinition, fingerprintJson } from "./catalog.js";
import type { OnlineMatch } from "./types.js";
import type { BattleEvent } from "../types.js";
import {
  applyCombatFeedback,
  combatFeedback,
} from "../catalog/combat-feedback.js";

/** Build the same tick-derived native UI state as the main battle view, scoped to this replay. */
export function onlineReplayState(battle: Battle) {
  return ([battle.player, battle.enemy] as const).flatMap((side) =>
    side.parts.map((part) => {
      const runtime = battle.states[side.name].get(part.id);
      const targetSide =
        part.type === "ad_popup"
          ? side.name === "player"
            ? battle.enemy
            : battle.player
          : side;
      const target = targetSide.parts.find((p) => p.id === runtime?.target);
      return {
        side: side.name === "player" ? "self" : "opponent",
        id: part.id,
        feedback: combatFeedback(
          part.type,
          part.charge,
          battle.ticks,
          runtime,
          target ? (D.PARTS[target.type]?.name ?? target.type) : "",
          side.shield,
        ),
        progress: part.period
          ? Math.max(0, 1 - part.remaining / part.period)
          : 0,
        income: part.type === "am_cart" ? part.charge : part.earned,
        charge: part.charge,
        fires: part.fires,
      };
    }),
  );
}
export function applyOnlineReplayFeedback(root: HTMLElement, battle: Battle) {
  for (const state of onlineReplayState(battle)) {
    const board = root.querySelector<HTMLElement>(
      `[data-arena-board="${state.side}"]`,
    );
    const part =
      board &&
      [...board.querySelectorAll<HTMLElement>("[data-id]")].find(
        (node) => node.dataset.id === state.id,
      );
    if (!part) continue;
    applyCombatFeedback(part, state.feedback);
    part.style.setProperty("--progress", String(state.progress));
    const income = part.querySelector(".state-income");
    if (income)
      income.textContent = String(Math.round(state.income * 100) / 100);
    const sent = part.querySelector(".cart-state");
    if (sent) sent.textContent = String(state.fires);
    const progress = part.querySelector<HTMLElement>(".cart-charge");
    if (progress)
      progress.style.setProperty(
        "--charge",
        String(Math.min(1, state.charge / 3)),
      );
  }
}
export function onlineEventText(event: BattleEvent, battle: Battle): string {
  if (event.kind !== "control") return "";
  const who = event.target === "player" ? "あなた" : "相手";
  const part = battle[event.target].parts.find((p) => p.id === event.to),
    name = part ? (D.PARTS[part.type]?.name ?? part.type) : "UI";
  const prefix = `${event.time.toFixed(1)}秒 · `;
  if (event.action === "cover")
    return `${prefix}${who}の${name}が広告で覆われました`;
  if (event.action === "blocked")
    return `${prefix}${who}のキャッシュが妨害を防ぎました`;
  if (event.action === "release")
    return `${prefix}${who}の${name}が再開しました`;
  if (event.action === "cache-ready")
    return `${prefix}${who}のキャッシュが再充填されました`;
  return "";
}

/** Verify actual simulation equivalence before animation; the server result is never replaced. */
export async function verifyOnlineReplay(
  match: OnlineMatch,
): Promise<
  | { ok: true }
  | {
      ok: false;
      code: "RULES_MISMATCH" | "CATALOG_MISMATCH" | "REPLAY_MISMATCH";
    }
> {
  if (match.combatVersion !== BATTLE_RULES_VERSION)
    return { ok: false, code: "RULES_MISMATCH" };
  if ((await fingerprintJson(arenaCatalogDefinition())) !== match.catalogHash)
    return { ok: false, code: "CATALOG_MISMATCH" };
  const battle = new E.Battle(match.player.items, match.opponent.items, {
    playerHp: match.player.hp,
    enemyHp: match.opponent.hp,
    playerAdmin: match.player.admin,
    enemyAdmin: match.opponent.admin,
    playerCapacity: match.player.capacity,
    enemyCapacity: match.opponent.capacity,
  });
  const events: BattleEvent[] = [];
  for (let tick = 0; tick < 1200 && !battle.result; tick++)
    events.push(...battle.step(0.05));
  if (
    !battle.result ||
    battle.result.winner !== match.winner ||
    battle.ticks !== match.finalTick ||
    (await fingerprintJson(events)) !== match.replayHash
  )
    return { ok: false, code: "REPLAY_MISMATCH" };
  return { ok: true };
}
