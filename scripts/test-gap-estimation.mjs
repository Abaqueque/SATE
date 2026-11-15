import test from 'node:test';
import assert from 'node:assert/strict';
import {gapCandidates,estimateMissingPixels} from '../sky-atlas/dist/cell-gap-estimation.js';
import {displayScale,cleanLevel} from '../sky-atlas/dist/cell-processing.js';
const frame=(values,wave,quality)=>({width:values.length,height:1,values:Float32Array.from(values),wavelengths:new Float64Array(values.length).fill(wave),quality:Uint8Array.from(quality||values.map(()=>1)),variance:new Float64Array(values.length).fill(1)});
test('spectral gap estimates preserve measurements and reject missing or flagged neighbours',()=>{
 const measured=frame([10,NaN,NaN,NaN],1.5),low=frame([900,4,5,NaN],1.4,[1,1,0,1]),high=frame([800,8,NaN,NaN],1.6),before=Float32Array.from(measured.values);
 const estimate=estimateMissingPixels(measured,[low,high],{wavelength:1.5,minWavelength:1.3,maxWavelength:1.7});
 assert.deepEqual(Array.from(estimate.values),[10,6,NaN,NaN]);assert.equal(estimate.estimatedCount,1);assert.equal(estimate.interpolatedCount,1);assert.deepEqual(measured.values,before);assert.equal(estimate.variance,measured.variance);assert.equal(estimate.quality,measured.quality);
 const far=estimateMissingPixels(measured,[frame([1,1,1,1],3)],{wavelength:1.5,minWavelength:1.3,maxWavelength:1.7});assert.equal(far.estimatedCount,0);
});
test('gap sources stay within six hours, nearby channels and required field coverage',()=>{
 const anchor={path:'a',mjd:60000},row=(path,wavelength,mjd=60000)=>({path,mjd,wavelength,checked:true});
 const candidates=[row('lower',1.4),row('upper',1.6),row('old',1.49,60001),row('far',2),{...row('partial',1.51),lowCoverage:true},{...row('failed',1.48),infoError:true}];
 assert.deepEqual(gapCandidates(candidates,anchor,[1.3,1.4,1.5,1.6,1.7],2).map(o=>o.path),['lower','upper']);
});
test('faint-detail stretch retains diffuse flux below the point-source median',()=>{
 const image=frame(Array.from({length:1000},(_,i)=>10+i*.1),1.5),detail=displayScale(image,{stretch:'detail'}),sources=displayScale(image);
 assert(cleanLevel(30,detail)>.1);assert.equal(cleanLevel(30,sources),0);assert(cleanLevel(90,detail)>cleanLevel(30,detail));assert.equal(cleanLevel(NaN,detail),0);
});
