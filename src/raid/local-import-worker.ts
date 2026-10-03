import { LOCAL_CAPTURE_LIMITS, reconstructLocalCode } from "./local-code.js";
import type { RaidBlueprint, RaidResult } from "./types.js";

type LocalImportReply = {
  type: "local-import-result";
  requestId: number;
  result: RaidResult<RaidBlueprint>;
};
const record = (value: unknown): value is Record<string, unknown> => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return false;
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      typeof key === "string" &&
      !!descriptor?.enumerable &&
      Object.hasOwn(descriptor, "value")
    );
  });
};
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

/** A strict structured-clone boundary; only the application's own module runs. */
export async function processLocalImportMessage(
  input: unknown,
): Promise<LocalImportReply> {
  let requestId = 0;
  const failure = (): LocalImportReply => ({
    type: "local-import-result",
    requestId,
    result: {
      ok: false,
      code: "invalid-local-request",
      error:
        "ローカルファイルの要求を確認できませんでした。選び直して再試行してください。",
    },
  });
  if (!record(input)) return failure();
  if (Number.isSafeInteger(input.requestId) && (input.requestId as number) > 0)
    requestId = input.requestId as number;
  if (
    !requestId ||
    !exact(input, [
      "type",
      "requestId",
      "html",
      "capturedAt",
      ...(Object.hasOwn(input, "stylesheet") ? ["stylesheet"] : []),
    ]) ||
    input.type !== "import-local" ||
    !(input.html instanceof ArrayBuffer) ||
    input.html.byteLength === 0 ||
    input.html.byteLength > LOCAL_CAPTURE_LIMITS.htmlBytes ||
    typeof input.capturedAt !== "string"
  )
    return failure();
  let stylesheet: { name: string; bytes: Uint8Array } | undefined;
  if (Object.hasOwn(input, "stylesheet")) {
    const css = input.stylesheet;
    if (
      !record(css) ||
      !exact(css, ["name", "bytes"]) ||
      typeof css.name !== "string" ||
      !(css.bytes instanceof ArrayBuffer) ||
      css.bytes.byteLength > LOCAL_CAPTURE_LIMITS.cssBytes
    )
      return failure();
    stylesheet = { name: css.name, bytes: new Uint8Array(css.bytes) };
  }
  const result = await reconstructLocalCode({
    html: new Uint8Array(input.html),
    ...(stylesheet ? { stylesheet } : {}),
    capturedAt: input.capturedAt,
  });
  return { type: "local-import-result", requestId, result };
}

// The client owns one worker per request and always terminates it. Ignore a
// second message even while WebCrypto yields, preventing parallel source work.
const workerScope = globalThis as unknown as {
  document?: unknown;
  addEventListener?: (
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ) => void;
  postMessage?: (message: LocalImportReply) => void;
};
if (
  typeof workerScope.document === "undefined" &&
  typeof workerScope.addEventListener === "function" &&
  typeof workerScope.postMessage === "function"
) {
  let started = false;
  workerScope.addEventListener("message", (event) => {
    if (started) return;
    started = true;
    void processLocalImportMessage(event.data).then((reply) =>
      workerScope.postMessage!(reply),
    );
  });
}
