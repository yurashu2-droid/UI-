import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const moduleUrl = new URL("../scripts/dev-local.ts", import.meta.url).href;
const launcher = await import(moduleUrl).catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return null;
  throw error;
});
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixture = `
import { createServer, get } from 'node:http';
import { appendFileSync, writeFileSync } from 'node:fs';
const [name, port, arenaPort, directory, mode] = process.argv.slice(2);
const health = {ok: true, service: 'ui-raid-arena', publicDeployment: false};
writeFileSync(directory + '/' + name + '.pid', String(process.pid));
writeFileSync(directory + '/' + name + '.env', JSON.stringify({store: process.env.ARENA_STORE, secret: process.env.QA_LAUNCH_SECRET}));
const server = createServer((req, res) => {
  appendFileSync(directory + '/' + name + '.requests', JSON.stringify({method: req.method, url: req.url, headers: req.headers}) + '\\n');
  if (mode === 'stall-body') {
    res.writeHead(200, {'content-type': 'application/json'});
    res.write('{"ok":true,');
    return;
  }
  if (mode === 'redirect') {
    res.writeHead(302, {location: 'http://127.0.0.1:' + arenaPort + req.url});
    res.end();
    return;
  }
  if (name === 'vite' && mode === 'proxy') {
    const upstream = get('http://127.0.0.1:' + arenaPort + req.url, response => {
      res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    upstream.on('error', () => { res.writeHead(502); res.end(); });
    res.on('close', () => upstream.destroy());
    return;
  }
  if (mode === 'delayed-health') {
    setTimeout(() => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(health)); }, 350);
    return;
  }
  res.setHeader('content-type', 'application/json');
  const payload = mode === 'impostor' ? {ok:true, service:'different-service', publicDeployment:false, secret:process.env.QA_LAUNCH_SECRET} :
    mode === 'public' ? {...health, publicDeployment:true} :
    mode === 'incomplete' ? {ok:true, service:'ui-raid-arena'} : health;
  res.end(JSON.stringify(payload), () => { if (mode === 'exit-after-health') process.exit(7); });
});
server.listen(Number(port), '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  appendFileSync(directory + '/signals', name + ':' + signal + '\\n');
  if (mode === 'ignore-signals') return;
  server.close(() => process.exit(0));
});
`;

async function eventually(check, detail, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await pause(20);
  }
  assert.fail(typeof detail === "function" ? detail() : detail);
}
async function read(path) {
  return readFile(path, "utf8").catch(() => "");
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}
async function reserve() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server;
}
async function start(t, options = {}) {
  assert.ok(launcher, "the local development launcher must exist");
  const directory = await mkdtemp(join(tmpdir(), "qa-dev-local-"));
  const reservations = await Promise.all([reserve(), reserve()]);
  const ports = reservations.map((server) => server.address().port);
  await Promise.all(
    reservations.map(
      (server) => new Promise((resolve) => server.close(resolve)),
    ),
  );
  await writeFile(join(directory, "service.mjs"), fixture);
  const secret = "qa-only-sensitive-marker-not-to-log";
  const store = join(directory, "caller-selected-store.json");
  const config = {
    cwd: root,
    env: { ...process.env, ARENA_STORE: store, QA_LAUNCH_SECRET: secret },
    services: ["arena", "vite"].map((name, index) => ({
      name,
      port: ports[index],
      args: [
        join(directory, "service.mjs"),
        name,
        String(ports[index]),
        String(ports[0]),
        directory,
        options[name] ?? (name === "vite" ? "proxy" : "health"),
      ],
    })),
    startupTimeoutMs: options.startupTimeoutMs ?? 4000,
    shutdownGraceMs: options.shutdownGraceMs ?? 150,
  };
  const runner = join(directory, "runner.mjs");
  await writeFile(
    runner,
    `import {runLocalDev} from ${JSON.stringify(moduleUrl)};\nprocess.exitCode = await runLocalDev(${JSON.stringify(config)});\n`,
  );
  const child = spawn(process.execPath, ["--import", "tsx", runner], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (bytes) => {
    output += bytes;
  });
  child.stderr.on("data", (bytes) => {
    output += bytes;
  });
  const ended = once(child, "exit").then(([code, signal]) => ({
    code,
    signal,
  }));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await Promise.race([ended, pause(3000)]);
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await ended;
    }
    for (const name of ["arena", "vite"]) {
      const pid = Number(await read(join(directory, name + ".pid")));
      if (pid && alive(pid)) process.kill(pid, "SIGKILL");
    }
    await rm(directory, { recursive: true, force: true });
  });
  return {
    child,
    directory,
    ports,
    ended,
    secret,
    store,
    output: () => output,
    ready: () =>
      eventually(
        () => output.includes("UI RAID local ready:"),
        () => "Never ready: " + output,
      ),
    stopped: () =>
      eventually(
        () => child.exitCode !== null || child.signalCode !== null,
        () => "Launcher did not stop: " + output,
      ),
    async childrenStarted() {
      for (const name of ["arena", "vite"])
        await eventually(
          async () => Boolean(await read(join(directory, name + ".pid"))),
          name + " did not start",
        );
    },
    async assertNoLeaks() {
      for (const name of ["arena", "vite"]) {
        const pid = Number(await read(join(directory, name + ".pid")));
        if (pid)
          assert.equal(
            alive(pid),
            false,
            name + " child remained alive after launcher exit",
          );
      }
      for (const port of ports) {
        const server = createServer();
        server.listen(port, "127.0.0.1");
        await once(server, "listening");
        await new Promise((resolve) => server.close(resolve));
      }
    },
  };
}

// A launcher that accepts a healthy proxy without checking its owned arena would fail this control.
test("QA local launcher rejects a direct impostor even if the web endpoint returns valid arena health", async (t) => {
  const running = await start(t, {
    arena: "impostor",
    vite: "health",
    startupTimeoutMs: 1800,
  });
  await running.stopped();
  assert.equal((await running.ended).code, 1);
  assert.doesNotMatch(
    running.output(),
    /UI RAID local ready:|different-service|qa-only-sensitive-marker/,
  );
  await running.assertNoLeaks();
});

for (const mode of ["public", "incomplete", "redirect", "stall-body"]) {
  // Each fixture must fail closed instead of treating any 2xx/redirect/headers as readiness.
  test(`QA local launcher rejects ${mode} proxied health with bounded cleanup`, async (t) => {
    const running = await start(t, { vite: mode, startupTimeoutMs: 1800 });
    await running.stopped();
    assert.equal((await running.ended).code, 1);
    assert.doesNotMatch(running.output(), /UI RAID local ready:/);
    assert.match(running.output(), /timed out.*health/i);
    await running.assertNoLeaks();
  });
}

// Removing or prematurely disposing signal handlers would terminate the launcher before reaping the children.
test("QA local launcher retains ownership through repeated mixed signals during force cleanup", async (t) => {
  const running = await start(t, {
    arena: "ignore-signals",
    vite: "ignore-signals",
    shutdownGraceMs: 450,
  });
  await running.ready();
  running.child.kill("SIGTERM");
  await eventually(
    async () =>
      (await read(join(running.directory, "signals"))).includes(
        "arena:SIGTERM",
      ),
    "cleanup did not begin",
  );
  for (const signal of ["SIGINT", "SIGTERM", "SIGINT"]) {
    running.child.kill(signal);
    await pause(25);
  }
  await running.stopped();
  assert.deepEqual(await running.ended, { code: 143, signal: null });
  assert.equal(running.output().split("UI RAID local ready:").length - 1, 1);
  await running.assertNoLeaks();
});

// Shutdown must abort a hanging readiness response instead of waiting for startup timeout or printing ready.
test("QA local launcher cancels in-flight readiness on SIGINT without waiting for startup timeout", async (t) => {
  const running = await start(t, {
    vite: "stall-body",
    startupTimeoutMs: 20000,
  });
  await eventually(
    async () => Boolean(await read(join(running.directory, "vite.requests"))),
    "web health was not requested",
  );
  running.child.kill("SIGINT");
  await running.stopped();
  assert.deepEqual(await running.ended, { code: 130, signal: null });
  assert.doesNotMatch(running.output(), /UI RAID local ready:/);
  await running.assertNoLeaks();
});

// This verifies actual transport and child environment, rather than just a constructed configuration object.
test("QA local launcher health is read-only and credential-free while preserving the caller environment", async (t) => {
  const running = await start(t);
  await running.ready();
  running.child.kill("SIGTERM");
  await running.stopped();
  assert.deepEqual(await running.ended, { code: 143, signal: null });
  for (const name of ["arena", "vite"]) {
    const childEnv = JSON.parse(
      await read(join(running.directory, name + ".env")),
    );
    assert.deepEqual(childEnv, {
      store: running.store,
      secret: running.secret,
    });
    const requests = (await read(join(running.directory, name + ".requests")))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.ok(requests.length, name + " was never health-checked");
    for (const request of requests) {
      assert.equal(request.method, "GET");
      assert.equal(request.url, "/api/arena/health");
      assert.equal(request.headers.cookie, undefined);
      assert.equal(request.headers.authorization, undefined);
    }
  }
  assert.equal(running.output().includes(running.secret), false);
  assert.equal(running.output().includes(running.store), false);
  await running.assertNoLeaks();
});

// An already-returned direct probe must not override the owned child's exit while the web probe is pending.
test("QA local launcher does not announce readiness after its arena exits during the pending proxy probe", async (t) => {
  const running = await start(t, {
    arena: "exit-after-health",
    vite: "delayed-health",
  });
  await running.stopped();
  assert.equal((await running.ended).code, 1);
  assert.match(running.output(), /arena.*exited.*7/);
  assert.doesNotMatch(running.output(), /UI RAID local ready:/);
  await running.assertNoLeaks();
});
