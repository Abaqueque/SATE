import test from 'node:test';
import assert from 'node:assert/strict';
import {averageNearby} from '../sky-atlas/dist/cell-stack.js';
import {alignImage} from '../src/spectral.js';

function job(id,values=[10,20],v=1,time=60000,wave=1.5){
  return {status:'ready',obs:{id,path:id+'.fits',band:'D2',mjd:time},frame:{values:Float32Array.from(values),variance:new Float64Array(values.length).fill(v),quality:new Uint8Array(values.length).fill(1),wavelengths:new Float64Array(values.length).fill(wave),wavelength:wave,width:values.length,height:1,aligned:true,gridKey:'same',unit:'MJy/sr',backgroundRemoved:true}};
}
test('weighted average and propagated variance follow inverse variance weights',()=>{
  const a=job('a'),b=job('b',[14,24],4);
  const result=averageNearby([a,b],a);
  assert.ok(Math.abs(result.frame.values[0]-10.8)<1e-6);
  assert.equal(result.frame.variance[0],.8);
  assert.deepEqual([...result.frame.counts],[2,2]);
  assert.deepEqual([...a.frame.values],[10,20]);
});
test('independent equal-noise exposures reduce variance by their count',()=>{
  const frames=[job('a',[8],4),job('b',[10],4),job('c',[12],4),job('d',[10],4)];
  const result=averageNearby(frames,frames[0]);
  assert.equal(result.frame.values[0],10);assert.equal(result.frame.variance[0],1);
});
test('time, wavelength, registration, units and duplicate reductions are screened',()=>{
  const a=job('a'),b=job('b'),duplicate=job('b',[999,999]),late=job('late',[100,100],1,60001),wrongWave=job('wave',[100,100],1,60000,1.6);
  const unaligned=job('unaligned'),wrongGrid=job('grid'),unit=job('unit'),background=job('background');
  unaligned.frame.aligned=false;wrongGrid.frame.gridKey='different';unit.frame.unit='Jy';background.frame.backgroundRemoved=false;
  const result=averageNearby([a,b,duplicate,late,wrongWave,unaligned,wrongGrid,unit,background],a);
  assert.deepEqual(result.members.map(j=>j.obs.id),['a','b']);
  assert.deepEqual([...result.frame.values],[10,20]);
  assert.equal(averageNearby([a,late,wrongWave],a).frame,null);
});
test('local wavelength and bad pixels are masked without hiding original exposures',()=>{
  const a=job('a'),b=job('b');b.frame.wavelengths[0]=1.6;b.frame.quality[1]=0;
  assert.equal(averageNearby([a,b],a).frame,null);
  b.frame.quality[1]=1;const result=averageNearby([a,b],a);
  assert.ok(Number.isNaN(result.frame.values[0]));assert.equal(result.frame.values[1],20);assert.equal(result.frame.coverage,.5);
  b.frame.variance.fill(NaN);assert.equal(averageNearby([a,b],a).frame,null);
});
test('robust clipping rejects isolated extreme samples with three or more measurements',()=>{
  const frames=[job('a',[10]),job('b',[10.1]),job('c',[1000])];
  const result=averageNearby(frames,frames[0]);assert.equal(result.rejected,1);
  assert.ok(Math.abs(result.frame.values[0]-10.05)<1e-5);
  assert.equal(result.members.length,2);
  // A pair alone cannot establish which value is an outlier.
  assert.equal(averageNearby([frames[0],frames[2]],frames[0]).frame.values[0],505);
});
test('bilinear registration carries squared-weight variance and actual wavelength',()=>{
  const header={CTYPE1:'RA---TAN',CTYPE2:'DEC--TAN',CRVAL1:0,CRVAL2:0,CRPIX1:1.5,CRPIX2:1.5,CD1_1:-.01,CD1_2:0,CD2_1:0,CD2_2:.01,BUNIT:'MJy/sr',CTYPE1W:'WAVE-TAB',CTYPE2W:'WAVE-TAB',PV1_3W:1,PV2_3W:2,CRPIX1W:1,CRPIX2W:1,CRVAL1W:0,CRVAL2W:0,CDELT1W:1,CDELT2W:1};
  const image={header,width:2,height:2,values:new Float64Array([1,2,3,4]),variance:new Float64Array(4).fill(4),flags:new Float64Array(4),waveTable:{X:[0,2],Y:[0,2],VALUES:[1.5,0,1.5,0,1.5,0,1.5,0]}};
  const grid={ra:0,dec:0,size:.01,pixels:1,coordinates:[0,0]};
  const frame=alignImage(image,grid,1.5,.1,{showAll:true});
  assert.equal(frame.values[0],2.5);assert.equal(frame.variance[0],1);assert.equal(frame.quality[0],1);assert.equal(frame.wavelengths[0],1.5);
  image.flags[0]=NaN;const flagged=alignImage(image,grid,1.5,.1,{showAll:true});assert.equal(flagged.quality[0],0);assert.equal(flagged.values[0],2.5);
});
