import { AUDIENCE_RULES } from '../audience-experiment.js';

interface AudienceSnapshot {
  loyalty: number;
  loyaltyExpiresAt: number;
  churn: number;
  retained: number;
  eligibleViews: number;
}
const number = (value: number) => String(Math.round(value * 100) / 100);

/** Deliberately absent from canonical battles: these are experimental visitor-HP, not people. */
export function audienceFeedback(snapshot: AudienceSnapshot | null | undefined, elapsed: number) {
  if (!snapshot) return null;
  const expiry = Math.max(0, snapshot.loyaltyExpiresAt - elapsed);
  const membership = `会員・ページ共有 ${number(snapshot.loyalty)} / ${AUDIENCE_RULES.loyaltyCapacity} · ${snapshot.loyalty > 0 ? `あと${expiry.toFixed(1)}秒` : '受付中'}`;
  return {
    membership,
    summary: `広告・会員の実験 · 離脱 ${number(snapshot.churn)} · 維持 ${number(snapshot.retained)} 閲覧者HP`,
    explanation: `自然再生3回で$${AUDIENCE_RULES.membershipIncome}と会員枠${AUDIENCE_RULES.loyaltyPerMembership}。枠はページ共有・上限${AUDIENCE_RULES.loyaltyCapacity}・更新から10秒。相手の攻撃によるシールド通過後の通常損失の25%までを防ぎ、貫通・過負荷・広告の自己離脱には使わない。広告の過密表示は自分の閲覧者HPを失う。`,
  };
}

export function applyAudienceFeedback(frame: HTMLElement, snapshot: AudienceSnapshot | null | undefined, elapsed: number) {
  const view = audienceFeedback(snapshot, elapsed);
  let meter = frame.querySelector<HTMLElement>(':scope > .audience-experiment-meter');
  if (!view) { meter?.remove(); return; }
  if (!meter) {
    meter = frame.ownerDocument.createElement('aside');
    meter.className = 'audience-experiment-meter';
    meter.setAttribute('aria-label', '実験中の広告負担と会員維持');
    frame.insertBefore(meter, frame.querySelector(':scope > .frame-viewport'));
  }
  meter.textContent = `${view.summary} ｜ ${view.membership}`;
  meter.title = view.explanation;
}
