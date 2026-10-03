/** Native experimental version-history UI. The engine supplies all combat amounts and timing. */
const escape = (value:string) => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const amount = (value:number) => String(Math.round(value*100)/100);

export function historyPartMarkup(label='変更履歴・版を復元'):string {
  return `<section class="native-version-history"><header><b aria-hidden="true">◴</b><strong>${escape(label)}</strong><small>最新1件</small></header><div class="history-entry"><i aria-hidden="true"></i><div><time class="history-time">履歴なし</time><b class="history-source">ページの変更を待っています</b><span class="history-recovery">復元できる被害はありません</span></div></div><footer><small class="history-expiry">ページ共有の履歴</small><button type="button" data-ui="history-restore" disabled aria-label="版の復元をプレビュー">この版を復元</button></footer></section>`;
}

export interface VisibleHistoryRecord {
  sourceName:string;
  /** Eligible loss from the engine's selected policy, not a new frontend damage calculation. */
  loss:number;
  /** Engine-computed recoverable HP after caps and current missing HP. */
  recoverable:number;
  recordAt:number;
  expiresAt:number;
  consumed:boolean;
}

const historyStates = ['empty','recoverable','used','expired','unneeded'] as const;
type HistoryState = typeof historyStates[number];
const observedHistoryStates = new WeakMap<HTMLElement,HistoryState>();

/** Strings are intended for textContent; timestamps are simulation ticks, never wall-clock time. */
export function historyFeedback(record:VisibleHistoryRecord|null|undefined,ticks:number) {
  if(!record)return {state:'empty' as const,available:false,consumed:false,source:'ページの変更を待っています',time:'履歴なし',status:'復元できる被害はありません',expiry:'ページ共有の履歴'};
  const expired=record.expiresAt<=ticks;
  const available=!record.consumed&&!expired&&record.recoverable>0;
  const state:HistoryState=record.consumed?'used':expired?'expired':available?'recoverable':'unneeded';
  return {
    state,
    available,
    consumed:record.consumed,
    source:record.sourceName,
    time:`${(record.recordAt/20).toFixed(1)}秒の変更`,
    status:record.consumed?'この履歴は使用済み':expired?'履歴の期限切れ':record.recoverable<=0?'現在は回復不要':`対象被害 ${amount(record.loss)} · 復元可能 +${amount(record.recoverable)}`,
    expiry:record.consumed?'次の変更を待っています':expired?'次の変更を待っています':`残り${((record.expiresAt-ticks)/20).toFixed(1)}秒 · ページ共有`,
  };
}


export function applyHistoryFeedback(panel:HTMLElement,view:ReturnType<typeof historyFeedback>):void {
  const previous=observedHistoryStates.get(panel);
  if(previous!==view.state){
    // A record is eligible, not necessarily ready to fire. Animate only an observed
    // loss of eligibility; first observation and replacement never replay a heal.
    panel.classList.toggle('is-history-closing',previous==='recoverable'&&['used','expired','unneeded'].includes(view.state));
    observedHistoryStates.set(panel,view.state);
  }
  for(const state of historyStates)panel.classList.toggle(`is-history-${state}`,view.state===state);
  const fields:Record<string,string>={'.history-time':view.time,'.history-source':view.source,'.history-recovery':view.status,'.history-expiry':view.expiry};
  for(const [selector,text] of Object.entries(fields)){
    const field=panel.querySelector(selector);
    if(field)field.textContent=text;
  }
  const button=panel.querySelector<HTMLButtonElement>('[data-ui="history-restore"]');
  if(button){button.disabled=!view.available;button.title=view.available?'ローカルの表示プレビューです。実際のファイルは変更しません。':view.status;}
}
