import { normalizePublicPageUrl } from "../../src/raid/url.js";

/** Trusted server configuration only. Never accept these records from an HTTP request. */
export interface ReviewedPublicSource {
  origin: string;
  pageUrl: string;
  stylesheetUrl?: string;
}

/** Lexical configuration validation is not DNS pinning or a public-only egress guarantee. */
export function definePublicSources(
  entries: readonly ReviewedPublicSource[],
): readonly Readonly<ReviewedPublicSource>[] {
  const invalid = () => new Error("Invalid reviewed public source 設定");
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 8)
    throw invalid();
  const origins = new Set<string>();
  const result: Readonly<ReviewedPublicSource>[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entryDescriptor = Object.getOwnPropertyDescriptor(entries, String(i));
    if (!entryDescriptor || !("value" in entryDescriptor)) throw invalid();
    const entry: unknown = entryDescriptor.value;
    if (
      !entry ||
      typeof entry !== "object" ||
      Object.getPrototypeOf(entry) !== Object.prototype
    )
      throw invalid();
    const fields = Object.getOwnPropertyDescriptors(entry);
    if (
      Reflect.ownKeys(fields).some(
        (key) =>
          typeof key !== "string" ||
          !["origin", "pageUrl", "stylesheetUrl"].includes(key),
      )
    )
      throw invalid();
    if (
      Object.values(fields).some(
        (field) => !("value" in field) || !field.enumerable,
      )
    )
      throw invalid();
    const origin = fields.origin?.value,
      pageUrl = fields.pageUrl?.value;
    const stylesheetUrl = fields.stylesheetUrl?.value;
    if (typeof origin !== "string" || typeof pageUrl !== "string")
      throw invalid();
    const checked = normalizePublicPageUrl(pageUrl);
    if (!checked.ok || checked.value !== pageUrl) throw invalid();
    const page = new URL(pageUrl);
    if (
      page.protocol !== "https:" ||
      page.origin !== origin ||
      pageUrl !== origin + "/" ||
      !/^[a-z0-9.-]+$/.test(page.hostname) ||
      origins.has(origin)
    )
      throw invalid();
    if (stylesheetUrl !== undefined) {
      if (typeof stylesheetUrl !== "string" || stylesheetUrl.length > 1024)
        throw invalid();
      let sheet: URL;
      try {
        sheet = new URL(stylesheetUrl);
      } catch {
        throw invalid();
      }
      if (
        sheet.href !== stylesheetUrl ||
        sheet.origin !== origin ||
        sheet.username ||
        sheet.password ||
        sheet.search ||
        sheet.hash ||
        !/^\/[a-zA-Z0-9/_.-]+\.css$/.test(sheet.pathname)
      )
        throw invalid();
    }
    origins.add(origin);
    result.push(
      Object.freeze({
        origin,
        pageUrl,
        ...(stylesheetUrl === undefined ? {} : { stylesheetUrl }),
      }),
    );
  }
  return Object.freeze(result);
}

/** Adding a source here is a reviewed code change, never a user's URL-input setting. */
export const DEFAULT_PUBLIC_SOURCES = definePublicSources([
  {
    origin: "https://books.toscrape.com",
    pageUrl: "https://books.toscrape.com/",
    stylesheetUrl: "https://books.toscrape.com/static/oscar/css/styles.css",
  },
  { origin: "https://example.com", pageUrl: "https://example.com/" },
]);
