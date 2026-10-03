import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFragment} from 'parse5';
import C from '../src/document.js';
import D from '../src/data.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import V from '../src/components.js';
import {resources,acquisitionValue} from '../src/buildlab.js';
import {SERVICE_FORM_TEMPLATES} from '../src/catalog/service-form-templates.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
import {serviceFormHeader,serviceFormDecor} from '../src/catalog/service-form-render.js';
import {previewCatalogueAction} from '../src/catalog/preview.js';

const t=SERVICE_FORM_TEMPLATES[0];
const clone=x=>JSON.parse(JSON.stringify(x));
// Exercise the registered lab preset, including its persisted theme and template.
const saved=()=>clone(R.newRun('lab','site_govuk'));
const byType=(run,type)=>run.owned.find(p=>p.type===type);
const res=run=>resources(run.owned.filter(C.placed).map(p=>[p.type,p.x,p.y,p.w,p.h]));
const ownedValue=run=>run.owned.reduce((sum,p)=>sum+acquisitionValue(p.type),0);
function simulate(run){
 const b=new E.Battle(run.owned,[C.makeItem('ab_link','enemy',24,24)],{playerHp:10000,enemyHp:10000,playerCapacity:12,enemyCapacity:12});b.player.hp=9000;
 for(let i=0;i<480;i++)b.step(.05);return b;
}
const measure=b=>[b.metrics.player.hpDamage,b.metrics.player.shielding,b.metrics.player.healing,b.player.income];
const overlaps=(a,b)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
function walk(n,visit){visit(n);for(const child of n.childNodes??[])walk(child,visit);}
const text=n=>(n.childNodes??[]).map(c=>c.value??(c.tagName==='br'?'\n':text(c))).join('');

test('QA: service-form exact rectangles and native containment leave all inert chrome unobscured',()=>{
 const run=saved(),info=E.analyze(run.owned),form=byType(run,'gov_form'),check=byType(run,'gov_check'),submit=byType(run,'gov_submit');
 assert.equal(R.validateRun(run),true);assert.deepEqual([res(run).acquisitionValue,res(run).load,res(run).parts,res(run).legal],[29,12,6,true]);
 assert.equal(Object.values(D.PARTS).some(p=>p.faction==='serviceform'),false);
 for(const [i,p]of run.owned.entries()){assert.deepEqual([p.x,p.y,p.w,p.h],t.layout[i].slice(1,5));assert.ok(C.canPlace(run.owned,p,p.x,p.y,p.w,p.h));assert.equal(D.PARTS[p.type].faction,'gov');}
 assert.deepEqual(C.inner(form),{x:40,y:328,w:568,h:140});assert.deepEqual(info.parents,{[check.id]:form.id,[submit.id]:form.id});assert.deepEqual(info.groups,[]);
 assert.equal(info.mods[form.id].speed,1);assert.equal(info.mods[check.id].speed,1.2);assert.equal(info.mods[submit.id].speed,1.2);
 for(const[k,x,y,w,h]of t.decor){assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=960&&y+h<=680,k);for(const p of run.owned)assert.equal(overlaps([x,y,w,h],[p.x,p.y,p.w,p.h]),false,k);}
 for(let i=0;i<t.decor.length;i++)for(let j=i+1;j<t.decor.length;j++)assert.equal(overlaps(t.decor[i].slice(1),t.decor[j].slice(1)),false,`${t.decor[i][0]} / ${t.decor[j][0]}`);
});

test('QA: real form fusion, saved provenance, parent storage and child redeployment preserve all paid ownership without refunds',()=>{
 let run=saved();const cash=run.cash,initialFootprint=res(run).footprint,formId=byType(run,'gov_form').id,check=byType(run,'gov_check'),submit=byType(run,'gov_submit');
 const refs=[{appearanceId:`appearance_${'a'.repeat(64)}`,provenanceId:`capture_${'b'.repeat(64)}`},{appearanceId:`appearance_${'c'.repeat(64)}`,provenanceId:`capture_${'d'.repeat(64)}`}];
 Object.assign(check,refs[0]);Object.assign(submit,refs[1]);assert.equal(R.validateRun(run),true);
 assert.equal(R.fuse(run).length,1);const fusedId=byType(run,'gov_onestop').id;
 assert.deepEqual(byType(run,'gov_onestop').lineage,refs);assert.deepEqual([byType(run,'gov_onestop').x,byType(run,'gov_onestop').y,byType(run,'gov_onestop').w,byType(run,'gov_onestop').h],[40,392,184,40]);
 assert.ok(!run.owned.some(p=>p.id===check.id||p.id===submit.id));assert.equal(run.owned.length,5);assert.equal(ownedValue(run),29);assert.equal(res(run).footprint,initialFootprint);assert.equal(res(run).load,11);
 assert.ok(C.canPlace(run.owned,check,check.x,check.y,check.w,check.h),'the checkbox rectangle is usable inside the still-occupied parent');
 const afterFusion=JSON.stringify(run);assert.deepEqual(R.fuse(run),[]);assert.equal(JSON.stringify(run),afterFusion);
 run=clone(run);assert.equal(R.validateRun(run),true);assert.equal(R.move(run,formId,null,null),true);run=clone(run);
 assert.equal(R.validateRun(run),true);assert.deepEqual(run.owned.filter(p=>!C.placed(p)).map(p=>p.id).sort(),[formId,fusedId].sort());assert.equal(res(run).load,6);assert.equal(ownedValue(run),29);assert.equal(run.cash,cash);
 assert.equal(R.move(run,fusedId,40,392),true);run=clone(run);assert.equal(R.validateRun(run),true);
 assert.deepEqual([res(run).load,res(run).acquisitionValue,ownedValue(run),run.cash],[8,24,29,cash]);assert.equal(run.owned.length,5);assert.deepEqual(byType(run,'gov_onestop').lineage,refs);assert.equal(byType(run,'gov_form').x,null);assert.equal(initialFootprint-res(run).footprint,119840);
 assert.equal(R.move(run,formId,24,272),true);assert.equal(R.validateRun(clone(run)),true);assert.equal(res(run).footprint,initialFootprint);assert.equal(res(run).load,11);assert.equal(E.analyze(run.owned).mods[fusedId].speed,1.2);assert.equal(run.cash,cash);
});

test('QA: service-form opportunity costs are real and ordinary repositioning improves the bare lesson without inventing a build class',()=>{
 const run=saved(),original=simulate(run);assert.deepEqual(measure(original),[132,66,35,6]);R.fuse(run);const contained=simulate(run);assert.deepEqual(measure(contained),[184,42,35,8]);
 const form=byType(run,'gov_form'),fused=byType(run,'gov_onestop'),breadcrumb=byType(run,'gov_breadcrumb');assert.equal(R.move(run,form.id,null,null),true);assert.equal(R.move(run,fused.id,40,392),true);
 const bare=simulate(run);assert.deepEqual(measure(bare),[170,0,35,7]);assert.equal(bare.player.parts.find(p=>p.id===fused.id).speed,1);
 // The source-native top breadcrumb was decorative support at this distance. It remains an ordinary
 // movable support part, rather than a locked template-specific upgrade.
 assert.equal(R.move(run,breadcrumb.id,24,348),true);assert.equal(R.validateRun(clone(run)),true);assert.equal(res(run).load,8);assert.equal(ownedValue(run),29);
 const supported=simulate(run);assert.deepEqual(measure(supported),[184,0,35,8]);assert.equal(supported.player.parts.find(p=>p.id===fused.id).speed,1.15);
 assert.ok(contained.player.parts.find(p=>p.id===fused.id).period<supported.player.parts.find(p=>p.id===fused.id).period);assert.ok(contained.metrics.player.firstImpact<supported.metrics.player.firstImpact,'matching24-second totals do not mean identical clocks or strength');
 for(const b of[original,contained,bare,supported]){assert.equal(b.metrics.player.routed,0);assert.equal(b.metrics.player.spent,0);assert.equal(b.metrics.player.unconverted,b.player.income);assert.equal(b.metrics.player.replays,0);assert.equal(b.player.lag,1);}
 const copy=t.tip+t.counterplay+serviceFormDecor('service-parent-note');assert.match(copy,/20%加速/);assert.match(copy,/手持ちに残/);assert.match(copy,/固定の最適ビルドではない/);
});

test('QA: service form is original inert chrome around escaped native controls with no submission, file or personal-data endpoint',()=>{
 const safe=(n,decor)=>{assert.ok(!['form','script','iframe','object','embed','img','link','audio','video'].includes(n.tagName));if(decor)assert.ok(!['button','input','select','textarea','a'].includes(n.tagName));for(const a of n.attrs??[]){if(a.name==='href'&&a.value==='#')continue;assert.ok(!['href','src','srcset','action','formaction','download','poster'].includes(a.name));assert.ok(!a.name.startsWith('on'));}if(n.tagName==='button')assert.equal(n.attrs.find(a=>a.name==='type')?.value,'button');};
 const chrome=serviceFormHeader()+t.decor.map(([kind])=>serviceFormDecor(kind)).join('');walk(parseFragment(chrome),n=>safe(n,true));assert.match(chrome,/非公式/);assert.match(chrome,/政府・自治体のサービスではありません/);assert.match(chrome,/個人情報の送信は行いません/);
 for(const p of[...saved().owned,C.makeItem('gov_onestop','p100',40,392,184,40)]){assert.equal(V.markup(p,{theme:'serviceform'}),V.markup(p,{theme:'mixed'}));walk(parseFragment(V.markup(p)),n=>safe(n,false));const hostile={...p,label:'<img src="https://invalid.test/" onerror="fetch(1)">'};walk(parseFragment(V.markup(hostile)),n=>safe(n,false));}
 const css=readFileSync(new URL('../src/catalog/service-form.css',import.meta.url),'utf8');assert.doesNotMatch(css,/@import|url\s*\(|\.web-node|\.node-|\.native-/i);
});

test('QA: actual shared submit/PDF preview seam only marks a local fieldset and prevents link navigation',()=>{
 // This executes the shared source callback with fakes; it is not browser evidence.
 const source=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8'),start=source.indexOf('function previewAction(e: MouseEvent)'),end=source.indexOf('/* ---------- Events ---------- */',start);assert.ok(start>=0&&end>start);
 const js=source.slice(start,end).replace('(e: MouseEvent)','(e)').replaceAll('<HTMLElement>','').replace('querySelector("span")!.','querySelector("span").');
 let control,contained=true,accepted=0,pulsed=0,prevented=0;const messages=[],form={classList:{add(value){assert.equal(value,'accepted');accepted++;}}};
 const node={dataset:{id:'p1'},closest(selector){assert.equal(selector,'.node-gov_form');return contained?{querySelector(s){assert.equal(s,'.native-form');return form;}}:null;}};
 class Element{closest(s){return s==='[data-ui]'?control:s==='.browser-paper'?{}:null;}}
 const preview=new Function('Element','preview','battle','storyActive','storySession','fx','previewCatalogueAction','toast','fetch','XMLHttpRequest','navigator','window',js+';return previewAction;')(Element,true,null,false,null,{pulse(){pulsed++;}},previewCatalogueAction,m=>messages.push(m),()=>assert.fail('network'),()=>assert.fail('network'),{sendBeacon(){assert.fail('network');}},{open(){assert.fail('navigation');}});
 const click=()=>preview({target:new Element(),preventDefault(){prevented++;}});
 control={tagName:'BUTTON',dataset:{ui:'submit'},closest(){return node;}};click();assert.equal(accepted,1);contained=false;click();assert.equal(accepted,1);
 control={tagName:'A',dataset:{ui:'download'},closest(){return node;}};click();assert.equal(prevented,1);assert.equal(pulsed,3);assert.deepEqual(messages,['ページ内のプレビューです。外部には移動しません。']);
});

test('QA: service local disclosure keeps a conservative source line budget, pending actual pixel verification',()=>{
 const root=parseFragment(serviceFormDecor('service-local-note')),paragraphs=[];walk(root,n=>{if(n.tagName==='p')paragraphs.push(text(n));});
 assert.equal(paragraphs.length,2);assert.ok(paragraphs.every(p=>p.split('\n').length===2));
 // Source-only estimate: each wide glyph at10px; longest line24 glyphs, not26.
 // Padding/border13 + heading21 + 4*16px text + three10px margins +18px footer =146.
 for(const p of paragraphs)for(const line of p.split('\n'))assert.ok([...line].length<=24,line);
 const box=t.decor.find(([kind])=>kind==='service-local-note');assert.equal(box[3],264);assert.ok(box[4]>=146);assert.ok(box[2]+box[4]<=680);
});

test('QA: service registration preserves every old numeric opponent and restores the real theme, decoration and stashed parent',()=>{
 const oldTemplates=['site_twitter_classic','site_x','site_wikipedia','site_github','site_niconico','site_reddit','site_yahoo_portal','site_steam_store','site_wayback','site_twitch','site_google_docs','site_soundcloud','site_stackoverflow','site_google_reader','site_rakuten','site_github_releases','site_hacker_news','site_google_maps','site_geocities','site_bandcamp'];
 const oldOpponents=['retro','gov','google','amazon','youtube','b_video','b_cart','b_text','b_links','b_fort','b_echo','b_fort_native','b_documents_heavy','b_video_checkout',...oldTemplates];
 assert.deepEqual(SITE_TEMPLATES.slice(0,20).map(p=>p.id),oldTemplates);assert.equal(SITE_TEMPLATES[20],t);assert.deepEqual(R.labEnemies().slice(0,34).map(p=>p.id),oldOpponents);assert.equal(R.labEnemies()[34].id,t.id);
 assert.deepEqual(D.ENEMIES.map(p=>p.id),['retro','gov','google','amazon','youtube']);assert.ok(D.FACTIONS.serviceform);assert.ok(D.PRESETS[t.id]);assert.equal(t.status,'experimental');
 let run=saved();assert.deepEqual(run.page,{name:t.pageName,theme:'serviceform',templateId:t.id});assert.deepEqual(run.admin,[]);assert.equal(R.validateRun(run),true);assert.deepEqual(R.pageDecor(run),t.decor);
 const rect=p=>[p.type,p.x,p.y,p.w,p.h,p.label];assert.deepEqual(run.owned.map(rect),t.layout.map(([type,x,y,w,h,,label])=>[type,x,y,w,h,label??'']));
 for(let stage=0;stage<oldOpponents.length;stage++){run.stage=stage;assert.equal(R.validateRun(clone(run)),true);assert.equal(R.opponent(run).id,oldOpponents[stage]);}
 run.stage=34;run=clone(run);assert.equal(R.validateRun(run),true);assert.equal(R.opponent(run).id,t.id);assert.deepEqual(R.enemyBoard(run).map(rect),run.owned.map(rect));
 R.fuse(run);const form=byType(run,'gov_form'),fused=byType(run,'gov_onestop');assert.equal(R.move(run,form.id,null,null),true);assert.equal(R.move(run,fused.id,40,392),true);run=clone(run);
 assert.equal(R.validateRun(run),true);assert.equal(run.page.theme,'serviceform');assert.equal(run.page.templateId,t.id);assert.deepEqual(R.pageDecor(run),t.decor);assert.equal(ownedValue(run),29);assert.deepEqual([res(run).acquisitionValue,res(run).load],[24,8]);
 assert.equal(V.header(run.page.theme,run.page.name),serviceFormHeader());assert.match(readFileSync(new URL('../src/styles/catalog.css',import.meta.url),'utf8'),/@import "\.\.\/catalog\/service-form\.css";/);
 // Test the actual decorator dispatch with a minimal host, without claiming pixels.
 const realDocument=globalThis.document;
 try{
  globalThis.document={createElement(){return{style:{},dataset:{}};}};
  const host={dataset:{},children:[],replaceChildren(){this.children=[];},append(n){this.children.push(n);},querySelectorAll(){return[];}};
  V.render(host,[],{theme:run.page.theme,decor:R.pageDecor(run)});assert.equal(host.children.length,t.decor.length);
  host.children.forEach((node,i)=>{const[kind,x,y,w,h]=t.decor[i];assert.equal(node.innerHTML,serviceFormDecor(kind));assert.deepEqual(node.style,{left:`${x}px`,top:`${y}px`,width:`${w}px`,height:`${h}px`});});
 }finally{if(realDocument===undefined)delete globalThis.document;else globalThis.document=realDocument;}
});
