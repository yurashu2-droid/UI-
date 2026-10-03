import { createHash } from "node:crypto";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { reconstructStaticCode } from "./code.js";
import { CSS_LIMITS, activeStylesheetLinkUrl } from "./css.js";
import type { RaidBlueprint } from "../../src/raid/types.js";
import {
  DEFAULT_PUBLIC_SOURCES,
  definePublicSources,
  type ReviewedPublicSource,
} from "./config.js";

/** Fixed public test pages only. Never make this list user-configurable or accept subpaths. */
export const SUPPORTED_PUBLIC_PAGES = Object.freeze(
  DEFAULT_PUBLIC_SOURCES.map((source) => source.pageUrl),
);
/** A source HTML link must name this exact reviewed asset. No inferred asset paths or imports. */
export const SUPPORTED_PUBLIC_STYLESHEETS = Object.freeze(
  Object.fromEntries(
    DEFAULT_PUBLIC_SOURCES.flatMap((source) =>
      source.stylesheetUrl ? [[source.pageUrl, source.stylesheetUrl]] : [],
    ),
  ),
);
export const INGEST_LIMITS = Object.freeze({
  bytes: 524_288,
  nodes: 20_000,
  candidates: 64,
  timeoutMs: 15_000,
  cssTimeoutMs: 15_000,
});
export interface StaticCandidate {
  kind: "heading" | "navigation" | "purchase" | "search";
  label: string;
  order: number;
}
export interface StaticExtraction {
  title: string;
  candidates: StaticCandidate[];
}
export interface FetchedStaticSource {
  requestedUrl: string;
  sourceHash: string;
  capturedAt: string;
  html: string;
  bytes: number;
  extraction: StaticExtraction;
  stylesheets?: { css: string; sourceHash: string; url?: string }[];
  stylesheetWarning?: boolean;
}
/** Future adapter boundary: offline renderer must enforce OS isolation and return real layout/reference pixels. */
export interface OfflineStaticRenderer {
  render(
    source: FetchedStaticSource,
    signal: AbortSignal,
  ): Promise<{ layout: unknown; referencePng: Uint8Array }>;
}
export interface ProbeFailure {
  ok: false;
  code:
    | "unsupported-origin"
    | "busy"
    | "cancelled"
    | "fetch-failed"
    | "source-too-large"
    | "not-html"
    | "renderer-unavailable"
    | "no-playable-elements";
  error: string;
  source?: {
    fetched: true;
    url: string;
    title: string;
    bytes: number;
    candidateCount: number;
    sourceHash: string;
    capturedAt: string;
  };
}
type Node = DefaultTreeAdapterMap["node"];
const children = (node: Node): Node[] =>
  "childNodes" in node ? node.childNodes : [];
const tag = (node: Node) => ("tagName" in node ? node.tagName : "");
const attr = (node: Node, key: string) =>
  "attrs" in node ? node.attrs.find((a) => a.name === key)?.value : undefined;
const OMIT = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "template",
  "noscript",
  "svg",
  "math",
  "input",
  "textarea",
  "select",
]);
const hidden = (node: Node) =>
  attr(node, "hidden") !== undefined ||
  attr(node, "aria-hidden") === "true" ||
  /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attr(node, "style") ?? "");
function plain(node: Node, depth = 0): string {
  if (depth > 64 || OMIT.has(tag(node)) || hidden(node)) return "";
  if (node.nodeName === "#text" && "value" in node) return node.value;
  return children(node)
    .map((c) => plain(c, depth + 1))
    .join(" ");
}
const clean = (value: string) =>
  value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
/** parse5 is inert. No DOM construction, script evaluation, asset fetch or form-value collection. */
export function extractStaticCandidates(html: string): StaticExtraction {
  if (Buffer.byteLength(html, "utf8") > INGEST_LIMITS.bytes)
    throw new Error("source-too-large");
  const document = parse(html, { scriptingEnabled: false });
  const result: StaticExtraction = {
    title: "公開テストページ",
    candidates: [],
  };
  let visited = 0;
  const visit = (node: Node, depth = 0) => {
    if (++visited > INGEST_LIMITS.nodes || depth > 64)
      throw new Error("source-too-large");
    const name = tag(node);
    if (OMIT.has(name) || hidden(node)) return;
    if (name === "title") {
      result.title = clean(plain(node)) || result.title;
      return;
    }
    const label = clean(plain(node));
    let kind: StaticCandidate["kind"] | null = null;
    if (/^h[1-3]$/.test(name)) kind = "heading";
    else if (name === "a") kind = "navigation";
    else if (
      name === "button" &&
      /add to (?:basket|cart)|buy|購入|カート|かご/i.test(label)
    )
      kind = "purchase";
    if (kind && label && result.candidates.length < INGEST_LIMITS.candidates)
      result.candidates.push({ kind, label, order: result.candidates.length });
    for (const child of children(node)) visit(child, depth + 1);
  };
  visit(document);
  return result;
}
class SourceTooLarge extends Error {}
async function readSource(
  response: Response,
  signal: AbortSignal,
  maxBytes: number = INGEST_LIMITS.bytes,
): Promise<{ html: string; bytes: number }> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > maxBytes) throw new SourceTooLarge();
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty-source");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let html = "",
    bytes = 0;
  try {
    for (;;) {
      if (signal.aborted) {
        await reader.cancel();
        throw new Error("cancelled");
      }
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new SourceTooLarge();
      }
      html += decoder.decode(item.value, { stream: true });
    }
    return { html: html + decoder.decode(), bytes };
  } finally {
    reader.releaseLock();
  }
}
export function createStaticIngestService(
  options: {
    transport?: typeof fetch;
    sources?: readonly ReviewedPublicSource[];
  } = {},
) {
  const transport = options.transport ?? globalThis.fetch.bind(globalThis);
  const sources = definePublicSources(
    options.sources ?? DEFAULT_PUBLIC_SOURCES,
  );
  const sourcesByPage = new Map(
    sources.map((source) => [source.pageUrl, source]),
  );
  let active = false;
  const fail = (code: ProbeFailure["code"], error: string): ProbeFailure => ({
    ok: false,
    code,
    error,
  });
  async function acquire(
    input: unknown,
    signal?: AbortSignal,
    withStyles = false,
  ): Promise<{ ok: true; value: FetchedStaticSource } | ProbeFailure> {
    if (typeof input !== "string" || !sourcesByPage.has(input))
      return fail(
        "unsupported-origin",
        "現在は指定された公開テストページのトップページだけに対応しています。",
      );
    if (signal?.aborted) return fail("cancelled", "取得を中止しました。");
    if (active)
      return fail(
        "busy",
        "別の公開ページを取得中です。少し待って再試行してください。",
      );
    active = true;
    const controller = new AbortController(),
      abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(
      abort,
      INGEST_LIMITS.timeoutMs + (withStyles ? INGEST_LIMITS.cssTimeoutMs : 0),
    );
    try {
      const htmlSignal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(INGEST_LIMITS.timeoutMs),
      ]);
      const response = await transport(input, {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        headers: { Accept: "text/html" },
        signal: htmlSignal,
      });
      if (
        response.status !== 200 ||
        response.redirected ||
        (response.url && response.url !== input)
      )
        return fail(
          "fetch-failed",
          "公開ページを取得できませんでした。リダイレクトは追跡しません。",
        );
      if (
        !/^text\/html(?:\s*;|$)/i.test(
          response.headers.get("content-type") ?? "",
        )
      )
        return fail("not-html", "取得先はHTMLページではありません。");
      const body = await readSource(response, htmlSignal);
      if (controller.signal.aborted)
        return fail("cancelled", "取得を中止しました。");
      const extraction = extractStaticCandidates(body.html);
      const stylesheets: NonNullable<FetchedStaticSource["stylesheets"]> = [];
      let stylesheetWarning = false;
      const allowed = sourcesByPage.get(input)?.stylesheetUrl;
      if (withStyles && allowed) {
        let linked = false;
        let linkNodes = 0;
        const visitLink = (n: Node, depth = 0) => {
          if (++linkNodes > INGEST_LIMITS.nodes || depth > 64)
            throw Error("source-too-large");
          if (activeStylesheetLinkUrl(n, input) === allowed) linked = true;
          for (const c of children(n)) visitLink(c, depth + 1);
        };
        visitLink(parse(body.html, { scriptingEnabled: false }));
        if (linked) {
          try {
            const cssSignal = AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(INGEST_LIMITS.cssTimeoutMs),
            ]);
            const sheet = await transport(allowed, {
              method: "GET",
              redirect: "error",
              credentials: "omit",
              cache: "no-store",
              headers: { Accept: "text/css" },
              signal: cssSignal,
            });
            if (
              sheet.status !== 200 ||
              sheet.redirected ||
              (sheet.url && sheet.url !== allowed) ||
              !/^text\/css(?:\s*;|$)/i.test(
                sheet.headers.get("content-type") ?? "",
              )
            )
              throw Error("stylesheet-response");
            const css = await readSource(sheet, cssSignal, CSS_LIMITS.bytes);
            stylesheets.push({
              url: allowed,
              css: css.html,
              sourceHash: createHash("sha256")
                .update(css.html, "utf8")
                .digest("hex"),
            });
          } catch (error) {
            if (controller.signal.aborted || signal?.aborted) throw error;
            stylesheetWarning = true;
          }
        }
      }
      return {
        ok: true,
        value: {
          requestedUrl: input,
          sourceHash: createHash("sha256")
            .update(body.html, "utf8")
            .digest("hex"),
          capturedAt: new Date().toISOString(),
          html: body.html,
          bytes: body.bytes,
          extraction,
          stylesheets,
          stylesheetWarning,
        },
      };
    } catch (error) {
      if (controller.signal.aborted)
        return fail(
          signal?.aborted ? "cancelled" : "fetch-failed",
          signal?.aborted
            ? "取得を中止しました。"
            : "公開ページの取得が制限時間を超えました。",
        );
      if (
        error instanceof SourceTooLarge ||
        (error instanceof Error && error.message === "source-too-large")
      )
        return fail(
          "source-too-large",
          "公開ページの容量または要素数が上限を超えています。",
        );
      return fail(
        "fetch-failed",
        "公開ページを取得できませんでした。アクセス制限を回避する再試行はしません。",
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      active = false;
    }
  }
  return {
    capabilities() {
      return {
        schemaVersion: 1,
        publicStaticCapture: false,
        publicStaticProbe: true,
        publicCodeReconstruction: true,
        networkIsolation: false,
        rendererJavascript: false,
        sourceJavascript: false,
        supportedUrls: sources.map((source) => source.pageUrl),
        blocker: "renderer-ipc-unavailable",
      };
    },
    async probe(input: unknown, signal?: AbortSignal): Promise<ProbeFailure> {
      const fetched = await acquire(input, signal);
      if (!fetched.ok) return fetched;
      const s = fetched.value;
      return {
        ok: false,
        code: "renderer-unavailable",
        error:
          "公開HTMLは取得できました。元サイトを測定した再現と比較画像はまだ生成できません。コード解析による近似再構成を利用できます。",
        source: {
          fetched: true,
          url: s.requestedUrl,
          title: s.extraction.title,
          bytes: s.bytes,
          candidateCount: s.extraction.candidates.length,
          sourceHash: s.sourceHash,
          capturedAt: s.capturedAt,
        },
      };
    },
    async reconstruct(
      input: unknown,
      signal?: AbortSignal,
    ): Promise<{ ok: true; value: RaidBlueprint } | ProbeFailure> {
      const fetched = await acquire(input, signal, true);
      if (!fetched.ok) return fetched;
      try {
        const blueprint = await reconstructStaticCode(fetched.value);
        if (signal?.aborted) return fail("cancelled", "取得を中止しました。");
        return { ok: true, value: blueprint };
      } catch (error) {
        if (error instanceof Error && error.message === "source-too-large")
          return fail("source-too-large", "HTMLの構造が上限を超えています。");
        return fail(
          "no-playable-elements",
          "初期HTMLから対戦できるUIを読み取れませんでした。JavaScriptで後から作られるページは現在対象外です。",
        );
      }
    },
  };
}
