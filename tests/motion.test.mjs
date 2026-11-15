import test from 'node:test';
import assert from 'node:assert/strict';
import {groupVisits,stackFrames,brightestCentroid,sharedScale,difference} from '../src/motion.js';

const W=40;
// A Gaussian star on a flat sky, optionally with one cosmic-ray pixel.
function frame(x,y,{sky=0,hit=-1}={}){const v=new Float32Array(W*W);for(let j=0;j<W;j++)for(let i=0;i<W;i++)v[j*W+i]=sky+100*Math.exp(-((i-x)**2+(j-y)**2)/8);if(hit>=0)v[hit]=5000;return v;}

test('exposures split into visits at long gaps only',()=>{
  const jobs=[60000,60001,60009,60200,60203,60230].map(mjd=>({obs:{mjd}}));
  assert.deepEqual(groupVisits(jobs.reverse()).map(v=>v.map(j=>j.obs.mjd)),[[60000,60001,60009],[60200,60203,60230]]);
  assert.deepEqual(groupVisits([]),[]);
});

test('median stack removes sky offsets and a cosmic-ray hit',()=>{
  const stack=stackFrames([frame(20,20,{sky:5}),frame(20,20,{sky:50,hit:3}),frame(20,20,{sky:-7})]);
  assert.ok(Math.abs(stack[3])<1,'the one-frame hit is rejected');
  assert.ok(Math.abs(stack[20*W+20]-100)<1,'the star keeps its brightness');
  const partial=frame(20,20);partial[0]=NaN;assert.ok(Number.isFinite(stackFrames([partial,frame(20,20)])[0]),'a missing sample does not blank the pixel');
  assert.equal(stackFrames([]),null);
});

test('a star moved between two stacks is measured to a fraction of a pixel',()=>{
  const a=brightestCentroid(stackFrames([frame(18.3,22.6),frame(18.3,22.6)]),W),b=brightestCentroid(stackFrames([frame(20.1,15.9),frame(20.1,15.9)]),W);
  assert.ok(Math.abs(a.x-18.3)<.1&&Math.abs(a.y-22.6)<.1);
  assert.ok(Math.abs(Math.hypot(b.x-a.x,b.y-a.y)-Math.hypot(1.8,6.7))<.15);
  assert.equal(brightestCentroid(new Float32Array(W*W).fill(NaN),W),null);
});

test('difference shows a moved star as a dark and a bright spot; scale is shared',()=>{
  const earlier=frame(18,22),later=frame(20,16),d=difference(later,earlier);
  assert.ok(d[22*W+18]<-90&&d[16*W+20]>90);assert.ok(Math.abs(d[0])<1e-3);
  const scale=sharedScale([earlier,later]);assert.ok(scale.low<1&&scale.high>scale.low);
});

// Motion controls must not turn cadence, wavelength or source changes into motion.
const {groupNights,matchingFrame,sourceNear,trackSource,fitMotion,uniqueExposures,stackMeasurements}=await import('../src/motion.js');
const quality=new Uint8Array(W*W).fill(1);
const science=(values,wavelength=1.25)=>({values,quality,wavelength,wavelengths:new Float64Array(values.length).fill(wavelength),aligned:true,gridKey:'grid',unit:'MJy/sr',backgroundRemoved:true});

test('UTC nights split at midnight, even within a continuous observing visit',()=>{
  const jobs=[60002.01,60000.99,60001.01,60001.99].map(mjd=>({obs:{mjd}}));
  assert.deepEqual(groupNights(jobs).map(g=>g.map(j=>j.obs.mjd)),[[60000.99],[60001.01,60001.99],[60002.01]]);
  assert.equal(groupVisits(jobs,.5).length,2,'the old gap-based groups were different');
});

test('matching requires calibrated centre AND local wavelengths; preserves flags',()=>{
  const f=science(frame(20,20));f.wavelengths[0]=1.28;f.quality=quality.slice();f.quality[20*W+20]=0;
  const m=matchingFrame(f,1.25);assert.ok(Number.isNaN(m.values[0]));assert.equal(m.quality[20*W+20],0);assert.equal(m.values[20*W+20],100);
  assert.equal(matchingFrame(science(f.values,1.28),1.25),null);
  assert.equal(matchingFrame({...f,aligned:false},1.25),null);
  assert.equal(matchingFrame(f,0),null);
  assert.ok(matchingFrame(science(f.values,1.2625),1.25),'inclusive 1% boundary');
});

test('same local source stays selected when a distant brighter star appears',()=>{
  const values=frame(18,20),bright=frame(34,20);for(let i=0;i<values.length;i++)values[i]+=bright[i]*8;
  const c=sourceNear(values,W,{x:19.5,y:19.5},{searchRadius:12,apertureRadius:6,quality});
  assert.ok(c?.trusted);assert.ok(Math.abs(c.x-18)<.15);
  const rival=frame(24,20);for(let i=0;i<values.length;i++)values[i]+=rival[i];
  assert.equal(sourceNear(values,W,{x:21,y:20},{searchRadius:12,apertureRadius:6,quality}),null,'ambiguous neighbours are withheld');
});

test('a missing target cannot jump to a distant bright source; core flags withhold rate',()=>{
  const entries=[{values:frame(18,20),quality,mjd:60000},{values:frame(33,20),quality,mjd:60001}];
  const tracked=trackSource(entries,W,1.5);assert.ok(tracked[0].centre);assert.equal(tracked[1].centre,null);
  const flagged=quality.slice();flagged[20*W+20]=0;
  const series=[60000,60200,60400].map(mjd=>({values:frame(20,20),quality:flagged,mjd}));
  assert.ok(trackSource(series,W,1.5).every(i=>i.centre&&!i.centre.trusted));
  assert.equal(fitMotion(trackSource(series,W,1.5),1.5).valid,false);
  const missing=frame(20,20);missing[20*W+20]=NaN;
  assert.equal(sourceNear(missing,W,{x:20,y:20},{quality}).trusted,false);
});

test('fit uses dates equally, ignores flagged positions, and requires sufficient baseline',()=>{
  const entries=[0,10,200,400].map((d,i)=>({mjd:60000+d,centre:{x:20+d*.01,y:20-d*.02,trusted:true},members:Array(i?100:1)}));
  const f=fitMotion(entries,1.5);assert.ok(f.valid);assert.ok(Math.abs(f.rate-Math.hypot(.01,.02)*365.25*1.5)<1e-9);assert.ok(f.rms<1e-10);
  assert.equal(fitMotion([...entries,{mjd:60300,centre:{x:100,y:100,trusted:false}}],1.5).rate,f.rate);
  assert.equal(fitMotion(entries.slice(0,2),1.5).valid,false);
  assert.equal(fitMotion(entries.map((e,i)=>({...e,mjd:60000+i})),1.5).valid,false);
});

test('stack never clears flags, mixes incompatible calibration, or duplicates an exposure',()=>{
  const a=science(frame(20,20)),b=science(frame(20,20));b.quality=quality.slice();b.quality[20*W+20]=0;
  assert.equal(stackMeasurements([a,b]).quality[20*W+20],0);
  assert.equal(stackMeasurements([a,{...b,unit:'counts'}]),null);
  assert.equal(stackMeasurements([a,{...b,backgroundRemoved:false}]),null);
  assert.equal(uniqueExposures([{obs:{id:'one',band:'D2',path:'a'}},{obs:{id:'one',band:'D2',path:'b'}},{obs:{id:'one',band:'D3',path:'c'}}]).length,2);
});

const {wavelengthStops,nearestWavelength,matchedJobs}=await import('../src/motion.js');
test('wavelength slider stops are ordered, stable for repeats, and snap over empty gaps',()=>{
  const jobs=[1.25,1.251,4.5,.8,NaN,6].map(w=>({frame:science(frame(20,20),w)}));
  const stops=wavelengthStops(jobs);assert.equal(stops.length,3);assert.ok(Math.abs(stops[1]-1.2505)<1e-6);assert.equal(stops[0],.8);assert.equal(stops[2],4.5);
  assert.equal(nearestWavelength(stops,2),stops[1]);assert.equal(nearestWavelength(stops,4),4.5);assert.equal(nearestWavelength([],1.25),1.25);
});
test('overlap wavelengths choose one detector using temporal coverage, not fitted motion',()=>{
  const jobs=[['D1',60000],['D1',60001],['D2',60000],['D2',60200],['D2',60400]].map(([band,mjd])=>({obs:{band,mjd},frame:science(frame(20,20))}));
  const selected=matchedJobs(jobs,1.25);assert.equal(selected.length,3);assert.ok(selected.every(j=>j.obs.band==='D2'));
});

const {fitAcrossBands}=await import('../src/motion.js');
test('cross-band fit separates colour-dependent positions from common movement',()=>{
  const rows=[];
  for(let b=0;b<5;b++)for(const day of [0,180,365.25])rows.push({band:'D1',wavelength:.8+b*.04,mjd:60000+day,centre:{x:20+b*2-day/365.25,y:20-b*3+2*day/365.25,trusted:true}});
  const fit=fitAcrossBands(rows,1.5);assert.ok(fit.valid);assert.equal(fit.groups,5);assert.ok(Math.abs(fit.rate-Math.hypot(1.5,3))<1e-9);assert.ok(fit.spread<1e-9);
  assert.equal(fitAcrossBands(rows.filter(r=>r.mjd<60300),1.5).valid,false);
  assert.equal(fitAcrossBands(rows.map(r=>({...r,centre:{...r.centre,trusted:false}})),1.5).valid,false);
  const stationary=rows.map(r=>({...r,centre:{...r.centre,x:20+(r.wavelength-.8)*50,y:20}}));assert.equal(fitAcrossBands(stationary,1.5).valid,false,'different band positions alone cannot establish motion');
});
test('cross-band fit withholds inconsistent wavelength-dependent movement',()=>{
  const rows=[];for(let b=0;b<5;b++)for(const day of [0,365.25])rows.push({band:'D1',wavelength:.8+b*.04,mjd:60000+day,centre:{x:20+(b%2?-3:3)*day/365.25,y:20,trusted:true}});
  assert.equal(fitAcrossBands(rows,1.5).valid,false);
});

test('display merge accepts ±5% centrally and masks pixels beyond the same window',()=>{
  const f=science(frame(20,20),1.3125);f.wavelengths[0]=1.3126;
  const selected=matchedJobs([{obs:{mjd:60000,band:'D2'},frame:f}],1.25,.05);
  assert.equal(selected.length,1);assert.ok(Number.isNaN(selected[0].selected.values[0]));assert.ok(Number.isFinite(selected[0].selected.values[1]));
  assert.equal(matchedJobs([{obs:{mjd:60000,band:'D2'},frame:science(frame(20,20),1.313)}],1.25,.05).length,0);
});
