import test from "node:test";
import assert from "node:assert/strict";
import E from "../src/engine.js";
import R from "../src/run.js";
import C from "../src/document.js";
test("video fusion consumes seek strip while preserving attached player controls", () => {
  const run = R.newRun("lab");
  run.owned = [
    C.makeItem("yt_play", "video", 24, 24, 560, 280),
    C.makeItem("yt_progress", "seek", 24, 304, 560, 22),
    C.makeItem("yt_speed", "speed", 24, 326, 104, 40),
    C.makeItem("yt_autoplay", "autoplay", 128, 326, 176, 40),
  ];
  run.nextId = 20;
  assert.equal(E.analyze(run.owned).mods.video.speed, 2);
  const fusions = R.fuse(run);
  assert.equal(fusions.length, 1);
  const fused = run.owned.find((p) => p.type === "yt_embed");
  assert.ok(fused);
  assert.equal(E.analyze(run.owned).mods[fused.id].speed, 2);
  assert.equal(fused.y + fused.h, 326);
  assert.ok(
    run.owned.every((p) => C.canPlace(run.owned, p, p.x, p.y, p.w, p.h)),
  );
});
