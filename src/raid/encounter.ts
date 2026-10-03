import { prepareRaidRewards } from "./blueprint.js";
import { registerRaidBlueprint } from "./registry.js";
import type {
  RaidBlueprint,
  RaidPanelCallbacks,
  RaidResult,
  RaidReward,
  RaidResume,
} from "./types.js";
export type RaidEncounterPhase =
  "empty" | "ready" | "battling" | "won" | "lost" | "claiming" | "claimed";
interface State {
  phase: RaidEncounterPhase;
  blueprint: RaidBlueprint | null;
  rewards: RaidReward[];
  message: string;
}
const fail = (error: string): RaidResult<never> => ({
  ok: false,
  code: "encounter-blocked",
  error,
});
export function createRaidEncounterController(callbacks: RaidPanelCallbacks) {
  let state: State = {
      phase: "empty",
      blueprint: null,
      rewards: [],
      message: "",
    },
    generation = 0,
    disposed = false;
  return {
    get state(): State {
      return structuredClone(state);
    },
    async select(blueprint: RaidBlueprint): Promise<RaidResult<RaidBlueprint>> {
      if (disposed || ["battling", "won", "claiming"].includes(state.phase))
        return fail("先に対戦または報酬の受け取りを完了してください。");
      const mine = ++generation;
      const checked = await registerRaidBlueprint(blueprint);
      if (disposed || mine !== generation)
        return fail("ページの選択を中止しました。");
      if (!checked.ok) return checked;
      state = {
        phase: "ready",
        blueprint: structuredClone(checked.value),
        rewards: [],
        message: "",
      };
      return { ok: true, value: structuredClone(checked.value) };
    },
    async restore(resume: RaidResume): Promise<RaidResult<RaidBlueprint>> {
      if (disposed || ["battling", "won", "claiming"].includes(state.phase))
        return fail("現在は保存済み対戦を復旧できません。");
      // Saved JSON is untrusted even when the TypeScript caller is typed.
      if (
        !resume ||
        typeof resume !== "object" ||
        resume.winner !== "player" ||
        typeof resume.battleId !== "string" ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(resume.battleId)
      )
        return fail("保存済みの勝利を確認できません。");
      const battleId = resume.battleId;
      const mine = ++generation;
      const checked = await registerRaidBlueprint(resume.blueprint);
      if (disposed || mine !== generation)
        return fail("対戦の復旧を中止しました。");
      if (!checked.ok) return checked;
      state = {
        phase: "won",
        blueprint: structuredClone(checked.value),
        rewards: prepareRaidRewards(checked.value, battleId),
        message: "保存済みの勝利を復旧しました。相手のUIを一つ回収できます。",
      };
      return { ok: true, value: structuredClone(checked.value) };
    },
    async challenge(): Promise<RaidResult<RaidReward[]>> {
      if (
        disposed ||
        !state.blueprint ||
        !["ready", "lost", "claimed"].includes(state.phase)
      )
        return fail("現在は対戦を開始できません。");
      const snapshot = structuredClone(state.blueprint);
      state.phase = "battling";
      state.rewards = [];
      state.message = "現在のビルドのコピーで対戦しています。";
      try {
        const result = await callbacks.onChallenge(structuredClone(snapshot));
        if (disposed) {
          state.phase = "ready";
          return fail("画面を閉じました。保存済みの勝利は次回復旧します。");
        }
        if (
          !["player", "enemy", "draw"].includes(result.winner) ||
          !/^[a-zA-Z0-9_-]{1,80}$/.test(result.battleId)
        )
          throw new Error("対戦結果を確認できませんでした。");
        state.blueprint = snapshot;
        state.rewards =
          result.winner === "player"
            ? prepareRaidRewards(snapshot, result.battleId)
            : [];
        state.phase = result.winner === "player" ? "won" : "lost";
        state.message =
          result.winner === "player"
            ? "勝利。相手のページからUIを一つ選んで回収できます。"
            : "今回は回収できませんでした。元のランは変更していません。";
        return { ok: true, value: structuredClone(state.rewards) };
      } catch (error) {
        state.phase = "ready";
        state.message =
          error instanceof Error
            ? error.message
            : "対戦を開始できませんでした。";
        return fail(state.message);
      }
    },
    async claim(componentId: string): Promise<RaidResult<RaidReward>> {
      if (disposed || state.phase !== "won" || !state.blueprint)
        return fail("回収できる報酬がありません。");
      const reward = state.rewards.find((r) => r.componentId === componentId);
      if (!reward)
        return fail("このUIは対戦したページの回収候補ではありません。");
      state.phase = "claiming";
      try {
        const result = await callbacks.onClaim(
          structuredClone(reward),
          structuredClone(state.blueprint),
        );
        if (!result.ok) {
          state.phase = "won";
          state.message = result.error;
          return fail(result.error);
        }
        state.phase = "claimed";
        state.message =
          result.message ??
          "外観と取得元を保存しました。コレクションから使えます。";
        return { ok: true, value: structuredClone(reward) };
      } catch {
        state.phase = "won";
        state.message =
          "保存できませんでした。報酬は選び直さず再試行できます。";
        return fail(state.message);
      }
    },
    async discard(): Promise<RaidResult<null>> {
      if (disposed || state.phase !== "won" || !callbacks.onDiscard)
        return fail("現在は報酬を見送れません。");
      const battleId = state.rewards[0]?.battleId;
      if (!battleId) return fail("対戦を確認できません。");
      state.phase = "claiming";
      try {
        const result = await callbacks.onDiscard(battleId);
        if (!result.ok) {
          state.phase = "won";
          state.message = result.error;
          return fail(result.error);
        }
        state.phase = "ready";
        state.rewards = [];
        state.message = "今回の回収を見送りました。";
        return { ok: true, value: null };
      } catch {
        state.phase = "won";
        return fail("保存できなかったため、報酬を保持しています。");
      }
    },
    dispose(): void {
      disposed = true;
      generation++;
    },
  };
}
