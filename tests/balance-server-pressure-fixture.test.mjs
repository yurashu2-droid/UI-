import test from 'node:test';
import assert from 'node:assert/strict';
import { pressureProbe, pressureFixture, runPressureStudy } from '../scripts/server-pressure-benchmark.js';
import E from '../src/engine.js';
import { ArenaService } from '../server/arena/service.js';
import { mkdtempSync,rmSync } from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('equal-investment pressure wins the late tight-capacity pair but loses to paid counters and spare CPU',()=>{
 const tight=pressureProbe(),normal=pressureProbe('gov_pdf'),spare=pressureProbe('go_jobs',26),blocked=pressureProbe('go_jobs',15,440,'captcha');
 for(const row of [tight,normal,spare,blocked]){assert.equal(row.attacker.cost,21);assert.equal(row.defender.cost,21);assert.ok(row.attacker.legal&&row.defender.legal);}
 assert.equal(tight.winner,'attacker');assert.equal(normal.winner,'defender');assert.equal(spare.winner,'defender');assert.equal(blocked.winner,'defender');
 assert.ok(tight.overloadLoss>0);assert.ok(blocked.spent>0);assert.equal(blocked.acceptedWork,0);assert.equal(blocked.overloadLoss,0);
 assert.ok(blocked.rejectedWaves>0);assert.equal(tight.income,tight.spent+tight.remainingCharge+tight.unconverted);
 assert.equal(pressureProbe('go_jobs',15,160).winner,'defender','early HP exposes funding startup cost');
 assert.equal(pressureProbe('go_jobs',15,440,'recaptcha').winner,'defender');
});
test('authored study covers early/late HP, spare capacity, zero/two admins, and seat swaps',()=>{
 const study=runPressureStudy();assert.equal(study.rows.length,36);
 for(const row of study.rows){assert.ok(row.attacker.legal&&row.defender.legal);assert.ok(Number.isFinite(row.time));}
 for(const defense of ['none','captcha','recaptcha'])assert.deepEqual(pressureProbe('go_jobs',15,440,defense,0,true),pressureProbe('go_jobs',15,440,defense,0,false));
});
test('new battles never inherit work or source state from the previous match',()=>{
 const f=pressureFixture(),options={experimentalRules:'server-pressure-v1',playerCapacity:15,enemyCapacity:15};
 const a=new E.Battle(f.attacker,f.defender,options);while(a.ticks<160)a.step(.05);assert.ok(a.pressure.player.sources.size>0);
 const b=new E.Battle(f.attacker,f.defender,options);assert.equal(b.pressure.enemy.work,0);assert.equal(b.pressure.player.sources.size,0);assert.equal(b.player.parts.find(p=>p.type==='go_jobs').charge,0);
});
test('authoritative online rejects pressure flags without changing server state',()=>{
 const dir=mkdtempSync(join(tmpdir(),'qa-pressure-online-')),server=new ArenaService({filePath:join(dir,'arena.json')});
 try{const session=server.openSession(),before=server.view(session.token);
 for(const extra of [{serverPressureExperiment:true},{experimentalRules:'server-pressure-v1'},{pressureCapacity:15}])assert.throws(()=>server.command(session.token,{commandId:'pressure-injection',expectedRevision:before.revision,kind:'inbox',...extra}),/INVALID_COMMAND/);
 assert.deepEqual(server.view(session.token),before);
 }finally{server.close();rmSync(dir,{recursive:true,force:true});}
});
