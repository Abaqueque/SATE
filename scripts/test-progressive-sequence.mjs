import test from 'node:test';
import assert from 'node:assert/strict';
import {forEachChronological} from '../sky-atlas/dist/cell-requests.js';
import {createStableCrop} from '../sky-atlas/dist/cell-display.js';
import {exposureAvailability} from '../sky-atlas/dist/cell-selection.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
test('out-of-order metadata dispatches images chronologically and publishes ready frames before completion',async()=>{
 const headers=[deferred(),deferred(),deferred()],images=[deferred(),deferred(),deferred()],started=[],ready=[];
 const task=forEachChronological([2,0,1].map(i=>({mjd:i,path:String(i)})),o=>headers[+o.path].promise,async o=>{started.push(+o.path);await images[+o.path].promise;ready.push(+o.path);},{concurrency:2});
 headers[2].resolve();headers[1].resolve();await tick();assert.deepEqual(started,[]);
 headers[0].resolve();await tick();assert.deepEqual(started,[0,1]);
 images[0].resolve();await tick();assert.deepEqual(ready,[0]);assert.deepEqual(started,[0,1,2]);
 images[1].resolve();images[2].resolve();await task;assert.equal(ready.length,3);
});
test('failed metadata is delivered without blocking later frames and abort stops new work',async()=>{
 const seen=[],controller=new AbortController();
 await forEachChronological([0,1,2].map(i=>({mjd:i,path:String(i)})),async o=>{if(o.mjd===0)throw Error('archive failure');return o.mjd;},async(o,result)=>{seen.push([o.mjd,!!result.error]);if(o.mjd===1)controller.abort();},{concurrency:1,signal:controller.signal});
 assert.deepEqual(seen,[[0,true],[1,false]]);
});
test('fixed crop and full field remain unchanged across mismatched exposure footprints',()=>{
 const framing=createStableCrop(12),frame=margin=>({values:Float32Array.from({length:144},(_,i)=>i%12<margin||i%12>=12-margin?NaN:1)});
 const first=framing.get('shared',[frame(2)]);assert.equal(first.size,8);
 assert.deepEqual(framing.get('shared',[frame(0)]),first);assert.deepEqual(framing.get('shared',[]),first);
 assert.deepEqual(framing.get('full',[frame(2)]),{x:0,y:0,size:12});
 framing.reset();assert.equal(framing.get('shared',[frame(0)]).size,12);
});
test('exposure availability distinguishes loading, filters and archive errors',()=>{
 assert.deepEqual(exposureAvailability([{checked:true,match:true},{checked:false},{checked:true,rejection:'coverage'},{checked:true,rejection:'wavelength'},{checked:true,rejection:'centre'},{checked:true,infoError:true}]),{candidates:6,ready:1,pending:1,coverage:1,wavelength:1,centre:1,failed:1});
});
