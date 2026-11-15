import test from 'node:test';import assert from 'node:assert/strict';
import {viewportGrid,visibleCells,cellAt} from '../sky-atlas/dist/sky-model.js';
import {mapRegion} from '../sky-atlas/dist/ai-region-map.js';
test('zoom refines complete grids without truncating their centre or edge cells',()=>{
 for(const [ra,dec] of [[266.4,-29],[359.99,0],[.01,75],[135,-89.9]]){
  let previous=0;
  for(const fov of [360,120,79,40,20,10,5,2,1,.4,.12]){
   const g=viewportGrid(ra,dec,fov);assert(g.order>=previous);previous=g.order;assert(g.ids.length<=500);assert(g.ids.includes(cellAt(ra,dec,g.order)));assert.deepEqual(g.ids,visibleCells(ra,dec,fov,g.order));
  }
 }
});
test('selected region references preserve real order, identity and sky position',()=>{
 for(const [id,order]of [[100,2],[734163,9],[1,0]]){const r=mapRegion(id,order);assert.equal(r.key,`${order}:${id}`);assert.equal(cellAt(r.ra,r.dec,order),id);}
 assert.equal(mapRegion(-1,9),null);assert.equal(mapRegion(12,0),null);assert.equal(mapRegion(3,10),null);
});
import {reviewGridState,reviewGridStyle,reviewGridLegend} from '../sky-atlas/dist/sky-review-grid.js';
test('review shades are stable by real grid identity, subtle, and include all requested states',()=>{
 const states=new Set();for(let i=0;i<192;i++){states.add(reviewGridState(i,9));assert.equal(reviewGridState(i,9),reviewGridState(i,9));const style=reviewGridStyle(i,9);assert.equal(style.fill,true);assert.match(style.fillColor,/rgba/);}
 assert.deepEqual([...states].sort(),['followup','reviewed','unreviewed']);const legend=reviewGridLegend();assert(legend.includes('Needs further review'));assert(!legend.includes('Demo'));for(let order=0;order<9;order++){const style=reviewGridStyle(1,order);assert.equal(style.fill,false);assert.equal(style.fillColor,undefined);assert.equal(style.color,'rgba(170,181,193,.22)');}
});
import {continuousSkyPolygon} from '../sky-atlas/dist/sky-review-grid.js';
test('review fills avoid closing across the sky projection seam',()=>{
 assert(continuousSkyPolygon([[10,10],[20,10],[20,20],[10,10]],(x,y)=>[x,y],100));
 assert(!continuousSkyPolygon([[1,10],[99,10],[1,10]],(x,y)=>[x,y],100));
 assert(!continuousSkyPolygon([[1,10]],()=>undefined,100));
});
