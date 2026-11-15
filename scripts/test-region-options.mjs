import test from 'node:test';
import assert from 'node:assert/strict';
import {viewportPoint} from '../sky-atlas/dist/sky-projection.js';
import {selectionRanges,inRanges} from '../sky-atlas/dist/cell-selection.js';
import {demoTargets} from '../sky-atlas/dist/demo-targets.js';
import {cellAt,center} from '../sky-atlas/dist/sky-model.js';

test('atlas markers account for search bar offsets at desktop and mobile sizes',()=>{
 for(const top of [62,86])assert.deepEqual(viewportPoint([100,150],{left:20,top:top+40},{left:20,top:40}),[100,150+top]);
 assert.equal(viewportPoint(undefined,{},{ }),null);
});
test('nearby mode retains broad archive matches without exact local pixel masking',()=>{
 const waves=[1.4,1.45,1.5,1.55,1.6],exact=selectionRanges(waves,'single',2),near=selectionRanges(waves,'single',2,[],true);
 assert(!inRanges(1.56,exact));assert(inRanges(1.56,near));assert(inRanges(1.59,near));assert(inRanges(1.8,near));assert(!inRanges(NaN,near));
 assert.deepEqual(selectionRanges(waves,'all',2,[],true),[]);
 assert(inRanges(1.56,selectionRanges(waves,'mix',0,[2],true)));
});
test('all eight requested test regions select valid search cells',()=>{
 assert.equal(demoTargets.length,8);
 for(const target of demoTargets){assert(Number.isFinite(target.ra)&&Number.isFinite(target.dec));const cell=cellAt(target.ra,target.dec);assert(cell>=0&&cell<3145728);assert(Number.isFinite(center(cell).ra));}
 const wise=demoTargets.find(t=>t.name==='WISE 0855');assert(Math.abs(wise.ra-15*(8+55/60+10.831/3600))<1e-10);
});
