// A display coadd around one selected observation, never across the whole timeline.
// Variances describe individual output pixels; reprojection introduces covariance
// between neighbouring pixels, so these are not aperture-photometry uncertainties.
const median = values => {
  const sorted = [...values].sort((a,b)=>a-b), n=sorted.length;
  return n%2 ? sorted[(n-1)/2] : (sorted[n/2-1]+sorted[n/2])/2;
};
const exposureKey = job => job.obs.id && job.obs.band ? job.obs.id+'|'+job.obs.band : job.obs.path;

export function averageNearby(jobs, anchor, {hours=6, wavelengthPercent=.5}={}) {
  if (!(hours>0 && hours<=24 && wavelengthPercent>0 && wavelengthPercent<=2)) throw new Error('Invalid averaging window.');
  const a=anchor?.frame;
  const unavailable=reason=>({frame:null,reason,members:[]});
  if (!a?.aligned || !a.variance || !a.wavelengths || !a.quality || !a.unit || !a.gridKey || !Number.isFinite(a.wavelength)) return unavailable('This exposure lacks the alignment, wavelength, uncertainty or unit information needed for averaging.');
  const time=anchor.obs.mjd, halfDays=hours/48, halfWave=a.wavelength*wavelengthPercent/200;
  if (!Number.isFinite(time)) return unavailable('This exposure has no usable observation time.');
  // Prefer the selected reduction when the same physical exposure occurs in
  // multiple releases. Never count repeat reductions as independent measurements.
  const seen=new Set(), candidates=[];
  for (const job of [anchor,...jobs]) {
    const f=job.frame, key=exposureKey(job);
    if (job.status!=='ready' || seen.has(key) || !f?.aligned || f.gridKey!==a.gridKey || f.unit!==a.unit || f.backgroundRemoved!==a.backgroundRemoved || f.width!==a.width || f.height!==a.height || !f.variance || !f.wavelengths || !f.quality) continue;
    if (!Number.isFinite(job.obs.mjd) || Math.abs(job.obs.mjd-time)>halfDays || !Number.isFinite(f.wavelength) || Math.abs(f.wavelength-a.wavelength)>halfWave) continue;
    seen.add(key); candidates.push(job);
  }
  if(candidates.length<2) return unavailable('No second compatible exposure in this time and wavelength window. Showing the original.');
  const values=new Float32Array(a.values.length).fill(NaN), variance=new Float64Array(values.length).fill(NaN), counts=new Uint32Array(values.length);
  const used=new Set(); let good=0,rejected=0,minCount=Infinity,maxCount=0;
  let waveMin=Infinity,waveMax=-Infinity;
  for(let i=0;i<values.length;i++) {
    // Match the local calibrated wavelengths, not only detector-band labels or
    // the centre of the cutout. Every pair is within the full selected span.
    const target=a.wavelengths[i]; if(!Number.isFinite(target))continue;
    let samples=candidates.filter(j=>{const f=j.frame;return f.quality[i] && Number.isFinite(f.values[i]) && Number.isFinite(f.variance[i]) && f.variance[i]>0 && Number.isFinite(f.wavelengths[i]) && Math.abs(f.wavelengths[i]-target)<=target*wavelengthPercent/200;});
    if(samples.length<2)continue;
    if(samples.length>=3){
      const centre=median(samples.map(j=>j.frame.values[i]));
      const scatter=1.4826*median(samples.map(j=>Math.abs(j.frame.values[i]-centre)));
      const typical=median(samples.map(j=>j.frame.variance[i]));
      samples=samples.filter(j=>{const keep=Math.abs(j.frame.values[i]-centre)<=5*Math.sqrt(j.frame.variance[i]+typical+scatter*scatter);if(!keep)rejected++;return keep;});
    }
    if(samples.length<2)continue;
    const minVariance=Math.min(...samples.map(j=>j.frame.variance[i]));
    let weighted=0,total=0;
    for(const j of samples){const w=minVariance/j.frame.variance[i];weighted+=w*j.frame.values[i];total+=w;used.add(j);waveMin=Math.min(waveMin,j.frame.wavelengths[i]);waveMax=Math.max(waveMax,j.frame.wavelengths[i]);}
    values[i]=weighted/total;variance[i]=minVariance/total;counts[i]=samples.length;good++;minCount=Math.min(minCount,samples.length);maxCount=Math.max(maxCount,samples.length);
  }
  if(!good)return unavailable('No overlapping pixels with two valid, wavelength-matched measurements. Showing the original.');
  const members=[...used].sort((x,y)=>x.obs.mjd-y.obs.mjd);
  return {frame:{values,variance,counts,width:a.width,height:a.height,aligned:true,coverage:good/values.length},members,rejected,minCount,maxCount,
    startMjd:members[0].obs.mjd,endMjd:members.at(-1).obs.mjd,
    centreWaveMin:Math.min(...members.map(j=>j.frame.wavelength)),centreWaveMax:Math.max(...members.map(j=>j.frame.wavelength)),waveMin,waveMax};
}
