import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CELL_COUNT,CELL_ARCMIN,cellAt,center,boundary,nearby,MIRA_CELL,parseSky,channelTransportHz} from '../dist/sky-model.js';
assert.equal(CELL_COUNT,3145728);assert(CELL_ARCMIN>6.87&&CELL_ARCMIN<6.88);
let checked=0;for(const dec of [-90,-89.999,-66.6,-41.81,0,41.81,66.6,89.999,90])for(const ra of [0,1e-7,45,90,135,180,225,270,315,359.999999]){const id=cellAt(ra,dec),p=center(id);assert.equal(cellAt(p.ra,p.dec),id);assert.equal(cellAt(ra+360,dec),id);const ns=nearby(id);assert(ns.length===8||ns.length===9);assert.equal(new Set(ns).size,ns.length);for(const n of ns)assert(nearby(n).includes(id),'symmetric neighbours');assert(boundary(id).every(p=>p.every(Number.isFinite)));checked++;}
const m=JSON.parse(await readFile(new URL('../dist/assets/mira.json',import.meta.url)));assert.equal(cellAt(m.ra,m.dec),MIRA_CELL);
assert.deepEqual(parseSky('?hpx=734163&order=9'),{id:734163,order:9});for(const s of ['?hpx=-1','?hpx=3145728','?hpx=4&order=10','?hpx=x','?hpx=1.5'])assert.equal(parseSky(s),null);
for(let i=0;i<102;i++){const min=299792458/5.009e-6,max=299792458/.743e-6;assert.equal(Math.floor((channelTransportHz(i)-min)/(max-min)*102),i);}
console.log(`PASS: ${checked} coordinate cases, RA wrap, poles, symmetric HEALPix neighbours, Mira identity, URL validation and all 102 channel addresses.`);
// Independently generated using astropy-healpix. Exact shared vertices permit
// any incident cell; center and neighbour checks use the selected cell's ID.
const ref=JSON.parse(await readFile(new URL('./healpix-reference.json',import.meta.url)));
for(const r of ref){const id=cellAt(r.ra,r.dec);assert(r.allowedIds.includes(id),`reference cell at ${r.ra},${r.dec}`);assert.deepEqual(nearby(id).sort((a,b)=>a-b),r.neighbors);const p=center(id);assert(Math.abs(p.dec-r.center[1])<1e-7);assert(Math.abs((p.ra-r.center[0]+540)%360-180)<1e-7);}
console.log('PASS: 590 independent Astropy coordinate, center and neighbour cases (including seams and poles).');
