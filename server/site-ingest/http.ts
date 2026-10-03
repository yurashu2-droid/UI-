import type { IncomingMessage, ServerResponse } from "node:http";
import { createStaticIngestService } from "./service.js";

/** Development middleware. No listener or public deployment is created here. */
export function createSiteIngestMiddleware(
  service = createStaticIngestService(),
) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> => {
    if (!req.url?.startsWith("/api/raid-captures")) {
      next();
      return;
    }
    const send = (status: number, value: unknown) => {
      if (res.writableEnded) return;
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.end(JSON.stringify(value));
    };
    if (req.url === "/api/raid-captures/capabilities" && req.method === "GET") {
      send(200, service.capabilities());
      return;
    }
    if (
      req.method !== "POST" ||
      ![
        "/api/raid-captures/probe",
        "/api/raid-captures",
        "/api/raid-captures/code",
      ].includes(req.url)
    ) {
      send(404, {
        ok: false,
        code: "not-found",
        error: "対応する取得操作がありません。",
      });
      return;
    }
    if (typeof req.headers.origin === "string") {
      try {
        const origin = new URL(req.headers.origin);
        if (
          origin.host !== req.headers.host ||
          !["http:", "https:"].includes(origin.protocol)
        )
          throw new Error();
      } catch {
        send(403, {
          ok: false,
          code: "origin-denied",
          error: "この画面から取得を開始してください。",
        });
        return;
      }
    }
    if (
      !/^application\/json(?:\s*;|$)/i.test(
        String(req.headers["content-type"] ?? ""),
      )
    ) {
      send(415, {
        ok: false,
        code: "invalid-request",
        error: "JSON形式で取得対象を指定してください。",
      });
      return;
    }
    if (Number(req.headers["content-length"] ?? 0) > 4096) {
      send(413, {
        ok: false,
        code: "invalid-request",
        error: "取得リクエストが大きすぎます。",
      });
      return;
    }
    let body = "";
    try {
      for await (const chunk of req) {
        body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        if (Buffer.byteLength(body, "utf8") > 4096) {
          send(413, {
            ok: false,
            code: "invalid-request",
            error: "取得リクエストが大きすぎます。",
          });
          return;
        }
      }
    } catch {
      send(400, {
        ok: false,
        code: "invalid-request",
        error: "取得リクエストを読み取れませんでした。",
      });
      return;
    }
    let input: unknown;
    try {
      input = JSON.parse(body);
    } catch {
      send(400, {
        ok: false,
        code: "invalid-request",
        error: "取得リクエストを読み取れませんでした。",
      });
      return;
    }
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      typeof (input as Record<string, unknown>).url !== "string"
    ) {
      send(400, {
        ok: false,
        code: "invalid-request",
        error: "取得するURLを指定してください。",
      });
      return;
    }
    const controller = new AbortController();
    req.on("aborted", () => controller.abort());
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    const result = await (
      req.url === "/api/raid-captures/code"
        ? service.reconstruct
        : service.probe
    )((input as Record<string, unknown>).url, controller.signal);
    if (result.ok) {
      send(200, result.value);
      return;
    }
    send(
      result.code === "unsupported-origin"
        ? 422
        : result.code === "busy"
          ? 429
          : result.code === "renderer-unavailable"
            ? 503
            : result.code === "cancelled"
              ? 408
              : 502,
      result,
    );
  };
}
