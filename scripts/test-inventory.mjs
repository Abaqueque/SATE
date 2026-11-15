import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleInventory,parseInventoryTable} from '../src/inventory-api.js';
import {inventoryRows} from '../sky-atlas/dist/inventory.js';
import {center} from '../sky-atlas/dist/sky-model.js';
import {cellAt} from '../sky-atlas/dist/sky-model.js';
import {insideImageField} from '../sky-atlas/dist/inventory-field.js';
import {skyAtPixel} from '../sky-atlas/dist/motion-track.js';
const raw=await readFile(new URL('./fixtures/inventory-allwise.tbl',import.meta.url),'utf8');
test('AllWISE data preserve measurements and filter membership in arbitrary cells',()=>{
  const sources=parseInventoryTable(raw);assert.equal(sources.length,678);assert.equal(sources[0].w1,17.795);
  assert.equal(inventoryRows({cell:734163,sources}).length,198);
  const cell=173380,inside={name:'inside',...center(cell)},outside={name:'outside',...center(734163)};
  assert.deepEqual(inventoryRows({cell,sources:[inside,outside]}),[inside]);
  assert.throws(()=>parseInventoryTable('<html>Archive error</html>'));
});
test('image-field inventories include neighbouring cells and handle poles and RA wrap',()=>{
 const cell=734163,field={...center(cell),size:.2},grid={...field,pixels:117};
 const neighbours=[];for(let y=0;y<117;y+=10)for(let x=0;x<117;x+=10){const p=skyAtPixel(grid,x,y);if(cellAt(p.ra,p.dec)!==cell)neighbours.push({...p,name:'neighbour-'+x+'-'+y});}
 assert(neighbours.length>0);const data={cell,field,sources:neighbours};assert.equal(inventoryRows(data,{scope:'field'}).length,neighbours.length);assert.equal(inventoryRows(data,{scope:'cell'}).length,0);
 for(const c of [{ra:359.99,dec:0,size:.2},{ra:45,dec:89.98,size:.2}]){const g={...c,pixels:117};assert(insideImageField(skyAtPixel(g,5,100),c));assert(!insideImageField(skyAtPixel(g,-20,60),c));}
});
test('inventory API queries the image centre and full corner radius with separate cache entries',async()=>{
 let calls=0;const req=extra=>new Request('http://localhost/api/inventory?cell=734163'+extra);
 const fetcher=async url=>{calls++;assert.equal(url.searchParams.get('objstr'),'225.55 59.52');assert(Number(url.searchParams.get('radius'))>.1414);return new Response(raw);};
 for(const extra of ['&ra=1','&ra=1&dec=2&size=0','&ra=360&dec=2&size=.2','&ra=1&dec=91&size=.2','&ra=&dec=2&size=.2'])assert.equal((await handleInventory(req(extra),{fetcher})).status,400);
 const extra='&ra=225.55&dec=59.52&size=.2';const response=await handleInventory(req(extra),{fetcher});assert.equal(response.status,200);assert.deepEqual((await response.json()).field,{ra:225.55,dec:59.52,size:.2});
 await handleInventory(req(extra),{fetcher});assert.equal(calls,1);await handleInventory(req(extra+'&refresh=1'),{fetcher});assert.equal(calls,2);
 await handleInventory(req('&ra=225.56&dec=59.52&size=.2'),{fetcher:async url=>{calls++;assert.equal(url.searchParams.get('objstr'),'225.56 59.52');return new Response(raw);}});assert.equal(calls,3);
});
test('inventory endpoint validates cells, caches successes, refreshes and retries failures',async()=>{
  let calls=0;const fetcher=async url=>{calls++;assert.equal(url.hostname,'irsa.ipac.caltech.edu');assert.equal(url.searchParams.get('outrows'),'2001');return new Response(raw);};
  const req=(cell,extra='')=>new Request('http://localhost/api/inventory?cell='+cell+extra);
  for(const bad of ['-1','3145728','x',''])assert.equal((await handleInventory(req(bad),{fetcher})).status,400);
  assert.equal(calls,0);
  const response=await handleInventory(req(734163),{fetcher});assert.equal(response.status,200);assert.equal((await response.json()).sources.length,678);
  await handleInventory(req(734163),{fetcher});assert.equal(calls,1);
  await handleInventory(req(734163,'&refresh=1'),{fetcher});assert.equal(calls,2);
  assert.equal((await handleInventory(req(734164),{fetcher:async()=>new Response('Unavailable',{status:503})})).status,502);
  assert.equal((await handleInventory(req(734164),{fetcher})).status,200);
});
