/** Native transfer presentation only. No file, network or wall-clock access. */
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export interface TransferFeedback {fraction:number;percent:number;status:string;}
export function transferFeedback(period:number,remaining:number):TransferFeedback {
  const fraction=Number.isFinite(period)&&period>0&&Number.isFinite(remaining)?Math.max(0,Math.min(1,1-remaining/period)):0;
  return {fraction,percent:fraction===1?100:Math.min(99,Math.round(fraction*100)),status:fraction===1?'転送完了':'次の転送を準備'};
}
export function applyTransferFeedback(panel:HTMLElement,view:TransferFeedback):void {
  const progress=panel.querySelector<HTMLProgressElement>('progress');if(progress)progress.value=view.fraction;
  const percent=panel.querySelector('.transfer-percent');if(percent)percent.textContent=`${view.percent}%`;
  const status=panel.querySelector('.transfer-state');if(status)status.textContent=view.status;
}
export function previewTransfer(panel:HTMLElement):void {
  const complete=panel.querySelector<HTMLProgressElement>('progress')?.value!==1;
  applyTransferFeedback(panel,transferFeedback(1,complete?0:1));
}
export function transferPartMarkup(label='web-parts.zip'):string {
  return `<section class="native-transfer"><header><i class="transfer-file" aria-hidden="true"><b>ZIP</b></i><div><strong>${escape(label)}</strong><small>ローカル転送UI・実ファイルなし</small></div></header><div class="transfer-progress-row"><progress aria-label="転送の準備（ゲーム内演出）" max="1" value="0"></progress><span class="transfer-percent">0%</span></div><footer><span class="transfer-state">次の転送を準備</span><b class="transfer-complete-hint">転送完了</b><b class="transfer-reused-hint">保存済みを再利用</b><button type="button" data-ui="transfer-preview" title="ローカルのプレビューです。実ファイルは転送しません。">転送を試す</button></footer></section>`;
}
