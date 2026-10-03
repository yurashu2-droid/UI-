import type { ArenaCommand, OnlineView } from "./types.js";
type Payload = ArenaCommand extends infer T
  ? T extends ArenaCommand
    ? Omit<T, "commandId" | "expectedRevision">
    : never
  : never;
export class OnlineError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
export function createOnlineClient(
  baseUrl: string,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? 15000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000)
    throw new OnlineError("INVALID_TIMEOUT", "接続待ち時間が不正です。");
  const transport = options.fetch || fetch,
    abort = new AbortController();
  let view: OnlineView | null = null,
    busy = false,
    pending: ArenaCommand | null = null;
  let requestSequence = 0,
    appliedSequence = 0;
  const retiredRuns = new Set<string>();
  const base = baseUrl.replace(/\/$/, "");
  async function request(path: string, body?: unknown): Promise<OnlineView> {
    const sequence = ++requestSequence;
    const response = await transport(base + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "include",
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(timeoutMs)]),
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok)
      throw new OnlineError(
        data.code || "SERVER_ERROR",
        data.message || "接続できませんでした。",
        response.status,
      );
    const next = data as OnlineView;
    if (view) {
      if (next.online.id === view.online.id) {
        // Server revisions describe commit order; request start order alone does not.
        if (next.revision < view.revision) return view;
      } else {
        const replacesRun =
          (path === "/command" &&
            (body as { kind?: string })?.kind === "new-run") ||
          (path === "/session" &&
            (body as { newGuest?: boolean })?.newGuest === true);
        if (
          retiredRuns.has(next.online.id) ||
          (sequence < appliedSequence && !replacesRun)
        )
          return view;
        retiredRuns.add(view.online.id);
      }
    }
    appliedSequence = Math.max(appliedSequence, sequence);
    view = next;
    return view;
  }
  async function submit(body: ArenaCommand) {
    try {
      return await request("/command", body);
    } catch (error) {
      if (error instanceof OnlineError || abort.signal.aborted) throw error;
      // Transport loss can happen after commit. The same command ID makes exactly one retry safe.
      return await request("/command", body);
    }
  }
  return {
    connect: () => request("/session", {}),
    async newGuest() {
      if (busy) throw new OnlineError("BUSY", "処理中です。");
      busy = true;
      try {
        const next = await request("/session", { newGuest: true });
        // An explicit identity replacement cannot replay the previous guest's pending intent.
        pending = null;
        return next;
      } finally {
        busy = false;
      }
    },
    refresh: () => request("/state"),
    get current() {
      return view;
    },
    async command(payload: Payload) {
      if (busy) throw new OnlineError("BUSY", "処理中です。");
      if (!view)
        throw new OnlineError(
          "NOT_CONNECTED",
          "先にサーバーへ接続してください。",
        );
      if (pending)
        throw new OnlineError(
          "UNCERTAIN_COMMAND",
          "前の操作の結果を確認してください。",
        );
      busy = true;
      const body = {
        ...payload,
        commandId: crypto.randomUUID(),
        expectedRevision: view.revision,
      } as ArenaCommand;
      pending = body;
      try {
        const next = await submit(body);
        pending = null;
        return next;
      } catch (error) {
        if (
          error instanceof OnlineError &&
          error.status >= 400 &&
          error.status < 500
        )
          pending = null;
        throw error;
      } finally {
        busy = false;
      }
    },
    async retry() {
      if (busy) throw new OnlineError("BUSY", "処理中です。");
      if (!pending) return request("/state");
      busy = true;
      try {
        const next = await submit(pending);
        pending = null;
        return next;
      } catch (error) {
        if (
          error instanceof OnlineError &&
          error.status >= 400 &&
          error.status < 500
        )
          pending = null;
        throw error;
      } finally {
        busy = false;
      }
    },
    dispose() {
      abort.abort();
    },
  };
}
