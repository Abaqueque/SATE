import test from 'node:test';
import assert from 'node:assert/strict';
import {composeMosaic} from '../src/mosaic.js';
import {alignImage,createSkyGrid,sharedStretch} from '../src/spectral.js';
import {handleObservations,parseRegion} from '../src/sequence-api.js';

const grid=createSkyGrid(0,0,.06,6);
function image(crpix,value){
  return {width:4,height:8,values:new Float64Array(32).fill(value),variance:new Float64Array(32).fill(1),flags:new Float64Array(32),
    header:{CTYPE1:'RA---TAN',CTYPE2:'DEC--TAN',CRVAL1:0,CRVAL2:0,CRPIX1:crpix,CRPIX2:4.5,CD1_1:-.01,CD1_2:0,CD2_1:0,CD2_2:.01,BUNIT:'MJy/sr',CTYPE1W:'WAVE-TAB',CTYPE2W:'WAVE-TAB',PV1_3W:1,PV2_3W:2,CRPIX1W:1,CRPIX2W:1,CRVAL1W:0,CRVAL2W:0,CDELT1W:1,CDELT2W:1},
    waveTable:{X:[-10,10],Y:[-10,20],VALUES:[1.5,0,1.5,0,1.5,0,1.5,0]}};
}
function job(id,crpix=4,value=10,mjd=60000){return {status:'ready',obs:{id,band:'D2',path:id+'.fits',mjd},frame:alignImage(image(crpix,value),grid,1.5,.1,{showAll:true})};}
const options={mjd:60000,hours:24,wavelength:1.5,tolerance:.05};
test('adjacent detector footprints join at their true sky positions without repeating the central field',()=>{
  const left=job('left'),right=job('right',1,20);
  const result=composeMosaic([left,right],grid,options);
  assert.equal(result.frame.width,6);assert.equal(result.frame.coverage,1);assert.equal(result.members.length,2);
  for(let y=0;y<6;y++)assert.deepEqual([...result.frame.values.slice(y*6,y*6+6)],[10,10,10,20,20,20]);
  assert.ok(result.tileCoverage.every(n=>n===1));
});
test('missing neighbouring sky stays transparent rather than repeating a source image',()=>{
  const result=composeMosaic([job('left')],grid,options);
  assert.equal(result.frame.coverage,.5);
  for(let y=0;y<6;y++)for(let x=3;x<6;x++)assert.ok(Number.isNaN(result.frame.values[y*6+x]));
});
test('joined field stays aligned across RA wrap and near the pole',()=>{
  for(const [ra,dec] of [[359.99,0],[0,89.9]]){
    const target=createSkyGrid(ra,dec,.06,6);
    const sources=[image(4,10),image(1,20)].map((source,i)=>{source.header.CRVAL1=ra;source.header.CRVAL2=dec;return {obs:{id:String(i),band:'D2',path:i+'.fits',mjd:60000},status:'ready',frame:alignImage(source,target,1.5,.1,{showAll:true})};});
    const result=composeMosaic(sources,target,options);
    assert.equal(result.frame.coverage,1);
    for(let y=0;y<6;y++)assert.deepEqual([...result.frame.values.slice(y*6,y*6+6)],[10,10,10,20,20,20]);
  }
});
test('mosaic colour stretch ignores masked, missing and off-wavelength measurements',()=>{
  const f={values:[2,3,1e9,NaN,1e8],quality:[1,1,0,1,1],wavelengths:[1.5,1.5,1.5,1.5,2]};
  const stretch=sharedStretch([f],{quality:true,wavelength:1.5,tolerance:.05});
  assert.equal(stretch.samples,2);assert.equal(stretch.low,2);assert.equal(stretch.high,3);
});
test('mosaic rejects remote epochs, wrong wavelengths, invalid quality and incompatible registrations',()=>{
  const left=job('left'),late=job('late',1,20,60002),wrong=job('wrong',1,30),unaligned=job('unaligned',1,40);
  wrong.frame.wavelengths.fill(2);unaligned.frame.gridKey='wrong';
  const result=composeMosaic([left,late,wrong,unaligned],grid,options);
  assert.equal(result.frame.coverage,.5);assert.deepEqual(result.members.map(j=>j.obs.id),['left']);
  left.frame.quality.fill(0);assert.equal(composeMosaic([left],grid,options).frame,null);
});
test('overlap uses closest actual wavelength, with independent weighted averaging optional',()=>{
  const a=job('a'),b=job('b',4,20);a.frame.wavelengths.fill(1.52);
  assert.equal(composeMosaic([a,b],grid,options).frame.values[0],20);
  a.frame.wavelengths.fill(1.5);b.frame.variance.fill(4);a.frame.variance.fill(1);
  const averaged=composeMosaic([a,b],grid,{...options,average:true});
  assert.equal(averaged.frame.values[0],12);assert.equal(averaged.frame.variance[0],.8);assert.equal(averaged.averagedPixels,18);
  b.obs.id=a.obs.id;assert.equal(composeMosaic([a,b],grid,{...options,average:true}).averagedPixels,0);
});
test('mosaic archive search covers the wider spatial footprint',async()=>{
  const old=globalThis.fetch;const requested=[];
  try{
    globalThis.fetch=async url=>{requested.push(new URL(url));return new Response('<VOTABLE><RESOURCE><TABLE><FIELD name="access_url"/><TABLEDATA/></TABLE></RESOURCE></VOTABLE>');};
    const url='http://local/api/observations?ra=0&dec=0&size=.3&wavelength=1.5&tolerance=.1&mosaic=true';
    assert.equal((await handleObservations(new Request(url))).status,200);
    // One wide cone stalls the archive; nine small cones span the same 0.30 degree field.
    const cones=requested.map(u=>u.searchParams.get('POS').split(' ').slice(1).map(Number));
    assert.equal(cones.length,9);assert.ok(cones.every(c=>c[2]<=.071));
    assert.ok(Math.max(...cones.map(c=>c[1]))-Math.min(...cones.map(c=>c[1]))>.19);
    assert.equal(parseRegion(new URL(url.replace('size=.3','size=1.05'))).mosaic,true);
    assert.throws(()=>parseRegion(new URL(url.replace('size=.3','size=1.1'))));
  }finally{globalThis.fetch=old;}
});
