import R from "./run.js";
import type { Mode, Run } from "./types.js";

export type LabAudienceVariant = "standard" | "audience-v1";
export interface LabControlContext {
  mode: Mode;
  storyActive: boolean;
  battleActive: boolean;
}

/** Session-local opt-in. It is deliberately absent from campaign and online saves. */
export function createLabBattleController() {
  let selected: LabAudienceVariant = "standard";
  return {
    get value() { return selected; },
    choose(value: string, context: LabControlContext) {
      if (context.mode !== "lab" || context.storyActive || context.battleActive ||
          (value !== "standard" && value !== "audience-v1")) return false;
      selected = value;
      return true;
    },
    reset() { selected = "standard"; },
    start(run: Run, storyActive: boolean) {
      return R.startBattle(run, {
        audienceExperiment: run.mode === "lab" && !storyActive && selected === "audience-v1",
      });
    },
  };
}
export type LabBattleController = ReturnType<typeof createLabBattleController>;

/** A native labelled control; dynamic context also rejects queued/stale change events. */
export function mountAudienceLabControl(
  host: HTMLElement,
  controller: LabBattleController,
  getContext: () => LabControlContext,
  onChange: () => void,
) {
  const doc = host.ownerDocument;
  const label = doc.createElement("label");
  label.setAttribute("for", "lab-audience-experiment");
  label.className = "field-label";
  label.textContent = "対戦ルール［実験室限定］";
  const select = doc.createElement("select");
  select.id = "lab-audience-experiment";
  select.className = "select-input";
  select.setAttribute("aria-describedby", "lab-audience-description");
  for (const [value, text] of [
    ["standard", "通常ルール"],
    ["audience-v1", "実験：広告の離脱・登録の定着"],
  ]) {
    const option = doc.createElement("option");
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  const description = doc.createElement("p");
  description.id = "lab-audience-description";
  description.className = "opp-tip";
  description.textContent = "試験中の追加ルール。広告が集中すると閲覧者が離脱し、登録は収益の一部を定着に変えます。双方のページに適用。実験室を離れると通常に戻ります。";
  const sync = () => {
    const context = getContext();
    select.value = controller.value;
    select.disabled = context.mode !== "lab" || context.storyActive || context.battleActive;
  };
  select.addEventListener("change", () => {
    const accepted = controller.choose(select.value, getContext());
    sync();
    if (accepted) onChange();
  });
  sync();
  host.append(label, select, description);
}
