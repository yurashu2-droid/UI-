import type {SiteTemplate} from './types.js';

export const RELEASE_TEMPLATES:SiteTemplate[]=[{
  id:'site_github_releases',name:'GitHub Releases風（配布ファイル）',faction:'forge',
  pageName:'patch.garden / ui-garden Releases',address:'archive://templates/releases',
  hp:440,fee:0,reward:0,admin:[],status:'experimental',
  tip:'ZIPの大きな通常転送、原本を待つコミット履歴、ZIPだけを守るキャッシュ、離して置いた半貫通PDF。4部品・$24・CPU10で、それぞれの待ち時間と役割を見比べる。',
  loot:['gh_transfer','gh_commit','gov_pdf'],
  inspiredBy:'GitHub Releasesのリリース名、タグと日付の欄、リリースノート、Assetsの配布一覧を参考にした架空の公開記録。既存の差分・レビュー型とは別の配置例。公式サービスとは無関係。',
  references:['https://github.com/cli/cli/releases','https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases','https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives'],
  counterplay:'この配置をCPU10以上・追加補正なしで使うと、ZIP初回は4秒、コミットの初回再利用は10.5秒。キャッシュは1回の覆いを防ぐが、再利用用の原本は作らない。PDFは独立した半貫通攻撃。回復・シールド・収益を持たず、速攻への備えが必要。',
  layout:[
    ['gh_commit',216,232,720,44,null,'v1.4.0 の公開内容'],
    ['gh_transfer',216,300,416,112,null,'ui-garden-v1.4.0.zip'],
    ['go_cache',648,300,288,44,null,'保存済みのZIP表示'],
    ['gov_pdf',216,456,320,48,null,'ui-garden-guide.pdf'],
  ],
  decor:[['forge-tabs',24,0,912,44],['release-nav',24,60,912,40],['release-tag',24,128,160,196],['release-title',216,124,720,44],['release-notes',216,176,720,40],['release-assets-heading',216,280,720,16],['release-cache-note',648,356,288,56],['release-pdf-heading',216,424,720,24],['release-pdf-meta',552,456,384,48],['release-disclaimer',216,528,720,56],['release-previous',24,616,912,40]],
}];
