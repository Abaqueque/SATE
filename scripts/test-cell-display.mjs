import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedCoverageCrop,falseColour,colourize} from '../sky-atlas/dist/cell-display.js';

const frame=(n,covered)=>({values:Float32Array.from({length:n*n},(_,i)=>covered(i%n,Math.floor(i/n))?1:NaN)});
test('shared framing finds the same centred sky square inside both exposure footprints',()=>{
 const a=frame(21,(x,y)=>y>=4),b=frame(21,(x,y)=>x<=16);
 const crop=sharedCoverageCrop([a,b],21);assert.deepEqual(crop,{x:4,y:4,size:13});
 for(const f of [a,b])for(let y=crop.y;y<crop.y+crop.size;y++)for(let x=crop.x;x<crop.x+crop.size;x++)assert(Number.isFinite(f.values[y*21+x]));
 assert.deepEqual(sharedCoverageCrop([b,a],21),crop);
});
test('enclosed bad pixels do not change framing; absent central coverage is explicit',()=>{
 const f=frame(21,()=>true);f.values[220]=NaN;assert.equal(sharedCoverageCrop([f],21).size,21);
 assert.equal(sharedCoverageCrop([frame(21,(x,y)=>y<3)],21).partial,true);
});
test('false colour preserves transparency and maps identical intensity identically',()=>{
 const data=Uint8ClampedArray.of(0,0,0,255,128,128,128,255,255,255,255,0),ctx={getImageData:()=>({data}),putImageData:()=>{}};
 colourize({width:3,height:1,getContext:()=>ctx});
 assert.deepEqual(Array.from(data.slice(0,3)),falseColour(0));assert.deepEqual(Array.from(data.slice(4,7)),falseColour(128/255));assert.equal(data[11],0);
 assert.deepEqual(falseColour(-1),falseColour(0));assert.deepEqual(falseColour(2),falseColour(1));
});
