import { verifyRaidBlueprint } from "./blueprint.js";
import type { RaidBlueprint, RaidResult } from "./types.js";

// Kept outside the parser graph: importing the controls must not import parse5.
export const LOCAL_IMPORT_LIMITS = Object.freeze({
  htmlBytes: 524288,
  cssBytes: 262144,
  deadlineMs: 5000,
});
const failure = (code: string, error: string): RaidResult<never> => ({
  ok: false,
  code,
  error,
});
const cancelled = () =>
  failure(
    "cancelled",
    "ローカル読込を中止しました。選択中のページは変更していません。",
  );
const disabled = () =>
  failure("local-disabled", "ローカルHTMLの読込・対戦・回収は実験室限定です。");
const invalid = () =>
  failure(
    "invalid-local-result",
    "安全なローカル解析結果を確認できませんでした。もう一度お試しください。",
  );

/** A native picker grants access to individual files, never a directory or ZIP. */
export function checkLocalImportFile(
  file: File,
  kind: "html" | "css",
): RaidResult<true> {
  const max =
    kind === "html"
      ? LOCAL_IMPORT_LIMITS.htmlBytes
      : LOCAL_IMPORT_LIMITS.cssBytes;
  if (
    !file ||
    !Number.isSafeInteger(file.size) ||
    file.size < (kind === "html" ? 1 : 0) ||
    file.size > max
  )
    return failure(
      "local-file-size",
      `${kind === "html" ? "HTMLは512" : "CSSは256"} KiB以内のファイルを選んでください。`,
    );
  if (
    typeof file.name !== "string" ||
    file.name.length > 255 ||
    /[\\/\u0000-\u001f\u007f]/u.test(file.name) ||
    file.webkitRelativePath ||
    !(
      kind === "html" ? /\.html?$/i : /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}\.css$/
    ).test(file.name) ||
    typeof file.arrayBuffer !== "function"
  )
    return failure(
      "local-file-type",
      "単独のHTMLファイルと、必要なら同じ場所のCSSファイルを一つずつ選んでください。フォルダーやZIPは使えません。",
    );
  return { ok: true, value: true };
}
function record(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return (
        typeof key === "string" &&
        !!descriptor?.enumerable &&
        Object.hasOwn(descriptor, "value")
      );
    })
  );
}
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

export interface LocalImportClientOptions {
  isAllowed?: () => boolean;
  createWorker?: () => Worker;
}
/** All source parsing runs in a disposable Worker. No synchronous fallback. */
export function createLocalImportClient(
  options: LocalImportClientOptions = {},
) {
  let disposed = false,
    sequence = 0;
  let active: (() => void) | undefined;
  const allowed = () => {
    try {
      return options.isAllowed?.() === true;
    } catch {
      return false;
    }
  };
  const cancel = () => {
    active?.();
  };
  return {
    cancel,
    dispose() {
      disposed = true;
      cancel();
    },
    importFiles(html: File, css?: File): Promise<RaidResult<RaidBlueprint>> {
      cancel();
      if (disposed) return Promise.resolve(cancelled());
      if (!allowed()) return Promise.resolve(disabled());
      const htmlCheck = checkLocalImportFile(html, "html");
      if (!htmlCheck.ok) return Promise.resolve(htmlCheck);
      if (css) {
        const cssCheck = checkLocalImportFile(css, "css");
        if (!cssCheck.ok) return Promise.resolve(cssCheck);
      }
      const requestId = ++sequence;
      return new Promise((resolve) => {
        let done = false,
          validating = false;
        let worker: Worker | undefined;
        const stop = () => finish(cancelled());
        active = stop;
        const current = () => !done && !disposed && active === stop;
        const timer = setTimeout(
          () =>
            finish(
              failure(
                "local-timeout",
                "ローカル解析が5秒以内に完了しませんでした。小さいHTMLで再試行できます。",
              ),
            ),
          LOCAL_IMPORT_LIMITS.deadlineMs,
        );
        const finish = (result: RaidResult<RaidBlueprint>) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (worker) {
            worker.removeEventListener("message", onMessage);
            worker.removeEventListener("error", onError);
            worker.removeEventListener("messageerror", onError);
            worker.terminate();
          }
          if (active === stop) active = undefined;
          resolve(result);
        };
        const onError = () =>
          finish(
            failure(
              "local-worker-failed",
              "ローカル解析用Workerが停止しました。ファイルを選び直して再試行できます。",
            ),
          );
        const onMessage = (event: MessageEvent<unknown>) => {
          if (!current() || validating) return;
          if (!allowed()) {
            finish(disabled());
            return;
          }
          const envelope = event.data;
          if (
            !record(envelope) ||
            !exact(envelope, ["type", "requestId", "result"]) ||
            envelope.type !== "local-import-result" ||
            envelope.requestId !== requestId ||
            !record(envelope.result)
          ) {
            finish(invalid());
            return;
          }
          const result = envelope.result;
          if (
            result.ok === false &&
            exact(result, ["ok", "code", "error"]) &&
            typeof result.code === "string" &&
            /^[a-z0-9-]{1,64}$/.test(result.code) &&
            typeof result.error === "string" &&
            result.error.length > 0 &&
            result.error.length <= 500 &&
            !/[\u0000-\u001f\u007f]/u.test(result.error)
          ) {
            finish(failure(result.code, result.error));
            return;
          }
          if (result.ok !== true || !exact(result, ["ok", "value"])) {
            finish(invalid());
            return;
          }
          validating = true;
          void verifyRaidBlueprint(result.value)
            .then((checked) => {
              if (!current()) return;
              if (!allowed()) {
                finish(disabled());
                return;
              }
              if (
                !checked.ok ||
                checked.value.source.kind !== "local-file" ||
                checked.value.fidelity !== "code-approximation" ||
                checked.value.extractorVersion !== "code-v1"
              ) {
                finish(invalid());
                return;
              }
              finish(checked);
            })
            .catch(() => {
              if (current()) finish(invalid());
            });
        };
        void (async () => {
          try {
            const htmlBytes = await html.arrayBuffer();
            if (!current()) return;
            if (!allowed()) {
              finish(disabled());
              return;
            }
            if (
              !(htmlBytes instanceof ArrayBuffer) ||
              htmlBytes.byteLength !== html.size
            ) {
              finish(
                failure(
                  "local-file-read",
                  "HTMLファイルの容量を確認できませんでした。",
                ),
              );
              return;
            }
            const cssBytes = css ? await css.arrayBuffer() : undefined;
            if (!current()) return;
            if (!allowed()) {
              finish(disabled());
              return;
            }
            if (
              css &&
              (!(cssBytes instanceof ArrayBuffer) ||
                cssBytes.byteLength !== css.size)
            ) {
              finish(
                failure(
                  "local-file-read",
                  "CSSファイルの容量を確認できませんでした。",
                ),
              );
              return;
            }
            try {
              worker = options.createWorker
                ? options.createWorker()
                : new Worker(
                    new URL("./local-import-worker.ts", import.meta.url),
                    { type: "module" },
                  );
            } catch {
              finish(
                failure(
                  "local-worker-unavailable",
                  "この環境ではローカル解析用Workerを起動できません。再試行するか、付属ページをご利用ください。",
                ),
              );
              return;
            }
            worker.addEventListener("message", onMessage);
            worker.addEventListener("error", onError);
            worker.addEventListener("messageerror", onError);
            const request = {
              type: "import-local",
              requestId,
              html: htmlBytes,
              ...(css && cssBytes
                ? { stylesheet: { name: css.name, bytes: cssBytes } }
                : {}),
              capturedAt: new Date().toISOString(),
            };
            worker.postMessage(
              request,
              cssBytes ? [htmlBytes, cssBytes] : [htmlBytes],
            );
          } catch {
            if (current())
              finish(
                failure(
                  "local-file-read",
                  "ファイルを読み込めませんでした。選び直して再試行できます。",
                ),
              );
          }
        })();
      });
    },
  };
}
