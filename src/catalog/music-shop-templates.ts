import type {SiteTemplate} from './types.js';
export const MUSIC_SHOP_TEMPLATES:SiteTemplate[]=[{
 id:'site_bandcamp',name:'Bandcamp風（応援と購入の分岐）',faction:'musicshop',
 pageName:'window sessions / Maps Without Folds',address:'archive://templates/direct-music-shop',
 hp:440,fee:0,reward:0,admin:[],status:'experimental',
 tip:'1枚のクーポン収益を応援かカートの片方へ。初期配置はシールドに使い、クーポンを右上へ移すとカート攻撃へ切り替わる。音楽自体は動画広告の収益を生まない。合成材料込み$31・CPU10の配置教材。',
 loot:['sc_track','am_coupon','am_cart'],
 inspiredBy:'Bandcampのアーティスト別アルバムページ、正方形のジャケット、曲目、購入欄、支援者や制作クレジットを参考にした架空の音楽店。作品・作り手・支援者・アートは独自の表示用データで、公式サービスとは無関係。',
 references:['https://fourtet.bandcamp.com/album/three','https://get.bandcamp.help/en/articles/15263106-bandcamp-design-tutorial','https://bandcamp.com/artists','https://get.bandcamp.help/en/articles/15263068-how-do-i-set-up-a-discount-code'],
 counterplay:'回復・貫通・キャッシュ・再発動はない。応援上限では$6まで貯め、余剰をカートに横流ししない。初期カートは変換せず3部品ボーナスに参加するが、応援専用なら安く軽い星評価に交換できる。これは切り替えを学ぶ配置で、最適化済みの完成ビルドではない。クーポンの戦闘収益はゲーム上の抽象化。',
 layout:[
  ['sc_track',24,144,500,104,null,'01 Maps Without Folds / Original demo'],
  ['am_buy',24,328,168,40,null,'アルバムをカートに'],['am_coupon',24,380,280,36],
  ['yt_tip',24,428,224,44,null,'この作品を応援する'],['am_cart',328,360,280,100],
 ],
 decor:[['musicshop-banner',24,0,912,64],['musicshop-album-title',24,80,584,52],['musicshop-track-list',24,264,584,40],['musicshop-purchase-label',24,308,168,16],['musicshop-cover',648,80,288,288],['musicshop-supporters',648,384,288,40],['musicshop-artist',648,440,288,112],['musicshop-support-note',24,480,280,76],['musicshop-cart-note',328,480,280,76],['musicshop-credits',24,580,584,76],['musicshop-local-note',648,580,288,76]],
}];
