/** Cosmetic binary feedback only; native labels, children and handlers stay intact. */
export function setNativeToggleState(control: HTMLElement, pressed: boolean): void {
  control.classList.toggle("is-on", pressed);
  control.setAttribute("aria-pressed", String(pressed));
}
