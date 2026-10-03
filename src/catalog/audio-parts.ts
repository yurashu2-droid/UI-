import type {PartDefinition} from '../types.js';

/** A compact, flat ordinary packet with intentionally limited video/text scaling. */
export const AUDIO_PARTS:Record<string,PartDefinition>={
  sc_track:{
    id:'sc_track',name:'波形プレイヤー',faction:'audio',kind:'attack',tags:['audio','media'],layout:'audio-player',
    w:500,h:104,cd:3,value:10,load:2,price:4,
    desc:'3秒ごとに10ダメージ。動画より小さく軽いが、動画専用2×・字幕・広告・会員収益や文字強化は受けない。リポストと出典は通常発動後の音声を再現でき、アクセスカウンターなど汎用連携は使える。実音声は再生しない。',
    added:true,status:'experimental',minW:256,minH:88,maxW:880,maxH:240,
  },
};
