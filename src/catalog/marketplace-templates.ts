import type {SiteTemplate} from './types.js';

export const MARKETPLACE_TEMPLATES:SiteTemplate[]=[{
  id:'site_rakuten',name:'楽天市場風（買い物と作り手の応援）',faction:'marketplace',
  pageName:'こみち市場 / 小さなWebの道具市',address:'archive://templates/two-lane-marketplace',
  hp:440,fee:0,reward:0,admin:['cdn'],status:'experimental',
  tip:'左のクーポンはカート攻撃へ、右のタイムセールは応援シールドへ。各収益の変換先は一つだが、累計収益と購入の成長はページ共有。戦闘後、左の購入とカートが1-Clickへ統合されてもクーポン接続は残る。',
  loot:['am_product','am_coupon','am_deal'],
  inspiredBy:'楽天市場の赤い買い物見出し、ジャンル欄、キャンペーン帯、商品とレビューの並び、ランキングを参考にした架空のショッピングモール。公式サービスとは無関係。',
  references:['https://www.rakuten.co.jp/','https://ranking.rakuten.co.jp/genre/'],
  counterplay:'合成材料込み$80・CPU30の完成例。応援には購入ボタンとメンバー登録の合成が必要で、無料取得ではない。回復・貫通・キャッシュはなく、二列の面積も使う。左が1-Clickへ統合されるとCPU28になり、カート跡が空く。応援を追加カートへ替えると防御を手放す。',
  layout:[
    ['go_search',224,16,528,44,null,'小さなWebの道具を探す'],['gov_submit',752,16,184,44],
    ['ab_link',24,176,168,32,null,'道具・ステーショナリー'],['ab_link',24,208,168,32,null,'暮らしの小さな箱'],['ab_link',24,240,168,32,null,'ページづくりの贈り物'],
    ['am_product',224,176,328,196,null,'ページ工房の道具セット'],['am_buy',224,372,328,40],['am_rating',224,412,328,24],['am_coupon',224,436,328,36],['am_cart',224,484,328,100],
    ['am_product',608,176,328,196,null,'作り手の小さな道具箱'],['am_buy',608,372,328,40],['am_rating',608,412,328,24],['am_deal',608,436,328,52],['yt_tip',608,504,328,44],
  ],
  decor:[['mall-brand',24,16,176,44],['mall-campaign',224,80,712,64],['mall-category-heading',24,112,168,48],['mall-category-list',24,292,168,256],['mall-ranking',224,608,712,48],['mall-disclaimer',24,576,168,80],['mall-support-note',608,560,328,32]],
}];
