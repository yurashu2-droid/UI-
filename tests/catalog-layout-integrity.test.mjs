import test from 'node:test';
import assert from 'node:assert/strict';
import D from '../src/data.js';
import C from '../src/document.js';
import { SITE_TEMPLATES } from '../src/catalog/index.js';

// Declaration-level geometry checks do not substitute for rendered pixel-layout review.
const overlaps=(a,b)=>a[1]<b[1]+b[3]&&a[1]+a[3]>b[1]&&a[2]<b[2]+b[4]&&a[2]+a[4]>b[2];
test('every authored template uses unique IDs and exact legal declared part dimensions',()=>{
  assert.equal(new Set(SITE_TEMPLATES.map(t=>t.id)).size,SITE_TEMPLATES.length);
  for(const t of SITE_TEMPLATES){
    const board=t.layout.map(([type,x,y,w,h],i)=>C.makeItem(type,`${t.id}-${i}`,x,y,w,h));
    for(let i=0;i<board.length;i++){
      const p=board[i],d=D.PARTS[p.type];
      assert.equal(p.w,t.layout[i][3],`${t.id}:${p.type} width changed silently`);
      assert.equal(p.h,t.layout[i][4],`${t.id}:${p.type} height changed silently`);
      assert.ok(p.w>=d.minW&&p.w<=d.maxW&&p.h>=d.minH&&p.h<=d.maxH,`${t.id}:${p.type} bounds`);
      assert.ok(C.canPlace(board,p,p.x,p.y),`${t.id}:${p.type} illegal placement`);
    }
  }
});
test('template decoration remains inside the page and cannot hide behind an active component',()=>{
  for(const t of SITE_TEMPLATES)for(const decor of t.decor){
    const [kind,x,y,w,h]=decor;
    assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=960&&y+h<=680,`${t.id}:${kind} bounds`);
    for(const part of t.layout)assert.equal(overlaps(decor,part),false,`${t.id}:${kind} overlaps ${part[0]}`);
  }
});
