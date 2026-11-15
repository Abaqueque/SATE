// Revalidate the bundled starting observations against the public archive.
// Downloads remain outside the repository; the response pixels are not modified.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {handleFrameInfo,handleFrame} from '../src/sequence-api.js';
import {parseSpectralImage,createSkyGrid,alignImage} from '../src/spectral.js';
const dir=new URL('../sky-atlas/dist/assets/example-sequences/',import.meta.url),metadata=JSON.parse(await readFile(new URL('../sky-atlas/dist/assets/spherex-survey.json',import.meta.url)));
for(const file of await readdir(dir)){
 const {name,region,observations}=JSON.parse(await readFile(new URL(file,dir))),wavelength=metadata.wavelengths[region.channel],grid=createSkyGrid(region.ra,region.dec,region.size);
 for(const obs of observations){const params=new URLSearchParams({ra:region.ra,dec:region.dec,size:region.size,wavelength,tolerance:.05,mode:'single',image:obs.path}),response=await handleFrameInfo(new Request('https://local/api/frame-info?'+params)),info=await response.json();assert(response.ok,info.error);assert(info.covered&&info.coverage>=.8);assert(Math.abs(info.wavelength-obs.wavelength)<1e-8);
  const imageResponse=await handleFrame(new Request('https://local/api/frame?'+params));assert(imageResponse.ok,await(!imageResponse.ok?imageResponse.text():Promise.resolve('')));const image=parseSpectralImage(await imageResponse.arrayBuffer());assert.equal(image.header.OBSID,obs.id);assert(Math.abs(image.header['MJD-OBS']-obs.mjd)*86400<2,'observation time agrees with FITS');const aligned=alignImage({...image,zodi:null},grid,wavelength,.08,{showAll:true}),coverage=aligned.values.reduce((n,v)=>n+Number(Number.isFinite(v)),0)/aligned.values.length;assert(coverage>=.8);console.log(name,obs.id,'PASS',coverage.toFixed(3));
 }
}
