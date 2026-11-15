import test from 'node:test';
import assert from 'node:assert/strict';
import {centroidNear} from '../sky-atlas/dist/motion-centroid.js';
function star(cx,cy){const width=31,height=31,values=Float32Array.from({length:width*height},(_,i)=>10+100*Math.exp(-((i%width-cx)**2+(Math.floor(i/width)-cy)**2)/(2*.8**2)));return{width,height,values,quality:new Uint8Array(width*height).fill(1)};}
test('tracking follows subpixel movement on original pixels',()=>{
 let seed={x:14,y:15};for(const[x,y]of [[14.2,15.1],[14.5,15.5],[14.8,16.2]]){const f=star(x,y),before=Float32Array.from(f.values),found=centroidNear(f,seed);assert(found);assert(Math.abs(found.x-x)<.1);assert(Math.abs(found.y-y)<.1);assert.deepEqual(f.values,before);seed=found;}
});
test('tracking leaves absent sources missing and reports flagged measurements',()=>{
 assert.equal(centroidNear({width:31,height:31,values:new Float32Array(961).fill(NaN)},{x:15,y:15}),null);
 assert.equal(centroidNear({width:31,height:31,values:new Float32Array(961).fill(10)},{x:15,y:15}),null);
 const f=star(15,15);f.quality.fill(0);assert.equal(centroidNear(f,{x:15,y:15}).flagged,true);
 assert.equal(centroidNear(star(28,28),{x:5,y:5}),null);
});
