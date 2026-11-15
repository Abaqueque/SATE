import test from 'node:test';
import assert from 'node:assert/strict';
import {findWavelengthObservation,wavelengthParameters,composeLayers} from '../sky-atlas/dist/cell-wavelengths.js';

const wavelengths=[1,1.1,1.2],observations=Array.from({length:9},(_,i)=>({id:String(i),path:'/image'+i,band:'D1',mjd:60000+i}));
test('additional wavelengths keep the same sky region and request their own band',()=>{
 const a=wavelengthParameters({ra:101.25,dec:-16.72},wavelengths,0),b=wavelengthParameters({ra:101.25,dec:-16.72},wavelengths,2);
 for(const key of ['ra','dec','size'])assert.equal(a.get(key),b.get(key));
 assert.equal(b.get('wavelength'),'1.2');assert.equal(b.get('mode'),'single');
});
test('closest date wins independent of response order and only covered matching wavelengths qualify',async()=>{
 let active=0,peak=0;
 const result=await findWavelengthObservation({observations,wavelengths,channel:1,anchorMjd:60004,signal:new AbortController().signal,inspect:async o=>{
  peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,o.id==='3'?10:0));active--;
  return {covered:o.id!=='4',wavelength:o.id==='5'?1.2:1.1};
 }});
 assert.equal(result.obs.id,'3');assert(peak<=4);
});
test('no coverage differs from an unavailable archive',async()=>{
 const args={observations,wavelengths,channel:1,signal:new AbortController().signal};
 const empty=await findWavelengthObservation({...args,inspect:async()=>({covered:false,wavelength:1.1})});
 assert.equal(empty.obs,null);assert.equal(empty.failures,0);
 const failed=await findWavelengthObservation({...args,inspect:async()=>{throw Error('Offline');}});
 assert.equal(failed.obs,null);assert.equal(failed.failures,9);
});
test('changing or removing a wavelength cancels pending results',async()=>{
 const controller=new AbortController();
 await assert.rejects(findWavelengthObservation({observations,wavelengths,channel:1,signal:controller.signal,inspect:async()=>{controller.abort();return {covered:true,wavelength:1.1};}}),{name:'AbortError'});
});

test('overlay compositor paints bottom to top, skips hidden layers and restores canvas state',()=>{
 const calls=[],ctx={globalAlpha:.3,globalCompositeOperation:'multiply',save(){this.saved=[this.globalAlpha,this.globalCompositeOperation];},restore(){[this.globalAlpha,this.globalCompositeOperation]=this.saved;},drawImage(canvas,x,y){calls.push([canvas,this.globalAlpha,this.globalCompositeOperation,x,y]);}};
 composeLayers(ctx,[{canvas:'base',visible:true,opacity:1},{canvas:'hidden',visible:false,opacity:1},{canvas:'middle',visible:true,opacity:.5},{canvas:'transparent',visible:true,opacity:0},{canvas:'top',visible:true,opacity:1}]);
 assert.deepEqual(calls,[['base',1,'source-over',0,0],['middle',.5,'source-over',0,0],['top',1,'source-over',0,0]]);
 assert.equal(ctx.globalAlpha,.3);assert.equal(ctx.globalCompositeOperation,'multiply');
});
