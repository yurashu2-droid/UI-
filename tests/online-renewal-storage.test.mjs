import test from "node:test";
import assert from "node:assert/strict";
import fs, { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArenaService } from "../server/arena/service.js";
import D from "../src/data.js";

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "arena-renewal-storage-"));
  const filePath = join(dir, "store.json");
  let service = new ArenaService({ filePath });
  let sequence = 0;
  const guests = [service.openSession(), service.openSession()];
  const request = (guest, kind, extra = {}) => ({
    commandId: `renewal-${++sequence}`,
    expectedRevision: service.view(guest.token).revision,
    kind,
    ...extra,
  });
  const command = (guest, kind, extra = {}) =>
    service.command(guest.token, request(guest, kind, extra));
  // Real purchases and matches supply archived gameplay to protect. No seeded
  // opponents, edited checkpoints, clock-dependent throughput thresholds or load.
  for (const guest of guests) {
    const stock = guest.view.run.shop.find(
      (entry) =>
        D.PARTS[entry.type]?.kind === "attack" &&
        D.PARTS[entry.type].price <= guest.view.run.cash,
    );
    assert.ok(stock);
    const part = command(guest, "purchase", { type: stock.type }).run.owned[0];
    command(guest, "placement", {
      items: [{ id: part.id, x: 32, y: 24, w: part.w, h: part.h }],
    });
    command(guest, "publish");
  }
  const receipt = request(guests[1], "match");
  const matched = service.command(guests[1].token, receipt);
  assert.equal(matched.outcome.code, "MATCH_READY");
  // A later publish will replace A's pool entry; B's assigned match must keep
  // its original immutable snapshot even when that publish cannot commit.
  const part = service.view(guests[0].token).run.owned[0];
  command(guests[0], "placement", {
    items: [{ id: part.id, x: 48, y: 24, w: part.w, h: part.h }],
  });
  t.after(() => {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    guests,
    receipt,
    matched,
    request,
    command,
    read: () => JSON.parse(readFileSync(filePath, "utf8")),
    get service() { return service; },
    restart() {
      service.close();
      service = new ArenaService({ filePath });
    },
  };
}

const persisted = (value) => JSON.parse(JSON.stringify(value));

function onlyExpiryChanged(before, after, owner) {
  assert.ok(after.sessions[owner].expiresAt > before.sessions[owner].expiresAt);
  after.sessions[owner].expiresAt = before.sessions[owner].expiresAt;
  assert.deepEqual(after, before);
}

for (const kind of ["resume", "retry"]) {
  test(`${kind} renews durably without deep-copying stored gameplay`, (t) => {
    const f = fixture(t);
    const guest = f.guests[1];
    const before = f.read();
    const owner = before.runs[guest.view.online.id].owner;
    const expected = f.service.view(guest.token);
    const otherGuest = f.service.view(f.guests[0].token);
    const now = Date.now();
    t.mock.method(Date, "now", () => now + 1000);
    const clone = structuredClone;
    let wholeStoreCopies = 0;
    t.mock.method(globalThis, "structuredClone", (value, ...options) => {
      if (value?.version === 1 && value?.sessions && value?.runs && value?.matches)
        wholeStoreCopies++;
      return clone(value, ...options);
    });
    const result = kind === "resume"
      ? f.service.openSession(guest.token).view
      : f.service.command(guest.token, f.receipt);
    assert.equal(result.revision, expected.revision);
    assert.deepEqual(result.run, expected.run);
    assert.deepEqual(result.match, expected.match);
    if (kind === "retry") assert.deepEqual(result.outcome, f.matched.outcome);
    onlyExpiryChanged(before, f.read(), owner);
    // Renewal changes one session. Reintroducing an archive-sized clone is the
    // regression under test; ordinary commands still require their deep clone.
    assert.equal(wholeStoreCopies, 0);
    result.run.cash = -1;
    result.match.player.items[0].x = 99999;
    result.match.events.length = 0;
    if (result.outcome) result.outcome.message = "caller mutation";
    assert.deepEqual(f.service.view(guest.token), expected, "returned views are detached");
    assert.deepEqual(f.service.view(f.guests[0].token), otherGuest);
    f.restart();
    assert.deepEqual(f.service.view(guest.token), persisted(expected));
    assert.equal(f.service.sessionExpiresAt(guest.token), now + 1000 + 86_400_000);
    assert.deepEqual(f.service.command(guest.token, f.receipt).outcome, f.matched.outcome);
  });
}

for (const kind of ["resume", "retry", "settle", "publish"]) {
  test(`failed ${kind} persistence preserves committed session and gameplay`, (t) => {
    const f = fixture(t);
    const guest = f.guests[1];
    const before = f.read();
    const views = f.guests.map((g) => f.service.view(g.token));
    const deadline = f.service.sessionExpiresAt(guest.token);
    const now = Date.now();
    t.mock.method(Date, "now", () => now + 1000);
    const failure = Object.assign(new Error("diagnostic rename failure"), { code: "EIO" });
    // Fail only the atomic replacement, after serialization/file sync. This
    // directly exercises isolation without adding a production persistence hook.
    const replacement = t.mock.method(fs, "renameSync", () => { throw failure; });
    syncBuiltinESMExports();
    const attempt = () => {
      if (kind === "resume") return f.service.openSession(guest.token);
      if (kind === "retry") return f.service.command(guest.token, f.receipt);
      if (kind === "settle") return f.command(guest, "settle", { matchId: f.matched.match.id });
      return f.command(f.guests[0], "publish");
    };
    try {
      assert.throws(attempt, (error) => error === failure);
      assert.equal(f.service.sessionExpiresAt(guest.token), deadline);
      assert.deepEqual(f.read(), before, "failed replacement leaves durable file unchanged");
      assert.deepEqual(f.guests.map((g) => f.service.view(g.token)), views);
      assert.deepEqual(f.service.getMatch(guest.token, f.matched.match.id), f.matched.match);
    } finally {
      replacement.mock.restore();
      syncBuiltinESMExports();
    }
    // Flush the untouched store through a different guest's successful renewal.
    // Any accidental shared run/match/snapshot mutation would now reach disk.
    f.service.openSession(f.guests[0].token);
    const owner = before.runs[f.guests[0].view.online.id].owner;
    onlyExpiryChanged(before, f.read(), owner);
    assert.equal(f.service.sessionExpiresAt(guest.token), deadline);
    f.restart();
    assert.deepEqual(f.guests.map((g) => f.service.view(g.token)), persisted(views));
    const recovered = f.service.command(guest.token, f.receipt);
    assert.equal(recovered.revision, views[1].revision);
    assert.deepEqual(recovered.match, persisted(f.matched.match));
  });
}
