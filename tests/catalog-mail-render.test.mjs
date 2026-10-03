import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFragment} from 'parse5';
import C from '../src/document.js';
import V from '../src/components.js';
import {MAIL_TEMPLATES} from '../src/catalog/mail-templates.js';
import {previewCatalogueAction} from '../src/catalog/preview.js';

const renderer=await import('../src/catalog/mail-render.js').catch(()=>({}));
const t=MAIL_TEMPLATES[0],walk=node=>[node,...(node.childNodes??[]).flatMap(walk)];
const board=t.layout.map(([type,x,y,w,h,,label],i)=>({...C.makeItem(type,`mail-${i}`,x,y,w,h),label:label||''}));
const css=()=>{try{return readFileSync(new URL('../src/styles/catalog-mail.css',import.meta.url),'utf8');}catch{return '';}};

test('POSTROOM provides original inert label, sender, snippet and reading-pane chrome',()=>{
 assert.equal(typeof renderer.mailHeader,'function');assert.equal(typeof renderer.mailDecor,'function');
 assert.match(renderer.mailHeader(),/POSTROOM/);assert.match(renderer.mailHeader(),/Gmail風.*非公式/);
 for(const html of [renderer.mailHeader(),...t.decor.map(([kind])=>renderer.mailDecor(kind))]){
  assert.ok(html);for(const node of walk(parseFragment(html))){
   assert.ok(!['button','input','select','textarea','form','a','script','iframe','img','audio','video','object','embed'].includes(node.tagName),node.tagName);
   for(const attribute of node.attrs??[])assert.ok(!['src','srcset','href','action','formaction','data-ui','tabindex'].includes(attribute.name)&&!attribute.name.startsWith('on'),attribute.name);
  }
 }
 assert.equal(renderer.mailDecor('not-a-mail-decoration'),'');
 assert.match(renderer.mailDecor('mail-list-note'),/固定|表示用/);
 assert.match(renderer.mailDecor('mail-local-note'),/送信|送受信/);assert.match(renderer.mailDecor('mail-local-note'),/同期/);
 assert.match(renderer.mailDecor('mail-thread-tail'),/見本|架空/);
 assert.match(renderer.mailDecor('mail-placement-lesson'),/翻訳/);
});

test('mail composition retains safe native search, links, language select and reference preview',()=>{
 for(const p of board){
  assert.equal(V.markup(p,{theme:'mailroom'}),V.markup(p,{theme:'mixed'}));
  const html=V.markup({...p,label:'<script>alert("label")</script> & "quote"'},{theme:'mailroom'});
  assert.doesNotMatch(html,/<script>/);assert.equal(walk(parseFragment(html)).some(n=>n.tagName==='script'),false);
 }
 const search=V.markup(board[0]),language=V.markup(board[4]),reference=V.markup(board[6]);
 assert.match(search,/<form[^>]+data-ui="search"/);assert.match(search,/<input[^>]+type="search"/);assert.doesNotMatch(search,/\baction=/);
 assert.match(language,/<select aria-label="翻訳先">/);assert.match(reference,/href="#" data-ui="reference"/);
 for(const p of board.slice(1,4))assert.match(V.markup(p),/href="#" data-ui="link"/);
 const attributes=new Map(),state={textContent:''},control={dataset:{ui:'reference'},setAttribute(k,v){attributes.set(k,v);}};
 assert.equal(previewCatalogueAction(control,{querySelector(){return state;}}),true);
 assert.match(state.textContent,/プレビュー.*外部移動なし/);assert.match(attributes.get('title'),/ページ内/);
 assert.equal(previewCatalogueAction(control,{querySelector(){return state;}}),true);
 assert.equal(state.textContent,'参照をプレビューしました · 外部移動なし');
});

test('mail CSS paints two reading surfaces without overriding combat controls or loading assets',()=>{
 const source=css();assert.ok(source,'POSTROOM CSS is present');
 assert.match(source,/\.site-theme-mailroom \.page-body::before/);assert.match(source,/\.site-theme-mailroom \.page-body::after/);
 assert.match(source,/pointer-events:\s*none/);assert.doesNotMatch(source,/\.native-|\.web-node|\.node-|url\(|@import|@font-face/);
 assert.match(source,/\.mail-row-meta/);assert.match(source,/\.mail-row-snippet/);assert.match(source,/\.mail-reading-heading/);
 assert.match(source,/\.site-theme-mailroom \.page-decor\s*\{\s*z-index:\s*1/,'inert text stays above the ::after reading surface');
 const lesson=source.match(/\.mail-placement-lesson\s*\{([^}]+)\}/)?.[1]??'';
 assert.match(lesson,/padding:\s*12px 16px/);
 assert.ok(24+18+6+2*16<=t.decor.find(d=>d[0]==='mail-placement-lesson')[4],'title and two body lines fit declared lesson height');
});

test('actual shared search submit stays local for fictional mail and repeated submissions',()=>{
 const source=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8'),start=source.indexOf('document.addEventListener("submit",'),end=source.indexOf('document.addEventListener("keydown",',start);
 assert.ok(start>=0&&end>start);let callback,prevented=0;const messages=[];
 class HTMLFormElement{closest(){return{};}matches(){return false;}querySelector(){return{value:'小さなWebの便り'};}}
 new Function('document','HTMLFormElement','preview','toast','previewVideoComment',source.slice(start,end))({addEventListener(name,fn){assert.equal(name,'submit');callback=fn;}},HTMLFormElement,true,text=>messages.push(text),()=>assert.fail('mail search is not video chat'));
 for(let i=0;i<2;i++)callback({target:new HTMLFormElement(),preventDefault(){prevented++;}});
 assert.equal(prevented,2);assert.deepEqual(messages,['「小さなWebの便り」を検索（ページ内の操作デモ）','「小さなWebの便り」を検索（ページ内の操作デモ）']);
});
