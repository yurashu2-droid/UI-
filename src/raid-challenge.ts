import D from "./data.js";
import C from "./document.js";
import E from "./engine.js";
import R from "./run.js";
import type { Run } from "./types.js";
import { createRaidEnemy } from "./raid/blueprint.js";
import type { RaidBlueprint } from "./raid/types.js";

export function prepareRaidChallenge(run: Run, blueprint: RaidBlueprint) {
  const snapshot = structuredClone(run), captured = structuredClone(blueprint);
  if (!R.validateRun(snapshot) || snapshot.phase !== "build") throw new Error("編集画面から挑戦してください。");
  if (captured.source.kind === "local-file" && snapshot.mode !== "lab")
    throw new Error("ローカルHTMLの対戦は実験室だけで利用できます。");
  if (!snapshot.owned.some(item => C.placed(item) && D.PARTS[item.type].kind === "attack"))
    throw new Error("攻撃するUIを最低1つ、自分のページに配置してください。");
  const hp = R.playerHp(snapshot), capacity = snapshot.mode === "lab" ? D.LOAD_LIMIT : R.capacity(snapshot);
  const battle = new E.Battle(snapshot.owned, createRaidEnemy(captured), {
    playerHp: hp, enemyHp: hp, playerAdmin: [...snapshot.admin], enemyAdmin: [],
    playerCapacity: capacity, enemyCapacity: capacity,
  });
  return { battleId: crypto.randomUUID(), battle, snapshot, blueprint: captured };
}
