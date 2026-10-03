import type { RaidResult } from "./types.js";
/** UX preflight only. DNS and connected-address checks belong to the isolated server. */
export function normalizePublicPageUrl(input: string): RaidResult<string> {
  const fail = (error: string): RaidResult<never> => ({
    ok: false,
    code: "invalid-url",
    error,
  });
  if (
    typeof input !== "string" ||
    input.length > 2048 ||
    /[\u0000-\u0020\u007f\\]/u.test(input.trim())
  )
    return fail("公開ページのURLを入力してください。");
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return fail("http:// または https:// から始まるURLを入力してください。");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.port)
    return fail("HTTP(S)の標準ポートだけに対応しています。");
  if (url.username || url.password || url.search)
    return fail("認証情報やクエリを含むURLは初期版では取得できません。");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !host.includes(".") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":") ||
    host.includes("[") ||
    /(^|\.)(localhost|local|internal|lan|home|localdomain|invalid|test)$/.test(
      host,
    )
  )
    return fail(
      "公開ドメインのページだけを指定できます。IPアドレスや内部サイトは取得しません。",
    );
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return fail("URLのパスを確認してください。");
  }
  if (
    /[\u0000-\u001f\u007f\\]/u.test(path) ||
    /(?:^|\/)(?:token|secret|password|session|auth|reset|verify|magic|checkout|account|admin|dashboard)(?:\/|$)/i.test(
      path,
    ) ||
    path.split("/").some((part) => /^[a-z0-9_-]{28,}$/i.test(part))
  )
    return fail(
      "秘密情報やアカウント操作を含む可能性のあるURLは取得しません。",
    );
  url.hash = "";
  url.hostname = host;
  return { ok: true, value: url.href };
}
