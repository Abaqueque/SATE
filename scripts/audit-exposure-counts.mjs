import {handleObservations,handleFrameInfo} from '../src/sequence-api.js';
import {channelRange,inRanges,uniqueExposures} from '../sky-atlas/dist/cell-selection.js';
import {forEachConcurrent} from '../sky-atlas/dist/cell-requests.js';
import {readFile,writeFile} from 'node:fs/promises';
const {wavelengths}=JSON.parse(await readFile(new URL('../sky-atlas/dist/assets/spherex-survey.json',import.meta.url)));
const channel=32,wavelength=wavelengths[channel],results=[];
for(const field of [{name:'Barnard',ra:269.4462685026598,dec:4.768204478798888},{name:'Orion',ra:83.8221,dec:-5.3911}]){
 const params=new URLSearchParams({ra:field.ra,dec:field.dec,size:.2,wavelength,tolerance:.025,mode:'single'});
 const response=await handleObservations(new Request('http://localhost/api/observations?'+params)),data=await response.json();
 if(!response.ok){console.log(JSON.stringify({field:field.name,error:data}));continue;}
 const observations=uniqueExposures(data.observations),report={...field,wavelength,archiveCandidates:observations.length,rawRows:data.observations.length,checked:0,failed:0,centreCovered:0,exactWavelength:0,nearbyCoverage80:0,exactCoverage80:0,dates:[observations[0]?.date,observations.at(-1)?.date]};
 console.log(JSON.stringify({field:field.name,candidates:observations.length}));
 await forEachConcurrent(observations,async obs=>{try{const q=new URLSearchParams(params);q.set('image',obs.path);const r=await handleFrameInfo(new Request('http://localhost/api/frame-info?'+q));const info=await r.json();if(!r.ok)throw Error(info.error);report.checked++;const exact=info.covered&&inRanges(info.wavelength,[channelRange(wavelengths,channel)]);if(info.covered)report.centreCovered++;if(exact)report.exactWavelength++;if(info.covered&&info.coverage>=.8)report.nearbyCoverage80++;if(exact&&info.coverage>=.8)report.exactCoverage80++;}catch{report.failed++;}},{concurrency:6});
 results.push(report);console.log(JSON.stringify(report));await writeFile(new URL('../docs/exposure-count-audit.json',import.meta.url),JSON.stringify({queried:new Date().toISOString(),width:.2,channel,qualification:'Header footprint coverage only; final finite-pixel coverage may exclude more frames',results},null,2));
}
