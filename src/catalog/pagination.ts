/** Local native page-number presentation only. No page fetching or game state. */
type PaginationType = "go_page" | "gov_page";

export function nativePaginationMarkup(type: PaginationType): string {
  const government = type === "gov_page";
  const pages = government ? 4 : 6;
  const description = "ページ番号の表示プレビューです。外部ページの取得・移動や戦闘状態の変更はしません。";
  const numbers = Array.from({ length: pages }, (_, index) => {
    const page = index + 1;
    return `<button type="button" data-ui="page" data-page="${page}" class="${page === 1 ? "current" : ""}"${page === 1 ? ' aria-current="page"' : ""}>${page}</button>`;
  }).join("");
  const previous = government
    ? '<button type="button" data-ui="page" data-page-direction="previous" aria-label="前のページ番号" disabled>‹</button>'
    : "";
  const next = `<button type="button" data-ui="page" data-page-direction="next" aria-label="次のページ番号">${government ? "›" : "次へ ›"}</button>`;
  return `<nav class="native-pagination ${government ? "gov" : "google"}-pagination" aria-label="${government ? "ページ番号" : "検索結果ページ"}" aria-description="${description}" title="${description}">${previous}${numbers}${next}</nav>`;
}

function controls(panel: HTMLElement): HTMLButtonElement[] {
  return [...panel.querySelectorAll<HTMLButtonElement>('button[data-ui="page"]')]
    .filter(button => button.parentElement === panel);
}

function numericControls(panel: HTMLElement): HTMLButtonElement[] {
  return controls(panel).filter(button => {
    const page = Number(button.dataset.page);
    return !button.dataset.pageDirection && Number.isSafeInteger(page) && page > 0;
  });
}

function currentIndex(numbers: HTMLButtonElement[]): number {
  const accessible = numbers.findIndex(button => button.getAttribute("aria-current") === "page");
  return accessible >= 0 ? accessible : numbers.findIndex(button => button.classList.contains("current"));
}

/** The single projection used by manual previews and automatic battle effects. */
export function projectPagination(panel: HTMLElement, page: number): boolean {
  if (!panel.matches(".native-pagination") || !Number.isSafeInteger(page)) return false;
  const numbers = numericControls(panel);
  const selected = numbers.find(button => Number(button.dataset.page) === page);
  if (!selected) return false;
  for (const button of controls(panel)) {
    const current = button === selected;
    button.classList.toggle("current", current);
    if (current) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
    if (button.dataset.pageDirection === "previous") button.disabled = selected === numbers[0];
    else if (button.dataset.pageDirection === "next") button.disabled = selected === numbers.at(-1);
  }
  return true;
}

export function previewPagination(control: HTMLElement, node: HTMLElement | null): boolean {
  if (!node || control.tagName !== "BUTTON" || control.dataset.ui !== "page" ||
      control.hasAttribute("disabled") || (control as HTMLButtonElement).disabled) return false;
  const panel = control.closest<HTMLElement>(".native-pagination");
  if (!panel || !node.contains(panel) || control.parentElement !== panel ||
      control.closest(".web-node") !== node || panel.closest(".web-node") !== node) return false;
  const numbers = numericControls(panel);
  if (!numbers.length) return false;
  const direction = control.dataset.pageDirection;
  if (direction) {
    if (direction !== "previous" && direction !== "next") return false;
    const index = Math.max(0, currentIndex(numbers));
    const next = numbers[index + (direction === "previous" ? -1 : 1)];
    return next ? projectPagination(panel, Number(next.dataset.page)) : false;
  }
  return numbers.includes(control as HTMLButtonElement)
    ? projectPagination(panel, Number(control.dataset.page))
    : false;
}

/** Battle presentation wraps through numeric pages, never through arrow controls. */
export function advancePagination(node: HTMLElement): boolean {
  const panel = node.matches(".native-pagination") ? node : node.querySelector<HTMLElement>(".native-pagination");
  if (!panel) return false;
  const numbers = numericControls(panel);
  if (!numbers.length) return false;
  const next = numbers[(currentIndex(numbers) + 1) % numbers.length];
  return projectPagination(panel, Number(next.dataset.page));
}
