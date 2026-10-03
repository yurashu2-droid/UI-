/** Native registration feedback only; authored text and child nodes stay intact. */
export function setSubscriptionState(control: HTMLElement, subscribed: boolean): void {
  const label = control.querySelector<HTMLElement>(":scope > .subscribe-label");
  const state = control.querySelector<HTMLElement>(":scope > .subscribe-state");
  if (!label || !state) return;
  control.classList.toggle("is-on", subscribed);
  control.setAttribute("aria-pressed", String(subscribed));
  label.hidden = subscribed;
  state.hidden = !subscribed;
}
