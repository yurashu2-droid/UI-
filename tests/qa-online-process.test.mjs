import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import D from "../src/data.js";

function start(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", new URL("./qa-arena-child.mjs", import.meta.url).pathname], {
      env: { ...process.env, QA_ARENA_STORE: filePath }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "", ready = false;
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("QA server startup timed out: " + output)); }, 8000);
    child.stderr.on("data", bytes => { output += bytes; });
    child.stdout.on("data", bytes => {
      output += bytes;
      const match = output.match(/QA_READY:(\d+)/);
      if (match && !ready) { ready = true; clearTimeout(timeout); resolve({ child, base: `http://127.0.0.1:${match[1]}/api/arena` }); }
    });
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.once("exit", code => { clearTimeout(timeout); if (!ready) reject(new Error(`QA server exited ${code}: ${output}`)); });
  });
}
async function stop(server, signal = "SIGTERM") {
  if (!server || server.child.exitCode !== null || server.child.signalCode !== null) return;
  const ended = once(server.child, "exit"); server.child.kill(signal); await ended;
}
async function request(server, client, path, body) {
  const response = await fetch(server.base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(client.cookie ? { Cookie: client.cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) client.cookie = setCookie.split(";")[0];
  const value = await response.json();
  if (response.ok && value.run) client.view = value;
  return { status: response.status, value, setCookie };
}
let sequence = 0;
async function command(server, client, kind, extra = {}) {
  return request(server, client, "/command", { commandId: `qa-${++sequence}`, expectedRevision: client.view.revision, kind, ...extra });
}
async function prepare(server, client) {
  assert.equal((await request(server, client, "/session", {})).status, 200);
  const stock = client.view.run.shop.find(s => D.PARTS[s.type]?.kind === "attack" && D.PARTS[s.type].price <= client.view.run.cash);
  assert.ok(stock);
  assert.equal((await command(server, client, "purchase", { type: stock.type })).status, 200);
  const item = client.view.run.owned[0];
  assert.equal((await command(server, client, "placement", { items: [{ id: item.id, x: 32, y: 24, w: item.w, h: item.h }] })).status, 200);
}

test("QA: two independent HTTP clients preserve one ticket across real server processes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qa-arena-http-")), filePath = join(dir, "store.json");
  let server;
  try {
    server = await start(filePath);
    const a = { cookie: "", view: null }, b = { cookie: "", view: null };
    await prepare(server, a); await prepare(server, b);
    assert.notEqual(a.cookie, b.cookie);
    const before = structuredClone(a.view.run);
    const empty = await command(server, a, "match");
    assert.equal(empty.value.outcome.code, "NO_OPPONENT");
    assert.deepEqual([a.view.run.cash, a.view.run.lives, a.view.run.stage], [before.cash, before.lives, before.stage]);
    const snapshotId = a.view.online.publishedSnapshotId;
    // A is offline from this point: no further requests from its session.
    await stop(server); server = await start(filePath);
    const matched = await command(server, b, "match");
    assert.equal(matched.status, 200);
    assert.equal(b.view.match.opponent.id, snapshotId);
    const ticket = b.view.match.id, digest = b.view.match.replayHash;
    await stop(server); server = await start(filePath);
    assert.equal((await request(server, b, "/state")).status, 200);
    assert.equal(b.view.match.id, ticket);
    assert.equal((await command(server, b, "match")).value.match.replayHash, digest);
    const settlement = { commandId: "qa-fixed-settlement", expectedRevision: b.view.revision, kind: "settle", matchId: ticket };
    const first = await request(server, b, "/command", settlement);
    assert.equal(first.status, 200);
    const settled = structuredClone(first.value.run);
    await stop(server); server = await start(filePath);
    const retry = await request(server, b, "/command", settlement);
    assert.equal(retry.status, 200);
    assert.deepEqual(retry.value.run, settled);
    assert.equal(retry.value.run.history.length, 1);
    assert.equal(retry.value.match.id, ticket);
    assert.equal(retry.value.match.replayHash, digest);
  } finally { await stop(server); rmSync(dir, { recursive: true, force: true }); }
});

test("QA: killed arena process can recover its durable store without manual lock deletion", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qa-arena-crash-")), filePath = join(dir, "store.json");
  let server;
  try {
    server = await start(filePath);
    const client = { cookie: "", view: null };
    await prepare(server, client);
    const saved = structuredClone(client.view.run);
    await stop(server, "SIGKILL");
    server = await start(filePath);
    const recovered = await request(server, client, "/state");
    assert.equal(recovered.status, 200);
    assert.deepEqual(recovered.value.run, saved);
  } finally { await stop(server); rmSync(dir, { recursive: true, force: true }); }
});

test("QA: HTTP placement rejects self-routes without modifying the run", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qa-arena-invalid-")), filePath = join(dir, "store.json");
  let server;
  try {
    server = await start(filePath);
    const client = { cookie: "", view: null };
    await prepare(server, client);
    const saved = structuredClone(client.view.run), p = saved.owned[0];
    const invalid = await command(server, client, "placement", { items: [{ id:p.id, x:p.x, y:p.y, w:p.w, h:p.h, routeTo:p.id }] });
    assert.equal(invalid.status, 400);
    await request(server, client, "/state");
    assert.deepEqual(client.view.run, saved);
  } finally { await stop(server); rmSync(dir, { recursive: true, force: true }); }
});

test("QA: successful online activity renews the guest cookie alongside server session expiry", async () => {
  const dir=mkdtempSync(join(tmpdir(),"qa-arena-cookie-")),filePath=join(dir,"store.json");
  let server;
  try {
    server=await start(filePath);
    const client={cookie:"",view:null};
    await prepare(server,client);
    const identity=client.cookie;
    const published=await command(server,client,"publish");
    assert.equal(published.status,200);
    assert.ok(published.setCookie,"rolling server expiry needs a refreshed browser cookie");
    assert.equal(published.setCookie.split(";")[0],identity,"renew the existing guest instead of creating another identity");
    assert.match(published.setCookie,/HttpOnly/i);
    assert.match(published.setCookie,/SameSite=Strict/i);
    assert.match(published.setCookie,/Max-Age=\d+|Expires=/i);
  } finally {await stop(server);rmSync(dir,{recursive:true,force:true});}
});
