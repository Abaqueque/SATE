import test from 'node:test';
import assert from 'node:assert/strict';
import {selectionRanges,inRanges,uniqueExposures,matchingExposures,stackCandidates,timelineLayout,nearestExposure} from '../sky-atlas/dist/cell-selection.js';
import {processDisplay,displayScale,cleanLevel} from '../sky-atlas/dist/cell-processing.js';
import {parseRegion,handleObservations,handleFrameInfo} from '../src/sequence-api.js';
import {wavelengthAtSky} from '../src/spectral.js';

test('single, all and mixed selections mask exactly their wavelength bins',()=>{
 const waves=[1,1.1,1.2,1.3],single=selectionRanges(waves,'single',1),mix=selectionRanges(waves,'mix',0,[0,3]);
 assert(inRanges(1.1,single));assert(!inRanges(1,single));assert(!inRanges(1.2,single));
 assert(inRanges(1,mix));assert(inRanges(1.3,mix));assert(!inRanges(1.1,mix));assert(!inRanges(1.2,mix));
 const frame={width:4,height:1,values:Float32Array.of(1,2,3,4),wavelengths:Float64Array.from(waves),variance:Float64Array.of(1,1,1,1),quality:Uint8Array.of(1,1,1,1)};
 const out=processDisplay(frame,{ranges:mix,denoise:0,repair:true});assert.deepEqual(Array.from(out.values),[1,NaN,NaN,4]);
 assert.deepEqual(Array.from(processDisplay(frame,{ranges:[],spectralMask:false,denoise:0}).values),[1,2,3,4]);assert.deepEqual(Array.from(frame.values),[1,2,3,4]);
});
test('every matching exposure remains accessible, including same-day and fully masked ones',()=>{
 const obs=Array.from({length:130},(_,i)=>({id:String(i),path:'/image'+i,band:'D2',mjd:60000+i/86400,date:'2023-02-25',match:true}));
 const unique=uniqueExposures([...obs].reverse().concat({...obs[0],path:'/duplicate'}));
 assert.equal(unique.length,130);assert.equal(matchingExposures(unique).length,130);assert.equal(unique[0].id,'0');assert.equal(unique.at(-1).id,'129');
});
test('coadd candidates stay close in time and wavelength',()=>{
 const anchor={path:'a',band:'D2',mjd:60000,wavelength:1.5};
 const rows=[anchor,{...anchor,path:'b',mjd:60000.01},{...anchor,path:'late',mjd:60000.2},{...anchor,path:'wave',wavelength:1.6},{...anchor,path:'detector',band:'D3'}];
 assert.deepEqual(stackCandidates(rows,anchor).map(o=>o.path),['b']);
});
test('fixed display scale preserves relative intensity between exposures',()=>{
 const scale=displayScale({values:Float32Array.from([0,0,0,0,1,2,5,10,20]),variance:new Float64Array(9).fill(1)});
 assert(cleanLevel(20,scale)>cleanLevel(10,scale));assert.equal(cleanLevel(0,scale),0);assert.equal(cleanLevel(NaN,scale),0);
});
const query='https://local/api/observations?ra=20&dec=10&size=.2&wavelength=1.1&tolerance=.05';
test('archive query uses selected spectral coverage; All has no band restriction',async()=>{
 const old=globalThis.fetch,urls=[];
 globalThis.fetch=async u=>{urls.push(new URL(u));return new Response('<VOTABLE><TABLE><DATA><TABLEDATA/></DATA></TABLE></VOTABLE>');};
 try{
  for(const mode of ['single','all','mix']){const res=await handleObservations(new Request(query+'&mode='+mode+(mode==='mix'?'&wavelengths=1,4.5':'')));assert.equal(res.status,200);}
  assert.equal(urls[1].searchParams.has('BAND'),false);
  const band=urls[2].searchParams.get('BAND').split(' ').map(Number);assert(Math.abs(band[0]-.95e-6)<1e-12);assert(Math.abs(band[1]-4.55e-6)<1e-12);
  assert.throws(()=>parseRegion(new URL(query+'&mode=mix')));assert.throws(()=>parseRegion(new URL(query+'&mode=mix&wavelengths=.1')));assert.throws(()=>parseRegion(new URL(query+'&mode=bad')));
 }finally{globalThis.fetch=old;}
});
const card=(k,v)=>(k.padEnd(8)+'= '+String(typeof v==='string'?"'"+v+"'":v).padStart(20)).padEnd(80);
function hdu(header,size=2880){const b=new Uint8Array(size);b.fill(32,0,2880);b.set(new TextEncoder().encode(Object.entries(header).map(([k,v])=>card(k,v)).join('')+'END'.padEnd(80)));return b;}
const header={XTENSION:'IMAGE',EXTNAME:'IMAGE',BITPIX:-32,NAXIS:2,NAXIS1:11,NAXIS2:11,CTYPE1:'RA---TAN',CTYPE2:'DEC--TAN',CRVAL1:20,CRVAL2:10,CRPIX1:6,CRPIX2:6,CD1_1:-.01,CD1_2:0,CD2_1:0,CD2_2:.01,CTYPE1W:'WAVE-TAB',CTYPE2W:'WAVE-TAB',PV1_3W:1,PV2_3W:2,CRPIX1W:1,CRPIX2W:1,CRVAL1W:0,CRVAL2W:0,CDELT1W:1,CDELT2W:1};
const table=hdu({XTENSION:'BINTABLE',EXTNAME:'WCS-WAVE',BITPIX:8,NAXIS:2,NAXIS1:48,NAXIS2:1,PCOUNT:0,GCOUNT:1,TFIELDS:3,TTYPE1:'X',TFORM1:'2E',TTYPE2:'Y',TFORM2:'2E',TTYPE3:'VALUES',TFORM3:'8E'},5760);
const view=new DataView(table.buffer);[0,10,0,10,1,0,2,0,1,0,2,0].forEach((v,i)=>view.setFloat32(2880+i*4,v,false));
test('header calibration uses the requested sky position and rejects positions outside exposure',()=>{
 const centre=wavelengthAtSky(header,table,20,10);assert(Math.abs(centre.wavelength-1.5)<1e-8);assert.equal(wavelengthAtSky(header,table,25,10),null);
});
test('frame metadata fetches only the header and this exact exposure calibration',async()=>{
 const old=globalThis.fetch,requests=[];const primary=hdu({SIMPLE:'T',BITPIX:8,NAXIS:0}),body=new Uint8Array(5760);body.set(primary);body.set(hdu(header),2880);
 globalThis.fetch=async(u,options)=>{requests.push({url:String(u),range:options.headers.range});return new Response(options.headers.range==='bytes=-5760'?table:body,{status:206});};
 try{const image='/ibe/data/spherex/dr1/level2/metadata-test.fits',response=await handleFrameInfo(new Request(query+'&image='+encodeURIComponent(image)));assert.equal(response.status,200);const info=await response.json();assert.equal(info.covered,true);assert(Math.abs(info.wavelength-1.5)<1e-8);assert.equal(requests.length,2);assert(requests.every(r=>r.url.endsWith(image)));assert(requests.every(r=>r.range));}finally{globalThis.fetch=old;}
});

test('timeline spacing reflects elapsed time and retains individual same-day observations',()=>{
 const rows=[0,1,10].map((days,i)=>({id:i,mjd:60000+days,date:new Date((60000+days-40587)*86400000).toISOString()}));
 assert.deepEqual(timelineLayout(rows).points.map(p=>p.position),[0,.1,1]);assert.equal(timelineLayout(rows).sameDay,false);
 const visits=[0,1,3].map(minutes=>({mjd:60000+minutes/1440,date:'2023-02-25T00:00:00Z'})),layout=timelineLayout(visits);
 assert.equal(layout.sameDay,true);assert(Math.abs(layout.points[1].position-1/3)<1e-6);assert.equal(timelineLayout([rows[0]]).points[0].position,.5);assert.deepEqual(timelineLayout([]).points,[]);
});

test('scrubbing chooses the nearest real observation across unequal time gaps',()=>{
 const rows=[0,1,10].map((day,i)=>({id:i,mjd:60000+day}));
 assert.equal(nearestExposure(rows,.1).id,1);assert.equal(nearestExposure(rows,.4).id,1);assert.equal(nearestExposure(rows,.8).id,2);
 assert.equal(nearestExposure(rows,-1).id,0);assert.equal(nearestExposure(rows,2).id,2);assert.equal(nearestExposure([rows[1]],.7).id,1);assert.equal(nearestExposure([],0),null);
});
