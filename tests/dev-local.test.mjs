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
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
const [kind, port, arenaPort, directory, mode] = process.argv.slice(2);
writeFileSync(directory + '/' + kind + '.pid', String(process.pid));
if (mode === 'exit') process.exit(7);
const server = createServer((req, res) => {
  if (mode === 'hang') return;
  if (kind === 'vite' && mode !== 'wrong') {
    const upstream = get('http://127.0.0.1:' + arenaPort + req.url, response => {
      res.writeHead(response.statusCode); response.pipe(res);
    });
    upstream.on('error', () => { res.writeHead(502); res.end(); });
    req.on('close', () => upstream.destroy());
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(mode === 'wrong' ? { ok: true, service: 'another-service' } :
    { ok: true, service: 'ui-raid-arena', publicDeployment: false }));
});
server.listen(Number(port), '127.0.0.1');
const poll = setInterval(() => {
  if (existsSync(directory + '/' + kind + '.exit')) process.exit(7);
}, 20);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  appendFileSync(directory + '/signals', kind + ':' + signal + '\\n');
  if (mode === 'ignore-signals') return;
  clearInterval(poll);
  server.close(() => process.exit(0));
});
`;

async function listeningServer() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server;
}
async function close(server) {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
}
async function eventually(check, detail, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await pause(20);
  }
  assert.fail(detail());
}
async function fileExists(path) {
  return readFile(path, "utf8").then(
    () => true,
    () => false,
  );
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

async function startFixture(t, options = {}) {
  assert.ok(launcher, "the local development launcher must exist");
  const directory = await mkdtemp(join(tmpdir(), "ui-raid-dev-local-"));
  const reservations = await Promise.all([
    listeningServer(),
    listeningServer(),
  ]);
  const ports = reservations.map((server) => server.address().port);
  const occupied =
    options.occupied === undefined ? null : reservations[options.occupied];
  await Promise.all(
    reservations.filter((server) => server !== occupied).map(close),
  );
  await writeFile(join(directory, "service.mjs"), fixture);
  const config = {
    cwd: options.badCwd ? join(directory, "missing") : root,
    services: ["arena", "vite"].map((name, index) => ({
      name,
      port: ports[index],
      args: [
        join(directory, "service.mjs"),
        name,
        String(ports[index]),
        String(ports[0]),
        directory,
        options[name] || "normal",
      ],
    })),
    startupTimeoutMs: options.startupTimeoutMs ?? 2000,
    shutdownGraceMs: options.shutdownGraceMs ?? 150,
  };
  const runner = join(directory, "run.mjs");
  await writeFile(
    runner,
    `import { runLocalDev } from ${JSON.stringify(moduleUrl)};\nprocess.exitCode = await runLocalDev(${JSON.stringify(config)});\n`,
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
      await Promise.race([ended, pause(4000)]);
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await ended;
    }
    // Fixture PIDs belong to this test only; don't leave them behind on assertion failure.
    for (const name of ["arena", "vite"]) {
      const pid = Number(
        await readFile(join(directory, name + ".pid"), "utf8").catch(() => 0),
      );
      if (pid && alive(pid)) process.kill(pid, "SIGKILL");
    }
    if (occupied) await close(occupied);
    await rm(directory, { recursive: true, force: true });
  });
  return {
    child,
    directory,
    ports,
    occupied,
    ended,
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
    async assertChildrenStopped() {
      for (const name of ["arena", "vite"]) {
        const pid = Number(
          await readFile(join(directory, name + ".pid"), "utf8").catch(() => 0),
        );
        if (pid) assert.equal(alive(pid), false, name + " child still running");
      }
      for (let index = 0; index < ports.length; index++) {
        if (index === options.occupied) continue;
        const server = createServer();
        server.listen(ports[index], "127.0.0.1");
        await once(server, "listening");
        await close(server);
      }
    },
  };
}

test("local development defaults preserve loopback, existing entrypoints, and the caller's store", () => {
  assert.ok(launcher, "the local development launcher must exist");
  const env = {
    ARENA_STORE: "/tmp/explicit-store.json",
    SENTINEL_SECRET: "not-to-log",
  };
  const config = launcher.createLocalDevConfig(env);
  assert.equal(config.env, env);
  assert.equal(config.cwd, root.replace(/\/$/, ""));
  assert.deepEqual(
    config.services.map(({ name, port }) => ({ name, port })),
    [
      { name: "arena", port: 5180 },
      { name: "vite", port: 5178 },
    ],
  );
  assert.deepEqual(config.services[0].args, [
    "--import",
    "tsx",
    "server/arena/main.ts",
  ]);
  assert.ok(config.services[1].args[0].endsWith("vite/bin/vite.js"));
  assert.deepEqual(config.services[1].args.slice(1), [
    "--host",
    "127.0.0.1",
    "--port",
    "5178",
    "--strictPort",
  ]);
  assert.throws(
    () => launcher.createLocalDevConfig({ ARENA_PORT: "5181" }),
    /ARENA_PORT.*5180.*proxy/,
  );
  assert.throws(
    () => launcher.createLocalDevConfig({ ARENA_PORT: "secret-value" }),
    (error) => !error.message.includes("secret-value"),
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  test(`local launcher verifies health and forwards ${signal} to both children`, async (t) => {
    const running = await startFixture(t);
    await running.ready();
    assert.match(running.output(), /127\.0\.0\.1/);
    running.child.kill(signal);
    await running.stopped();
    assert.deepEqual(await running.ended, {
      code: signal === "SIGINT" ? 130 : 143,
      signal: null,
    });
    const signals = await readFile(join(running.directory, "signals"), "utf8");
    for (const name of ["arena", "vite"])
      assert.ok(signals.includes(`${name}:${signal}`));
    await running.assertChildrenStopped();
  });
}

for (const occupied of [0, 1]) {
  test(`local launcher leaves existing ${occupied === 0 ? "arena" : "web"} port owner untouched`, async (t) => {
    const running = await startFixture(t, { occupied });
    await running.stopped();
    assert.equal((await running.ended).code, 1);
    assert.match(running.output(), /already in use.*existing process/i);
    assert.equal(running.occupied.listening, true);
    assert.equal(await fileExists(join(running.directory, "arena.pid")), false);
    assert.equal(await fileExists(join(running.directory, "vite.pid")), false);
    assert.doesNotMatch(running.output(), /UI RAID local ready:/);
    await running.assertChildrenStopped();
  });
}

for (const name of ["arena", "vite"]) {
  test(`local launcher shuts down its peer if ${name} exits after readiness`, async (t) => {
    const running = await startFixture(t);
    await running.ready();
    await writeFile(join(running.directory, name + ".exit"), "exit");
    await running.stopped();
    assert.equal((await running.ended).code, 1);
    assert.match(running.output(), new RegExp(name + ".*exited.*7"));
    await running.assertChildrenStopped();
  });
}

test("local launcher fails without announcing ready when a child exits during startup", async (t) => {
  const running = await startFixture(t, { arena: "exit" });
  await running.stopped();
  assert.equal((await running.ended).code, 1);
  assert.doesNotMatch(running.output(), /UI RAID local ready:/);
  await running.assertChildrenStopped();
});

for (const mode of ["wrong", "hang"]) {
  test(`local launcher bounds ${mode} proxy health checks and cleans up`, async (t) => {
    const running = await startFixture(t, {
      vite: mode,
      startupTimeoutMs: 700,
    });
    await running.stopped();
    assert.equal((await running.ended).code, 1);
    assert.match(running.output(), /timed out.*health/i);
    assert.doesNotMatch(
      running.output(),
      /UI RAID local ready:|another-service/,
    );
    await running.assertChildrenStopped();
  });
}

test("local launcher escalates a stuck owned child after the shutdown grace", async (t) => {
  const running = await startFixture(t, { arena: "ignore-signals" });
  await running.ready();
  running.child.kill("SIGTERM");
  await running.stopped();
  assert.equal((await running.ended).code, 143);
  assert.match(running.output(), /arena.*did not stop.*forc/i);
  await running.assertChildrenStopped();
});

test("local launcher handles process spawn errors without hanging", async (t) => {
  const running = await startFixture(t, { badCwd: true });
  await running.stopped();
  assert.equal((await running.ended).code, 1);
  assert.match(running.output(), /could not start/i);
  assert.doesNotMatch(running.output(), /UI RAID local ready:/);
  await running.assertChildrenStopped();
});
