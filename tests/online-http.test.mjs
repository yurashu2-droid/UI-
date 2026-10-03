import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const entry = new URL("../server/arena/http.ts", import.meta.url);
test("two HTTP cookie sessions persist an offline ghost and resume one match after server restart", async () => {
  assert.ok(existsSync(entry), "HTTP arena transport must exist");
  const { createArenaServer } = await import(entry.href);
  const dir = mkdtempSync(join(tmpdir(), "ui-raid-http-"));
  let server = createArenaServer({ filePath: join(dir, "arena.json") });
  const listen = async () => {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${server.address().port}/api/arena`;
  };
  let base = await listen();
  const clients = [
    { cookie: "", view: null },
    { cookie: "", view: null },
  ];
  let id = 0;
  async function request(client, path, body) {
    const res = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        ...(client.cookie ? { Cookie: client.cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const cookie = res.headers.get("set-cookie");
    if (cookie) client.cookie = cookie.split(";")[0];
    const json = await res.json();
    if (res.ok && json.run) client.view = json;
    return { res, json };
  }
  async function command(client, kind, extra = {}) {
    return request(client, "/command", {
      commandId: `http-${++id}`,
      expectedRevision: client.view.revision,
      kind,
      ...extra,
    });
  }
  try {
    for (const client of clients) {
      assert.equal((await request(client, "/session", {})).res.status, 200);
      const stock = client.view.run.shop.find((s) =>
        ["ab_heading", "ab_link", "ab_nav"].includes(s.type),
      );
      assert.ok(stock);
      assert.equal(
        (await command(client, "purchase", { type: stock.type })).res.status,
        200,
      );
      const p = client.view.run.owned[0];
      assert.equal(
        (
          await command(client, "placement", {
            items: [{ id: p.id, x: 32, y: 24, w: p.w, h: p.h }],
          })
        ).res.status,
        200,
      );
    }
    assert.notEqual(clients[0].cookie, clients[1].cookie);
    assert.equal(
      (await command(clients[0], "publish")).json.outcome.code,
      "PUBLISHED",
    );
    // A sends no further requests. Stop and reopen the actual HTTP service with the same durable file.
    await new Promise((resolve) => server.close(resolve));
    server = createArenaServer({ filePath: join(dir, "arena.json") });
    base = await listen();
    const start = await command(clients[1], "match");
    assert.equal(
      start.json.match.opponent.ownerRunId,
      clients[0].view.online.id,
    );
    const matchId = start.json.match.id;
    const settleBody = {
      commandId: "network-settlement",
      expectedRevision: clients[1].view.revision,
      kind: "settle",
      matchId,
    };
    const first = await request(clients[1], "/command", settleBody);
    const retried = await request(clients[1], "/command", settleBody);
    assert.equal(retried.json.run.cash, first.json.run.cash);
    assert.equal(retried.json.run.history.length, 1);
    assert.equal(
      (await request(clients[0], `/matches/${matchId}`)).res.status,
      404,
    );
    assert.equal((await request({ cookie: "" }, "/state")).res.status, 401);
    const hostile = await fetch(base + "/session", {
      method: "POST",
      headers: {
        Origin: "https://evil.invalid",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(hostile.status, 403);
    const invalid = await request(clients[1], "/command", {
      ...settleBody,
      kind: "reroll",
    });
    assert.equal(invalid.res.status, 409);
    assert.equal(invalid.json.code, "COMMAND_ID_REUSED");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
