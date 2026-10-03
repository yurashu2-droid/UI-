import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createArenaServer } from "../server/arena/http.js";
const clientPath = new URL("../src/online/client.ts", import.meta.url);
test("online client retries a lost committed response with the same command identity", async () => {
  assert.ok(existsSync(clientPath), "online client must exist");
  const { createOnlineClient } = await import(clientPath.href);
  const dir = mkdtempSync(join(tmpdir(), "raid-client-")),
    server = createArenaServer({ filePath: join(dir, "arena.json") });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let cookie = "",
    drop = false;
  const transport = async (url, init) => {
    const response = await fetch(url, {
      ...init,
      headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
    });
    const next = response.headers.get("set-cookie");
    if (next) cookie = next.split(";")[0];
    if (drop && String(url).endsWith("/command")) {
      drop = false;
      throw new TypeError("simulated lost response after server commit");
    }
    return response;
  };
  const client = createOnlineClient(
    `http://127.0.0.1:${server.address().port}/api/arena`,
    { fetch: transport },
  );
  try {
    const initial = await client.connect();
    const type = initial.run.shop.find((x) =>
      ["ab_link", "ab_heading", "ab_nav"].includes(x.type),
    ).type;
    drop = true;
    const bought = await client.command({ kind: "purchase", type });
    assert.equal(bought.run.owned.length, 1);
    assert.equal((await client.refresh()).run.owned.length, 1);
    assert.equal(bought.revision, 1);
  } finally {
    client.dispose();
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("delayed refresh cannot overwrite a newer committed revision", async () => {
  const { createOnlineClient } = await import(clientPath.href);
  const dir = mkdtempSync(join(tmpdir(), "arena-client-order-")),
    server = createArenaServer({ filePath: join(dir, "store.json") });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let cookie = "",
    release,
    seen;
  const delayed = new Promise((r) => {
      release = r;
    }),
    captured = new Promise((r) => {
      seen = r;
    });
  let hold = true;
  const transport = async (url, init) => {
    const res = await fetch(url, {
      ...init,
      headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
    });
    const next = res.headers.get("set-cookie");
    if (next) cookie = next.split(";")[0];
    if (String(url).endsWith("/state") && hold) {
      hold = false;
      seen();
      await delayed;
    }
    return res;
  };
  const client = createOnlineClient(
    `http://127.0.0.1:${server.address().port}/api/arena`,
    { fetch: transport },
  );
  try {
    const initial = await client.connect(),
      type = initial.run.shop.find(
        (s) => s.type === "ab_link" || s.type === "ab_nav",
      ).type;
    const stale = client.refresh();
    await captured;
    const latest = await client.command({ kind: "purchase", type });
    release();
    const refresh = await stale;
    assert.equal(client.current.revision, latest.revision);
    assert.equal(refresh.run.owned.length, 1);
  } finally {
    release();
    client.dispose();
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("transient HTTP failure preserves the command so explicit retry completes it once", async () => {
  const { createOnlineClient } = await import(clientPath.href);
  const dir = mkdtempSync(join(tmpdir(), "arena-client-503-")),
    server = createArenaServer({ filePath: join(dir, "store.json") });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let cookie = "",
    fail = false;
  const transport = async (url, init) => {
    if (fail && String(url).endsWith("/command")) {
      fail = false;
      return new Response(
        JSON.stringify({
          code: "UPSTREAM_UNAVAILABLE",
          message: "Temporary proxy failure",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    const res = await fetch(url, {
      ...init,
      headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
    });
    const next = res.headers.get("set-cookie");
    if (next) cookie = next.split(";")[0];
    return res;
  };
  const client = createOnlineClient(
    `http://127.0.0.1:${server.address().port}/api/arena`,
    { fetch: transport },
  );
  try {
    const initial = await client.connect(),
      type = initial.run.shop.find(
        (s) => s.type === "ab_link" || s.type === "ab_nav",
      ).type;
    fail = true;
    await assert.rejects(
      client.command({ kind: "purchase", type }),
      (e) => e.code === "UPSTREAM_UNAVAILABLE",
    );
    await assert.rejects(
      client.command({ kind: "reroll" }),
      (e) => e.code === "UNCERTAIN_COMMAND",
    );
    const recovered = await client.retry();
    assert.equal(recovered.run.owned.length, 1);
    assert.equal(recovered.revision, 1);
    assert.equal((await client.retry()).run.owned.length, 1);
  } finally {
    client.dispose();
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a command committed after a later-started refresh still advances the displayed revision", async () => {
  const { createOnlineClient } = await import(clientPath.href);
  const dir = mkdtempSync(join(tmpdir(), "arena-client-commit-order-")),
    server = createArenaServer({ filePath: join(dir, "store.json") });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let cookie = "",
    release,
    seen;
  const gate = new Promise((r) => {
      release = r;
    }),
    waiting = new Promise((r) => {
      seen = r;
    });
  const transport = async (url, init) => {
    if (String(url).endsWith("/command")) {
      seen();
      await gate;
    }
    const res = await fetch(url, {
      ...init,
      headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
    });
    const next = res.headers.get("set-cookie");
    if (next) cookie = next.split(";")[0];
    return res;
  };
  const client = createOnlineClient(
    `http://127.0.0.1:${server.address().port}/api/arena`,
    { fetch: transport },
  );
  try {
    const initial = await client.connect(),
      type = initial.run.shop.find(
        (s) => s.type === "ab_link" || s.type === "ab_nav",
      ).type;
    const purchase = client.command({ kind: "purchase", type });
    await waiting;
    assert.equal((await client.refresh()).revision, 0);
    release();
    const committed = await purchase;
    assert.equal(committed.revision, 1);
    assert.equal(client.current.run.owned.length, 1);
  } finally {
    release();
    client.dispose();
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("HTTP failure after server commit retries the exact command without duplicate purchase", async () => {
  const { createOnlineClient } = await import(clientPath.href);
  const dir = mkdtempSync(join(tmpdir(), "arena-client-after-commit-")),
    server = createArenaServer({ filePath: join(dir, "store.json") });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let cookie = "",
    fail = false;
  const ids = [];
  const transport = async (url, init) => {
    const command = String(url).endsWith("/command");
    if (command) ids.push(JSON.parse(init.body).commandId);
    const res = await fetch(url, {
      ...init,
      headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
    });
    const next = res.headers.get("set-cookie");
    if (next) cookie = next.split(";")[0];
    if (command && fail) {
      fail = false;
      await res.arrayBuffer();
      return new Response(
        JSON.stringify({
          code: "UPSTREAM_UNAVAILABLE",
          message: "Proxy lost committed response",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    return res;
  };
  const client = createOnlineClient(
    `http://127.0.0.1:${server.address().port}/api/arena`,
    { fetch: transport },
  );
  try {
    const initial = await client.connect(),
      type = initial.run.shop.find(
        (s) => s.type === "ab_link" || s.type === "ab_nav",
      ).type;
    fail = true;
    await assert.rejects(
      client.command({ kind: "purchase", type }),
      (e) => e.code === "UPSTREAM_UNAVAILABLE",
    );
    const recovered = await client.retry();
    assert.equal(recovered.run.owned.length, 1);
    assert.equal(recovered.revision, 1);
    assert.equal(ids.length, 2);
    assert.equal(ids[0], ids[1]);
    assert.equal((await client.refresh()).run.owned.length, 1);
  } finally {
    client.dispose();
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unresponsive connection times out instead of leaving the online screen busy forever", async () => {
  const { createServer } = await import("node:http");
  const { createOnlineClient } = await import(clientPath.href);
  const server = createServer(() => {});
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const client = createOnlineClient(
    `http://127.0.0.1:${server.address().port}/api/arena`,
    { timeoutMs: 40 },
  );
  let deadline;
  try {
    const result = await Promise.race([
      client.connect().then(
        () => ({ name: "unexpected-success" }),
        (e) => e,
      ),
      new Promise((resolve) => {
        deadline = setTimeout(() => resolve({ name: "harness-deadline" }), 400);
      }),
    ]);
    assert.equal(result.name, "TimeoutError");
  } finally {
    clearTimeout(deadline);
    client.dispose();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test("explicit new guest never carries an uncertain old-identity command into the fresh run", async () => {
  const { createOnlineClient } = await import(clientPath.href);
  const dir = mkdtempSync(join(tmpdir(), "arena-new-guest-pending-")),
    server = createArenaServer({ filePath: join(dir, "store.json") });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let cookie = "",
    fail = false;
  const transport = async (url, init) => {
    if (fail && String(url).endsWith("/command")) {
      fail = false;
      return new Response(
        JSON.stringify({
          code: "UPSTREAM_UNAVAILABLE",
          message: "Temporary proxy failure",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    const res = await fetch(url, {
      ...init,
      headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
    });
    const next = res.headers.get("set-cookie");
    if (next) cookie = next.split(";")[0];
    return res;
  };
  const client = createOnlineClient(
    `http://127.0.0.1:${server.address().port}/api/arena`,
    { fetch: transport },
  );
  try {
    const initial = await client.connect(),
      type = initial.run.shop.find(
        (s) => s.type === "ab_link" || s.type === "ab_nav",
      ).type;
    fail = true;
    await assert.rejects(client.command({ kind: "purchase", type }));
    const fresh = await client.newGuest();
    assert.notEqual(fresh.online.id, initial.online.id);
    assert.equal(fresh.run.owned.length, 0);
    const newType = fresh.run.shop.find(
      (s) => s.type === "ab_link" || s.type === "ab_nav",
    ).type;
    const bought = await client.command({ kind: "purchase", type: newType });
    assert.equal(bought.run.owned.length, 1);
    assert.equal(bought.revision, 1);
  } finally {
    client.dispose();
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
