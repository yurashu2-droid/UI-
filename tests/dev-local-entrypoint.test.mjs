import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const packageJson=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));

test('explicit local startup command targets the supervisor and preserves existing standalone commands',()=>{
  assert.equal(packageJson.scripts['dev:local'],'node --import tsx scripts/dev-local.ts');
  assert.equal(packageJson.scripts.dev,'vite --host 127.0.0.1');
  assert.equal(packageJson.scripts.arena,'node --import tsx server/arena/main.ts');
  assert.equal(packageJson.scripts.preview,'vite preview --host 127.0.0.1');
  assert.equal(packageJson.scripts.postinstall,undefined,'install must not launch persistent services');
});

test('the registered command rejects a mismatched arena port before launching services without exposing environment values',()=>{
  assert.equal(packageJson.scripts['dev:local'],'node --import tsx scripts/dev-local.ts');
  const [program,...args]=packageJson.scripts['dev:local'].split(' ');assert.equal(program,'node');
  const sentinel='private-startup-test-value';
  const result=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,ARENA_PORT:'5179',UI_RAID_PRIVATE_TEST:sentinel},encoding:'utf8',timeout:5000});
  assert.equal(result.error,undefined);assert.equal(result.status,1);
  assert.match(result.stderr,/requires ARENA_PORT 5180/);assert.match(result.stderr,/npm run arena.*npm run dev/);
  assert.doesNotMatch(result.stdout+result.stderr,/local ready|UI RAID arena:|5179|private-startup-test-value/);
});
