import type { SiteTemplate } from './types.js';

/** Template-only batch: new page structures, no new combat IDs or shop entries. */
export const DISCOVERY_TEMPLATES: SiteTemplate[] = [
  {
    id: 'site_yahoo_portal', name: 'Yahoo! JAPAN風（総合ポータル）', faction: 'portal',
    pageName: 'まどぐち! / 今日の小さなWeb', address: 'archive://templates/daily-portal',
    hp: 440, fee: 0, reward: 0, admin: ['sns'], status: 'experimental',
    tip: '検索窓と行政の送信ボタンを連結し、ニュースの青いリンクから各サービスへ。既存のUIで総合ポータルを組み直す。',
    loot: ['go_search', 'ab_link', 'gov_notice'],
    inspiredBy: 'Yahoo! JAPANの検索・ニュース・天気・サービス一覧が並ぶ総合ポータルを参考にした架空のページ。公式サービスとは無関係。',
    references: ['https://www.lycorp.co.jp/ja/service/', 'https://www.lycbiz.com/sites/default/files/media/jp/download/LY_Corporation_MediaGuide.pdf'],
    counterplay: '軽い文字導線が多く、重い貫通攻撃は持たない。広告の収益はそのまま攻撃にならず、変換UIを足すならニュースの面積を譲る必要がある。',
    layout: [
      ['go_search',232,16,488,44,null,'今日のWebを探す'], ['gov_submit',720,16,216,44,null,'ウェブ検索'],
      ['go_tabs',232,64,704,40],
      ['ab_link',232,180,432,32,null,'小さなページがつないだ、大きな輪'],
      ['ab_link',232,212,432,32,null,'旧式リンク、今も現役の理由'],
      ['ab_link',232,244,432,32,null,'動画の下に、別のサイトのボタン'],
      ['ab_link',232,276,432,32,null,'本日のおすすめ：余白のある設計'],
      ['ab_link',232,308,432,32,null,'みんなの制作記録を公開中'],
      ['gov_notice',232,360,432,60,null,'お知らせ：これは架空のニュースです'],
      ['go_result',232,446,432,96,null,'いろいろな時代のWebを集めよう'],
      ['go_ads',232,554,432,84,null,'小さなページ制作キット'],
    ],
    decor: [
      ['portal-services',24,16,184,534], ['portal-news',232,128,432,40],
      ['portal-weather',688,128,248,140], ['portal-account',688,292,248,116],
      ['portal-shopping',688,432,248,206], ['portal-footnote',24,570,184,68],
    ],
  },
  {
    id: 'site_steam_store', name: 'Steam風（ゲーム商品ページ）', faction: 'storefront',
    pageName: 'playfoundry / WINDOW GARDEN', address: 'archive://templates/game-store',
    hp: 440, fee: 0, reward: 0, admin: ['adnet'], status: 'experimental',
    tip: '大きな動画プレビューの隣に紹介と広告、下には購入とウィッシュリスト。広告を隣のカートへ送り、別サイトのUIでゲームの販売ページを作る。',
    loot: ['yt_play', 'am_buy', 'am_wish'],
    inspiredBy: 'Steamの商品ページにある動画・紹介・購入・レビュー・ウィッシュリストの配置を参考にした架空のストア。公式サービスとは無関係。',
    references: ['https://partner.steamgames.com/doc/store/page', 'https://partner.steamgames.com/doc/store/assets'],
    counterplay: '大型の動画と広告収益に面積を使う。広告はカートへ一度だけ配分され、動画の停止や回復を上回る速攻に対する守りは薄い。',
    layout: [
      ['yt_play',24,80,592,333], ['yt_progress',24,413,592,22],
      ['yt_speed',24,435,104,40], ['yt_autoplay',128,435,176,40], ['yt_caption',304,435,88,40],
      ['yt_ad',640,316,296,80,null,'小さなゲーム、見つけよう。'],
      ['am_cart',640,408,296,100], ['am_coupon',640,520,296,36],
      ['am_buy',24,500,336,44,null,'このゲームをカートに入れる'],
      ['am_wish',360,500,256,44,null,'ウィッシュリストに追加'],
      ['am_rating',24,544,592,24], ['am_deal',24,568,344,52],
    ],
    decor: [
      ['store-title',24,0,912,64], ['store-description',640,80,296,212],
      ['store-gallery',400,580,216,60], ['store-languages',640,580,296,60],
    ],
  },
];
