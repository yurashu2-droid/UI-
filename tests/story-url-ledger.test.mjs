import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { createProfileStore } from "../src/profile-store.ts";
import { createFixtureRaid, prepareRaidRewards } from "../src/raid/index.ts";
import {
  createStorySession,
  commandStorySession,
} from "../src/story/session.ts";

test("a story URL trophy cannot seed or overwrite the legacy campaign profile", async () => {
  const store = createProfileStore(new IDBFactory(), "story-url-isolation");
  const story = commandStorySession(createStorySession(), {
    type: "name-page",
    name: "Story only",
  }).session;
  const bp = await createFixtureRaid("archive"),
    id = "story-url-match";
  await store.recordRaidVictory(bp, id);
  const reward = prepareRaidRewards(bp, id)[0];
  await store.claimRaidReward(story.run, reward, bp, {
    writeRunProfile: false,
  });
  assert.equal(await store.loadRun("campaign"), undefined);
  assert.equal((await store.listTrophies()).length, 1);
});
