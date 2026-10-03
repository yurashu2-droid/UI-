import test from "node:test";
import assert from "node:assert/strict";
import { createStoryState, transitionStory, validateStoryState, currentStoryEncounter, STORY_STAGES, ARCHIVE_COORDINATES } from "../src/story/index.js";
import R from "../src/run.js";
import C from "../src/document.js";

const roundTrip = state => JSON.parse(JSON.stringify(state));
function apply(state, command) {
  const before = structuredClone(state);
  const result = transitionStory(state, command);
  assert.deepEqual(state, before, "the input save must remain unchanged");
  assert.equal(result.ok, true, result.error);
  assert.equal(validateStoryState(result.state), true, `${command.type}: valid output`);
  const restored = roundTrip(result.state);
  assert.equal(validateStoryState(restored), true, `${command.type}: serializable output`);
  return { ...result, state: restored };
}
const begin = () => apply(createStoryState(), { type: "name-page", name: "QA のページ" }).state;

test("QA: every accepted normalized page name remains a valid reloadable story state", () => {
  for (const name of ["a", " e\u0301 ", "あ".repeat(40), "😀".repeat(40), "a" + "\u0344".repeat(79)]) {
    const initial = createStoryState();
    const result = transitionStory(initial, { type: "name-page", name });
    if (result.ok) {
      assert.equal(validateStoryState(result.state), true, `accepted name becomes invalid after NFC: ${JSON.stringify(name)}`);
      assert.equal(validateStoryState(roundTrip(result.state)), true);
    } else assert.deepEqual(result.state, initial);
  }
});

test("QA: fifteen story encounters and all ending actions survive reload without duplicate grants", () => {
  let state = begin();
  const records = [], endingGrants = [], counterEvents = [];
  for (const [index, stage] of STORY_STAGES.entries()) {
    assert.equal(state.stageId, stage.id);
    if (stage.id === "delivery") {
      // The host must witness an actual cross-culture R.fuse operation, not merely
      // grant the narrative flag. This isolated legal kit exercises that operation.
      const build = R.newRun("campaign", "mixed");
      build.nextId = 3;
      build.owned = [C.makeItem("ab_mail", "p1", 32, 32, 208, 32),
        C.makeItem("am_coupon", "p2", 240, 32, 280, 36)];
      assert.equal(R.validateRun(roundTrip(build)), true);
      const fusions = R.fuse(build);
      assert.equal(fusions.length, 1);
      assert.equal(fusions[0].item.type, "am_newsletter");
      assert.equal(R.validateRun(roundTrip(build)), true);
      state = apply(state, { type: "witness-fusion" }).state;
    }
    for (const encounter of stage.encounters) {
      const matchId = `qa-${encounter.id}`;
      state = apply(state, { type: "start-encounter", encounterId: encounter.id, matchId }).state;
      const won = apply(state, { type: "resolve-encounter", matchId, winner: "player" });
      state = won.state;
      records.push(...won.effects.filter(e => e.type === "record-collected"));
      const replay = apply(state, { type: "resolve-encounter", matchId, winner: "player" });
      assert.deepEqual(replay.effects, []);
      assert.deepEqual(replay.state, state);
    }
    state = apply(state, { type: "collect-record" }).state;
    if (index < 7) state = apply(state, { type: "advance-stage" }).state;
  }
  assert.equal(state.completedEncounters.length, 15);
  assert.deepEqual(records.map(e => e.recordId), STORY_STAGES.map(s => s.record.id));
  for (const command of [
    { type: "open-archive", url: ARCHIVE_COORDINATES.url, date: ARCHIVE_COORDINATES.date },
    { type: "restore-archive" }, { type: "place-ending-link" }, { type: "visit-restored-page" },
  ]) {
    const result = apply(state, command);
    state = result.state;
    endingGrants.push(...result.effects.filter(e => e.type === "ending-link-granted"));
    counterEvents.push(...result.effects.filter(e => e.type === "counter-increment"));
    const replay = apply(state, command);
    assert.deepEqual(replay.effects, []);
    assert.deepEqual(replay.state, state);
  }
  assert.equal(endingGrants.length, 1);
  assert.deepEqual(counterEvents, [{ type: "counter-increment", value: 1 }]);
  assert.equal(state.restoredVisits, 1);
  assert.equal(state.phase, "complete");
});

test("QA: cancellation and stale settlements cannot resolve a different pending story battle", () => {
  let state = begin();
  const id = currentStoryEncounter(state).id;
  state = apply(state, { type: "start-encounter", encounterId: id, matchId: "qa-cancelled" }).state;
  state = apply(state, { type: "cancel-encounter", matchId: "qa-cancelled" }).state;
  state = apply(state, { type: "start-encounter", encounterId: id, matchId: "qa-retry" }).state;
  for (const command of [
    { type: "resolve-encounter", matchId: "qa-cancelled", winner: "player" },
    { type: "cancel-encounter", matchId: "qa-cancelled" },
  ]) {
    const result = transitionStory(state, command);
    assert.equal(result.ok, false);
    assert.deepEqual(result.state, state);
    assert.deepEqual(result.effects, []);
  }
  state = apply(state, { type: "resolve-encounter", matchId: "qa-retry", winner: "draw" }).state;
  assert.equal(currentStoryEncounter(state).id, id);
  assert.deepEqual(state.records, []);
});

test("QA: malformed saved story order and ending flags fail closed without rewriting the original", () => {
  const state = begin();
  for (const patch of [
    { completedEncounters: [STORY_STAGES[0].encounters[1].id] },
    { records: ["broken-counter"] }, { readRecords: ["broken-counter"] },
    { stageId: "last-browser" }, { phase: "archive" }, { archiveOpened: true },
    { restored: true }, { endingLinkPlaced: true }, { restoredVisits: 1 },
    { resolvedMatches: ["duplicate", "duplicate"] }, { analysisEnergy: Infinity },
    { pageName: "untrimmed " }, { pageName: "a\u0000b" },
  ]) {
    const bad = { ...structuredClone(state), ...patch }, before = structuredClone(bad);
    assert.equal(validateStoryState(bad), false, JSON.stringify(patch));
    const result = transitionStory(bad, { type: "talk-junk" });
    assert.equal(result.ok, false);
    assert.deepEqual(result.state, before);
    assert.deepEqual(bad, before);
  }
});
