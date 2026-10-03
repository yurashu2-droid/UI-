import type { SiteTemplate } from './types.js';

export const TIME_MEDIA_TEMPLATES: SiteTemplate[] = [
  {
    id:'site_wayback',name:'Wayback Machine風（保存記録）',faction:'webarchive',
    pageName:'revisit. / 小さなWebの保存記録',address:'archive://templates/saved-web',
    hp:440,fee:0,reward:0,admin:['backup'],status:'experimental',
    tip:'保存日のタイムラインとカレンダーの下に、キャッシュで保護したPDFと記事を並べる。本文を脚注とページ送りで読み返す。',
    loot:['go_cache','gov_pdf','wk_reference'],
    inspiredBy:'Wayback Machineの保存回数グラフ、日付のカレンダー、過去のページをたどる操作を参考にした架空の保存画面。公式サービスとは無関係。',
    references:['https://archivesupport.zendesk.com/hc/en-us/articles/360004651732-Using-The-Wayback-Machine'],
    counterplay:'キャッシュが守るのは隣のPDFだけ。記事の再発動は原本を待ち、直接攻撃や継続的な妨害まで無効にはできない。保存日や件数は演出用の架空データ。',
    layout:[
      ['go_search',24,20,664,44,null,'archive.invalid/small-web'],['gov_submit',688,20,248,44,null,'保存記録を探す'],
      ['go_cache',312,168,288,40,null,'保存済みの表示を使う'],['gov_pdf',312,216,624,48,null,'小さなWebの記録.pdf'],
      ['wk_article',312,288,624,140,null,'あのページに、何があったか'],['wk_reference',312,440,624,52,null,'当時の記録を参照する'],
      ['go_page',24,400,264,36],['ab_guestbook',24,468,264,132],
    ],
    decor:[['archive-history',24,84,912,68],['archive-date',24,176,264,40],['archive-calendar',24,236,264,140],['archive-caption',312,520,624,80],['archive-disclaimer',24,628,912,28]],
  },
  {
    id:'site_twitch',name:'Twitch風（ライブチャンネル）',faction:'livechannel',
    pageName:'sidecast / 今日もページを作る',address:'archive://templates/live-channel',
    hp:440,fee:0,reward:0,admin:['moderator'],status:'experimental',
    tip:'中央のライブ動画と右の会話欄。動画の広告と会員収益を応援ボタンに集めて、カート火力ではなくシールドへ使う。',
    loot:['yt_sub','rd_thread','yt_ad'],
    inspiredBy:'Twitchのチャンネル一覧、中央プレイヤー、配信情報、右側のチャット、フォローと会員ボタンを参考にした架空の配信ページ。公式サービスとは無関係。',
    references:['https://help.twitch.tv/s/article/a-tour-of-your-channel-page'],
    counterplay:'応援へ配分した収益はカートに二重使用できない。動画への依存が大きく、会話欄の面積とCPUも必要。会員の離脱維持効果は広告・会員実験を選んだ時だけ。',
    layout:[
      ['yt_play',96,48,488,270],['yt_progress',96,318,488,22],
      ['yt_speed',96,340,104,40],['yt_autoplay',200,340,176,40],['yt_caption',376,340,88,40],['yt_notify',464,340,72,40],
      ['yt_ad',96,392,256,64,null,'配信を、ちょっと応援。'],['yt_sub',364,392,220,40],['yt_tip',364,444,220,44],
      ['rd_thread',608,16,328,328,null,'配信の会話'],['rd_post',624,70,296,128,null,'この組み合わせ、動くところを見たい！'],
      ['ab_link',624,218,296,32,null,'今日の制作メモを読む'],['wk_reference',624,274,296,52,null,'会話から参照したページ'],
    ],
    decor:[['live-channel-rail',16,16,64,628],['live-title',96,0,488,36],['live-broadcast',96,518,488,76],['live-about',96,612,488,44],['live-chat-note',624,350,296,140],['live-chat-footer',608,564,328,80]],
  },
];
