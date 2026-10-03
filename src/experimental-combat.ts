/** Opt-in laboratory rule sets. Never selected by campaign or authoritative online play. */
export const EXPERIMENTAL_RULESETS = [
  "navigation-v1",
  "audience-v1",
  "navigation-audience-v1",
] as const;
export type ExperimentalRules = (typeof EXPERIMENTAL_RULESETS)[number] | null;
export const NAVIGATION_ATTENTION = Object.freeze({
  fullSpeedEntries: 6,
  extraEntryWeight: 0.05,
  highlightedLinks: 2,
});
export function navigationExperiment(rules: ExperimentalRules) {
  return rules === "navigation-v1" || rules === "navigation-audience-v1";
}
export function audienceExperiment(rules: ExperimentalRules) {
  return rules === "audience-v1" || rules === "navigation-audience-v1";
}
