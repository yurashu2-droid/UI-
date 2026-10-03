import { spawn, type ChildProcess } from "node:child_process";
import { get } from "node:http";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

interface LocalService {
  name: "arena" | "vite";
  port: number;
  args: string[];
}
interface LocalDevConfig {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  services: [LocalService, LocalService];
  startupTimeoutMs?: number;
  shutdownGraceMs?: number;
}
class LocalStartError extends Error {}
const host = "127.0.0.1";

/** Keep the existing standalone commands and the Vite proxy's fixed origin. */
export function createLocalDevConfig(
  env: NodeJS.ProcessEnv = process.env,
): LocalDevConfig {
  if (env.ARENA_PORT && Number(env.ARENA_PORT) !== 5180)
    throw new LocalStartError(
      "dev:local requires ARENA_PORT 5180 to match the Vite proxy. Unset ARENA_PORT, or use npm run arena and npm run dev separately with an explicitly matching vite.config.ts proxy.",
    );
  const require = createRequire(import.meta.url);
  return {
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
    env,
    services: [
      {
        name: "arena",
        port: 5180,
        args: ["--import", "tsx", "server/arena/main.ts"],
      },
      {
        name: "vite",
        port: 5178,
        args: [
          resolve(dirname(require.resolve("vite/package.json")), "bin/vite.js"),
          "--host",
          host,
          "--port",
          "5178",
          "--strictPort",
        ],
      },
    ],
    startupTimeoutMs: 15000,
    shutdownGraceMs: 3000,
  };
}

function requireFreePort(service: LocalService): Promise<void> {
  return new Promise((accept, reject) => {
    const probe = createServer();
    probe.once("error", (error: NodeJS.ErrnoException) => {
      reject(
        new LocalStartError(
          error.code === "EADDRINUSE"
            ? `${service.name}: ${host}:${service.port} is already in use. Stop the existing process yourself, or keep using your separately started services. No existing process was changed.`
            : `${service.name}: could not check ${host}:${service.port}. Check local port permissions; no services were started.`,
        ),
      );
    });
    probe.listen({ host, port: service.port, exclusive: true }, () => {
      probe.close((error) =>
        error
          ? reject(
              new LocalStartError("Could not release the local port check."),
            )
          : accept(),
      );
    });
  });
}

/** Health checks send no cookies and never print response bodies or environment values. */
function hasArenaHealth(port: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((accept) => {
    let settled = false;
    const finish = (healthy: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      accept(healthy);
    };
    const request = get(
      { hostname: host, port, path: "/api/arena/health", signal, agent: false },
      (response) => {
        if (response.statusCode !== 200) {
          finish(false);
          response.destroy();
          return;
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
          if (body.length > 4096) {
            finish(false);
            response.destroy();
          }
        });
        response.once("error", () => finish(false));
        response.once("end", () => {
          try {
            const value: unknown = JSON.parse(body);
            finish(
              typeof value === "object" &&
                value !== null &&
                "ok" in value &&
                value.ok === true &&
                "service" in value &&
                value.service === "ui-raid-arena" &&
                "publicDeployment" in value &&
                value.publicDeployment === false,
            );
          } catch {
            finish(false);
          }
        });
        response.once("close", () => finish(false));
      },
    );
    // An absolute deadline also bounds slow-drip responses, unlike a socket idle timeout.
    const deadline = setTimeout(() => {
      finish(false);
      request.destroy();
    }, 500);
    request.once("error", () => finish(false));
  });
}

function within(
  promise: Promise<void>,
  milliseconds: number,
): Promise<boolean> {
  return new Promise((accept) => {
    const timeout = setTimeout(() => accept(false), milliseconds);
    void promise.then(() => {
      clearTimeout(timeout);
      accept(true);
    });
  });
}

/** Supervise only the two directly spawned local children; never signal a port owner. */
export async function runLocalDev(
  config: LocalDevConfig = createLocalDevConfig(),
): Promise<number> {
  const children: {
    service: LocalService;
    child: ChildProcess;
    closed: Promise<void>;
  }[] = [];
  const controller = new AbortController();
  let stopping = false;
  let stopSignal: NodeJS.Signals = "SIGTERM";
  let finishResult!: (code: number) => void;
  const finished = new Promise<number>((accept) => {
    finishResult = accept;
  });
  const finish = (
    code: number,
    message?: string,
    signal: NodeJS.Signals = "SIGTERM",
  ) => {
    if (stopping) return;
    stopping = true;
    stopSignal = signal;
    if (message) console.error(`[dev:local] ${message}`);
    controller.abort();
    finishResult(code);
  };
  const interrupt = () => finish(130, undefined, "SIGINT");
  const terminate = () => finish(143, undefined, "SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  const isLive = (child: ChildProcess) =>
    child.pid !== undefined &&
    child.exitCode === null &&
    child.signalCode === null;
  const startup = setTimeout(
    () =>
      finish(
        1,
        "Startup timed out waiting for arena identity health directly and through Vite. Check the service errors above, vite.config.ts proxy, and arena store access. Stopping this launcher's children.",
      ),
    config.startupTimeoutMs ?? 15000,
  );
  try {
    // Check both ports before starting either service, including an unrelated healthy server.
    for (const service of config.services) {
      await requireFreePort(service);
      if (stopping) return await finished;
    }
    for (const service of config.services) {
      const child = spawn(process.execPath, service.args, {
        cwd: config.cwd,
        env: config.env ?? process.env,
        stdio: "inherit",
        shell: false,
      });
      const closed = new Promise<void>((accept) =>
        child.once("close", () => accept()),
      );
      children.push({ service, child, closed });
      child.once("error", () =>
        finish(
          1,
          `${service.name} could not start. Check Node.js, npm ci, and the project directory. Stopping this launcher's children.`,
        ),
      );
      child.once("exit", (code, signal) =>
        finish(
          1,
          `${service.name} exited unexpectedly (${signal ?? `code ${code}`}). Check its error output above. Stopping this launcher's children.`,
        ),
      );
    }
    while (!stopping) {
      const health = await Promise.all(
        config.services.map(({ port }) =>
          hasArenaHealth(port, controller.signal),
        ),
      );
      if (
        !stopping &&
        health.every(Boolean) &&
        children.every(({ child }) => isLive(child))
      ) {
        clearTimeout(startup);
        const web = config.services.find(({ name }) => name === "vite")!;
        console.log(
          `UI RAID local ready: http://${host}:${web.port}/ (arena health verified through Vite; local only). Ctrl+C stops both services.`,
        );
        break;
      }
      await delay(100, undefined, { signal: controller.signal }).catch(
        () => {},
      );
    }
    return await finished;
  } catch (error) {
    finish(
      1,
      error instanceof LocalStartError
        ? error.message
        : "Could not start local services. Check Node.js, npm ci, and the project directory.",
    );
    return await finished;
  } finally {
    clearTimeout(startup);
    controller.abort();
    for (const { child } of children) if (isLive(child)) child.kill(stopSignal);
    await Promise.all(
      children.map(async ({ child, closed, service }) => {
        if (await within(closed, config.shutdownGraceMs ?? 3000)) return;
        if (isLive(child)) {
          console.error(
            `[dev:local] ${service.name} did not stop within the grace period; forcing only this owned child to stop.`,
          );
          child.kill("SIGKILL");
        }
        await closed;
      }),
    );
    // Keep handlers until cleanup completes, even if Ctrl+C is pressed again.
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = await runLocalDev();
  } catch (error) {
    console.error(
      `[dev:local] ${error instanceof LocalStartError ? error.message : "Could not configure local development. Run npm ci and check the project directory."}`,
    );
    process.exitCode = 1;
  }
}
