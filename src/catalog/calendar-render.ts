/** Fixed original calendar chrome. It never creates dates, timers or service actions. */
export function calendarHeader(): string {
  return '<div class="calendar-word"><i aria-hidden="true">w</i><span>WEEKGRID<small>Google Calendar風 · 非公式UIモチーフ</small></span></div><span class="calendar-header-caption">小さなWebをめぐる3日間</span><span class="calendar-header-local">架空のカスタム表示 · 予定は固定</span>';
}

function day(name: string, date: string, selected = false): string {
  return `<div class="calendar-day${selected ? " is-example-day" : ""}"><span>${name}</span><b>${date}</b><small>固定の見本</small></div>`;
}

function event(title: string, detail: string, color: string, body = ""): string {
  return `<section class="calendar-event calendar-${color}"><b>${title}</b><small>${detail}</small>${body ? `<p>${body}</p>` : ""}</section>`;
}

export function calendarDecor(kind: string): string {
  switch (kind) {
    case "calendar-toolbar": return '<div class="calendar-toolbar"><span class="calendar-today">今日</span><span class="calendar-date-arrows" aria-hidden="true">‹　›</span><h1>2026年10月</h1><span class="calendar-view">カスタム · 3日間 <i aria-hidden="true">⌄</i></span><small>日付操作は固定表示</small></div>';
    case "calendar-mini-month": {
      const dates = ["", "", "", ...Array.from({ length: 31 }, (_, i) => String(i + 1)), ""];
      return `<aside class="calendar-mini-month"><h2>2026年10月 <span aria-hidden="true">‹　›</span></h2><div class="calendar-month-weekdays">${["月", "火", "水", "木", "金", "土", "日"].map(d => `<span>${d}</span>`).join("")}</div><div class="calendar-month-dates">${dates.map(d => `<span${d === "5" ? ' class="is-example-day"' : ["6", "7"].includes(d) ? ' class="in-example-range"' : ""}>${d}</span>`).join("")}</div><p>選択日は固定の見本です</p></aside>`;
    }
    case "calendar-list": return '<aside class="calendar-list"><h2>カレンダー <small>固定表示</small></h2><p><i class="calendar-swatch-blue" aria-hidden="true"></i>ページづくり</p><p><i class="calendar-swatch-green" aria-hidden="true"></i>読みものと寄り道</p></aside>';
    case "calendar-bell-title": return '<h2 class="calendar-bell-title">通知ベル <small>ゲーム内UI</small></h2>';
    case "calendar-bell-note": return '<p class="calendar-bell-note">初期配置の見本：<br>ベルは基礎間隔4秒・シールド5。<br>近くに動画で+2。速度補正あり。<br>未配置では発動しません。<br>切替は表示のみ・端末への通知なし。</p>';
    case "calendar-day-mon": return day("月曜日", "5", true);
    case "calendar-day-tue": return day("火曜日", "6");
    case "calendar-day-wed": return day("水曜日", "7");
    case "calendar-all-day-label": return '<span class="calendar-all-day-label">終日</span>';
    case "calendar-all-day": return '<div class="calendar-all-day"><b>小さなWebをめぐる3日間</b><span>固定の予定見本 · 時刻による効果なし</span></div>';
    case "calendar-event-search": return event("資料の入口を探す", "月曜の予定見本 · 下は検索UI", "blue");
    case "calendar-event-wish": return event("気になるページを残す", "火曜の予定見本 · 回復UIを左右へ", "peach");
    case "calendar-event-lucky": return event("まだ知らないページへ", "水曜の予定見本 · 下はLucky", "violet");
    case "calendar-event-note": return event("制作ノートをひらく", "10:30–11:30 · 固定表示のみ", "green", "余白のあるページを眺めて、<br>好きな形をひとつ書き留める。");
    case "calendar-event-review": return event("画面を並べてみる", "10:45–11:30 · 固定表示のみ", "blue", "曜日の境界は、ゲームの親枠ではありません。");
    case "calendar-event-reading": return event("読みものの時間", "11:45–12:30 · 固定表示のみ", "peach", "上の空き場所へ回復UIを離すと未接続。<br>予定を重ねても、時間の補正はありません。");
    case "calendar-hour-09": case "calendar-hour-10": case "calendar-hour-11": case "calendar-hour-12": case "calendar-hour-13": return `<span class="calendar-hour">${kind.slice(-2)}:00</span>`;
    case "calendar-lesson": return '<section class="calendar-lesson"><b>同じ回復ボタンを、どちらへつなぐ？</b><span>4 UI / $20 / CPU 8</span><p>右：WishとLuckyが12%加速。左：検索に別系統+2、その後フォームで威力+30%。<br>回復はどちらも1回5。序盤の手数・回復と、長めの検索火力を交換します。<br>中央下へ離せば未接続。曜日・時刻・色の帯に、内包や時間のボーナスはありません。</p></section>';
    case "calendar-local-note": return '<p class="calendar-local-note">予定・日時・カレンダー名は固定の創作表示。予定の保存・予約・外部カレンダーとの同期は行いません。検索やボタンは既存のページ内プレビューです。</p>';
    default: return "";
  }
}
