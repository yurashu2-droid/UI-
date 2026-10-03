import test from 'node:test';
import assert from 'node:assert/strict';
import E from '../src/engine.js';
import Effects from '../src/effects.js';

test('SNS effects log actual capped healing in HP units and suppress zero-heal lines on both sides',()=>{
 const b=new E.Battle([],[],{playerHp:440,enemyHp:440,playerAdmin:['sns'],enemyAdmin:['sns']});b.player.hp=438.75;b.enemy.hp=434;
 const logs=[],forwarded=[],fx={traffic:{adminEvent(e){forwarded.push(e);}},adminPulse(){},log(side,html,time){logs.push({side,html,time});}};
 for(let i=0;i<160;i++)for(const e of b.step(.05))if(e.kind==='admin')Effects.prototype.emit.call(fx,e,b);
 assert.deepEqual(logs.map(l=>[l.side,l.time]),[['player',3],['enemy',3]]);assert.match(logs[0].html,/1\.25.*閲覧者HP回復/);assert.match(logs[1].html,/6.*閲覧者HP回復/);for(const l of logs)assert.doesNotMatch(l.html,/新規流入|\+10人/);
 assert.deepEqual(forwarded.map(e=>[e.side,e.time,e.value]),[['player',3,1.25],['enemy',3,6],['player',8,0],['enemy',8,0]]);
});
