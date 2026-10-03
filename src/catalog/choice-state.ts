/** Current local choice only; these native buttons are not tabs or radios.
 * https://www.w3.org/TR/wai-aria-1.2/#aria-current
 */
export function setNativeChoiceState(control: HTMLElement): boolean {
  const kind = control.dataset.ui, group = control.parentElement;
  if (control.tagName !== "BUTTON" || !group ||
      !(kind === "tab" && group.matches(".native-tabs") ||
        kind === "font" && group.parentElement?.matches(".native-font"))) return false;
  const buttons = [...group.querySelectorAll<HTMLElement>(`button[data-ui="${kind}"]`)]
    .filter(button => button.parentElement === group);
  for (const button of buttons) {
    const current = button === control;
    button.classList.toggle("current", current);
    if (current) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  }
  return true;
}
