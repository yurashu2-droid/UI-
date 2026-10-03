/** Disconnected preview contract only. No catalogue entry, combat hook or network operation. */
export interface EtagView {
  capacity:number;
  remaining:number;
  last?:{sourceName:string;prevented:number}|null;
}
export interface EtagFeedback {
  active:boolean;
  hasRecord:boolean;
  capacity:number;
  remaining:number;
  sourceText:string;
  preventedText:string;
  budgetText:string;
}
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Text deliberately rounds down; the native meter keeps the exact finite value.
const amount=(n:number)=>n>0&&n<.1?'<0.1':String(Math.floor((n+Number.EPSILON)*10)/10);
export function etagPartMarkup(label:string):string {
  return `<section class="native-etag-preview" aria-label="再利用攻撃の検証状態・ゲーム内の実験"><header><b>${escape(label||'再取得ガード')}</b><small>ETag風・実験</small></header><div class="etag-source">戦闘情報を待機</div><div class="etag-summary"><span>再利用の通常部分のみ</span><strong class="etag-prevented">前回の軽減 —</strong></div><footer><meter class="etag-budget-meter" min="0" max="1" value="0" aria-label="ページ共有の軽減枠"></meter><span class="etag-budget-label">共有 —</span></footer></section>`;
}
export function etagFeedback(view:EtagView|null|undefined):EtagFeedback {
  if(!view||!Number.isFinite(view.capacity)||view.capacity<=0||!Number.isFinite(view.remaining))return{active:false,hasRecord:false,capacity:1,remaining:0,sourceText:'戦闘情報を待機',preventedText:'前回の軽減 —',budgetText:'共有 —'};
  const capacity=view.capacity,remaining=Math.max(0,Math.min(capacity,view.remaining));
  const prevented=Number.isFinite(view.last?.prevented)?Math.max(0,view.last!.prevented):0;
  const source=typeof view.last?.sourceName==='string'?view.last.sourceName:'';
  return{active:true,hasRecord:prevented>0,capacity,remaining,sourceText:prevented>0?(source||'相手の再利用攻撃'):'再利用攻撃を待機',preventedText:prevented>0?`前回の軽減 ${amount(prevented)}`:'前回の軽減 —',budgetText:`共有 ${amount(remaining)} / ${amount(capacity)}`};
}
export function applyEtagFeedback(panel:HTMLElement|null|undefined,feedback:EtagFeedback):void {
  if(!panel)return;
  for(const[selector,text]of[['.etag-source',feedback.sourceText],['.etag-prevented',feedback.preventedText],['.etag-budget-label',feedback.budgetText]]){
    const node=panel.querySelector<HTMLElement>(selector);if(node)node.textContent=text;
  }
  const meter=panel.querySelector<HTMLMeterElement>('.etag-budget-meter');if(meter){meter.max=feedback.capacity;meter.value=feedback.remaining;}
  panel.classList.toggle('has-replay-record',feedback.hasRecord);
}
