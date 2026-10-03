import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArenaService } from "../server/arena/service.js";

test("economy commands reject undeclared fields and forged inventory without mutation", () => {
  const dir = mkdtempSync(join(tmpdir(), "arena-command-validation-")),
    service = new ArenaService({ filePath: join(dir, "store.json") });
  try {
    const session = service.openSession(),
      before = service.view(session.token),
      type = before.run.shop.find(
        (s) => s.type === "ab_link" || s.type === "ab_nav",
      ).type;
    const invalid = [
      { kind: "purchase", type, cash: 99999 },
      { kind: "purchase", type, owned: [] },
      { kind: "purchase", type, appearanceId: "private-capture" },
      { kind: "purchase", type, price: 0 },
      { kind: "reroll", seed: 1 },
      { kind: "publish", rating: 9999 },
      { kind: "match", opponentId: "chosen" },
      { kind: "new-run", lives: 999 },
      { kind: "inbox", items: [{ type }] },
      { kind: "fuse", a: 1, b: "p1" },
      { kind: "claim", matchId: "x", choice: { type } },
    ];
    invalid.forEach((payload, i) => {
      assert.throws(
        () =>
          service.command(session.token, {
            commandId: `bad${i}`,
            expectedRevision: before.revision,
            ...payload,
          }),
        /INVALID_COMMAND/,
        JSON.stringify(payload),
      );
      assert.deepEqual(service.view(session.token), before);
    });
  } finally {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("expired guest cookie is explicit and never silently replaces the saved run", async () => {
  const { readFileSync, writeFileSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "arena-expiry-")),
    filePath = join(dir, "store.json");
  let service = new ArenaService({ filePath });
  try {
    const session = service.openSession(),
      runId = session.view.online.id;
    service.close();
    const data = JSON.parse(readFileSync(filePath, "utf8"));
    for (const guest of Object.values(data.sessions)) guest.expiresAt = 0;
    writeFileSync(filePath, JSON.stringify(data));
    service = new ArenaService({ filePath });
    assert.throws(() => service.openSession(session.token), /SESSION_EXPIRED/);
    assert.throws(() => service.view(session.token), /SESSION_EXPIRED/);
    const saved = JSON.parse(readFileSync(filePath, "utf8"));
    assert.equal(Object.keys(saved.runs).length, 1);
    assert.ok(saved.runs[runId]);
    const replacement = service.openSession();
    assert.notEqual(replacement.view.online.id, runId);
    assert.equal(
      Object.keys(JSON.parse(readFileSync(filePath, "utf8")).runs).length,
      2,
    );
  } finally {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
