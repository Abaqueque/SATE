import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldWidth} from '../sky-atlas/dist/cell-field.js';
import {wavelengthParameters} from '../sky-atlas/dist/cell-wavelengths.js';
import {createSkyGrid} from '../src/spectral.js';
import {skyAtPixel} from '../sky-atlas/dist/motion-track.js';
import {fitsLink} from '../sky-atlas/dist/cell-documents-store.js';

test('field widths validate URL input and keep custom precision',()=>{
 for(const value of [null,undefined,'',' ',NaN,Infinity,'no',0,.009,.351])assert.equal(fieldWidth(value),.2);
 for(const width of [.01,.05,.055,.10,.2,.35])assert.equal(fieldWidth(String(width)),width);
});
test('changing width changes the sky footprint and every wavelength request together',()=>{
 const position={ra:216.110564,dec:-6.987388};
 for(const size of [.05,.10,.35]){
  const grid=createSkyGrid(position.ra,position.dec,size);
  for(const channel of [0,1,2]){
   const query=wavelengthParameters({...position,size},[1,2,3],channel);
   assert.equal(Number(query.get('size')),grid.size);assert.equal(Number(query.get('ra')),grid.ra);assert.equal(Number(query.get('dec')),grid.dec);
  }
  const centre=skyAtPixel(grid,(grid.pixels-1)/2,(grid.pixels-1)/2);assert(Math.abs(centre.ra-position.ra)<1e-10);assert(Math.abs(centre.dec-position.dec)<1e-10);
  const link=new URL(fitsLink('/ibe/data/spherex/dr1/example.fits',position,size));assert(Math.abs(Number(link.searchParams.get('size'))-size*1.5)<1e-10);
 }
});
