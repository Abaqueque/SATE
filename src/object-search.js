// CDS Sesame resolves astronomical names through SIMBAD, NED and VizieR.
// Its jradeg/jdedeg position is J2000; proper motions are mas/year (RA includes cos Dec).
const ENDPOINTS=['https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?','https://vizier.cfa.harvard.edu/viz-bin/nph-sesame/-oxp/SNV?'];
const cache=new Map(),TTL=86400000;
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':status===200?'public, max-age=86400':'no-store'}});
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,e=>{const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(named[e])return named[e];const n=e.startsWith('&#x')?parseInt(e.slice(3,-1),16):Number(e.slice(2,-1));return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):'';});
export function queryName(value){const name=String(value||'').trim().replace(/[’‘]/g,"'").replace(/\s+/g,' ');if(!name||name.length>120||/[\x00-\x1f\x7f]/.test(name))throw Error('Enter an object name (up to 120 characters).');return /^wise\s*0855$/i.test(name)?'WISE J085510.83-071442.5':name;}
export function parseObject(xml,query){
 for(const match of xml.matchAll(/<Resolver\b[^>]*>([\s\S]*?)<\/Resolver>/g)){
  const body=match[1],field=tag=>body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1],number=tag=>{const s=field(tag);return s?.trim()?Number(s):NaN;};
  const ra=number('jradeg'),dec=number('jdedeg');if(!Number.isFinite(ra)||!Number.isFinite(dec)||ra<0||ra>=360||dec< -90||dec>90)continue;
  const object={name:decode(field('oname')||query).replace(/^NAME\s+/,'').trim().slice(0,140),ra,dec,catalogueRa:ra,catalogueDec:dec,epoch:2000,source:'CDS Sesame'};
  const pmRA=number('pmRA'),pmDE=number('pmDE');
  if(Number.isFinite(pmRA)&&Number.isFinite(pmDE)){
   // A tangent-vector propagation keeps RA wrap and polar coordinates well behaved.
   // Navigation only: no annual parallax, radial velocity or precision astrometry.
   const a=ra*Math.PI/180,d=dec*Math.PI/180,k=26*Math.PI/(180*3600000),east=pmRA*k,north=pmDE*k;
   const x=Math.cos(d)*Math.cos(a)-east*Math.sin(a)-north*Math.sin(d)*Math.cos(a),y=Math.cos(d)*Math.sin(a)+east*Math.cos(a)-north*Math.sin(d)*Math.sin(a),z=Math.sin(d)+north*Math.cos(d);
   object.ra=(Math.atan2(y,x)*180/Math.PI+360)%360;object.dec=Math.atan2(z,Math.hypot(x,y))*180/Math.PI;object.epoch=2026;
  }
  return object;
 }return null;
}
export async function handleObjectSearch(request,{fetcher=fetch}={}){
 let name;try{name=queryName(new URL(request.url).searchParams.get('q'));}catch(e){return response({error:e.message},400);}
 const key=name.toLowerCase(),saved=cache.get(key);if(saved&&saved.expires>Date.now())return response(saved.value);
 let complete=false;
 for(const endpoint of ENDPOINTS){try{
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(6000)]),r=await fetcher(endpoint+encodeURIComponent(name),{signal,headers:{accept:'text/plain, application/xml'}});if(!r.ok)continue;const xml=await r.text();if(!xml.includes('<Sesame'))continue;complete=true;const object=parseObject(xml,name);if(!object)continue;
  cache.delete(key);cache.set(key,{value:object,expires:Date.now()+TTL});while(cache.size>128)cache.delete(cache.keys().next().value);return response(object);
 }catch{if(request.signal.aborted)return response({error:'Search cancelled.'},499);}}
 return response({error:complete?'Object not found. Try another name or catalogue identifier.':'Object search is temporarily unavailable. Please retry.'},complete?404:502);
}
