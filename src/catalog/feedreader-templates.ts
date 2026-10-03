import type {SiteTemplate} from './types.js';

export const FEEDREADER_TEMPLATES:SiteTemplate[]=[{
  id:'site_google_reader',name:'Google Reader風（購読欄と展開表示）',faction:'feedreader',
  pageName:'feedroom / 小さなWebの購読箱',address:'archive://templates/expanded-feed-reader',
  hp:440,fee:0,reward:0,admin:['cdn'],status:'experimental',
  tip:'検索の隣にある「すべて」とスターだけが、別サイト2系統分の加算を作る。記事→出典と差分→ページ送りは、それぞれ独立した読み返し。未読数は表示用で、新しいRSSルールはない。',
  loot:['go_search','wk_article','tw_favorite'],
  inspiredBy:'Google Readerの左側の購読欄、フォルダ、未読表示、複数記事の展開表示を参考にした架空のフィードリーダー。公式サービスとは無関係。',
  references:['https://googlereader.blogspot.com/2006/09/something-looks-different.html','https://googlereader.blogspot.com/2006/10/we-made-it-little-bit-better.html'],
  counterplay:'UI自体は回復・貫通・キャッシュ保護を持たない。元の攻撃を外したり覆ったりすると、その出典やページ送りは別の記事へ自動で乗り換えない。この配置をCPU19以上・追加補正なしで使うと、ページ送りは最初に原本を待ち、初回の再現は8.25秒。',
  layout:[
    ['go_search',248,48,432,44,null,'登録フィードを検索'],['go_tabs',248,96,432,32],
    ['ab_link',24,52,216,32,null,'すべてのアイテム'],['tw_favorite',688,52,224,32,null,'スター付きアイテム'],
    ['ab_link',24,168,192,32,null,'小さなWeb日報'],['ab_link',24,208,192,32,null,'庭の制作ノート'],['ab_link',24,248,192,32,null,'道具箱の更新'],
    ['wk_article',248,164,688,140,null,'小さなWeb日報：接続は余白から'],['wk_reference',248,308,688,52,null,'出典：小さなWeb日報'],
    ['gh_diff',248,392,688,172,null,'道具箱の更新 / src/page.ts'],['go_page',248,584,320,36],
  ],
  decor:[['reader-title',24,0,912,36],['reader-subscription-heading',24,128,192,24],['reader-view-heading',248,136,688,24],['reader-second-meta',248,368,688,20],['reader-subscriptions',24,296,192,264],['reader-disclaimer',24,636,912,28]],
}];
