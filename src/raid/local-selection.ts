import { verifyRaidBlueprint } from "./blueprint.js";
import type { RaidBlueprint, RaidResult } from "./types.js";

/** A single same-tab return target. The owner controls its run/profile scope. */
export interface LocalRaidSelection {
  remember(
    blueprint: RaidBlueprint,
    isCurrent: () => boolean,
  ): Promise<RaidResult<RaidBlueprint>>;
  read(): RaidBlueprint | undefined;
  clear(): void;
}

/** No files, source text, storage, acquisition, or reward state enters this slot. */
export function createLocalRaidSelection(): LocalRaidSelection {
  let selected: RaidBlueprint | undefined;
  let generation = 0;
  const cancelled = (): RaidResult<never> => ({
    ok: false,
    code: "local-selection-cancelled",
    error: "画面が変わったため、ローカル近似の一時保持を中止しました。",
  });
  return {
    async remember(blueprint, isCurrent) {
      const current = () => {
        try {
          return isCurrent() === true;
        } catch {
          return false;
        }
      };
      if (!current()) return cancelled();
      const mine = ++generation;
      const verified = await verifyRaidBlueprint(blueprint);
      if (mine !== generation || !current()) return cancelled();
      if (!verified.ok) return verified;
      if (verified.value.source.kind !== "local-file")
        return {
          ok: false,
          code: "local-selection-only",
          error: "一時保持できるのは検証済みのローカル近似だけです。",
        };
      selected = structuredClone(verified.value);
      return verified;
    },
    read() {
      return selected ? structuredClone(selected) : undefined;
    },
    clear() {
      generation++;
      selected = undefined;
    },
  };
}
