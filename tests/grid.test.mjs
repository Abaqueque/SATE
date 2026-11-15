import test from 'node:test';
import assert from 'node:assert/strict';
import {nearbyObservations} from '../src/sequence-model.js';
import {brightnessColour,drawAligned} from '../src/spectral.js';
const jobs=hours=>hours.map((h,i)=>({obs:{mjd:60000+h/24,id:String(i),band:'D2',path:i+'.fits'},status:'pending'}));
test('nearby grid uses actual time, remains chronological and does not fill sparse visits with distant epochs',()=>{
  const rows=jobs([0,.1,.2,100,101,102]);
  assert.deepEqual(nearbyObservations(rows,0,24).map(r=>r.index),[0,1,2]);
  assert.deepEqual(nearbyObservations(rows,4,24).map(r=>r.index),[3,4,5]);
  assert.deepEqual(nearbyObservations([],0),[]);
  assert.equal(nearbyObservations(jobs([0]),0).length,1);
});
test('grid selects nine nearest times, includes anchor and window edges, independent of download status',()=>{
  const rows=jobs(Array.from({length:40},(_,i)=>i/4));
  rows[15].status='failed';
  assert.deepEqual(nearbyObservations(rows,18,24).map(r=>r.index),[14,15,16,17,18,19,20,21,22]);
  assert.equal(nearbyObservations(jobs([-12,0,12,13]),1,24).length,3);
});
test('repeated reductions are not counted twice, while selected reduction wins tied times',()=>{
  const rows=jobs([0,0,0]);rows[0].obs.id=rows[1].obs.id='same';
  assert.deepEqual(nearbyObservations(rows,1).map(r=>r.index),[1,2]);
});
test('false colour has increasing luminance and grayscale remains neutral',()=>{
  let previous=-1;
  for(let i=0;i<=255;i++){
    const [r,g,b]=brightnessColour(i/255),lum=.2126*r+.7152*g+.0722*b;
    assert.ok(lum>=previous);previous=lum;
    const gray=brightnessColour(i/255,'grayscale');assert.equal(gray[0],gray[1]);assert.equal(gray[1],gray[2]);
  }
});
test('shared scale maps equal intensity identically across different images and leaves missing data transparent',()=>{
  function render(values,palette){let pixels;const context={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>pixels=image.data};const canvas={getContext:()=>context};drawAligned(canvas,{values,width:values.length,height:1},{low:0,high:10},palette);return pixels;}
  const first=render([0,5,NaN],'false-colour'),second=render([10,5,1],'false-colour');
  assert.deepEqual([...first.slice(4,8)],[...second.slice(4,8)]);assert.equal(first[11],0);
  const gray=render([5],'grayscale');assert.equal(gray[0],gray[1]);assert.equal(gray[1],gray[2]);
});
