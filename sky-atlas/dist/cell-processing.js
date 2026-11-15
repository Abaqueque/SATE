// Display transforms always copy the aligned measurements. Never feed these into photometry.
const median = a => { a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)]; };
export function processDisplay(frame, {quality=true,denoise=2,repair=false,wavelength,tolerance=.08,spectralMask=true}={}) {
 const values=Float32Array.from(frame.values), {width,height}=frame;
 for(let i=0;i<values.length;i++)if((quality&&!frame.quality[i])||(spectralMask&&(!Number.isFinite(frame.wavelengths[i])||Math.abs(frame.wavelengths[i]-wavelength)>tolerance)))values[i]=NaN;
 const sample=Array.from(values).filter(Number.isFinite),background=sample.length?median([...sample]):0;
 const sigma=sample.length?Math.max(1e-8,1.4826*median(sample.map(v=>Math.abs(v-background)))):1;
 let result=values, repaired=0;
 if(denoise)for(let pass=0;pass<denoise;pass++){
  const next=Float32Array.from(result);
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
   const i=y*width+x,v=result[i];if(!Number.isFinite(v))continue;
   const noise=Number.isFinite(frame.variance[i])&&frame.variance[i]>0?Math.sqrt(frame.variance[i]):sigma;
   const range=Math.max(sigma*.5,noise)*1.8;let total=0,weight=0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const n=result[i+dy*width+dx];if(!Number.isFinite(n))continue;
    const w=Math.exp(-(dx*dx+dy*dy)/2-(n-v)**2/(2*range*range));total+=w*n;weight+=w;
   }
   if(weight)next[i]=total/weight;
  }result=next;
 }
 if(repair){const next=Float32Array.from(result);for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const i=y*width+x;if(Number.isFinite(result[i])||!Number.isFinite(frame.wavelengths[i])||Math.abs(frame.wavelengths[i]-wavelength)>tolerance)continue;
  const neighbors=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const v=result[i+dy*width+dx];if(Number.isFinite(v))neighbors.push(v);}
  if(neighbors.length>=7){next[i]=median(neighbors);repaired++;}
 }result=next;}
 return {...frame,values:result,background,sigma,repaired,coverage:result.reduce((n,v)=>n+Number.isFinite(v),0)/result.length};
}
export function groupVisits(observations){
 const days=new Map(),seen=new Set();
 for(const obs of [...observations].sort((a,b)=>a.mjd-b.mjd||a.path.localeCompare(b.path))){
  // Re-releases of the same detector exposure are not independent dates.
  const key=obs.id+'|'+obs.band;if(seen.has(key))continue;seen.add(key);
  const day=obs.date.slice(0,10);if(!days.has(day))days.set(day,{day,observations:[],status:'idle'});days.get(day).observations.push(obs);
 }return [...days.values()];
}
