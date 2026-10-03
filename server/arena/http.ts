import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { ArenaError, ArenaService } from "./service.js";
import type { ArenaRules } from "../../src/online/types.js";

const COOKIE = "ui_raid_guest";
function cookie(req: IncomingMessage) {
  return (
    (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(COOKIE + "="))
      ?.slice(COOKIE.length + 1) || ""
  );
}
function setSessionCookie(
  res: ServerResponse,
  token: string,
  expiresAt: number,
) {
  // The service persists renewal before the browser receives its new lifetime.
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; Path=/api/arena; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`,
  );
}
function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
async function json(req: IncomingMessage) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new ArenaError("JSON_REQUIRED", 415);
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 65536) throw new ArenaError("PAYLOAD_TOO_LARGE", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ArenaError("INVALID_JSON");
  }
}
/** Loopback development transport. Public hosting/authentication remains a separate deployment decision. */
export function createArenaServer(options: {
  filePath: string;
  rules?: Partial<ArenaRules>;
  allowedOrigins?: string[];
}) {
  const service = new ArenaService(options);
  const origins = new Set(
    options.allowedOrigins || [
      "http://127.0.0.1:5178",
      "http://localhost:5178",
      "http://127.0.0.1:4173",
      "http://localhost:4173",
      "http://127.0.0.1:5180",
      "http://localhost:5180",
    ],
  );
  const buckets = new Map<string, { since: number; count: number }>();
  const server = createServer(async (req, res) => {
    try {
      const origin = req.headers.origin;
      if (origin && !origins.has(origin))
        throw new ArenaError("ORIGIN_REJECTED", 403);
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw new ArenaError("ORIGIN_REJECTED", 403);
      const key = req.socket.remoteAddress || "local",
        now = Date.now(),
        bucket = buckets.get(key);
      if (!bucket || now - bucket.since > 60000)
        buckets.set(key, { since: now, count: 1 });
      else if (++bucket.count > 600)
        throw new ArenaError(
          "RATE_LIMITED",
          429,
          "しばらく待ってから再試行してください。",
        );
      const path = new URL(req.url || "/", "http://localhost").pathname;
      if (path === "/api/arena/health" && req.method === "GET")
        return send(res, 200, {
          ok: true,
          service: "ui-raid-arena",
          publicDeployment: false,
        });
      const token = cookie(req);
      if (path === "/api/arena/session" && req.method === "POST") {
        const body = await json(req);
        if (
          !body ||
          typeof body !== "object" ||
          Array.isArray(body) ||
          Object.keys(body).some((key) => key !== "newGuest") ||
          ("newGuest" in body && body.newGuest !== true)
        )
          throw new ArenaError("INVALID_COMMAND");
        const session = service.openSession(
          body.newGuest === true ? undefined : token || undefined,
        );
        setSessionCookie(
          res,
          session.token,
          service.sessionExpiresAt(session.token),
        );
        return send(res, 200, session.view);
      }
      if (path === "/api/arena/state" && req.method === "GET")
        return send(res, 200, service.view(token));
      if (path === "/api/arena/command" && req.method === "POST") {
        const view = service.command(token, await json(req));
        setSessionCookie(res, token, service.sessionExpiresAt(token));
        return send(res, 200, view);
      }
      const match = path.match(/^\/api\/arena\/matches\/([a-zA-Z0-9-]+)$/);
      if (match && req.method === "GET")
        return send(res, 200, service.getMatch(token, match[1]));
      throw new ArenaError("NOT_FOUND", 404);
    } catch (error) {
      if (error instanceof ArenaError)
        return send(res, error.status, {
          code: error.code,
          message: error.detail,
        });
      // Do not expose file paths, guest tokens or internal stacks to clients.
      console.error(
        "[arena] request failed",
        error instanceof Error ? error.name : "UnknownError",
      );
      return send(res, 500, {
        code: "SERVER_ERROR",
        message:
          "サーバーで保存できませんでした。再試行して状態を確認してください。",
      });
    }
  });
  server.on("close", () => service.close());
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}
