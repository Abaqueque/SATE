import test from 'node:test';
import assert from 'node:assert/strict';
import {positionAt,sexagesimal,sexagesimalParameter} from '../sky-atlas/dist/known-positions.js';
import {parseSimbad,parseSmallBodies,handleKnownObjects,exposureEpoch} from '../src/known-objects-api.js';
const metadata=['main_id','ra','dec','pmra','pmdec','otype'].map(name=>({name}));
test('SIMBAD proper motion uses cos(dec), handles RA wrapping and absent motion',()=>{
 const a=positionAt({ra:359.999,dec:60,pmra:3600,pmdec:0},51544.5+365.25);assert(Math.abs(a.ra-.001)<1e-6);
 const b=positionAt({ra:10,dec:0,pmra:0,pmdec:10000},51544.5+25*365.25);assert(Math.abs(b.dec-250/3600)<1e-6);
 assert.equal(positionAt({ra:10,dec:20,pmra:null,pmdec:null},60000).propagated,false);
 assert(Number.isFinite(positionAt({ra:10,dec:90,pmra:200,pmdec:-10},60000).ra));
 const records=parseSimbad({metadata,data:[['star',10,20,null,null,'*']]});assert.equal(records[0].pmra,null);assert.throws(()=>parseSimbad({metadata:[],data:[]}));
});
test('JPL uses final numerical positions only, including negative declinations',()=>{
 assert.equal(sexagesimal('-00 30\'00"'),-.5);assert.equal(sexagesimal('12:00:00',true),180);assert.equal(sexagesimalParameter(-.5),'M00-30-00.000');
 const field={ra:180,dec:-.5,size:.2},base={signature:{version:'1.1'},n_second_pass:1,fields_second:['Object name','Astrometric RA (hh:mm:ss)','Astrometric Dec (dd mm\'ss")','Visual magnitude (V)'],data_second_pass:[['Example','12:00:00','-00 30\'00"','20.2']],data_first_pass:[['Wrong','00:00:00','00 00\'00"','10']]};
 assert.equal(parseSmallBodies(base,field)[0].name,'Example');assert.deepEqual(parseSmallBodies({...base,n_second_pass:0},field),[]);assert.throws(()=>parseSmallBodies({...base,signature:{version:'2'}},field));assert.throws(()=>parseSmallBodies({...base,n_second_pass:2},field));assert.deepEqual(parseSmallBodies(base,{ra:0,dec:0,size:.1}),[]);
});
function fitsHeader(cards){const text=cards.map(([key,value])=>`${key.padEnd(8)}= ${String(value).padStart(20)}`.padEnd(80)).join('')+'END'.padEnd(80);return text.padEnd(Math.ceil(text.length/2880)*2880);}
test('midpoint comes from the IMAGE header, never from the selected date or current clock',async()=>{
 const body=fitsHeader([['SIMPLE','T'],['BITPIX',8],['NAXIS',0]])+fitsHeader([['XTENSION',"'IMAGE'"],['BITPIX',-32],['NAXIS',2],['NAXIS1',10],['NAXIS2',10],['MJD-AVG',60000.25]]);
 const fetcher=async()=>new Response(body),epoch=await exposureEpoch('/ibe/data/spherex/dr1/level2/test-midpoint.fits',fetcher,AbortSignal.timeout(1000));assert.equal(epoch.mjd,60000.25);assert.equal(epoch.date,'2023-02-25T06:00:00.000Z');
 await assert.rejects(exposureEpoch('/ibe/data/spherex/dr1/level2/test-missing.fits',async()=>new Response(fitsHeader([['SIMPLE','T'],['BITPIX',8],['NAXIS',0]])),AbortSignal.timeout(1000)));
});
test('API rejects invalid fields and paths before network access; outages are not empty results',async()=>{
 const bad=()=>{throw Error('must not fetch')};for(const query of ['ra=&dec=2&size=.1','ra=1&dec=91&size=.1','ra=1&dec=2&size=4','kind=solar&ra=1&dec=2&size=.1&image=https://evil.test/a.fits'])assert.equal((await handleKnownObjects(new Request('https://local/?'+query),{fetcher:bad})).status,400);
 const r=await handleKnownObjects(new Request('https://local/?ra=12&dec=2&size=.1'),{fetcher:async()=>new Response('down',{status:503})});assert.equal(r.status,502);assert((await r.json()).error);
});
test('API builds bounded SIMBAD queries and explicit geocentric second-pass ephemerides',async()=>{
 let queries=[];const fetcher=async url=>{queries.push(new URL(url));return new Response(JSON.stringify({metadata,data:[['Test star',13,2,0,0,'*']]}));};
 const r=await handleKnownObjects(new Request('https://local/?ra=13&dec=2&size=.1'),{fetcher});assert.equal(r.status,200);assert.match(queries[0].searchParams.get('query'),/TOP 1501/);
 const body=fitsHeader([['SIMPLE','T'],['BITPIX',8],['NAXIS',0],['MJD-AVG',60001]]);queries=[];
 const solar=await handleKnownObjects(new Request('https://local/?kind=solar&ra=13&dec=2&size=.1&image=/ibe/data/spherex/dr1/level2/test-solar.fits'),{fetcher:async url=>{const u=new URL(url);queries.push(u);return new Response(u.hostname==='irsa.ipac.caltech.edu'?body:JSON.stringify({signature:{version:'1.1'},n_second_pass:0}));}});
 assert.equal(solar.status,200);assert.equal(queries[1].searchParams.get('obs-time'),'2460001.5');assert.equal(queries[1].searchParams.get('xobs'),'0,0,0');assert.equal(queries[1].searchParams.get('two-pass'),'true');assert.match((await solar.json()).observer,/Earth centre/);
});
