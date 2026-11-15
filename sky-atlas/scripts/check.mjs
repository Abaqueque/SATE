import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {regionBounds,cellBounds,parseSelection,nextRegion,MIRA,regionStatus,readState} from '../dist/model.js';
let area=0;
for(let r=0;r<72;r++){const b=regionBounds(r);assert.equal(b.west-b.east,30);assert.equal(b.north-b.south,30);let subarea=0;for(let c=0;c<9;c++){const q=cellBounds(r,c);assert(q.west<=b.west&&q.east>=b.east&&q.north<=b.north&&q.south>=b.south);subarea+=(q.west-q.east)*(q.north-q.south);}assert.equal(subarea,900);area+=subarea;}
assert.equal(area,360*180);
const m=JSON.parse(await readFile(new URL('../dist/assets/mira.json',import.meta.url)));const b=cellBounds(MIRA.region,MIRA.cell);assert(m.ra>b.east&&m.ra<b.west&&m.dec>b.south&&m.dec<b.north);assert.equal(m.observations.length,4);assert(m.observations.every(o=>o.url.startsWith('https://')&&o.obsid));assert(m.ratio>0&&m.ratio<1);
assert.deepEqual(parseSelection('?region=-1&cell=100'),{region:null,cell:null});assert.deepEqual(parseSelection('?region=16&cell=1'),MIRA);
const n=nextRegion({});assert(n&&!(n.region===MIRA.region&&n.cell===MIRA.cell));assert.deepEqual(readState({getItem:()=>'{broken'}).reviews,{});
const reviews={};for(let c=0;c<9;c++)reviews['2:'+c]={status:'reviewed'};assert.equal(regionStatus(2,reviews),'reviewed');reviews['2:0']={status:'waiting'};assert.notEqual(regionStatus(2,reviews),'reviewed');
for(const p of ['index.html','app.js','style.css','atlas.js','model.js','explore/index.html','contribute/index.html','about/index.html','wavelength-demo/index.html','wavelength-demo.js','saved-cells/index.html','cell-documents.js','cell-documents-store.js','assets/LICENSE','assets/mira-1.png','assets/mira-2.png','assets/stars.json'])await access(new URL('../dist/'+p,import.meta.url));
console.log('PASS: 648-cell partition, selected-source coordinates, four provenance records, partial review status, malformed storage, assignment and all direct-entry routes.');
