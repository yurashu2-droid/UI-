interface StylesheetLoad {
  link: HTMLLinkElement;
  ready: Promise<void>;
  loaded: boolean;
}

const stylesheets = new WeakMap<Document, Map<string, StylesheetLoad>>();
const STYLESHEET_TIMEOUT_MS = 15_000;

function isUsable(link: HTMLLinkElement, url: string) {
  return link.href === url && link.rel === "stylesheet" && link.isConnected && !link.disabled && !!link.sheet &&
    (!link.media || link.media === "all");
}

/**
 * Await build-owned CSS ?url assets before mounting an optional screen.
 * Vite's import-preload cache records failed sheets too, so these URLs must not
 * also be imported for CSS side effects. Only an observed success is reusable.
 * A closed host does not cancel a shared sheet; createDeferredMount suppresses
 * its stale mount while another host can finish the same bounded request.
 */
export function loadFeatureStylesheet(href: string, ownerDocument: Document = document): Promise<void> {
  const url = new URL(href, ownerDocument.baseURI).href;
  let cache = stylesheets.get(ownerDocument);
  if (!cache) stylesheets.set(ownerDocument, cache = new Map());
  const current = cache.get(url);
  if (current && (!current.loaded || isUsable(current.link, url))) return current.ready;

  // A non-owned link with no sheet may be pending or may have failed before we
  // observed it. Never infer readiness from its presence or remove that link.
  const existing = [...ownerDocument.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
    .find(link => isUsable(link, url));
  if (existing) {
    const ready = Promise.resolve();
    cache.set(url, { link: existing, ready, loaded: true });
    return ready;
  }

  const link = ownerDocument.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const ready = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  const entry: StylesheetLoad = { link, ready, loaded: false };
  cache.set(url, entry);
  let settled = false;
  const cleanup = () => {
    clearTimeout(timer);
    link.removeEventListener("load", loaded);
    link.removeEventListener("error", failed);
  };
  const finish = (error?: Error) => {
    if (settled) return;
    settled = true;
    cleanup();
    if (error) {
      if (cache.get(url) === entry) cache.delete(url);
      link.remove();
      reject(error);
    } else {
      entry.loaded = true;
      resolve();
    }
  };
  const loaded = () => finish(isUsable(link, url) ? undefined : new Error("Feature stylesheet is not available."));
  const failed = () => finish(new Error("Unable to load feature stylesheet."));
  const timer = setTimeout(() => finish(new Error("Feature stylesheet load timed out.")), STYLESHEET_TIMEOUT_MS);
  link.addEventListener("load", loaded);
  link.addEventListener("error", failed);
  try { ownerDocument.head.appendChild(link); }
  catch { failed(); }
  return ready;
}
