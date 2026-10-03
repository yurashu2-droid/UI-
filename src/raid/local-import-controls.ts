import {
  checkLocalImportFile,
  createLocalImportClient,
} from "./local-import-client.js";
import type { RaidBlueprint, RaidResult } from "./types.js";

export interface LocalImportControlsOptions {
  /** Required live owner opt-in; an absent/throwing callback fails closed. */
  isAllowed?: () => boolean;
  isLocked?: () => boolean;
  onStart?: () => void;
  onBusyChange?: (busy: boolean) => void;
  onSelected(
    blueprint: RaidBlueprint,
    isCurrent: () => boolean,
  ): Promise<RaidResult<RaidBlueprint>>;
}

export function mountLocalImportControls(
  host: HTMLElement,
  options: LocalImportControlsOptions,
): { dispose(): void; cancel(): void; refresh(): void } {
  const doc = host.ownerDocument;
  const section = doc.createElement("section");
  section.className = "raid-local-import";
  const title = doc.createElement("h3");
  title.textContent = "ローカルHTMLの近似再構成（実験室限定）";
  const scope = doc.createElement("p");
  scope.textContent =
    "UTF-8のHTML（512 KiB以内）と、任意でCSS一つ（HTML内のCSSと合計256 KiB以内）を選びます。CSS名は英数字で始まる半角英数字・._- と小文字.cssのみ。HTML内の同じ場所を指すリンク一つに名前が一致する場合だけ、その宣言位置で使います。フォルダーやZIPは読み込みません。";
  const disclosure = doc.createElement("p");
  disclosure.textContent =
    "この端末内のWorkerで、タグと限定したCSSから配置を近似します。元ページのJavaScriptは実行せず、画像・動画・外部フォント・追加CSS・外部通信は使いません。未対応のCSS・レイアウトは再現せず、元ページとの比較はできません。選択だけでは報酬は増えません。";
  const fields = doc.createElement("div");
  fields.className = "raid-fixtures";
  const htmlLabel = doc.createElement("label");
  htmlLabel.textContent = "HTMLファイル ";
  const htmlInput = doc.createElement("input");
  htmlInput.type = "file";
  htmlInput.accept = ".html,.htm,text/html";
  htmlInput.multiple = false;
  htmlInput.setAttribute("aria-label", "実験室で近似再構成するHTMLファイル");
  htmlLabel.append(htmlInput);
  const cssLabel = doc.createElement("label");
  cssLabel.textContent = "CSSファイル（任意） ";
  const cssInput = doc.createElement("input");
  cssInput.type = "file";
  cssInput.accept = ".css,text/css";
  cssInput.multiple = false;
  cssInput.setAttribute(
    "aria-label",
    "HTMLから参照される同じ場所のCSSファイル一つ",
  );
  cssLabel.append(cssInput);
  fields.append(htmlLabel, cssLabel);
  const actions = doc.createElement("div");
  actions.className = "raid-actions";
  const start = doc.createElement("button");
  start.type = "button";
  start.textContent = "ローカルHTMLを近似再構成";
  const clearCss = doc.createElement("button");
  clearCss.type = "button";
  clearCss.textContent = "CSSなしに戻す";
  const stop = doc.createElement("button");
  stop.type = "button";
  stop.textContent = "ローカル読込を中止";
  actions.append(start, clearCss, stop);
  const selection = doc.createElement("p");
  const status = doc.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  status.textContent =
    "ファイル選択後に「ローカルHTMLを近似再構成」を押してください。";
  section.append(title, scope, disclosure, fields, actions, selection, status);
  host.replaceChildren(section);
  let disposed = false,
    generation = 0,
    busy = false,
    cssInvalid = false,
    html: File | undefined,
    css: File | undefined;
  const allowed = () => {
    try {
      return options.isAllowed?.() === true;
    } catch {
      return false;
    }
  };
  const locked = () => {
    try {
      return options.isLocked?.() ?? false;
    } catch {
      return true;
    }
  };
  const mounted = () =>
    !disposed &&
    host.isConnected &&
    section.isConnected &&
    section.parentElement === host;
  const live = () => mounted() && allowed();
  const client = createLocalImportClient({ isAllowed: live });
  const current = (token: number) =>
    token === generation && live() && !locked();
  const refresh = () => {
    if (disposed) return;
    const enabled = allowed(),
      blocked = locked();
    section.hidden = !enabled;
    htmlInput.disabled = cssInput.disabled = !enabled || blocked;
    start.disabled = !enabled || blocked || busy || !html || cssInvalid;
    clearCss.disabled = !enabled || blocked || (!css && !cssInvalid);
    stop.hidden = !busy;
    section.setAttribute("aria-busy", String(busy));
    selection.textContent = `HTML: ${html ? "選択済み" : "未選択"} ／ CSS: ${css ? "選択済み" : "なし"}`;
  };
  const setBusy = (value: boolean) => {
    busy = value;
    options.onBusyChange?.(value);
    refresh();
  };
  const cancel = () => {
    generation++;
    client.cancel();
    if (busy) {
      setBusy(false);
      if (live())
        status.textContent =
          "ローカル読込を中止しました。選択中のページは変更していません。";
    }
  };
  const choose = (kind: "html" | "css", input: HTMLInputElement) => {
    const files = input.files ? Array.from(input.files) : [];
    input.value = "";
    if (!live() || locked() || files.length === 0) return;
    cancel();
    if (files.length !== 1) {
      if (kind === "html") html = undefined;
      else {
        css = undefined;
        cssInvalid = true;
      }
      status.textContent =
        "HTMLとCSSはそれぞれ単独ファイル一つを選んでください。";
      refresh();
      return;
    }
    const checked = checkLocalImportFile(files[0], kind);
    if (kind === "html") html = checked.ok ? files[0] : undefined;
    else {
      css = checked.ok ? files[0] : undefined;
      cssInvalid = !checked.ok;
    }
    status.textContent = checked.ok
      ? "ファイルを選択しました。まだ解析・対戦・回収はしていません。"
      : checked.error;
    refresh();
  };
  const chooseHtml = () => choose("html", htmlInput),
    chooseCss = () => choose("css", cssInput);
  const cancelledHtml = () => {
      htmlInput.value = "";
    },
    cancelledCss = () => {
      cssInput.value = "";
    };
  const begin = async () => {
    if (!live() || locked() || busy || !html || cssInvalid) return;
    const token = ++generation;
    try {
      options.onStart?.();
      if (!current(token)) return;
      setBusy(true);
      status.textContent =
        "ローカルHTMLを近似解析しています。5秒以内に完了しなければ中止します。";
      const result = await client.importFiles(html, css);
      if (!current(token)) return;
      if (!result.ok) {
        status.textContent = result.error;
        return;
      }
      const selected = await options.onSelected(result.value, () =>
        current(token),
      );
      if (!current(token)) return;
      status.textContent = selected.ok
        ? "ローカルHTMLの近似再構成を選択しました。実験室で対戦して勝利するとUIを一つ回収できます。"
        : selected.error;
    } catch {
      if (current(token))
        status.textContent =
          "ローカル読込を完了できませんでした。選び直して再試行できます。";
    } finally {
      if (token === generation) {
        busy = false;
        if (mounted()) options.onBusyChange?.(false);
        if (live() && !locked()) refresh();
      }
    }
  };
  const clear = () => {
    if (!live() || locked()) return;
    cancel();
    css = undefined;
    cssInvalid = false;
    cssInput.value = "";
    status.textContent =
      "CSSなしで近似再構成します。HTML内の対応するstyle・style属性のみを使います。";
    refresh();
  };
  htmlInput.addEventListener("change", chooseHtml);
  cssInput.addEventListener("change", chooseCss);
  htmlInput.addEventListener("cancel", cancelledHtml);
  cssInput.addEventListener("cancel", cancelledCss);
  start.addEventListener("click", begin);
  clearCss.addEventListener("click", clear);
  stop.addEventListener("click", cancel);
  refresh();
  return {
    cancel,
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      client.dispose();
      busy = false;
      html = css = undefined;
      htmlInput.removeEventListener("change", chooseHtml);
      cssInput.removeEventListener("change", chooseCss);
      htmlInput.removeEventListener("cancel", cancelledHtml);
      cssInput.removeEventListener("cancel", cancelledCss);
      start.removeEventListener("click", begin);
      clearCss.removeEventListener("click", clear);
      stop.removeEventListener("click", cancel);
    },
  };
}
