import {validatedImagePath} from './sequence-api.js';
import {readHeader} from './spectral.js';
import {sexagesimal,sexagesimalParameter} from '../sky-atlas/dist/known-positions.js';
import {insideImageField} from '../sky-atlas/dist/inventory-field.js';
const cache=new Map(),LIMIT=1500;
const finite=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
function remember(key,data){cache.set(key,{data,expires:Date.now()+86400000});while(cache.size>96)cache.delete(cache.keys().next().value);return data;}
export function parseSimbad(data){
 if(!Array.isArray(data.metadata)||!Array.isArray(data.data))throw Error('Invalid SIMBAD response');
 const names=data.metadata.map(c=>c.name);
 for(const name of ['main_id','ra','dec','pmra','pmdec','otype'])if(!names.includes(name))throw Error('Incomplete SIMBAD response');
 return data.data.map(values=>{const row=Object.fromEntries(names.map((k,i)=>[k,values[i]])),ra=finite(row.ra),dec=finite(row.dec);if(ra===null||dec===null||ra<0||ra>=360||Math.abs(dec)>90)throw Error('Invalid catalogue coordinates');return {name:String(row.main_id),ra,dec,pmra:finite(row.pmra),pmdec:finite(row.pmdec),type:row.otype,kind:'catalogue'};});
}
export function parseSmallBodies(data,field){
 if(data.signature?.version!=='1.1'||!Number.isInteger(data.n_second_pass)||data.n_second_pass<0)throw Error('Unsupported ephemeris response');
 if(data.n_second_pass===0)return [];
 const names=data.fields_second;if(!Array.isArray(names)||!Array.isArray(data.data_second_pass)||data.data_second_pass.length!==data.n_second_pass)throw Error('Incomplete ephemeris response');
 const nameIndex=names.indexOf('Object name'),raIndex=names.findIndex(x=>x.startsWith('Astrometric RA')),decIndex=names.findIndex(x=>x.startsWith('Astrometric Dec')),magIndex=names.indexOf('Visual magnitude (V)');
 if(Math.min(nameIndex,raIndex,decIndex)<0)throw Error('Missing ephemeris positions');
 return data.data_second_pass.map(row=>({name:String(row[nameIndex]),ra:sexagesimal(row[raIndex],true),dec:sexagesimal(row[decIndex]),magnitude:finite(row[magIndex]),kind:'solar',type:'Asteroid / comet'})).filter(s=>insideImageField(s,field));
}
export async function exposureEpoch(path,fetcher,signal){
 const key='epoch:'+path,hit=cache.get(key);if(hit&&hit.expires>Date.now())return hit.data;
 const r=await fetcher('https://irsa.ipac.caltech.edu'+path,{headers:{range:'bytes=0-65535'},redirect:'error',signal});
 if(!r.ok)throw Error('Exposure date unavailable');
 const reader=r.body.getReader();let bytes=new Uint8Array(0);
 try{while(bytes.length<65536){const part=await reader.read();if(part.done)break;const next=new Uint8Array(Math.min(65536,bytes.length+part.value.length));next.set(bytes);next.set(part.value.subarray(0,next.length-bytes.length),bytes.length);bytes=next;let offset=0;while(offset<bytes.length){const h=readHeader(bytes,offset);if(!h)break;const mjd=finite(h.header['MJD-AVG']);if(mjd!==null&&mjd>=50000&&mjd<=80000)return remember(key,{mjd,date:new Date((mjd-40587)*86400000).toISOString()});let count=h.header.NAXIS?1:0;for(let i=1;i<=(h.header.NAXIS||0);i++)count*=h.header['NAXIS'+i];const length=Math.abs(h.header.BITPIX||8)/8*(h.header.GCOUNT||1)*(count+(h.header.PCOUNT||0));offset=h.dataOffset+Math.ceil(length/2880)*2880;}}throw Error('Incomplete exposure metadata');}finally{await reader.cancel().catch(()=>{});}
}
// JPL asks clients to submit one request at a time. Keep queued requests cancellable.
let jplTail=Promise.resolve();
function sequentialJpl(job,signal){const task=jplTail.catch(()=>{}).then(()=>{signal.throwIfAborted();return job();});jplTail=task.catch(()=>{});return task;}
export async function handleKnownObjects(request,{fetcher=fetch}={}){
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':status===200?'public, max-age=3600':'no-store'}});
 const q=new URL(request.url).searchParams,field=Object.fromEntries(['ra','dec','size'].map(k=>[k,q.get(k)?.trim()?Number(q.get(k)):NaN])),kind=q.get('kind')||'catalogue';
 if(!Object.values(field).every(Number.isFinite)||field.ra<0||field.ra>=360||Math.abs(field.dec)>90||field.size<.01||field.size>.35||!['catalogue','solar'].includes(kind))return reply({error:'Invalid known-object field'},400);
 let path;if(kind==='solar')try{path=validatedImagePath(q.get('image')||'');}catch{return reply({error:'Invalid exposure identifier'},400);}
 const key=JSON.stringify([kind,field,path]),hit=cache.get(key);if(hit&&hit.expires>Date.now())return reply(hit.data);
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(48000)]);
 try{
  let data;
  if(kind==='catalogue'){
   // Include a 0.12-degree margin for sources that have moved into the field since J2000.
   const radius=field.size/Math.SQRT2+.12,query=`SELECT TOP ${LIMIT+1} main_id,ra,dec,pmra,pmdec,otype,DISTANCE(POINT('ICRS',ra,dec),POINT('ICRS',${field.ra},${field.dec})) AS separation FROM basic WHERE CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',${field.ra},${field.dec},${radius}))=1 AND otype NOT IN ('Pl','Pl?') ORDER BY separation`;
   let sources,lastError;
   for(const host of ['simbad.cfa.harvard.edu','simbad.cds.unistra.fr']){try{const url=new URL(`https://${host}/simbad/sim-tap/sync`);url.search=new URLSearchParams({request:'doQuery',lang:'adql',format:'json',query});const r=await fetcher(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(14000)])});if(!r.ok)throw Error('SIMBAD unavailable');sources=parseSimbad(await r.json());break;}catch(e){lastError=e;signal.throwIfAborted();}}
   if(!sources)throw lastError;
   data={kind,field,catalogue:'SIMBAD',epoch:2000,limit:LIMIT,truncated:sources.length>LIMIT,sources:sources.slice(0,LIMIT),retrieved:new Date().toISOString()};
  }else{
   const epoch=await exposureEpoch(path,fetcher,signal),url=new URL('https://ssd-api.jpl.nasa.gov/sb_ident.api');
   const half=field.size/Math.SQRT2,raHalf=Math.min(180,half/Math.max(.001,Math.cos(field.dec*Math.PI/180)));
   url.search=new URLSearchParams({'xobs':'0,0,0','obs-time':String(epoch.mjd+2400000.5),'fov-ra-center':sexagesimalParameter(field.ra,true),'fov-dec-center':sexagesimalParameter(field.dec),'fov-ra-hwidth':String(raHalf),'fov-dec-hwidth':String(half),'two-pass':'true','suppress-first-pass':'true','req-elem':'false','vmag-lim':'22','mag-required':'true'});
   const body=await sequentialJpl(async()=>{const r=await fetcher(url,{signal});if(!r.ok)throw Error('JPL ephemeris unavailable');return r.json();},signal);
   data={kind,field,image:path,...epoch,observer:'Earth centre (approximate for SPHEREx)',magnitudeLimit:22,sources:parseSmallBodies(body,field),retrieved:new Date().toISOString()};
  }
  signal.throwIfAborted();return reply(remember(key,data));
 }catch{return reply({error:kind==='catalogue'?'SIMBAD unavailable. Retry known objects.':'Asteroid / comet predictions unavailable. Retry known objects.'},signal.aborted?504:502);}
}
