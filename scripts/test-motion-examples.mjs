import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {motionExamples,motionExampleUrl} from '../sky-atlas/dist/motion-examples.js';
import {cellAt} from '../sky-atlas/dist/sky-model.js';
import {parseObservations,validatedImagePath} from '../src/sequence-api.js';
import {createSkyGrid,makeWorldToPixel} from '../src/spectral.js';
test('motion demo URLs centre their selected cell and retain verified initial exposures',()=>{
 for(const e of motionExamples){const u=new URL(motionExampleUrl(e.id),'https://local'),ra=Number(u.searchParams.get('sourceRa')),dec=Number(u.searchParams.get('sourceDec'));assert.equal(cellAt(ra,dec),Number(u.searchParams.get('hpx')));assert.equal(u.searchParams.get('exposure'),e.first);assert.equal(u.searchParams.get('compare'),e.last);assert.equal(u.searchParams.get('tracking'),'1');assert.equal(u.searchParams.get('nearby'),'1');}
 assert.equal(motionExampleUrl('missing'),null);
});
test('comet seeds match the official NASA exposure table and remain in one fixed field',async()=>{
 const table=parseObservations(await readFile(new URL('../docs/3i-atlas-observations.vot',import.meta.url),'utf8'));
 const demo=JSON.parse(await readFile(new URL('../sky-atlas/dist/assets/motion-3i-atlas.json',import.meta.url),'utf8'));
 const grid=createSkyGrid(167.202,5.1486,.2),project=makeWorldToPixel({CTYPE1:'RA---TAN',CTYPE2:'DEC--TAN',CRVAL1:grid.ra,CRVAL2:grid.dec,CRPIX1:59,CRPIX2:59,CD1_1:-.2/117,CD1_2:0,CD2_1:0,CD2_2:-.2/117});
 assert.equal(demo.observations.length,11);let last=-Infinity;
 for(const obs of demo.observations){const original=table.find(r=>r.obs_id===obs.id&&r.spherex_detector==='D5');assert(original);assert.equal(obs.expected.ra,Number(original.comet_ra));assert.equal(obs.expected.dec,Number(original.comet_dec));assert.equal(validatedImagePath(obs.path),obs.path);assert(obs.mjd>last);last=obs.mjd;const[x,y]=project(obs.expected.ra,obs.expected.dec);assert(x>=0&&y>=0&&x<grid.pixels&&y<grid.pixels);}
 const first=demo.observations[0],end=demo.observations.at(-1);assert((end.mjd-first.mjd)*24>3);assert(Math.abs(end.expected.ra-first.expected.ra)>.15);
});
test('new moving-object demos use matched MOST exposure positions inside their fixed fields',async()=>{
 for(const id of ['vesta','ceres','swan']){
  const e=motionExamples.find(e=>e.id===id),original=parseObservations(await readFile(new URL('../docs/most-'+id+'.txt',import.meta.url),'utf8')),demo=JSON.parse(await readFile(new URL('../sky-atlas/dist'+e.curated,import.meta.url),'utf8'));
  const project=makeWorldToPixel({CTYPE1:'RA---TAN',CTYPE2:'DEC--TAN',CRVAL1:e.centre.ra,CRVAL2:e.centre.dec,CRPIX1:59,CRPIX2:59,CD1_1:-.2/117,CD1_2:0,CD2_1:0,CD2_2:-.2/117});
  assert(demo.observations.length>=4);assert.equal(demo.observations[0].id,e.first);assert.equal(demo.observations.at(-1).id,e.last);
  for(const obs of demo.observations){const row=original.find(r=>r.observationid===obs.id&&r.productid===obs.band.replace('SPHEREx-',''));assert(row);assert.equal(obs.expected.ra,Number(row.ra_obj));assert.equal(obs.expected.dec,Number(row.dec_obj));assert.equal(validatedImagePath(obs.path),'/'+row.uri);const[x,y]=project(obs.expected.ra,obs.expected.dec);assert(x>=0&&y>=0&&x<117&&y<117);}
 }
});
