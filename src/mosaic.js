// Spatial mosaic: every exposure has already been reprojected onto ONE sky grid.
// Never paste repeated views of the central field into adjacent image slots.
const median = values => {const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;return n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;};
const physicalKey=j=>j.obs.id&&j.obs.band?j.obs.id+'|'+j.obs.band:j.obs.path;

export function composeMosaic(jobs,grid,{mjd,hours=24,wavelength,tolerance,average=false,averageHours=6,wavelengthPercent=.5}={}){
  const empty=reason=>({frame:null,members:[],reason});
  if(!Number.isFinite(mjd))return empty('Select an observation time for the joined image.');
  const key=JSON.stringify([grid.ra,grid.dec,grid.size,grid.pixels]);
  const seen=new Set();
  const near=jobs.filter(j=>j.status==='ready'&&Number.isFinite(j.obs.mjd)&&Math.abs(j.obs.mjd-mjd)<=hours/48&&j.frame?.aligned&&j.frame.gridKey===key&&j.frame.unit&&j.frame.variance&&j.frame.quality&&j.frame.wavelengths)
    .sort((a,b)=>Math.abs(a.obs.mjd-mjd)-Math.abs(b.obs.mjd-mjd)||a.obs.path.localeCompare(b.obs.path));
  const reference=near[0]?.frame;
  if(!reference)return empty('No aligned exposures in this time window yet.');
  const candidates=near.filter(j=>{
    const id=physicalKey(j),f=j.frame;
    if(seen.has(id)||f.unit!==reference.unit||f.backgroundRemoved!==reference.backgroundRemoved)return false;
    seen.add(id);return true;
  });
  const length=grid.pixels**2,values=new Float32Array(length).fill(NaN),variance=new Float64Array(length).fill(NaN),counts=new Uint32Array(length),source=new Int32Array(length).fill(-1);
  const wavelengths=new Float64Array(length).fill(NaN),quality=new Uint8Array(length),used=new Set(),contributions=new Map(),tilePixels=new Uint32Array(9),tileValid=new Uint32Array(9);
  let good=0,averaged=0,rejected=0,waveMin=Infinity,waveMax=-Infinity;
  for(let i=0;i<length;i++){
    const tile=Math.min(2,Math.floor(Math.floor(i/grid.pixels)*3/grid.pixels))*3+Math.min(2,Math.floor((i%grid.pixels)*3/grid.pixels));tilePixels[tile]++;
    const samples=[];
    for(let k=0;k<candidates.length;k++){
      const j=candidates[k],f=j.frame,v=f.variance[i],w=f.wavelengths[i];
      if(f.quality[i]&&Number.isFinite(f.values[i])&&Number.isFinite(v)&&v>0&&Number.isFinite(w)&&Math.abs(w-wavelength)<=tolerance)samples.push({job:j,k,value:f.values[i],variance:v,wave:w});
    }
    if(!samples.length)continue;
    // Prefer the closest calibrated wavelength; ties retain nearest-time order.
    samples.sort((a,b)=>Math.abs(a.wave-wavelength)-Math.abs(b.wave-wavelength));
    const best=samples[0];let accepted=[best];
    if(average&&Math.abs(best.job.obs.mjd-mjd)<=averageHours/48){
      accepted=samples.filter(s=>Math.abs(s.job.obs.mjd-mjd)<=averageHours/48&&Math.abs(s.wave-best.wave)<=best.wave*wavelengthPercent/200);
      if(accepted.length>=3){
        const centre=median(accepted.map(s=>s.value)),scatter=1.4826*median(accepted.map(s=>Math.abs(s.value-centre))),typical=median(accepted.map(s=>s.variance));
        accepted=accepted.filter(s=>{const keep=Math.abs(s.value-centre)<=5*Math.sqrt(s.variance+typical+scatter*scatter);if(!keep)rejected++;return keep;});
      }
      if(!accepted.length)accepted=[best];
    }
    const minVariance=Math.min(...accepted.map(s=>s.variance));let total=0,value=0,wave=0;
    for(const s of accepted){const weight=minVariance/s.variance;total+=weight;value+=weight*s.value;wave+=weight*s.wave;used.add(s.job);contributions.set(s.job,(contributions.get(s.job)||0)+1);waveMin=Math.min(waveMin,s.wave);waveMax=Math.max(waveMax,s.wave);}
    values[i]=value/total;variance[i]=minVariance/total;wavelengths[i]=wave/total;counts[i]=accepted.length;source[i]=accepted[0].k;quality[i]=1;good++;tileValid[tile]++;if(accepted.length>1)averaged++;
  }
  if(!good)return empty('No valid pixels match this time and wavelength window. Try another time or a wider window.');
  const members=[...used].sort((a,b)=>a.obs.mjd-b.obs.mjd);
  return {frame:{values,variance,wavelengths,quality,counts,source,width:grid.pixels,height:grid.pixels,gridKey:key,aligned:true,unit:reference.unit,backgroundRemoved:reference.backgroundRemoved,coverage:good/length},members,contributions,
    startMjd:members[0].obs.mjd,endMjd:members.at(-1).obs.mjd,waveMin,waveMax,averagedPixels:averaged,rejected,tileCoverage:Array.from(tileValid,(n,i)=>n/tilePixels[i])};
}
