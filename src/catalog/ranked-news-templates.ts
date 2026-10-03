import type {SiteTemplate} from './types.js';
const headlines=['余白を残したリンク集を作った','一枚のHTMLで制作日記を続ける','古い端末でも読める天気の窓','道具箱の更新を静かに配る','個人サイトを結ぶ小さな地図','Show Garden: 紙のように軽い検索','Ask Garden: 長く使いたいUIは？','アイコンのない掲示板を試した'];
export const RANKED_NEWS_TEMPLATES:SiteTemplate[]=[{
 id:'site_hacker_news',name:'Hacker News風（順位付きニュースとコメント）',faction:'rankednews',
 pageName:'rank.garden / 小さなWebの話題',address:'archive://templates/ranked-news',
 hp:440,fee:0,reward:0,admin:[],status:'experimental',
 tip:'平たい順位付きリンク8件と、離れたMoreリンク。攻撃するナビゲーションが9個あるため、ページ全体で注意を分け合う。下のコメント例と出典は独立した小さな再発動。11部品・$36・CPU13。',
 loot:['ab_link','rd_post','wk_reference'],
 inspiredBy:'Hacker Newsの小さな橙色のヘッダー、番号付きの記事、得点・投稿者・コメント件数の行、Moreリンクを参考にした架空のニュース一覧。下部のコメント例はゲーム用の構成。公式サービスとは無関係。',
 references:['https://news.ycombinator.com/'],
 counterplay:'Moreは再発動ではなく通常のナビ攻撃。物理的に離しても、9個のナビ攻撃はページ全体の注意を共有する。CPU13以上・追加補正なしの24秒では、More単体の50ダメージに対しページ全体の増分は14。回復・シールド・貫通・収益を持たず、CPU12では負荷も増える。',
 layout:[
  ...headlines.map((title,i)=>['ab_link',72,48+i*44,864,24,null,title] as SiteTemplate['layout'][number]),
  ['ab_nav',72,416,144,24,null,'More / 次の話題'],
  ['rd_post',72,476,760,112,null,'Ask Garden: 長く使いたいUIは？'],
  ['wk_reference',72,596,760,52,null,'この話題の出典・読み返し'],
 ],
 decor:[
  ['ranked-context',24,0,912,32],
  ...headlines.flatMap((_,i)=>[[`ranked-rank-${i+1}`,24,48+i*44,40,24],[`ranked-meta-${i+1}`,72,72+i*44,864,16]] as SiteTemplate['decor']),
  ['ranked-more-note',232,416,704,24],['ranked-discussion-heading',72,452,864,20],['ranked-disclaimer',24,656,912,20],
 ],
}];
