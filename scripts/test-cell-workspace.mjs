import test from 'node:test';
import assert from 'node:assert/strict';
import {processDisplay,groupVisits} from '../sky-atlas/dist/cell-processing.js';
import {parseRegion,validatedImagePath,parseObservations} from '../src/sequence-api.js';
const frame=(width=11)=>({width,height:width,values:Float32Array.from({length:width**2},(_,i)=>10+Math.sin(i*19)*2),variance:new Float64Array(width**2).fill(4),wavelengths:new Float64Array(width**2).fill(2),quality:new Uint8Array(width**2).fill(1)});
test('denoising reduces grain without changing original measurements or bright source peaks',()=>{
 const f=frame(),i=60;f.values[i]=100;const before=Array.from(f.values);const out=processDisplay(f,{wavelength:2,denoise:2});assert.deepEqual(Array.from(f.values),before);assert(out.values[i]>95);const noise=a=>a.filter((_,i)=>i!==60).reduce((s,v)=>s+(v-10)**2,0);assert(noise(Array.from(out.values))<noise(before)*.7);
});
test('quality and wavelength masking are distinct controls and gaps are not silently filled',()=>{
 const f=frame();f.quality[60]=0;f.wavelengths[61]=2.2;const out=processDisplay(f,{wavelength:2,denoise:0});assert(Number.isNaN(out.values[60]));assert(Number.isNaN(out.values[61]));
 const full=processDisplay(f,{wavelength:2,denoise:0,quality:false,spectralMask:false});assert.equal(full.values[60],f.values[60]);assert.equal(full.values[61],f.values[61]);
 const fixed=processDisplay(f,{wavelength:2,denoise:0,repair:true,spectralMask:false});assert(Number.isFinite(fixed.values[60]));assert.equal(fixed.repaired,1);assert.equal(f.quality[60],0);
 f.values[0]=NaN;f.values[20]=NaN;f.values[21]=NaN;f.values[22]=NaN;const large=processDisplay(f,{wavelength:2,denoise:0,repair:true});assert(Number.isNaN(large.values[0]));assert(Number.isNaN(large.values[21]));
});
test('visits use UTC dates and deduplicate re-released exposures',()=>{
 const make=(id,mjd,date,path,band='D2')=>({id,mjd,date,path,band});const rows=[make('b',3,'2025-06-10T02:00:00Z','/b'),make('a',1,'2025-05-10T22:00:00Z','/a'),make('a',1,'2025-05-10T22:00:00Z','/duplicate'),make('a',1,'2025-05-10T22:00:00Z','/d3','D3')];const visits=groupVisits(rows);assert.deepEqual(visits.map(v=>v.day),['2025-05-10','2025-06-10']);assert.equal(visits[0].observations.length,2);
});
test('archive proxy rejects missing settings, untrusted paths and truncated searches',()=>{
 assert.throws(()=>parseRegion(new URL('https://local/?ra=1&dec=1&size=.2&wavelength=2')));assert.throws(()=>validatedImagePath('https://evil.test/image.fits'));assert.throws(()=>validatedImagePath('/ibe/data/spherex/dr1/level2/../secret.fits'));assert.throws(()=>parseObservations('<VOTABLE><INFO name="QUERY_STATUS" value="OVERFLOW"/></VOTABLE>'));
});
