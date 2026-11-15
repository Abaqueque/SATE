import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLayerHue,tintGrayscale} from '../sky-atlas/dist/cell-colour.js';
const linear=v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const luminance=p=>.2126*linear(p[0])+.7152*linear(p[1])+.0722*linear(p[2]);
const ramp=Uint8ClampedArray.from(Array.from({length:256},(_,i)=>[i,i,i,255]).flat());
test('all hues preserve displayed luminance, monotonic brightness, black and white',()=>{
 for(let hue=0;hue<360;hue++){
  const tinted=tintGrayscale(ramp,hue);let previous=-1;
  for(let level=0;level<256;level++){
   const pixel=tinted.subarray(level*4,level*4+4),light=luminance(pixel);
   assert(Math.abs(light-linear(level))<.0045,'Luminance differs beyond 8-bit rounding');
   assert(light>=previous,'Brightness order changed');previous=light;
   assert.equal(pixel[3],255);
  }
  assert.deepEqual([...tinted.subarray(0,4)],[0,0,0,255]);
  assert.deepEqual([...tinted.subarray(-4)],[255,255,255,255]);
 }
});
test('red, green and blue selections produce distinct hues without changing alpha or source pixels',()=>{
 const source=new Uint8ClampedArray([80,80,80,255,120,120,120,96,25,25,25,0]),before=source.slice();
 for(const [hue,dominant] of [[0,0],[120,1],[240,2]]){
  const output=tintGrayscale(source,hue);
  assert(output[dominant]>output[(dominant+1)%3]);assert(output[dominant]>output[(dominant+2)%3]);
  assert.equal(output[7],96);assert.deepEqual(output.subarray(8),source.subarray(8));
 }
 assert.deepEqual(source,before);
});
test('grayscale and malformed saved hues are lossless, including zero-degree red',()=>{
 assert.equal(parseLayerHue('0'),0);assert.equal(parseLayerHue('359'),359);
 for(const invalid of [null,undefined,'','gray','bad','Infinity',-1,360,12.5]){
  assert.equal(parseLayerHue(invalid),null);assert.deepEqual(tintGrayscale(ramp,invalid),ramp);
 }
 assert.deepEqual(tintGrayscale(ramp,null),ramp);
});
