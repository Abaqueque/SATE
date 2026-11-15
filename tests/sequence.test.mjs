import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseRegion,parseObservations,validatedImagePath,handleObservations,handleFrame} from '../src/sequence-api.js';
import {makeWorldToPixel,wavelengthAt,createSkyGrid,alignImage,rawDetectorFrame} from '../src/spectral.js';
import {spreadOrder} from '../src/sequence-model.js';
import {cachedFrame,cacheFrame,frameCacheKey} from '../src/frame-cache.js';
const fixture=JSON.parse(await readFile(new URL('./fixtures/wcs-reference.json',import.meta.url)));
const query='http://local/api/observations?ra=133.795129&dec=-7.245147&size=.1&wavelength=4.5&tolerance=.1';
const path='/ibe/data/spherex/dr1/level2/test.fits';
const xml=rows=>'<VOTABLE><RESOURCE><INFO name="QUERY_STATUS" value="OK"/><TABLE>'+['access_url','t_min','obs_id','energy_bandpassname','obs_collection'].map(n=>'<FIELD name="'+n+'"/>').join('')+'<DATA><TABLEDATA>'+rows.map(r=>'<TR>'+r.map(v=>'<TD>'+v+'</TD>').join('')+'</TR>').join('')+'</TABLEDATA></DATA></TABLE></RESOURCE></VOTABLE>';
test('the loading queue preserves every exposure',()=>{
 for(const count of [0,1,2,3,121])assert.deepEqual(spreadOrder(Array.from({length:count},(_,i)=>i)).sort((a,b)=>a-b),Array.from({length:count},(_,i)=>i));
});
test('pixel cache reuses a patch across wavelength searches but isolates different regions',async()=>{
 const region={ra:10,dec:20,size:.1,wavelength:1.5};const key=frameCacheKey(region,path);
 assert.equal(key,frameCacheKey({...region,wavelength:4.5},path));assert.notEqual(key,frameCacheKey({...region,size:.2},path));
 const frame={values:new Float32Array([1,2,3,4]),width:2,height:2};await cacheFrame(key,frame);assert.deepEqual(await cachedFrame(key),frame);
});
test('celestial and spectral transforms agree with independently computed Astropy values',()=>{
 fixture.coords.forEach((coord,i)=>{const pixel=makeWorldToPixel(fixture.header)(...coord);pixel.forEach((v,k)=>assert.ok(Math.abs(v-fixture.pixels[i][k])<1e-5));assert.ok(Math.abs(wavelengthAt(fixture,...pixel)-fixture.wavelength[i])<1e-7);});
});
test('alignment enforces wavelength and quality masks',()=>{
 const header={CTYPE1:'RA---TAN',CTYPE2:'DEC--TAN',CRVAL1:0,CRVAL2:0,CRPIX1:5,CRPIX2:5,CD1_1:-.01,CD1_2:0,CD2_1:0,CD2_2:.01,CTYPE1W:'WAVE-TAB',CTYPE2W:'WAVE-TAB',PV1_3W:1,PV2_3W:2,CRPIX1W:1,CRPIX2W:1,CRVAL1W:0,CRVAL2W:0,CDELT1W:1,CDELT2W:1};
 const image={header,width:10,height:10,values:new Float64Array(100).fill(12),variance:new Float64Array(100).fill(1),flags:new Float64Array(100),zodi:new Float64Array(100).fill(2),waveTable:{X:[0,10],Y:[0,10],VALUES:[1,0,1,0,1,0,1,0]}};
 const grid=createSkyGrid(0,0,.02,8);const frame=alignImage(image,grid,1,.1);assert.equal(frame.coverage,1);assert.ok(frame.values.every(v=>v===10));
 assert.equal(alignImage(image,grid,2,.1).excluded,true);image.flags.fill(1);assert.throws(()=>alignImage(image,grid,1,.1),/No usable pixels/);
 const all=alignImage(image,grid,2,.1,{showAll:true});assert.equal(all.excluded,undefined);assert.equal(all.coverage,1);assert.equal(all.wavelength,1);assert.equal(all.flaggedFraction,1);assert.ok(all.values.every(v=>v===10));
 image.values.fill(NaN);assert.equal(alignImage(image,grid,2,.1,{showAll:true}).coverage,0);
 image.values.fill(12);const raw=rawDetectorFrame(image,'unsupported WCS');assert.equal(raw.aligned,false);assert.equal(raw.coverage,1);
});
test('invalid inputs and non-archive paths are rejected before fetching',async()=>{
 assert.throws(()=>parseRegion(new URL(query.replace('ra=133.795129','ra='))),/Missing/);
 assert.equal(parseRegion(new URL(query.replace('ra=133.795129','ra=360'))).ra,0);
 for(const p of ['https://example.com/x.fits','/ibe/data/spherex/dr1/level2/../x.fits','/etc/passwd'])assert.throws(()=>validatedImagePath(p));
 assert.equal((await handleFrame(new Request(query+'&image=invalid'))).status,400);
});
test('complete SIA parsing preserves all rows and detects overflow',()=>{
 const rows=Array.from({length:125},(_,i)=>['https://irsa.ipac.caltech.edu'+path,'60000','id'+i,'D1','dr1']);
 assert.equal(parseObservations(xml(rows)).length,125);
 assert.throws(()=>parseObservations(xml(rows).replace('value="OK"','value="OVERFLOW"')),/truncated/);
 assert.throws(()=>parseObservations('not a votable'),/invalid/);
});
test('observation endpoint sorts and deduplicates archive files without a first-80 cap',async()=>{
 const old=globalThis.fetch;try{
 const rows=Array.from({length:125},(_,i)=>['https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/'+i+'.fits',String(60125-i),'id'+i,'D1','dr1']);rows.push(rows[0]);
 globalThis.fetch=async()=>new Response(xml(rows));const response=await handleObservations(new Request(query));const data=await response.json();assert.equal(response.status,200);assert.equal(data.complete,true);assert.equal(data.observations.length,125);assert.equal(data.observations[0].mjd,60001);
 globalThis.fetch=async()=>new Response(xml([['https://example.com'+path,'60000','id','D1','dr1']]));assert.equal((await handleObservations(new Request(query))).status,502);
 }finally{globalThis.fetch=old;}
});
test('a joined field is searched with small cones that cover it',async()=>{
 const {searchCircles}=await import('../src/sequence-api.js');
 assert.deepEqual(searchCircles({ra:10,dec:20,size:.1}),[{ra:10,dec:20,radius:.000001}]);
 for(const size of [.15,.3,.6,1.05]){const circles=searchCircles({ra:.01,dec:-7,size,mosaic:true});
  assert.ok(circles.length<=25&&circles.every(c=>c.radius<=.071&&c.ra>=0&&c.ra<360));
  assert.ok(circles.some(c=>c.ra>359)&&circles.some(c=>c.ra<1),'cones wrap through RA 0');}
 // The default 0.30 degree field is fully covered: its corners lie inside a cone.
 const circles=searchCircles({ra:100,dec:0,size:.3,mosaic:true});assert.equal(circles.length,9);
 for(const [x,y] of [[.15,.15],[-.15,.15],[0,0],[.05,.05]])assert.ok(circles.some(c=>Math.hypot(c.ra-100-x,c.dec-y)<=c.radius+1e-6));
});
test('wavelength range of an image is read from its header and a standalone table',async()=>{
 const {wavelengthRange}=await import('../src/spectral.js');
 const card=(k,v)=>(k.padEnd(8)+'= '+String(v).padStart(20)).padEnd(80);
 const cards=[card('XTENSION',"'BINTABLE'"),card('BITPIX',8),card('NAXIS',2),card('NAXIS1',48),card('NAXIS2',1),card('PCOUNT',0),card('GCOUNT',1),card('TFIELDS',3),card('TTYPE1',"'X       '"),card('TFORM1',"'2E      '"),card('TTYPE2',"'Y       '"),card('TFORM2',"'2E      '"),card('TTYPE3',"'VALUES  '"),card('TFORM3',"'8E      '"),'END'.padEnd(80)];
 const bytes=new Uint8Array(5760);bytes.fill(32,0,2880);bytes.set(new TextEncoder().encode(cards.join('')));
 const view=new DataView(bytes.buffer);[0,10,0,10,1,0,2,0,1,0,2,0].forEach((v,i)=>view.setFloat32(2880+i*4,v,false));
 const header={NAXIS1:11,NAXIS2:11,CTYPE1W:'WAVE-TAB',CTYPE2W:'WAVE-TAB',PV1_3W:1,PV2_3W:2,CRPIX1W:1,CRPIX2W:1,CRVAL1W:0,CRVAL2W:0,CDELT1W:1,CDELT2W:1};
 const range=wavelengthRange(header,bytes);assert.ok(Math.abs(range.min-1)<1e-6&&Math.abs(range.max-2)<1e-6);
 assert.equal(wavelengthRange({...header,NAXIS1:40},bytes),null,'samples beyond the table are not guessed');
});
