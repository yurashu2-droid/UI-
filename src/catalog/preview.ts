import {previewTransfer} from "./transfer-render.js";
/** Cosmetic local demonstration only. This helper has no battle, network or currency access. */
export function previewCatalogueAction(control: HTMLElement, node: HTMLElement | null): boolean {
  const kind = control.dataset.ui;
  if (kind && ['retweet','favorite','follow','bookmark'].includes(kind)) {
    const pressed = control.getAttribute('aria-pressed') !== 'true';
    control.setAttribute('aria-pressed', String(pressed));
    control.setAttribute('title', pressed ? 'ページ内のプレビューです。外部へは送信しません。' : 'プレビューを解除しました');
    if (kind === 'favorite' || kind === 'follow') {
      const symbol = control.querySelector('b');
      if (symbol) symbol.textContent = kind === 'favorite' ? (pressed ? '★' : '☆') : (pressed ? '✓' : '＋');
    }
    return true;
  }
  if (kind === 'cache') {
    const state=node?.querySelector('.cache-state');
    if(state)state.textContent='表示のデモ';
    control.setAttribute('title','ページ内の表示プレビューです。外部ページや戦闘状態は変更しません。');
    return true;
  }
  if (kind === 'transfer-preview') {
    const panel=node?.querySelector<HTMLElement>('.native-transfer');
    if(panel)previewTransfer(panel);
    return true;
  }
  if (kind === 'audio-play') {
    const playing = control.getAttribute('aria-pressed') !== 'true';
    control.setAttribute('aria-pressed', String(playing));
    control.setAttribute('title', playing ? '再生状態のプレビュー・実音声は再生しません' : '停止状態のプレビュー・実音声は再生しません');
    return true;
  }
  if (kind === 'history-restore') {
    control.setAttribute('title', '戦闘中の復元は自動発動です。実際のファイルは変更しません。');
    return true;
  }
  if (kind === 'reference') {
    const state = node?.querySelector('.reference-state');
    if (state) state.textContent = '参照をプレビューしました · 外部移動なし';
    control.setAttribute('title', 'ページ内の参照プレビューです');
    return true;
  }
  if (kind === 'support') {
    const state = node?.querySelector('.support-feedback');
    if (state) state.textContent = '応援のプレビュー · 決済なし';
    control.setAttribute('title', '応援のプレビュー · 実際の決済なし');
    control.setAttribute('data-supported', 'true');
    return true;
  }
  return false;
}
