import test from 'node:test';
import assert from 'node:assert/strict';
const original=globalThis.Path2D;globalThis.Path2D=class{};
const {default:Traffic}=await import('../src/traffic.js');
if(original===undefined)delete globalThis.Path2D;else globalThis.Path2D=original;
function traffic(pressure){const t=Object.create(Traffic.prototype);Object.assign(t,{base:{player:50,enemy:50},battle:{pressure,player:{hp:100,maxHp:100},enemy:{hp:50,maxHp:100}},ended:false,winner:null});return t;}
test('pressure visual projection never turns overload departures into opponent viewers, even after victory',()=>{
 const t=traffic({});assert.deepEqual(t.final(),{player:50,enemy:25});assert.equal(t.desired({origin:'enemy',idx:40}),'gone');
 t.ended=true;t.winner='player';t.battle.enemy.hp=0;assert.deepEqual(t.final(),{player:50,enemy:0});assert.equal(t.desired({origin:'enemy',idx:0}),'gone');
});
test('canonical cursor projection is unchanged without the laboratory flag',()=>{
 const t=traffic(null);assert.deepEqual(t.final(),{player:75,enemy:25});assert.equal(t.desired({origin:'enemy',idx:40}),'player');
});

test('departed pressure viewers can return after healing or backup; exposed fake bots stay gone',()=>{
 const t=traffic({}),c={origin:'enemy',idx:40,side:'enemy',alive:true,dead:false,moving:false,legs:[],leg:null,x:0,y:0};
 Object.assign(t,{active:true,last:0,now:0,paused:false,speed:1,cursors:[c],invaders:[],point:()=>({x:0,y:0}),draw(){},hud(){}});
 t.migrate(c,'gone');c.legs[0].then();assert.equal(c.dead,true);
 c.legs=[];t.battle.enemy.hp=100;
 const bot={...c,bot:true,dead:true,legs:[]};t.cursors.push(bot);
 const raf=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=()=>1;
 try{t.frame(50);}finally{if(raf===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=raf;}
 assert.equal(c.dead,false);assert.equal(c.alive,true);assert.equal(c.moving,true);assert.equal(c.legs.at(-1).side,'enemy');assert.equal(bot.dead,true);
});
