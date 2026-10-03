import type { RaidBlueprint, RaidResult } from "./types.js";
import { analyzeLocalCode, reconstructCodeAnalysis } from "./code.js";
import { rawSourceHash } from "./code-source.js";

export const LOCAL_CAPTURE_LIMITS = Object.freeze({
  htmlBytes: 524288,
  cssBytes: 262144,
});
export interface LocalCaptureRequest {
  html: Uint8Array;
  stylesheet?: { name: string; bytes: Uint8Array };
  capturedAt: string;
}
const errors: Record<string, string> = {
  "invalid-local-request":
    "ローカルHTMLの読み込み要求が正しくありません。HTMLを1個、必要ならCSSを1個選び直してください。",
  "invalid-stylesheet-name":
    "CSS名は半角英数字で始まる英数字・ピリオド・ハイフン・下線だけの.css名に限ります。パスやURLは選べません。",
  "stylesheet-unmatched":
    "選んだCSSと一致する有効なlinkがHTMLにありません。hrefがCSS名または./CSS名の同じフォルダのファイルだけを使えます。",
  "stylesheet-ambiguous":
    "選んだCSSに一致する有効なlinkが複数あります。対応するlinkを1個にして選び直してください。",
  "invalid-utf8":
    "HTMLとCSSは正しいUTF-8形式に限ります。文字コードをUTF-8にして選び直してください。",
  "source-too-large":
    "上限を超えています。HTMLは512 KiB、CSSはHTML内と合計256 KiB、要素は2万個・深さ64までです。省略せず中止しました。",
  "no-playable-elements":
    "対応する見出し・リンク・購入ボタンなどをHTMLから見つけられませんでした。JavaScriptで生成される画面は読み込めません。",
  "local-reconstruction-failed":
    "このHTMLを戦闘用の近似配置へ変換できませんでした。元のファイルと現在の選択は変更していません。",
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
function copyBytes(value: unknown, max: number): Uint8Array<ArrayBuffer> {
  if (!(value instanceof Uint8Array) || !(value.buffer instanceof ArrayBuffer))
    throw Error("invalid-local-request");
  if (value.byteLength > max) throw Error("source-too-large");
  return new Uint8Array(value);
}
function decode(bytes: Uint8Array): string {
  // ignoreBOM=true means keep the BOM in the decoded string. Its original UTF-8
  // bytes remain part of provenance, and parse5 treats it as inert text.
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw Error("invalid-utf8");
  }
}
/**
 * Pure, bounded acquisition for the caller's cancellable module worker. It
 * never reads files, uploads source, fetches URLs or creates source DOM.
 * Filenames are transient CSS matching input, never persisted provenance.
 */
export async function reconstructLocalCode(
  request: LocalCaptureRequest,
): Promise<RaidResult<RaidBlueprint>> {
  try {
    if (
      !record(request) ||
      !exact(request, [
        "html",
        "capturedAt",
        ...(Object.hasOwn(request, "stylesheet") ? ["stylesheet"] : []),
      ]) ||
      typeof request.capturedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
        request.capturedAt,
      ) ||
      !Number.isFinite(Date.parse(request.capturedAt)) ||
      new Date(request.capturedAt).toISOString() !== request.capturedAt
    )
      throw Error("invalid-local-request");
    const capturedAt = request.capturedAt;
    const htmlBytes = copyBytes(request.html, LOCAL_CAPTURE_LIMITS.htmlBytes);
    let selected:
      { name: string; bytes: Uint8Array<ArrayBuffer>; css: string } | undefined;
    if (Object.hasOwn(request, "stylesheet")) {
      const sheet = request.stylesheet;
      if (
        !record(sheet) ||
        !exact(sheet, ["name", "bytes"]) ||
        typeof sheet.name !== "string"
      )
        throw Error("invalid-local-request");
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}\.css$/.test(sheet.name))
        throw Error("invalid-stylesheet-name");
      const bytes = copyBytes(sheet.bytes, LOCAL_CAPTURE_LIMITS.cssBytes);
      selected = { name: sheet.name, bytes, css: decode(bytes) };
    }
    // All mutable request bytes and scalar metadata have been snapshotted
    // before the first asynchronous digest yields to another message.
    const html = decode(htmlBytes);
    const analysis = analyzeLocalCode(html, selected);
    const sourceHash = await rawSourceHash(htmlBytes);
    const value = await reconstructCodeAnalysis(analysis, {
      kind: "local-file",
      displayUrl: "local://" + sourceHash,
      caption: "ローカルHTML / コード解析による近似配置",
      capturedAt,
      sourceHash,
      stylesheetHashes: selected ? [await rawSourceHash(selected.bytes)] : [],
    });
    return { ok: true, value };
  } catch (error) {
    const code =
      error instanceof Error && Object.hasOwn(errors, error.message)
        ? error.message
        : "local-reconstruction-failed";
    return { ok: false, code, error: errors[code] };
  }
}
