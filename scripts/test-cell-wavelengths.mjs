import test from 'node:test';
import assert from 'node:assert/strict';
import {findWavelengthObservation,wavelengthParameters,composeLayers,createLayerTimeline} from '../sky-atlas/dist/cell-wavelengths.js';

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

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('timeline commits every layer together and keeps left and right independent',async()=>{
 const layers=[{id:1},{id:2}],requests=[],commits=[];
 const timeline=createLayerTimeline({layers:()=>layers,load:(layer,target)=>{const job=deferred();requests.push({layer,target,job});return job.promise;},onCommit:(side,result)=>commits.push({side,result})});
 const left=timeline.sync('left',{mjd:60000}),right=timeline.sync('right',{mjd:60300});
 requests[0].job.resolve('early-one');await Promise.resolve();assert.equal(commits.length,0);assert(timeline.pending('left'));
 requests[2].job.resolve('late-one');requests[3].job.resolve('late-two');await right;
 assert.equal(commits.length,1);assert.equal(commits[0].side,'right');assert(timeline.pending('left'));
 requests[1].job.resolve('early-two');await left;assert.deepEqual(commits[1].result.map(r=>r.value),['early-one','early-two']);assert(!timeline.pending('left'));
});
test('rapid timeline seeks cancel obsolete stacks even when the old request resolves last',async()=>{
 const requests=[],commits=[],timeline=createLayerTimeline({layers:()=>[1],load:(layer,target,signal)=>{const job=deferred();requests.push({job,signal});return job.promise;},onCommit:(side,result,target)=>commits.push(target.mjd)});
 const old=timeline.sync('left',{mjd:1}),latest=timeline.sync('left',{mjd:2});assert(requests[0].signal.aborted);
 requests[1].job.resolve('new');await latest;requests[0].job.resolve('old');await old;assert.deepEqual(commits,[2]);
 const closed=timeline.sync('left',{mjd:3});timeline.close();requests[2].job.resolve('closed');await closed;assert.deepEqual(commits,[2]);
});
test('an unavailable layer resolves the stack with an error rather than leaving old data',async()=>{
 let committed;const timeline=createLayerTimeline({layers:()=>[1,2],load:async layer=>{if(layer===2)throw Error('Unavailable');return 'new-frame';},onCommit:(side,result)=>committed=result});
 await timeline.sync('left',{mjd:60000});assert.equal(committed[0].value,'new-frame');assert.equal(committed[1].error.message,'Unavailable');assert(!timeline.pending('left'));
});
test('wavelength observations follow both ends of the timeline',async()=>{
 const args={observations,wavelengths,channel:1,signal:new AbortController().signal,inspect:async()=>({covered:true,wavelength:1.1})};
 const early=await findWavelengthObservation({...args,anchorMjd:60000}),late=await findWavelengthObservation({...args,anchorMjd:60008});
 assert.equal(early.obs.id,'0');assert.equal(late.obs.id,'8');
});

test('coverage cropping keeps every wavelength layer on the same displayed sky grid',()=>{
 const calls=[],ctx={save(){},restore(){},drawImage(...args){calls.push([this.globalAlpha,...args]);}};
 composeLayers(ctx,[{canvas:'base',visible:true,opacity:1},{canvas:'overlay',visible:true,opacity:.4}],{x:12,y:18,size:160});
 assert.deepEqual(calls,[[1,'base',12,18,160,160,0,0,160,160],[.4,'overlay',12,18,160,160,0,0,160,160]]);
});
