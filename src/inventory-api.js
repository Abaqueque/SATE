import {cellInvestigation} from '../sky-atlas/dist/region-geometry.js';
const cache=new Map(),LIMIT=2000;
export function parseInventoryTable(text){
  const lines=text.split(/\r?\n/),header=lines.find(line=>line.startsWith('|')&&line.includes('designation'));
  if(!header)throw Error('Invalid catalogue response');
  const columns=header.split('|').slice(1,-1).map(s=>s.trim());
  const number=v=>v==='null'||v==null?null:Number(v);
  return lines.filter(line=>/^\s*J\d/.test(line)).map(line=>{
    const values=line.trim().split(/\s+/),row=Object.fromEntries(columns.map((key,i)=>[key,values[i]]));
    const ra=number(row.ra),dec=number(row.dec);
    if(!Number.isFinite(ra)||!Number.isFinite(dec)||!row.designation)throw Error('Invalid catalogue position');
    return{name:row.designation,ra,dec,w1:number(row.w1mpro),w2:number(row.w2mpro),flags:row.cc_flags||'',extended:number(row.ext_flg)};
  });
}
export async function handleInventory(request,{fetcher=fetch}={}){
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':status===200?'public, max-age=600':'no-store'}});
  const query=new URL(request.url).searchParams,raw=query.get('cell');
  if(raw==null||!/^\d+$/.test(raw))return reply({error:'Invalid search cell'},400);
  const id=Number(raw);let region;
  try{region=cellInvestigation(id);}catch{return reply({error:'Invalid search cell'},400);}
  let field=null;const names=['ra','dec','size'];if(names.some(k=>query.has(k))){if(names.some(k=>!query.get(k)?.trim()))return reply({error:'Missing image field coordinates'},400);field=Object.fromEntries(names.map(k=>[k,Number(query.get(k))]));if(!names.every(k=>Number.isFinite(field[k]))||field.ra<0||field.ra>=360||Math.abs(field.dec)>90||field.size<.01||field.size>.35)return reply({error:'Invalid image field'},400);}
  const cacheKey=JSON.stringify([id,field]);
  const saved=cache.get(cacheKey);if(query.get('refresh')!=='1'&&saved&&saved.expires>Date.now())return reply(saved.data);
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(45000)]);
  try{
    const radiusDeg=field?Math.atan(Math.SQRT2*field.size/2*Math.PI/180)*180/Math.PI+1e-6:Math.max(.12,region.size*.55),centre=field||region,url=new URL('https://irsa.ipac.caltech.edu/cgi-bin/Gator/nph-query');
    for(const [key,value]of Object.entries({catalog:'allwise_p3as_psd',spatial:'cone',objstr:centre.ra+' '+centre.dec,radius:radiusDeg,radunits:'deg',outfmt:1,outrows:LIMIT+1,selcols:'designation,ra,dec,w1mpro,w2mpro,cc_flags,ext_flg'}))url.searchParams.set(key,value);
    const response=await fetcher(url,{signal});if(!response.ok)throw Error('Catalogue service unavailable');
    const sources=parseInventoryTable(await response.text());signal.throwIfAborted();
    const data={cell:id,center:{ra:centre.ra,dec:centre.dec},...(field?{field}:{}),radiusDeg,retrieved:new Date().toISOString(),catalogue:'AllWISE',limit:LIMIT,truncated:sources.length>LIMIT,sources:sources.slice(0,LIMIT)};
    cache.set(cacheKey,{expires:Date.now()+86400000,data});while(cache.size>32)cache.delete(cache.keys().next().value);
    return reply(data);
  }catch(e){return reply({error:signal.aborted?'Catalogue request stopped or timed out.':'Could not load the regional catalogue. Try again.'},signal.aborted?504:502);}
}
