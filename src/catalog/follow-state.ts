/** Native follow feedback only; authored labels and control children stay intact. */
export function setFollowState(control: HTMLElement, followed: boolean): void {
  control.setAttribute("aria-pressed", String(followed));
  const symbol = control.querySelector(":scope > b");
  if (symbol) symbol.textContent = followed ? "✓" : "＋";
}
