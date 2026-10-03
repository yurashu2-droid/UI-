import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import E from "../src/engine.js";
import C from "../src/document.js";
const path = new URL("../src/online/replay.ts", import.meta.url);
test("online replay projects covered targets and cache recovery on both native pages", async () => {
  assert.ok(existsSync(path), "online replay feedback adapter must exist");
  const { onlineReplayState, onlineEventText } = await import(path.href);
  const p = (type, id, x, y) => C.makeItem(type, id, x, y);
  const battle = new E.Battle(
    [p("ad_popup", "popup", 24, 24), p("ab_mail", "mail", 24, 120)],
    [p("gov_pdf", "pdf", 24, 24)],
    { playerHp: 10000, enemyHp: 10000 },
  );
  const popup = battle.player.parts.find((p) => p.id === "popup");
  popup.charge = 3;
  battle._activate(battle.player, battle.enemy, popup);
  const state = onlineReplayState(battle),
    cover = state.find((s) => s.side === "opponent" && s.id === "pdf");
  assert.equal(cover.feedback.covered, true);
  assert.equal(cover.feedback.remaining, "0.8");
  assert.match(state.find((s) => s.id === "popup").feedback.targetText, /PDF/);
  const control = battle.events.find(
    (e) => e.kind === "control" && e.action === "cover",
  );
  assert.match(onlineEventText(control, battle), /覆/);
  for (let tick = 0; tick < 16; tick++) battle.step(0.05);
  const released = onlineReplayState(battle).find(
    (s) => s.side === "opponent" && s.id === "pdf",
  );
  assert.equal(released.feedback.covered, false);
  assert.equal(released.feedback.recovering, true);
});

test("online replay exposes fractional conversion charge and useful blocked-event text", async () => {
  assert.ok(existsSync(path), "online replay feedback adapter must exist");
  const { onlineReplayState, onlineEventText } = await import(path.href);
  const p = (type, id, x, y) => C.makeItem(type, id, x, y);
  const battle = new E.Battle(
    [p("ad_popup", "popup", 24, 24), p("ab_mail", "mail", 24, 120)],
    [p("gov_pdf", "pdf", 24, 24), p("go_cache", "cache", 24, 80)],
    { playerHp: 10000, enemyHp: 10000 },
  );
  const popup = battle.player.parts.find((p) => p.id === "popup");
  popup.charge = 4.5;
  battle._activate(battle.player, battle.enemy, popup);
  assert.equal(
    onlineReplayState(battle).find((s) => s.id === "popup").feedback.chargeText,
    "1.5",
  );
  const cache = onlineReplayState(battle).find((s) => s.id === "cache");
  assert.match(cache.feedback.stateText, /8.0秒/);
  const blocked = battle.events.find(
    (e) => e.kind === "control" && e.action === "blocked",
  );
  assert.match(onlineEventText(blocked, battle), /防/);
});

async function serverMatch() {
  const { ArenaService } = await import("../server/arena/service.js");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "arena-replay-proof-")),
    service = new ArenaService({ filePath: join(dir, "store.json") });
  try {
    const players = [service.openSession(), service.openSession()];
    let i = 0;
    const command = (p, kind, extra = {}) =>
      service.command(p.token, {
        commandId: `proof${++i}`,
        expectedRevision: service.view(p.token).revision,
        kind,
        ...extra,
      });
    for (const p of players) {
      const type = p.view.run.shop.find(
        (s) => s.type === "ab_link" || s.type === "ab_nav",
      ).type;
      command(p, "purchase", { type });
      const item = service.view(p.token).run.owned[0];
      command(p, "placement", {
        items: [{ id: item.id, x: 32, y: 32, w: item.w, h: item.h }],
      });
      command(p, "publish");
    }
    return command(players[1], "match").match;
  } finally {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("online replay verifies the actual server catalogue and fixed-tick event digest before showing combat", async () => {
  const replay = await import(path.href);
  assert.equal(
    typeof replay.verifyOnlineReplay,
    "function",
    "replay must verify more than a version label",
  );
  const match = await serverMatch();
  assert.deepEqual(await replay.verifyOnlineReplay(match), { ok: true });
  assert.equal(
    (await replay.verifyOnlineReplay({ ...match, catalogHash: "0".repeat(64) }))
      .code,
    "CATALOG_MISMATCH",
  );
  assert.equal(
    (await replay.verifyOnlineReplay({ ...match, replayHash: "0".repeat(64) }))
      .code,
    "REPLAY_MISMATCH",
  );
  assert.equal(
    (
      await replay.verifyOnlineReplay({
        ...match,
        combatVersion: "older-rules",
      })
    ).code,
    "RULES_MISMATCH",
  );
});

test("replay compatibility excludes cosmetic text but detects a changed gameplay catalogue", async () => {
  const { verifyOnlineReplay } = await import(path.href);
  const { arenaCatalogDefinition, fingerprintJson } =
    await import("../src/online/catalog.js");
  const match = await serverMatch(),
    definition = arenaCatalogDefinition();
  for (const part of Object.values(definition.parts)) {
    assert.ok(!Object.hasOwn(part, "name"));
    assert.ok(!Object.hasOwn(part, "desc"));
    assert.ok(!Object.hasOwn(part, "appearanceId"));
    assert.ok(!Object.hasOwn(part, "provenanceId"));
  }
  for (const plan of Object.values(definition.plans))
    assert.deepEqual(Object.keys(plan).sort(), ["cap", "price"]);
  assert.deepEqual(await verifyOnlineReplay(match), { ok: true });
  const changed = structuredClone(definition);
  changed.parts.ab_link.value++;
  assert.equal(
    (
      await verifyOnlineReplay({
        ...match,
        catalogHash: await fingerprintJson(changed),
      })
    ).code,
    "CATALOG_MISMATCH",
  );
});

test("replay target tags participate in the gameplay catalogue fingerprint", async () => {
  const { arenaCatalogDefinition, fingerprintJson } =
    await import("../src/online/catalog.js");
  const D = (await import("../src/data.js")).default;
  const definition = arenaCatalogDefinition();
  assert.ok(D.PARTS.nc_comment.replayTags.length > 0);
  assert.deepEqual(
    definition.parts.nc_comment.replayTags,
    [...D.PARTS.nc_comment.replayTags].sort(),
    "target filtering changes combat and must not be treated as cosmetic",
  );
  const changed = structuredClone(definition);
  changed.parts.nc_comment.replayTags = ["heading"];
  assert.notEqual(
    await fingerprintJson(changed),
    await fingerprintJson(definition),
  );
  assert.deepEqual(D.PARTS.nc_comment.replayTags, ["video"]);
  assert.ok(Object.isFrozen(D.PARTS.nc_comment.replayTags));
});
