import { verifyRaidBlueprint } from "./blueprint.js";
import type { RaidAppearance, RaidBlueprint, RaidResult } from "./types.js";
const appearances = new Map<string, RaidAppearance>();
/** Hydrate only verified private local snapshots. Missing entries intentionally keep canonical UI. */
export async function registerRaidBlueprint(
  blueprint: RaidBlueprint,
): Promise<RaidResult<RaidBlueprint>> {
  const checked = await verifyRaidBlueprint(blueprint);
  if (!checked.ok) return checked;
  for (const component of checked.value.components)
    appearances.set(
      component.appearanceId,
      structuredClone(component.appearance),
    );
  return checked;
}
export function getRaidAppearance(id: string): RaidAppearance | undefined {
  const value = appearances.get(id);
  return value ? structuredClone(value) : undefined;
}
