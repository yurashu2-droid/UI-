import test from "node:test";
import assert from "node:assert/strict";

const story = await import("../src/story/index.ts").catch(() => ({}));

test("story has an isolated, serializable eight-stage campaign rather than replacing legacy rounds", () => {
  assert.equal(
    typeof story.createStoryState,
    "function",
    "story entry point exists",
  );
  const state = story.createStoryState();
  assert.equal(state.version, 1);
  assert.equal(state.stageId, "salvage");
  assert.equal(story.STORY_STAGES.length, 8);
  assert.equal(
    story.validateStoryState(JSON.parse(JSON.stringify(state))),
    true,
  );
  assert.equal(Object.hasOwn(state, "cash"), false);
  assert.equal(Object.hasOwn(state, "lives"), false);
  assert.equal(Object.hasOwn(state, "owned"), false);
});

const cmd = (state, command) => {
  const result = story.transitionStory(state, command);
  assert.equal(result.ok, true, result.error);
  return result;
};
function begun() {
  return cmd(story.createStoryState(), {
    type: "name-page",
    name: "  ぼくのページ  ",
  }).state;
}
function winStage(state, prefix = "match") {
  for (const encounter of story.currentStoryStage(state).encounters) {
    const matchId = `${prefix}-${encounter.id}`;
    state = cmd(state, {
      type: "start-encounter",
      encounterId: encounter.id,
      matchId,
    }).state;
    state = cmd(state, {
      type: "resolve-encounter",
      matchId,
      winner: "player",
    }).state;
  }
  return state;
}
test("naming is normalized and a blank or oversized name cannot start the story", () => {
  assert.equal(typeof story.transitionStory, "function");
  const initial = story.createStoryState();
  for (const name of ["   ", "a".repeat(81), "bad\u0000name"])
    assert.equal(
      story.transitionStory(initial, { type: "name-page", name }).ok,
      false,
    );
  assert.equal(begun().pageName, "ぼくのページ");
  assert.equal(begun().phase, "hub");
  assert.equal(initial.pageName, "", "transition must not mutate the input");
});
test("loss can be retried at the same encounter and cannot yield a required record", () => {
  assert.equal(typeof story.transitionStory, "function");
  let state = begun();
  const first = story.currentStoryEncounter(state);
  state = cmd(state, {
    type: "start-encounter",
    encounterId: first.id,
    matchId: "lost-1",
  }).state;
  const loss = cmd(state, {
    type: "resolve-encounter",
    matchId: "lost-1",
    winner: "enemy",
  });
  assert.equal(story.currentStoryEncounter(loss.state).id, first.id);
  assert.equal(loss.state.stageId, "salvage");
  assert.deepEqual(loss.state.records, []);
  assert.deepEqual(
    cmd(loss.state, {
      type: "resolve-encounter",
      matchId: "lost-1",
      winner: "enemy",
    }).effects,
    [],
  );
});
test("main-route completion always grants the story record once, independently of random loot", () => {
  assert.equal(typeof story.transitionStory, "function");
  const state = winStage(begun());
  assert.deepEqual(state.records, ["broken-counter"]);
  assert.equal(state.phase, "record");
  assert.equal(
    story.transitionStory(state, { type: "advance-stage" }).ok,
    false,
  );
  const acknowledged = cmd(state, { type: "collect-record" }).state;
  const next = cmd(acknowledged, { type: "advance-stage" }).state;
  assert.equal(next.stageId, "delivery");
  assert.equal(next.analysisEnergy >= state.analysisEnergy, true);
  assert.equal(story.validateStoryState(next), true);
});
test("out-of-order battle resolution, locked encounters, invalid save states and duplicate settlements are rejected safely", () => {
  assert.equal(typeof story.transitionStory, "function");
  const state = begun(),
    boss = story.STORY_STAGES[0].encounters.at(-1);
  assert.equal(
    story.transitionStory(state, {
      type: "start-encounter",
      encounterId: boss.id,
      matchId: "skip",
    }).ok,
    false,
  );
  assert.equal(
    story.transitionStory(state, {
      type: "resolve-encounter",
      matchId: "unknown",
      winner: "player",
    }).ok,
    false,
  );
  for (const patch of [
    { stageId: "unknown" },
    { analysisEnergy: -1 },
    { phase: "record" },
    { phase: "complete" },
    { records: ["archive-coordinates"] },
    { junkMet: "yes" },
    { pendingEncounter: { id: boss.id, matchId: "x" } },
  ])
    assert.equal(
      story.validateStoryState({ ...state, ...patch }),
      false,
      JSON.stringify(patch),
    );
});
test("optional analysis has explicit new/cached/reanalysis costs and cannot consume mandatory story connections", () => {
  assert.equal(typeof story.transitionStory, "function");
  let state = begun();
  const energy = state.analysisEnergy;
  state = cmd(state, {
    type: "spend-analysis",
    receiptId: "cached",
    kind: "cached",
  }).state;
  assert.equal(state.analysisEnergy, energy);
  state = cmd(state, {
    type: "spend-analysis",
    receiptId: "new",
    kind: "new",
  }).state;
  assert.equal(state.analysisEnergy, energy - 1);
  assert.equal(
    cmd(state, { type: "spend-analysis", receiptId: "new", kind: "new" }).state
      .analysisEnergy,
    energy - 1,
  );
  state = { ...state, analysisEnergy: 0 };
  assert.equal(
    story.transitionStory(state, {
      type: "spend-analysis",
      receiptId: "again",
      kind: "reanalyze",
    }).ok,
    false,
  );
  assert.equal(
    story.transitionStory(state, {
      type: "start-encounter",
      encounterId: story.currentStoryEncounter(state).id,
      matchId: "free-main",
    }).ok,
    true,
  );
});
test("the ending restores a present copy without changing the archive and counts the first link visit once", () => {
  assert.equal(typeof story.transitionStory, "function");
  let state = begun();
  for (let i = 0; i < 8; i++) {
    state = winStage(state);
    state = cmd(state, { type: "collect-record" }).state;
    if (i === 1) state = cmd(state, { type: "witness-fusion" }).state;
    if (i < 7) state = cmd(state, { type: "advance-stage" }).state;
  }
  assert.equal(state.phase, "archive");
  assert.equal(state.records.length, 8);
  assert.equal(
    story.transitionStory(state, {
      type: "open-archive",
      url: "https://wrong.example/",
      date: "2001-01-01",
    }).ok,
    false,
  );
  state = cmd(state, {
    type: "open-archive",
    ...story.ARCHIVE_COORDINATES,
  }).state;
  assert.equal(state.archiveOpened, true);
  assert.equal(state.restored, false);
  state = cmd(state, { type: "restore-archive" }).state;
  const link = cmd(state, { type: "place-ending-link" });
  assert.equal(
    link.effects.filter((e) => e.type === "ending-link-granted").length,
    1,
  );
  assert.deepEqual(cmd(link.state, { type: "place-ending-link" }).effects, []);
  const visit = cmd(link.state, { type: "visit-restored-page" });
  assert.equal(visit.state.restoredVisits, 1);
  assert.equal(visit.state.phase, "complete");
  assert.equal(
    cmd(visit.state, { type: "visit-restored-page" }).state.restoredVisits,
    1,
  );
  assert.equal(story.validateStoryState(visit.state), true);
});

test("normalized page names obey the existing run's 40 UTF-16-unit storage limit", () => {
  for (const name of [
    "a".repeat(41),
    "😀".repeat(21),
    "a" + "\u0344".repeat(39),
  ])
    assert.equal(
      story.transitionStory(story.createStoryState(), {
        type: "name-page",
        name,
      }).ok,
      false,
    );
  const result = cmd(story.createStoryState(), {
    type: "name-page",
    name: " e\u0301 ",
  });
  assert.equal(result.state.pageName, "é");
  assert.equal(story.validateStoryState(result.state), true);
});

test("stage two grants a deterministic cross-culture fusion kit and waits for an actual fusion witness", () => {
  let state = cmd(winStage(begun()), { type: "collect-record" }).state;
  const entering = cmd(state, { type: "advance-stage" });
  state = entering.state;
  assert.deepEqual(
    entering.effects.find((e) => e.type === "fusion-kit")?.types,
    ["ab_mail", "am_coupon"],
  );
  state = cmd(winStage(state), { type: "collect-record" }).state;
  assert.equal(
    story.transitionStory(state, { type: "advance-stage" }).ok,
    false,
  );
  const fused = cmd(state, { type: "witness-fusion" });
  assert.equal(fused.effects[0].type, "fusion-reaction");
  assert.deepEqual(cmd(fused.state, { type: "witness-fusion" }).effects, []);
  assert.equal(
    cmd(fused.state, { type: "advance-stage" }).state.stageId,
    "playback",
  );
});
