import test from 'node:test';
import assert from 'node:assert/strict';
import {createSkyGrid,fieldCoverage} from '../src/spectral.js';
import {hasFieldCoverage,requireFrameCoverage,InsufficientCoverageError} from '../sky-atlas/dist/cell-coverage.js';
import {createRequestPool,forEachConcurrent} from '../sky-atlas/dist/cell-requests.js';
import {createFrameLoader} from '../sky-atlas/dist/cell-frame-cache.js';
import {findWavelengthObservation} from '../sky-atlas/dist/cell-wavelengths.js';
const tick=()=>new Promise(r=>setImmediate(r));
const header={NAXIS1:201,NAXIS2:201,CTYPE1:'RA---TAN',CTYPE2:'DEC--TAN',CRVAL1:20,CRVAL2:10,CRPIX1:101,CRPIX2:101,CD1_1:-.001,CD1_2:0,CD2_1:0,CD2_2:.001};
test('full-field coverage handles exact threshold, rotated images, RA wrap and poles',()=>{
 const grid={pixels:10,coordinates:Float64Array.from(Array.from({length:100},(_,i)=>i<80?[20,10]:[25,10]).flat())};
 assert.equal(fieldCoverage(header,grid),.8);
 assert(hasFieldCoverage({coverage:.8}));assert(!hasFieldCoverage({coverage:.7999}));assert(!hasFieldCoverage({}));
 for(const [ra,dec] of [[20,10],[359.99,0],[0,89.9],[30,-89.9]]){
  const h={...header,CRVAL1:ra,CRVAL2:dec,CD1_1:0,CD1_2:.001,CD2_1:.001,CD2_2:0};
  assert.equal(fieldCoverage(h,createSkyGrid(ra,dec,.1)),1);
  const wide=fieldCoverage(h,createSkyGrid(ra,dec,.4));assert(wide>.24&&wide<.26);
 }
});
test('actual finite-pixel coverage rejects gaps and cannot be inflated by crops or masks',()=>{
 const frame={raw:{values:Float32Array.from({length:100},(_,i)=>i<80?0:NaN),quality:new Uint8Array(100),coverage:1}};
 assert.equal(requireFrameCoverage(frame),frame);frame.raw.values[79]=NaN;
 assert.throws(()=>requireFrameCoverage(frame),e=>e.name==='InsufficientCoverageError'&&e.coverage===.79);
 assert.throws(()=>requireFrameCoverage({raw:{values:[]}}),InsufficientCoverageError);
});
test('shared image pool starts ten downloads, refills slots and cancels queued work',async()=>{
 const pool=createRequestPool(),releases=[];let active=0,peak=0,started=0;
 const work=()=>pool.run(async()=>{started++;peak=Math.max(peak,++active);await new Promise(r=>releases.push(r));active--;});
 const jobs=Array.from({length:12},work);await tick();assert.equal(started,10);assert.equal(peak,10);
 releases[0]();await tick();assert.equal(started,11);assert.equal(peak,10);
 const controller=new AbortController(),cancelled=pool.run(()=>assert.fail('Cancelled request ran'),controller.signal);
 const rejected=assert.rejects(cancelled,{name:'AbortError'});controller.abort();await rejected;
 for(let i=1;i<12;i++){await tick();releases[i]();}await Promise.all(jobs);assert.equal(active,0);
});
test('metadata checks overlap with a bounded rolling queue and stop after abort',async()=>{
 let active=0,peak=0,started=0;const controller=new AbortController();
 await forEachConcurrent(Array.from({length:30},(_,i)=>i),async()=>{started++;peak=Math.max(peak,++active);await tick();controller.abort();active--;},{concurrency:12,signal:controller.signal});
 assert.equal(peak,12);assert.equal(started,12);
});
test('coverage exclusions are neither ready images nor failed downloads',async()=>{
 const loader=createFrameLoader({load:async()=>{throw new InsufficientCoverageError(.5);}});
 await assert.rejects(loader.get({path:'partial'}),InsufficientCoverageError);await tick();
 assert.deepEqual(loader.counts(),{ready:0,failed:0,total:0,skipped:1});
});
test('wavelength layers skip partial metadata and partial image data to find the next date',async()=>{
 const calls=[],observations=Array.from({length:4},(_,i)=>({id:String(i),path:'/image'+i,mjd:60000+i,band:'D1'}));
 const result=await findWavelengthObservation({observations,wavelengths:[1,1.1,1.2],channel:1,anchorMjd:60000,signal:new AbortController().signal,
  inspect:async obs=>({wavelength:1.1,covered:true,coverage:obs.id==='0'?.79:1}),
  load:async obs=>{calls.push(obs.id);if(obs.id==='1')throw new InsufficientCoverageError(.7);return 'valid-frame';}});
 assert.equal(result.obs.id,'2');assert.equal(result.frame,'valid-frame');assert.deepEqual(calls,['1','2']);assert.equal(result.failures,0);
});
