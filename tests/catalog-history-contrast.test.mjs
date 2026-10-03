import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const css=await readFile(new URL('../src/catalog/history.css',import.meta.url),'utf8');
const luminance=hex=>{
  const rgb=hex.length===4?hex.slice(1).split('').map(c=>parseInt(c+c,16)/255):[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const linear=rgb.map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
};
const ratio=(a,b)=>{const [lo,hi]=[luminance(a),luminance(b)].sort((a,b)=>a-b);return (hi+.05)/(lo+.05);};
const rule=selector=>{const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1]??'';};

// Source-color regression only: actual display scaling, cascade and pixels remain unverified.
test('functional history labels retain at least4.5:1 declared contrast without changing the native silhouette',()=>{
  for(const [selector,background] of [
    ['.history-time','#ffffff'],['.history-source','#ffffff'],['.history-recovery','#ffffff'],['.history-expiry','#ffffff'],
    ['.native-version-history>header>small','#f8fafb'],['.native-version-history>footer>button','#edf5fa'],
    ['.native-version-history.is-history-used .history-recovery','#fafbfc'],
  ]){
    const foreground=rule(selector).match(/(?:^|;)\s*color\s*:\s*(#[\da-f]{3,6})\s*(?:;|$)/i)?.[1];
    assert.ok(foreground,selector);
    assert.ok(ratio(foreground,background)>=4.5,`${selector}: ${ratio(foreground,background).toFixed(2)}:1`);
  }
});
