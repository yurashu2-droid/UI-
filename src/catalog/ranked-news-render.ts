/** Fictional ranking chrome. Counts do not vote, subscribe, navigate or change combat. */
export function rankedNewsHeader():string {
 return '<div class="ranked-word"><i aria-hidden="true">r</i><span>rank.garden<small>Hacker News風 · 非公式UIモチーフ</small></span></div><nav>new <span>|</span> past <span>|</span> comments <span>|</span> ask <span>|</span> show</nav><small class="ranked-local">ローカルの表示例</small>';
}
const stats=[[41,12,'mori'],[28,7,'raku'],[19,4,'nagi'],[16,6,'sora'],[13,3,'koma'],[11,5,'fuyu'],[9,24,'nuno'],[6,2,'toki']] as const;
export function rankedNewsDecor(kind:string):string {
 const rank=/^ranked-rank-([1-8])$/.exec(kind),meta=/^ranked-meta-([1-8])$/.exec(kind);
 if(rank)return `<span class="ranked-number">${rank[1]}.</span>`;
 if(meta){const i=Number(meta[1])-1,[points,comments,name]=stats[i];return `<div class="ranked-meta"><span>${points} points by ${name}</span><span>${i+1} hours ago</span><span>|</span><span>${comments} comments</span><small>架空の表示データ</small></div>`;}
 switch(kind){
  case 'ranked-context':return '<div class="ranked-context"><b>小さなWebの話題</b><span>flat list / 今日の固定表示</span><small>順位に追加効果はありません</small></div>';
  case 'ranked-more-note':return '<small class="ranked-more-note">Moreも通常のナビ攻撃。ページ全体の注意を分け合います。</small>';
  case 'ranked-discussion-heading':return '<h3 class="ranked-discussion-heading">選んだ話題のコメント例 <small>元の投稿と出典だけが接続</small></h3>';
  case 'ranked-disclaimer':return '<small class="ranked-disclaimer">記事・得点・アカウントは架空です。投票や外部送信は行いません。下部はゲーム用のコメント例です。</small>';
  default:return '';
 }
}
