import { verifyRaidBlueprint } from "./blueprint.js";
import { normalizePublicPageUrl } from "./url.js";
import { RAID_LIMITS, type RaidBlueprint, type RaidResult } from "./types.js";

const fail = (code: string, error: string): RaidResult<never> => ({
  ok: false,
  code,
  error,
});
const unavailable = () =>
  fail(
    "capture-unavailable",
    "安全な公開ページ取得サービスが接続されていません。付属の検証用ページで再構成と回収を試せます。",
  );
function supportedNotice(urls: unknown[]): string {
  const safe = urls.slice(0, 8).filter((value): value is string => {
    if (typeof value !== "string") return false;
    const checked = normalizePublicPageUrl(value);
    return (
      checked.ok && checked.value === value && new URL(value).pathname === "/"
    );
  });
  return safe.length
    ? `現在の取得対象は ${safe.join("、")} です。`
    : "現在、このURLは取得対象に登録されていません。";
}
class CaptureLimit extends Error {}
async function boundedJson(response: Response, max: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let bytes = 0,
    output = "";
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > max) {
        await reader.cancel();
        throw new CaptureLimit();
      }
      output += decoder.decode(next.value, { stream: true });
    }
    return JSON.parse(output + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
/** Only calls this application's capture API. Never fetches arbitrary target URLs in the game client. */
export async function requestRaidCapture(
  input: string,
  signal?: AbortSignal,
  transport: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<RaidResult<RaidBlueprint>> {
  const url = normalizePublicPageUrl(input);
  if (!url.ok) return url;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 35_000);
  try {
    controller.signal.throwIfAborted();
    const capabilities = await transport("/api/raid-captures/capabilities", {
      method: "GET",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    });
    controller.signal.throwIfAborted();
    if (!capabilities.ok) return unavailable();
    let caps: unknown;
    try {
      caps = await boundedJson(capabilities, 4096);
    } catch (error) {
      if (controller.signal.aborted) throw error;
      return unavailable();
    }
    controller.signal.throwIfAborted();
    if (
      !caps ||
      typeof caps !== "object" ||
      (caps as Record<string, unknown>).schemaVersion !== 1
    )
      return unavailable();
    const capability = caps as Record<string, unknown>;
    if (capability.publicCodeReconstruction === true) {
      if (
        capability.sourceJavascript !== false ||
        !Array.isArray(capability.supportedUrls)
      )
        return unavailable();
      if (!capability.supportedUrls.includes(url.value))
        return fail(
          "unsupported-origin",
          supportedNotice(capability.supportedUrls),
        );
      controller.signal.throwIfAborted();
      const response = await transport("/api/raid-captures/code", {
        method: "POST",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.value }),
      });
      controller.signal.throwIfAborted();
      if (!response.ok)
        return fail(
          "capture-failed",
          "初期HTMLから対戦できるUIを読み取れませんでした。取得制限やJavaScriptで後から作られるページには対応していません。",
        );
      const verified = await verifyRaidBlueprint(
        await boundedJson(response, RAID_LIMITS.manifestBytes),
      );
      controller.signal.throwIfAborted();
      if (
        !verified.ok ||
        verified.value.source.kind !== "static-public" ||
        verified.value.fidelity !== "code-approximation" ||
        verified.value.extractorVersion !== "code-v1" ||
        verified.value.source.displayUrl !== new URL(url.value).origin + "/"
      )
        return fail(
          "invalid-capture",
          "取得元とコード解析結果の一致を確認できませんでした。",
        );
      return verified;
    }
    if (capability.publicStaticCapture !== true) {
      if (
        capability.publicStaticProbe !== true ||
        !Array.isArray(capability.supportedUrls)
      )
        return unavailable();
      if (!capability.supportedUrls.includes(url.value))
        return fail(
          "unsupported-origin",
          supportedNotice(capability.supportedUrls),
        );
      controller.signal.throwIfAborted();
      const probe = await transport("/api/raid-captures/probe", {
        method: "POST",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.value }),
      });
      const report = await boundedJson(probe, 8192);
      controller.signal.throwIfAborted();
      if (report && typeof report === "object") {
        const r = report as Record<string, unknown>,
          source = r.source as Record<string, unknown> | undefined;
        if (
          r.code === "renderer-unavailable" &&
          source?.fetched === true &&
          source.url === url.value &&
          typeof source.bytes === "number" &&
          Number.isInteger(source.bytes) &&
          source.bytes > 0 &&
          source.bytes <= 524288 &&
          typeof source.candidateCount === "number" &&
          Number.isInteger(source.candidateCount) &&
          source.candidateCount >= 0 &&
          source.candidateCount <= 64
        )
          return fail(
            "renderer-unavailable",
            `公開HTML ${source.bytes} bytesを取得し、${source.candidateCount}個のUI候補を読み取りました。安全な描画環境が使えないため、実サイトの敵と比較画像はまだ生成できません。現在のページは変更していません。`,
          );
      }
      return fail(
        "capture-failed",
        "公開テストページの取得確認を完了できませんでした。現在のページは変更していません。",
      );
    }
    if (
      capability.networkIsolation !== true ||
      capability.rendererJavascript !== false
    )
      return unavailable();
    controller.signal.throwIfAborted();
    const response = await transport("/api/raid-captures", {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schemaVersion: 1,
        url: url.value,
        viewport: { width: 960, height: 680 },
      }),
    });
    controller.signal.throwIfAborted();
    if (!response.ok)
      return fail(
        "capture-failed",
        "このページは取得できませんでした。現在のページと所持品は変更していません。",
      );
    const value = await boundedJson(response, RAID_LIMITS.manifestBytes);
    const verified = await verifyRaidBlueprint(value);
    if (
      !verified.ok ||
      verified.value.source.kind !== "static-public" ||
      verified.value.source.displayUrl !== new URL(url.value).origin + "/"
    )
      return fail(
        "invalid-capture",
        "実サイトの安全な取得結果を確認できませんでした。",
      );
    controller.signal.throwIfAborted();
    return verified;
  } catch (error) {
    if (controller.signal.aborted)
      return fail(
        signal?.aborted ? "cancelled" : "capture-timeout",
        signal?.aborted
          ? "取得を中止しました。"
          : "取得が時間内に完了しませんでした。",
      );
    if (error instanceof CaptureLimit)
      return fail("capture-too-large", "取得データが容量上限を超えています。");
    return fail(
      "capture-failed",
      "取得サービスと通信できませんでした。現在のページと所持品は変更していません。",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
export function createRaidCaptureSession(
  loader: (
    url: string,
    signal: AbortSignal,
  ) => Promise<RaidResult<RaidBlueprint>> = requestRaidCapture,
) {
  let generation = 0,
    active: AbortController | null = null,
    current: RaidBlueprint | null = null;
  return {
    get current() {
      return current;
    },
    cancel() {
      generation++;
      active?.abort();
      active = null;
    },
    async capture(url: string): Promise<RaidResult<RaidBlueprint>> {
      const mine = ++generation;
      active?.abort();
      const controller = new AbortController();
      active = controller;
      let result: RaidResult<RaidBlueprint>;
      try {
        result = await loader(url, controller.signal);
      } catch {
        result = fail("capture-failed", "取得を完了できませんでした。");
      }
      if (mine !== generation || controller.signal.aborted)
        return fail("cancelled", "取得を中止しました。");
      active = null;
      if (result.ok) current = structuredClone(result.value);
      return result;
    },
  };
}
