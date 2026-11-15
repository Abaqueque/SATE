import test from 'node:test';
import assert from 'node:assert/strict';
import {skyAtPixel,motionStats,barnardExampleUrl} from '../sky-atlas/dist/motion-track.js';
import {makeWorldToPixel} from '../src/spectral.js';
import {targetCatalogue,predictPosition} from '../sky-atlas/dist/targets.js';
test('marked positions invert the displayed sky grid with subpixel precision',()=>{
 const grid={ra:359.98,dec:66,size:.2,pixels:117},toPixel=makeWorldToPixel({CTYPE1:'RA---TAN',CTYPE2:'DEC--TAN',CRVAL1:grid.ra,CRVAL2:grid.dec,CRPIX1:59,CRPIX2:59,CD1_1:-.2/117,CD1_2:0,CD2_1:0,CD2_2:-.2/117});
 for(const[x,y]of [[58,58],[3.4,98.7],[110,4]]){const p=skyAtPixel(grid,x,y),back=toPixel(p.ra,p.dec);assert(Math.abs(back[0]-x)<1e-7);assert(Math.abs(back[1]-y)<1e-7);}
});
test('motion summary handles date order, RA wrap, and no elapsed time',()=>{
 const a={ra:359.999,dec:0,date:'2025-01-01T00:00:00Z'},b={ra:.001,dec:0,date:'2026-01-01T00:00:00Z'};
 const stats=motionStats([b,a]);assert(Math.abs(stats.arcsec-7.2)<1e-6);assert.equal(stats.days,365);assert.equal(motionStats([a]),null);assert.equal(motionStats([a,{...b,date:a.date}]).perYear,null);
});
test('Barnard example preserves interpolation defaults and starts tracking on a full field',()=>{
 const url=new URL(barnardExampleUrl(),'https://local');assert.equal(url.searchParams.get('tracking'),'1');assert.equal(url.searchParams.get('framing'),'full');assert.equal(url.searchParams.get('target'),'barnard');assert.equal(url.searchParams.get('nearby'),'1');assert.equal(url.searchParams.get('exposure'),'2025W35_1A_0146_3');assert.equal(url.searchParams.get('compare'),'2026W34_1A_0363_3');
 const a=predictPosition(targetCatalogue[0],'2025-01-01'),b=predictPosition(targetCatalogue[0],'2026-01-01');const stats=motionStats([{...a,date:'2025-01-01'},{...b,date:'2026-01-01'}]);assert(stats.arcsec>10&&stats.arcsec<11);
});
