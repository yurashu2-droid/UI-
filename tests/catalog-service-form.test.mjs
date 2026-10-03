import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFragment} from 'parse5';
import D from '../src/data.js';
import C from '../src/document.js';
import E from '../src/engine.js';
import R from '../src/run.js';
import V from '../src/components.js';
import {resources} from '../src/buildlab.js';
const proto=await import('../src/catalog/service-form-templates.js').catch(()=>({}));
const renderer=await import('../src/catalog/service-form-render.js').catch(()=>({}));
const template=()=>{assert.equal(proto.SERVICE_FORM_TEMPLATES?.length,1);return proto.SERVICE_FORM_TEMPLATES[0];};
const runFor=()=>{const t=template(),r=R.newRun('lab','blank');r.owned=t.layout.map(([type,x,y,w,h,shape,label],i)=>({...C.makeItem(type,`p${i+1}`,x,y,w,h),...(label?{label}:{}),...(shape?{shape}:{})}));r.nextId=r.owned.length+1;r.admin=[];return r;};
const resource=items=>resources(items.filter(C.placed).map(p=>[p.type,p.x,p.y,p.w,p.h]));
function simulate(items,shield=false){const b=new E.Battle(items,[C.makeItem('ab_link','enemy',24,24)],{playerHp:10000,enemyHp:10000,playerCapacity:12,enemyCapacity:12});b.player.hp=9000;if(shield)b.enemy.shield=60;const events=[];for(let i=0;i<480;i++)events.push(...b.step(.05));return{b,events};}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('service form prototype uses six existing native parts with genuine direct containment and $29/CPU12',()=>{
 const t=template(),r=runFor();assert.equal(t.id,'site_govuk');assert.equal(t.status,'experimental');assert.equal(t.faction,'serviceform');assert.deepEqual(t.admin,[]);assert.match(t.name,/GOV\.UK風/);assert.equal(r.owned.length,6);assert.deepEqual([resource(r.owned).acquisitionValue,resource(r.owned).load],[29,12]);assert.equal(resource(r.owned).legal,true);assert.deepEqual(resource(r.owned).experimental,[]);
 const form=r.owned.find(p=>p.type==='gov_form'),check=r.owned.find(p=>p.type==='gov_check'),submit=r.owned.find(p=>p.type==='gov_submit'),info=E.analyze(r.owned);assert.equal(info.parents[check.id],form.id);assert.equal(info.parents[submit.id],form.id);assert.ok(info.near[check.id].includes(submit.id));assert.deepEqual(info.groups,[]);for(const p of r.owned)assert.deepEqual([p.w,p.h],t.layout.find(q=>q[0]===p.type).slice(3,5));
});
test('real onestop fusion preserves paid ingredients and parent footprint while exchanging checkbox shielding for piercing and income',()=>{
 const r=runFor(),before=simulate(r.owned),initial=resource(r.owned),submit=r.owned.find(p=>p.type==='gov_submit');assert.equal(R.validateRun(r),true);const first=simulate(r.owned,true).events.find(e=>e.kind==='damage'&&e.id===submit.id);assert.equal(first.pierce,false);assert.equal(first.hit,0);assert.equal(first.blocked,10);
 const result=R.fuse(r);assert.equal(result.length,1);assert.equal(result[0].recipe.into,'gov_onestop');assert.deepEqual(R.fuse(r),[]);assert.equal(R.validateRun(JSON.parse(JSON.stringify(r))),true);const fused=r.owned.find(p=>p.type==='gov_onestop');assert.deepEqual([fused.x,fused.y,fused.w,fused.h],[40,392,184,40]);assert.deepEqual([resource(r.owned).acquisitionValue,resource(r.owned).load],[29,11]);assert.equal(resource(r.owned).footprint,initial.footprint,'the remaining form still occupies the outer rectangle');
 const after=simulate(r.owned),pierced=simulate(r.owned,true).events.find(e=>e.kind==='damage'&&e.id===fused.id);assert.equal(pierced.pierce,true);close(pierced.hit,4.2);close(pierced.blocked,9.8);
 assert.deepEqual([before.b.metrics.player.hpDamage,before.b.metrics.player.shielding,before.b.metrics.player.healing,before.b.player.income],[132,66,35,6]);assert.deepEqual([after.b.metrics.player.hpDamage,after.b.metrics.player.shielding,after.b.metrics.player.healing,after.b.player.income],[184,42,35,8]);assert.equal(after.b.player.parts.find(p=>p.id===fused.id).speed,1.2);
});
test('storing the parent also stores its child; redeploying that fused child keeps its income but gives up parent protection and speed',()=>{
 const r=runFor();R.fuse(r);const form=r.owned.find(p=>p.type==='gov_form'),fused=r.owned.find(p=>p.type==='gov_onestop'),initial=resource(r.owned);assert.equal(R.move(r,form.id,null,null),true);assert.equal(fused.x,null);assert.equal(fused.y,null);assert.equal(R.move(r,fused.id,40,392),true);assert.equal(R.validateRun(JSON.parse(JSON.stringify(r))),true);assert.equal(r.owned.length,5);assert.deepEqual([resource(r.owned).acquisitionValue,resource(r.owned).load],[24,8]);assert.equal(initial.footprint-resource(r.owned).footprint,119840);
 const bare=simulate(r.owned);assert.deepEqual([bare.b.metrics.player.hpDamage,bare.b.metrics.player.shielding,bare.b.metrics.player.healing,bare.b.player.income],[170,0,35,7]);assert.equal(bare.b.player.parts.find(p=>p.id===fused.id).speed,1);assert.equal(D.PARTS[form.type].price,5,'the unplaced form is still owned, not refunded');
 const original=runFor(),oldForm=original.owned.find(p=>p.type==='gov_form'),submit=original.owned.find(p=>p.type==='gov_submit');R.move(original,oldForm.id,null,null);R.move(original,submit.id,40,392);const standalone=simulate(original.owned);assert.equal(standalone.b.player.income,0,'ordinary submit needs its actual form for earnings');
});
test('fictional service summary and help chrome is inert and never modifies native part markup',()=>{
 const t=template();assert.equal(typeof renderer.serviceFormHeader,'function');assert.equal(typeof renderer.serviceFormDecor,'function');assert.match(renderer.serviceFormHeader(),/GOV\.UK風.*非公式/);const walk=n=>{assert.ok(!['a','button','input','select','textarea','form','script','iframe','img','audio','video','object','embed'].includes(n.tagName));for(const a of n.attrs||[])assert.ok(!['href','src','srcset','action','formaction'].includes(a.name)&&!a.name.startsWith('on'));for(const child of n.childNodes||[])walk(child);};walk(parseFragment(renderer.serviceFormHeader()));for(const[kind]of t.decor){const html=renderer.serviceFormDecor(kind);assert.ok(html,kind);walk(parseFragment(html));}assert.match(renderer.serviceFormDecor('service-local-note'),/外部への申請・保存・個人情報の送信/);for(const p of runFor().owned)assert.equal(V.markup(p,{theme:'serviceform'}),V.markup(p,{theme:'mixed'}));
});

test('service confirmation summary uses valid definition-list term and value rows',()=>{
 template();const root=parseFragment(renderer.serviceFormDecor('service-summary')),dl=root.childNodes.find(n=>n.tagName==='dl');assert.ok(dl);for(const row of dl.childNodes.filter(n=>n.tagName)){assert.equal(row.tagName,'div');const cells=row.childNodes.filter(n=>n.tagName);assert.equal(cells[0].tagName,'dt');assert.ok(cells.slice(1).every(n=>n.tagName==='dd'));}
});

test('service breadcrumb occupies the native top-of-page position instead of buying a contrived form adjacency',()=>{
 const t=template(),crumb=t.layout.find(p=>p[0]==='gov_breadcrumb'),title=t.decor.find(p=>p[0]==='service-title');assert.ok(crumb[2]+crumb[4]<title[2]);const r=runFor(),info=E.analyze(r.owned),form=r.owned.find(p=>p.type==='gov_form');assert.equal(info.mods[form.id].speed,1);
});

test('reviewed service-form template appends safely with live theme, preset, opponent and saved-page hooks',async()=>{
 const{SITE_TEMPLATES}=await import('../src/catalog/index.js'),{readFileSync}=await import('node:fs'),t=template();assert.equal(SITE_TEMPLATES[19].id,'site_bandcamp');assert.equal(SITE_TEMPLATES[20]?.id,t.id);assert.ok(D.FACTIONS.serviceform);assert.ok(D.PRESETS[t.id]);assert.equal(Object.values(D.PARTS).some(p=>p.faction==='serviceform'),false);assert.equal(V.header('serviceform'),renderer.serviceFormHeader());
 const r=R.newRun('lab',t.id);assert.equal(r.page.theme,'serviceform');assert.equal(r.page.templateId,t.id);assert.equal(r.owned.length,6);assert.deepEqual(R.pageDecor(r),t.decor);r.stage=R.labEnemies().findIndex(e=>e.id===t.id);const saved=JSON.parse(JSON.stringify(r));assert.equal(R.validateRun(saved),true);assert.equal(R.opponent(saved).id,t.id);assert.deepEqual(R.enemyBoard(saved).map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]),saved.owned.map(p=>[p.type,p.x,p.y,p.w,p.h,p.label]));assert.match(readFileSync(new URL('../src/styles/catalog.css',import.meta.url),'utf8'),/@import "\.\.\/catalog\/service-form\.css";/);assert.match(readFileSync(new URL('../src/components.ts',import.meta.url),'utf8'),/serviceFormDecor\(kind\)/);
});
