import type {SiteTemplate} from './types.js';
export const PERSONAL_WEB_TEMPLATES:SiteTemplate[]=[{
 id:'site_geocities',name:'GeoCities風（カウンターと掲示板）',faction:'personalweb',
 pageName:'ほしのアトリエ / 小さな個人ホームページ',address:'archive://templates/personal-homepage',
 hp:440,fee:0,reward:0,admin:[],status:'experimental',
 tip:'標準サイズのカウンターが、3つのリンクと掲示板の通常発動を数える。掲示板との合成は回復を増やし、CPUと場所を空ける。8部品・$30・CPU12の個人ホームページ。',
 loot:['ab_counter','ab_guestbook','ab_link'],
 inspiredBy:'GeoCities時代の個人ホームページに見られる中央寄せの見出し、訪問カウンター、掲示板、工事中表示、ウェブリングを参考にした現在の架空ページ。歴史上の画面の複製ではなく、公式サービスとは無関係。',
 references:['https://www.oocities.org/BourbonStreet/3785/','https://art.teleportacia.org/observation/vernacular/','https://blog.geocities.institute/archives/4399'],
 counterplay:'この単独配置ではブログ合成で回復とCPUが改善し、攻撃力は下がらない。近くにカートを追加すると、カウンター収益の減少が変換火力にも響く。逆にカウンターを下へ移すと合成で収益が増えるため、損得は配置次第。ラボの収益はラン資金にはならず、貫通・キャッシュ保護もない。',
 layout:[
  ['ab_heading',192,24,576,56,null,'ほしのアトリエ'],['ab_hr',192,208,576,16],
  ['ab_link',192,232,192,32,null,'作品のへや'],['ab_link',384,232,192,32,null,'制作日記'],['ab_link',576,232,192,32,null,'おともだちリンク'],
  ['ab_counter',336,286,288,26],['ab_guestbook',320,336,320,132],['ab_mail',368,514,224,32,null,'感想をメールで'],
 ],
 decor:[['personal-intro',192,96,576,56],['personal-update',192,168,576,24],['personal-bbs-note',320,484,320,20],['personal-construction',352,568,256,32],['personal-webring',192,616,576,32],['personal-disclaimer',192,656,576,20]],
}];
