import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createArenaServer } from "../server/arena/http.js";
import { createOnlineClient } from "../src/online/client.js";
import D from "../src/data.js";

// Real loopback HTTP on both sides of a controllable proxy. Only response loss
// and temporary proxy rejections are injected; purchases use the durable arena.
async function recoveryFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "arena-retry-http-"));
  const filePath = join(dir, "store.json");
  let arena = createArenaServer({ filePath });
  await new Promise((resolve) => arena.listen(0, "127.0.0.1", resolve));
  let upstream = `http://127.0.0.1:${arena.address().port}`;
  const faults = [],
    commands = [];
  const proxy = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? Buffer.concat(chunks).toString() : undefined;
      const command = req.url.endsWith("/command");
      if (command) commands.push(JSON.parse(body));
      const fault = command ? faults.shift() : null;
      let response;
      if (!fault || fault.afterCommit) {
        response = await fetch(upstream + req.url, {
          method: req.method,
          headers: {
            ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
            ...(body ? { "content-type": "application/json" } : {}),
          },
          body,
        });
      }
      const cookie = response?.headers.get("set-cookie");
      if (cookie) res.setHeader("set-cookie", cookie);
      res.setHeader("content-type", "application/json");
      if (fault) {
        if (response) await response.arrayBuffer();
        res.writeHead(fault.status);
        res.end(
          JSON.stringify({
            code: `PROXY_${fault.status}`,
            message: "Temporary proxy failure",
          }),
        );
      } else {
        res.writeHead(response.status);
        res.end(Buffer.from(await response.arrayBuffer()));
      }
    } catch (error) {
      res.writeHead(500);
      res.end(
        JSON.stringify({ code: "HARNESS_FAILURE", message: error.message }),
      );
    }
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  let cookie = "";
  const client = createOnlineClient(
    `http://127.0.0.1:${proxy.address().port}/api/arena`,
    {
      fetch: async (url, init) => {
        const response = await fetch(url, {
          ...init,
          headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
        });
        const next = response.headers.get("set-cookie");
        if (next) cookie = next.split(";")[0];
        return response;
      },
    },
  );
  t.after(async () => {
    client.dispose();
    await new Promise((resolve) => proxy.close(resolve));
    await new Promise((resolve) => arena.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  const initial = await client.connect();
  const type = initial.run.shop.find((stock) =>
    ["ab_link", "ab_nav"].includes(stock.type),
  ).type;
  return {
    client,
    faults,
    commands,
    initial,
    type,
    async exhaustRequestBudget() {
      let response;
      for (let i = 0; i < 600; i++)
        response = await fetch(upstream + "/api/arena/health");
      assert.equal(
        response.status,
        429,
        "exercise the actual arena rate limiter",
      );
    },
    async restartArena() {
      await new Promise((resolve) => arena.close(resolve));
      arena = createArenaServer({ filePath });
      await new Promise((resolve) => arena.listen(0, "127.0.0.1", resolve));
      upstream = `http://127.0.0.1:${arena.address().port}`;
    },
  };
}

for (const status of [408, 429]) {
  test(`HTTP ${status} on the initial command preserves purchase intent for explicit retry`, async (t) => {
    const { client, faults, commands, initial, type } =
      await recoveryFixture(t);
    faults.push({ status });
    await assert.rejects(
      client.command({ kind: "purchase", type }),
      (error) => error.status === status,
    );
    assert.equal(
      commands.length,
      1,
      "temporary HTTP rejection must not trigger an automatic retry loop",
    );
    await assert.rejects(
      client.command({ kind: "reroll" }),
      (error) => error.code === "UNCERTAIN_COMMAND",
    );
    const recovered = await client.retry();
    assert.equal(recovered.run.owned.length, 1);
    assert.equal(recovered.run.cash, initial.run.cash - D.PARTS[type].price);
    assert.equal(recovered.revision, 1);
    assert.deepEqual(
      commands[1],
      commands[0],
      "retry must preserve command ID and expected revision",
    );
  });

  for (const afterCommit of [false, true]) {
    test(`HTTP ${status} during recovery retains a purchase lost ${afterCommit ? "after" : "before"} commit`, async (t) => {
      const { client, faults, commands, initial, type } =
        await recoveryFixture(t);
      faults.push({ status: 503, afterCommit }, { status });
      await assert.rejects(
        client.command({ kind: "purchase", type }),
        (error) => error.status === 503,
      );
      assert.equal(
        (await client.refresh()).run.owned.length,
        afterCommit ? 1 : 0,
      );
      await assert.rejects(client.retry(), (error) => error.status === status);
      assert.equal(
        commands.length,
        2,
        "retry must stop on temporary HTTP failure and wait for the player",
      );
      await assert.rejects(
        client.command({ kind: "reroll" }),
        (error) => error.code === "UNCERTAIN_COMMAND",
      );
      const recovered = await client.retry();
      assert.equal(recovered.run.owned.length, 1);
      assert.equal(recovered.run.cash, initial.run.cash - D.PARTS[type].price);
      assert.equal(recovered.revision, 1);
      assert.equal(
        recovered.outcome.code,
        "OK",
        "recovery must resolve the original command receipt",
      );
      assert.equal(commands.length, 3);
      assert.deepEqual(commands, [commands[0], commands[0], commands[0]]);
      assert.equal((await client.retry()).run.owned.length, 1);
      assert.equal(
        commands.length,
        3,
        "completed recovery must not replay an already resolved intent",
      );
    });
  }
}

test("real arena rate limiting and service restart preserve the uncertain command", async (t) => {
  const {
    client,
    faults,
    commands,
    initial,
    type,
    exhaustRequestBudget,
    restartArena,
  } = await recoveryFixture(t);
  faults.push({ status: 503 });
  await assert.rejects(
    client.command({ kind: "purchase", type }),
    (error) => error.status === 503,
  );
  await exhaustRequestBudget();
  await assert.rejects(
    client.retry(),
    (error) => error.status === 429 && error.code === "RATE_LIMITED",
  );
  await restartArena();
  const recovered = await client.retry();
  assert.equal(recovered.run.owned.length, 1);
  assert.equal(recovered.run.cash, initial.run.cash - D.PARTS[type].price);
  assert.equal(recovered.revision, 1);
  assert.equal(commands.length, 3);
  assert.deepEqual(commands, [commands[0], commands[0], commands[0]]);
});

for (const [status, rejected] of [
  [400, { kind: "purchase", type: "not-a-part" }],
  [409, { kind: "new-run" }],
]) {
  test(`definitive arena ${status} rejection releases the command instead of replaying it`, async (t) => {
    const { client, commands, type } = await recoveryFixture(t);
    await assert.rejects(
      client.command(rejected),
      (error) => error.status === status,
    );
    assert.equal((await client.retry()).revision, 0);
    assert.equal(
      commands.length,
      1,
      "reconnect must only read after a final rejection",
    );
    assert.equal(
      (await client.command({ kind: "purchase", type })).run.owned.length,
      1,
    );
    assert.notEqual(commands[1].commandId, commands[0].commandId);
  });

  test(`definitive ${status} rejection after uncertain transport also releases the command`, async (t) => {
    const { client, faults, commands, type } = await recoveryFixture(t);
    faults.push({ status: 503 });
    await assert.rejects(
      client.command(rejected),
      (error) => error.status === 503,
    );
    await assert.rejects(client.retry(), (error) => error.status === status);
    assert.equal((await client.retry()).revision, 0);
    assert.equal(commands.length, 2);
    assert.deepEqual(commands[0], commands[1]);
    assert.equal(
      (await client.command({ kind: "purchase", type })).run.owned.length,
      1,
    );
    assert.notEqual(commands[2].commandId, commands[0].commandId);
  });
}
