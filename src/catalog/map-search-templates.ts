import type {SiteTemplate} from './types.js';
export const MAP_SEARCH_TEMPLATES:SiteTemplate[]=[{
 id:'site_google_maps',name:'Google Maps風（検索欄と架空の街）',faction:'mapsearch',
 pageName:'まちさがし / 小庭の街',address:'archive://templates/fictional-map',
 hp:440,fee:0,reward:0,admin:[],status:'experimental',
 tip:'左の検索欄では近くのスターとエリアリンクだけが異系統加算を作る。地図上の3つのリンクは離れているため、左の文字強化もナビ列の加速も届かない。11部品・$48・CPU19。',
 loot:['go_search','go_result','ab_link'],
 inspiredBy:'Google Mapsの検索欄と結果のサイドパネル、地図上に分かれて表示される場所、保存した場所の操作を参考にした架空の街。道路や施設は独自の固定図で、公式サービスとは無関係。',
 references:['https://support.google.com/maps/answer/3092445?hl=en','https://support.google.com/maps/answer/4610185?co=GENIE.Platform%3DDesktop&hl=en'],
 counterplay:'分散したリンクに隠れた防御効果はない。文字強化やナビ列の接続を捨てる代わりに、局所接続とページ全体の補正の違いを見比べる配置。旧式UIの加速と最初の2リンクの余白加算は全体で共有する。回復・貫通・収益はなく、初期CPU12では負荷1.35倍となる。',
 layout:[
  ['go_search',24,24,216,44,null,'小庭の街を探す'],['go_voice',240,24,48,44],
  ['tw_favorite',24,76,128,32,null,'お気に入り'],['ab_link',160,76,128,32,null,'小庭エリア'],
  ['go_result',24,172,264,96,null,'路地の書店'],['gov_font',24,284,264,36],
  ['go_result',24,336,264,96,null,'橋の喫茶室'],['go_result',24,480,264,96,null,'庭の工房'],
  ['ab_link',392,184,184,32,null,'路地の書店'],['ab_link',728,344,184,32,null,'橋の喫茶室'],['ab_link',472,536,192,32,null,'庭の工房'],
 ],
 decor:[
  ['map-rail-heading',24,128,264,32],['map-result-a-meta',24,272,264,12],['map-result-b-meta',24,440,264,20],['map-result-c-meta',24,584,264,24],['map-rail-note',24,624,264,40],
  ['map-area-title',336,24,576,40],['map-marker-a',360,184,24,32],['map-place-a-note',392,224,184,32],['map-marker-b',696,344,24,32],['map-place-b-note',728,384,184,32],['map-marker-c',440,536,24,32],['map-place-c-note',472,576,192,32],
  ['map-park',616,96,200,56],['map-river',616,280,80,28],['map-street',348,436,200,32],['map-legend',336,632,600,32],
 ],
}];
