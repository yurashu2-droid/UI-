import assert from 'node:assert/strict';
import {RELEASE_TEMPLATES} from '../../src/catalog/releases-templates.js';
const original=RELEASE_TEMPLATES[0];

// Historical append-only goldens predate the reviewed Releases teaching upgrade.
// Normalize only its three fixed teaching fields at the established exact slot.
// Identity, combat, geometry, native labels, source references and every other
// entry remain part of the original whole-object digest.
export function withOriginalReleaseTeaching(rows,slot) {
  assert.ok(slot===15||slot===29,'only the template and laboratory Releases slots');
  assert.equal(rows[slot]?.id,original.id);
  assert.equal(rows.filter(row=>row.id===original.id).length,1);
  return rows.map((row,index)=>index===slot?{
    ...row,tip:original.tip,counterplay:original.counterplay,decor:original.decor,
  }:row);
}
export function withOriginalReleasePresetDescription(presets) {
  assert.ok(Object.hasOwn(presets,original.id));
  return {...presets,[original.id]:{...presets[original.id],desc:original.tip}};
}
