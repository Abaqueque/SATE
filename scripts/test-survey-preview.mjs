import test from 'node:test';
import assert from 'node:assert/strict';
import {surveyPixel,surveyTileUrl} from '../sky-atlas/dist/cell-survey-preview.js';
import {pix2ang_nest,bit_combine} from '../sky-atlas/dist/vendor/healpix.js';
import {frameCoverageInfo} from '../sky-atlas/dist/cell-coverage.js';
import {exposureDistance} from '../sky-atlas/dist/cell-selection.js';

test('survey PNG pixels use the correct spectral plane and nested tile orientation',()=>{
 for(const tile of [0,5359,7304,12287])for(const [ne,nw] of [[0,0],[1,0],[0,1],[127,435],[511,511]]){
  const index=tile*512**2+bit_combine(ne,nw),{theta,phi}=pix2ang_nest(16384,index),pixel=surveyPixel(phi*180/Math.PI,90-theta*180/Math.PI);
  assert.deepEqual(pixel,{tile,offset:(ne*512+nw)*4});
 }
 assert.equal(surveyTileUrl({url:'https://archive/survey'},12287,62),'https://archive/survey/Norder5/Dir10000/Npix12287_62.png');
 assert.deepEqual(surveyPixel(359.99,89.99),surveyPixel(-.01,89.99));
});
test('downloaded FITS coverage retains wavelength calibration and the full-field threshold',()=>{
 assert.deepEqual(frameCoverageInfo({raw:{values:new Float32Array([1,2,NaN,3,4]),wavelength:3.29}}),{wavelength:3.29,covered:true,coverage:.8});
 assert.equal(frameCoverageInfo({raw:{values:new Float32Array([1,2,3]),wavelength:NaN}}).covered,false);
});
test('first-image ordering favours centred footprints, including across RA wrap',()=>{
 const p={ra:359.99,dec:40};assert(exposureDistance({centre:{ra:.01,dec:40}},p)<exposureDistance({centre:{ra:1,dec:40}},p));assert.equal(exposureDistance({},p),Infinity);
});
