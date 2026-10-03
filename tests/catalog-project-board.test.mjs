import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFragment} from 'parse5';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import V from '../src/components.js';
import {resources} from '../src/buildlab.js';
import {SITE_TEMPLATES} from '../src/catalog/index.js';
import {previewCatalogueAction} from '../src/catalog/preview.js';
import * as renderer from '../src/catalog/project-board-render.js';

const template=()=>{const t=SITE_TEMPLATES.find(t=>t.id==='site_trello');assert.ok(t,'the project-board template is registered');return t;};
const runFor=()=>R.newRun('lab',template().id);
const resource=board=>resources(board.map(p=>[p.type,p.x,p.y,p.w,p.h]));
const part=(r,type)=>r.owned.find(p=>p.type===type);
const walk=node=>[node,...(node.childNodes??[]).flatMap(walk)];
function simulate(board,shield=false){
 const b=new E.Battle(board,[],{playerHp:10000,enemyHp:10000,playerCapacity:12,enemyCapacity:12}),events=[];
 if(shield)b.enemy.shield=60;
 for(let tick=0;tick<480;tick++)events.push(...b.step(.05));
 return{b,events};
}

test('project board appends a legal five-part $23/CPU8 composition without any new combat family',()=>{
 const t=template(),r=runFor(),cost=resource(r.owned);
 assert.equal(SITE_TEMPLATES[20].id,'site_govuk');assert.equal(SITE_TEMPLATES[21].id,t.id);
 assert.equal(t.faction,'projectboard');assert.equal(t.status,'experimental');assert.deepEqual(t.admin,[]);
 assert.match(t.name,/Trello風/);assert.ok(t.references.every(url=>url.startsWith('https://support.atlassian.com/trello/')));
 assert.deepEqual(r.owned.map(p=>p.type),['gov_pdf','wk_reference','ab_link','gov_check','gh_checks']);
 assert.deepEqual([cost.acquisitionValue,cost.load,cost.legal],[23,8,true]);
 assert.equal(Object.values(D.PARTS).some(p=>p.faction==='projectboard'),false);
 assert.equal(Object.values(D.PARTS).filter(p=>p.status==='experimental').length,28);
 const info=E.analyze(r.owned);assert.deepEqual(info.parents,{});assert.deepEqual(info.groups,[]);
 for(const p of r.owned){assert.ok(C.canPlace(r.owned,p,p.x,p.y));assert.equal(info.mods[p.id].speed,1);assert.equal(info.mods[p.id].power,1);}
});

test('the same reference follows one actual attachment, not its decorative lane label',()=>{
 const r=runFor(),reference=part(r,'wk_reference'),pdf=part(r,'gov_pdf'),link=part(r,'ab_link');
 const original=simulate(r.owned);
 assert.deepEqual(original.b.player.info.near[reference.id],[pdf.id]);
 assert.ok(original.events.filter(e=>e.kind==='echo').length>0);
 assert.ok(original.events.filter(e=>e.kind==='echo').every(e=>e.id===reference.id&&e.to===pdf.id));
 const natural=original.events.filter(e=>e.kind==='fire'&&!e.echo&&[pdf.id,link.id].includes(e.id));
 assert.equal(R.move(r,reference.id,336,300),true);
 const linked=simulate(r.owned);
 assert.deepEqual(linked.b.player.info.near[reference.id],[link.id]);
 assert.ok(linked.events.filter(e=>e.kind==='echo').every(e=>e.id===reference.id&&e.to===link.id));
 assert.deepEqual(linked.events.filter(e=>e.kind==='fire'&&!e.echo&&[pdf.id,link.id].includes(e.id)),natural);
 assert.ok(original.b.metrics.player.hpDamage>linked.b.metrics.player.hpDamage);
 assert.ok(Math.abs(original.b.metrics.player.hpDamage-188.2)<1e-8);
 assert.ok(Math.abs(linked.b.metrics.player.hpDamage-172.6)<1e-8);
 assert.deepEqual([original.b.metrics.player.naturalAttacks,linked.b.metrics.player.naturalAttacks],[17,17]);
 assert.deepEqual([original.b.player.income,linked.b.player.income],[0,0]);
 assert.equal(R.move(r,reference.id,656,400),true);
 const waiting=simulate(r.owned);assert.equal(waiting.events.some(e=>e.kind==='echo'),false);assert.equal(waiting.b.metrics.player.hpDamage,163);
 assert.equal(R.move(r,reference.id,16,300),true);
 assert.deepEqual(simulate(r.owned).events,original.events);
 assert.deepEqual(simulate([...r.owned].reverse()).events,original.events);
 assert.deepEqual(R.fuse(r),[]);
});

test('PDF replay retains its natural piercing; the ordinary link replay does not invent it',()=>{
 const r=runFor(),pdf=part(r,'gov_pdf'),link=part(r,'ab_link'),reference=part(r,'wk_reference');
 const first=simulate(r.owned,true),pdfPackets=first.events.filter(e=>e.kind==='damage'&&e.id===pdf.id);
 assert.ok(pdfPackets.some(e=>e.value===6.3&&e.pierce===true));
 assert.equal(R.move(r,reference.id,336,300),true);
 const linked=simulate(r.owned,true),linkPackets=linked.events.filter(e=>e.kind==='damage'&&e.id===link.id);
 // Preserve the canonical JS one-decimal replay rounding (7 * .35 lands just below 2.45).
 assert.ok(linkPackets.some(e=>e.value===2.4));assert.ok(linkPackets.every(e=>e.pierce===false));
 assert.deepEqual(resource(r.owned),resource(runFor().owned));
});

test('project board keeps native editor movement, collision rejection, saved identity and opponent geometry',()=>{
 const t=template(),r=runFor(),reference=part(r,'wk_reference'),before=JSON.stringify(reference);
 assert.equal(R.move(r,reference.id,16,236),false);assert.equal(JSON.stringify(reference),before);
 assert.equal(R.move(r,reference.id,336,300),true);assert.equal(R.move(r,reference.id,336,300),true);
 assert.equal(R.move(r,reference.id,null,null),true);assert.equal(R.move(r,reference.id,16,300),true);
 const index=R.labEnemies().findIndex(e=>e.id===t.id);assert.equal(index,35);r.stage=index;
 const saved=JSON.parse(JSON.stringify(r));assert.equal(R.validateRun(saved),true);assert.equal(saved.page.theme,'projectboard');assert.equal(saved.page.templateId,t.id);
 assert.equal(R.opponent(saved).id,t.id);assert.deepEqual(R.pageDecor(saved),t.decor);
 assert.deepEqual(R.enemyBoard(saved).map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]),saved.owned.map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]));
 assert.equal(R.newRun('campaign',t.id).owned.some(p=>['wk_reference','gh_checks'].includes(p.type)),false);
});

test('project-board lanes and labels are inert original chrome, with no native-control replacements',()=>{
 const t=template();assert.equal(typeof renderer.projectBoardHeader,'function');assert.equal(typeof renderer.projectBoardDecor,'function');
 assert.equal(V.header('projectboard'),renderer.projectBoardHeader());assert.match(V.header('projectboard'),/Trello風.*非公式/);
 for(const html of [renderer.projectBoardHeader(),...t.decor.map(([kind])=>renderer.projectBoardDecor(kind))]){
  assert.ok(html);for(const node of walk(parseFragment(html))){
   assert.ok(!['button','input','select','textarea','form','a','script','iframe','img','audio','video','object','embed'].includes(node.tagName));
   for(const attribute of node.attrs??[])assert.ok(!['src','srcset','href','action','formaction','data-ui'].includes(attribute.name)&&!attribute.name.startsWith('on'));
  }
 }
 assert.match(renderer.projectBoardDecor('board-local-note'),/外部.*同期|同期.*外部/);
 assert.match(renderer.projectBoardDecor('board-lesson'),/列.*表示|表示.*列/);
 for(const p of runFor().owned){assert.equal(V.markup(p,{theme:'projectboard'}),V.markup(p,{theme:'mixed'}));p.label='<script>unsafe</script>';assert.doesNotMatch(V.markup(p,{theme:'projectboard'}),/<script>/);}
 const reference=part(runFor(),'wk_reference'),attrs=new Map(),state={textContent:''};
 assert.match(V.markup(reference),/data-ui="reference"/);
 assert.equal(previewCatalogueAction({dataset:{ui:'reference'},setAttribute(k,v){attrs.set(k,v);}},{querySelector(){return state;}}),true);
 assert.match(state.textContent,/プレビュー.*外部移動なし/);
 assert.match(V.markup(part(runFor(),'gov_pdf')),/data-ui="download"/);assert.match(V.markup(part(runFor(),'gov_check')),/type="checkbox"/);
});

test('board background remains display-only and does not restyle source-native part classes',()=>{
 template();const css=readFileSync(new URL('../src/catalog/project-board.css',import.meta.url),'utf8');
 assert.match(css,/\.site-theme-projectboard \.page-body::before/);assert.match(css,/pointer-events:\s*none/);
 assert.doesNotMatch(css,/\.native-|\.web-node|\.node-/);
 assert.match(readFileSync(new URL('../src/styles/catalog.css',import.meta.url),'utf8'),/@import "\.\.\/catalog\/project-board\.css";/);
 assert.match(readFileSync(new URL('../src/components.ts',import.meta.url),'utf8'),/projectBoardDecor\(kind\)/);
});

test('board lesson and empty replay slots keep their declared source-level text and geometry budget',()=>{
 const t=template(),lesson=t.decor.find(d=>d[0]==='board-lesson');
 const css=readFileSync(new URL('../src/catalog/project-board.css',import.meta.url),'utf8');
 const rule=css.match(/\.project-board-lesson\s*\{([^}]+)\}/)?.[1]??'';
 assert.match(rule,/padding:\s*8px 16px/);
 assert.ok(2*8+18+4+2*15<=lesson[4],'one title and two 15px body lines fit the declaration');
 const overlaps=(a,b)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
 for(const slot of [[336,300,288,52],[656,400,288,52]])for(const [kind,x,y,w,h] of t.decor){
  assert.equal(overlaps(slot,[x,y,w,h]),false,`${kind} blocks the described replay slot`);
 }
});
