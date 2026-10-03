import type {SiteTemplate} from './types.js';

export const AUDIO_TEMPLATES:SiteTemplate[]=[{
  id:'site_soundcloud',name:'SoundCloud風（波形とリポスト）',faction:'audio',
  pageName:'wave.note / window sessions',address:'archive://templates/waveform-audio',
  hp:440,fee:0,reward:0,admin:['sns'],status:'experimental',
  tip:'波形プレイヤーの下にリポスト・いいね・フォローを並べる。音声の通常発動をリポストが再現し、別サイトの操作が会話と防御を支える。',
  loot:['sc_track','tw_retweet','tw_favorite'],
  inspiredBy:'SoundCloudの波形、再生ボタン、トラック一覧、リポストと時間に結び付いたコメントの慣習を参考にした架空の音声ページ。公式サービスとは無関係。',
  references:['https://help.soundcloud.com/hc/en-us/articles/115003567488-Reposting-tracks-or-playlists','https://developers.soundcloud.com/blog/wave-raid/'],
  counterplay:'文字や動画専用の強化を使えず、成長の上限は控えめ。リンクや購入ボタンよりCPU・面積を使う。429への優位は無強化の小ヒット比較に限られ、支援済み文字攻撃への万能な対策ではない。',
  layout:[
    ['sc_track',24,148,592,136,null,'夜のインターネット / Original demo'],
    ['tw_retweet',24,284,128,32,null,'リポスト'],['tw_favorite',152,284,128,32,null,'いいね'],['tw_follow',280,284,132,32,null,'フォロー'],
    ['sc_track',24,356,592,136,null,'雨の日のブラウザ / Original demo'],
    ['tw_retweet',24,492,128,32,null,'リポスト'],['x_bookmark',152,492,144,36,null,'保存する'],
  ],
  decor:[['audio-profile',24,0,912,104],['audio-tabs',24,112,592,24],['audio-makers',648,136,288,160],['audio-notes',648,320,288,172],['audio-connections',648,516,288,124],['audio-comments',24,552,592,88]],
}];
