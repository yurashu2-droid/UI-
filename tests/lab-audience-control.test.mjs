import test from 'node:test';
import assert from 'node:assert/strict';
import R from '../src/run.js';
import C from '../src/document.js';
const mod = await import('../src/lab-audience-control.js').catch(() => ({}));

function run(mode='lab') {
  const run=R.newRun(mode);
  run.owned=[C.makeItem('yt_play','video',24,24,560,280),C.makeItem('yt_sub','sub',592,24,184,40),C.makeItem('yt_ad','ad',592,80,160,48)];
  return run;
}
function environment() {
  const nodes=[];
  const doc={createElement(tag){const node={tagName:tag,children:[],attributes:{},value:'',disabled:false,textContent:'',events:{},append(...children){this.children.push(...children);},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,v){this.events[k]=v;},ownerDocument:doc};nodes.push(node);return node;}};
  return {host:doc.createElement('div'),nodes};
}
const labContext={mode:'lab',storyActive:false,battleActive:false};

test('fresh laboratory selection starts a real canonical battle; explicit selector change enables audience-v1',()=>{
  assert.equal(typeof mod.createLabBattleController,'function');
  const controller=mod.createLabBattleController();
  assert.equal(controller.value,'standard');
  const normal=controller.start(run(),false);
  assert.equal(normal.ok,true);assert.equal(normal.battle.audience,null);
  const env=environment();
  mod.mountAudienceLabControl(env.host,controller,()=>labContext,()=>{});
  const select=env.nodes.find(n=>n.tagName==='select');
  assert.equal(select.value,'standard');
  assert.equal(env.nodes.find(n=>n.tagName==='label').attributes.for,select.id);
  assert.match(env.nodes.map(n=>n.textContent).join(' '),/実験/);
  select.value='audience-v1';select.events.change();
  assert.equal(controller.value,'audience-v1');
  const experiment=controller.start(run(),false);
  assert.equal(experiment.ok,true);
  assert.equal(experiment.battle.experimentalRules,'audience-v1');
  assert.ok(experiment.battle.audience);
  select.value='standard';select.events.change();
  assert.equal(controller.start(run(),false).battle.audience,null);
});

test('unknown values and active or stale non-lab events cannot change lab rules',()=>{
  assert.equal(typeof mod.createLabBattleController,'function');
  const controller=mod.createLabBattleController();
  assert.equal(controller.choose('navigation-audience-v1',labContext),false);
  assert.equal(controller.choose('audience-v1',{...labContext,battleActive:true}),false);
  assert.equal(controller.choose('audience-v1',{...labContext,mode:'campaign'}),false);
  assert.equal(controller.choose('audience-v1',{...labContext,storyActive:true}),false);
  assert.equal(controller.value,'standard');
  assert.equal(controller.choose('audience-v1',labContext),true);
  assert.equal(controller.start(run('campaign'),false).battle.audience,null);
  assert.equal(controller.start(run(),true).battle.audience,null);
  controller.reset();assert.equal(controller.value,'standard');
});

test('native control refuses a stale change after battle begins and stays visibly locked',()=>{
  assert.equal(typeof mod.createLabBattleController,'function');
  const controller=mod.createLabBattleController(), env=environment();
  let context=labContext,changes=0;
  mod.mountAudienceLabControl(env.host,controller,()=>context,()=>changes++);
  const select=env.nodes.find(n=>n.tagName==='select');
  context={...labContext,battleActive:true};
  select.value='audience-v1';select.events.change();
  assert.equal(controller.value,'standard');assert.equal(select.value,'standard');
  assert.equal(select.disabled,true);assert.equal(changes,0);
});

test('run transaction accepts the audience flag only for the laboratory',()=>{
  const lab=R.startBattle(run(),{audienceExperiment:true});
  assert.equal(lab.ok,true);assert.equal(lab.battle.experimentalRules,'audience-v1');
  const campaign=R.startBattle(run('campaign'),{audienceExperiment:true});
  assert.equal(campaign.ok,true);assert.equal(campaign.battle.audience,null);
  const normal=R.startBattle(run());assert.equal(normal.battle.audience,null);
});

test('the selected host path produces real audience events and standard selection removes them on the next match',()=>{
  const controller=mod.createLabBattleController();
  const play=()=>{
    const prepared=run();
    for(let n=1;n<4;n++)prepared.owned.push(C.makeItem('yt_ad',`dense-${n}`,592,80+n*56,160,48));
    const started=controller.start(prepared,false);assert.equal(started.ok,true);
    const events=[];while(!started.battle.result)events.push(...started.battle.step(.05));
    return {battle:started.battle,events};
  };
  controller.choose('audience-v1',labContext);
  const experiment=play();
  assert.ok(experiment.events.some(event=>event.kind==='audience'&&event.action==='churn'));
  assert.ok(experiment.events.some(event=>event.kind==='audience'&&event.action==='loyalty-earned'));
  controller.choose('standard',labContext);
  const normal=play();
  assert.equal(normal.battle.audience,null);
  assert.ok(normal.events.every(event=>event.kind!=='audience'));
});
