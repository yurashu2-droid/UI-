import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createArenaServer } from "../server/arena/http.js";

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "arena-session-http-"));
  const filePath = join(dir, "store.json");
  let server, base, identity;
  const read = () => JSON.parse(readFileSync(filePath, "utf8"));
  const close = () => new Promise((resolve) => server.close(resolve));
  async function start() {
    server = createArenaServer({ filePath });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}/api/arena`;
  }
  async function request(path, body) {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(identity ? { Cookie: identity } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie && !identity) identity = setCookie.split(";")[0];
    return { status: response.status, body: await response.json(), setCookie };
  }
  async function setExpiry(expiresAt) {
    await close();
    const data = read();
    Object.values(data.sessions)[0].expiresAt = expiresAt;
    writeFileSync(filePath, JSON.stringify(data));
    await start();
  }
  t.after(async () => {
    await close();
    rmSync(dir, { recursive: true, force: true });
  });
  await start();
  const opened = await request("/session", {});
  assert.equal(opened.status, 200);
  return {
    request,
    read,
    setExpiry,
    opened,
    identity: () => identity,
    expiry: () => Object.values(read().sessions)[0].expiresAt,
  };
}

function maxAge(setCookie, identity) {
  assert.ok(setCookie, "successful renewal must reach the browser");
  assert.equal(setCookie.split(";")[0], identity);
  assert.match(setCookie, /; Path=\/api\/arena(?:;|$)/);
  assert.match(setCookie, /; HttpOnly(?:;|$)/);
  assert.match(setCookie, /; SameSite=Strict(?:;|$)/);
  assert.doesNotMatch(setCookie, /; Domain=/i);
  const match = setCookie.match(/; Max-Age=(\d+)(?:;|$)/);
  assert.ok(match, "cookie lifetime must be explicit");
  return Number(match[1]);
}

test("successful HTTP commands renew the same cookie to the committed server deadline", async (t) => {
  const f = await fixture(t);
  await f.setExpiry(Date.now() + 60_000);
  const before = Date.now();
  const result = await f.request("/command", {
    commandId: "renew-command",
    expectedRevision: 0,
    kind: "inbox",
  });
  assert.equal(result.status, 200);
  const lifetime = maxAge(result.setCookie, f.identity());
  assert.ok(f.expiry() >= before + 86_400_000);
  assert.ok(lifetime >= 86_395 && lifetime <= 86_400);
  assert.equal(result.body.online.id, f.opened.body.online.id);
});

test("session resume and duplicate commands renew both deadlines without replaying gameplay", async (t) => {
  const f = await fixture(t);
  const command = {
    commandId: "retry-command",
    expectedRevision: 0,
    kind: "inbox",
  };
  const first = await f.request("/command", command);
  assert.equal(first.status, 200);
  for (const [path, body] of [
    ["/session", {}],
    ["/command", command],
  ]) {
    await f.setExpiry(Date.now() + 60_000);
    const before = Date.now();
    const saved = f.read();
    const result = await f.request(path, body);
    assert.equal(result.status, 200);
    const lifetime = maxAge(result.setCookie, f.identity());
    assert.ok(
      lifetime >= 86_395 && lifetime <= 86_400,
      "late resume/retry responses must not overwrite a renewal with a short cookie",
    );
    assert.ok(f.expiry() >= before + 86_400_000);
    const current = f.read();
    for (const [key, session] of Object.entries(saved.sessions)) {
      assert.equal(current.sessions[key].runId, session.runId);
      assert.equal(current.sessions[key].rating, session.rating);
      current.sessions[key].expiresAt = session.expiresAt;
    }
    assert.deepEqual(
      current,
      saved,
      "only the authenticated session expiry changes",
    );
    assert.equal(result.body.revision, first.body.revision);
    assert.deepEqual(result.body.run, first.body.run);
  }
});

test("rejected and expired HTTP requests cannot renew or replace a guest", async (t) => {
  const f = await fixture(t);
  const command = {
    commandId: "invalid-command",
    expectedRevision: 0,
    kind: "inbox",
    cash: 1000,
  };
  const before = f.read();
  const viewed = await f.request("/state");
  assert.equal(viewed.status, 200);
  assert.equal(viewed.setCookie, null);
  assert.deepEqual(f.read(), before);
  const rejected = await f.request("/command", command);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.setCookie, null);
  assert.deepEqual(f.read(), before);
  await f.setExpiry(0);
  const expired = f.read();
  for (const [path, body] of [
    ["/session", {}],
    ["/command", { commandId: "expired", expectedRevision: 0, kind: "inbox" }],
  ]) {
    const result = await f.request(path, body);
    assert.equal(result.status, 401);
    assert.equal(result.body.code, "SESSION_EXPIRED");
    assert.equal(result.setCookie, null);
    assert.deepEqual(f.read(), expired);
  }
});
