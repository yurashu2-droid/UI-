import type { ServerPressure } from "../server-pressure.js";
export function jobTableMarkup() {
  return `<section class="native-job-table"><header><b>自動閲覧ジョブ一覧</b><small>SIMULATED · LOCAL</small></header><table><tbody><tr><th><i class="job-dot"></i>待機</th><td class="job-state">収益待ち · 実験ルールで有効</td></tr><tr><th>実行</th><td class="job-running">0回 · 一時作業 +6 / 5秒</td></tr><tr><th>拒否</th><td class="job-blocked">0回 · 支払い済み</td></tr></tbody></table><footer><span>資金 $<b class="state-charge">0</b> / 6</span><span>$3 / 波 · 基本4秒</span></footer></section>`;
}
export function pressureFeedback(base: number, capacity: number, queue: ReturnType<ServerPressure['snapshot']>) {
  return {cpuText: `CPU ${base} + ${queue.work} 一時作業 / ${capacity}`,
    expiryText: queue.work ? `共有キュー ${queue.work}/${queue.cap} · 次の解消まで ${queue.nextExpiry.toFixed(1)}秒` : `共有キュー 0/${queue.cap} · 回復済み`,
    fill: queue.work / queue.cap};
}
export function jobFeedback(enabled: boolean, charge: number, source: {attempts: number; blocked: number; accepted: number} | undefined, remaining: number) {
  return {stateText: !enabled ? "実験ルールで有効" : charge < 3 ? "収益待ち" : `実行待ち · ${Math.max(0, remaining).toFixed(1)}秒`,
    chargeText: String(Math.round(charge * 100) / 100),
    runningText: `${source?.attempts ?? 0}回 · 作業受理 ${source?.accepted ?? 0}`,
    blockedText: `${source?.blocked ?? 0}回 · 支払い済み`};
}
export function pressureMeterMarkup(base: number, capacity: number) {
  const f = pressureFeedback(base, capacity, {work: 0, cap: 12, nextExpiry: 0});
  return `<div class="server-pressure-meter" aria-label="一時サーバー負荷。閲覧者HPとは別"><b class="pressure-cpu">${f.cpuText}</b><span class="pressure-expiry">${f.expiryText}</span><span class="pressure-track"><i></i></span></div>`;
}
export function applyPressureFeedback(frame: HTMLElement, base: number, capacity: number, queue: ReturnType<ServerPressure['snapshot']>) {
  const f = pressureFeedback(base, capacity, queue);
  const cpu = frame.querySelector('.pressure-cpu'), expiry = frame.querySelector('.pressure-expiry'), meter = frame.querySelector<HTMLElement>('.pressure-track i');
  if (cpu) cpu.textContent = f.cpuText;
  if (expiry) expiry.textContent = f.expiryText;
  if (meter) meter.style.width = `${f.fill * 100}%`;
}
export function applyJobFeedback(el: HTMLElement, f: ReturnType<typeof jobFeedback>) {
  for (const [selector, text] of [['.job-state',f.stateText],['.job-running',f.runningText],['.job-blocked',f.blockedText],['.state-charge',f.chargeText]]) {
    const node = el.querySelector(selector); if (node) node.textContent = text;
  }
}
