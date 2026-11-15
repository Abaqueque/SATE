// Display-only spectral estimates. Original arrays, variance and quality remain
// untouched, and these values never enter tracking or saved source FITS files.
export function gapCandidates(observations,anchor,wavelengths,channel,{hours=6}={}){
 const low=wavelengths[Math.max(0,channel-2)],high=wavelengths[Math.min(wavelengths.length-1,channel+2)],centre=wavelengths[channel];
 const candidates=observations.filter(o=>o.path!==anchor.path&&o.checked&&!o.infoError&&!o.lowCoverage&&Number.isFinite(o.wavelength)&&o.wavelength>=low&&o.wavelength<=high&&Math.abs(o.mjd-anchor.mjd)<=hours/24);
 const order=(a,b)=>Math.abs(a.wavelength-centre)-Math.abs(b.wavelength-centre)||Math.abs(a.mjd-anchor.mjd)-Math.abs(b.mjd-anchor.mjd)||a.path.localeCompare(b.path);
 const below=candidates.filter(o=>o.wavelength<centre).sort(order)[0],above=candidates.filter(o=>o.wavelength>=centre).sort(order)[0];
 return [...new Set([below,above].filter(Boolean))];
}
export function estimateMissingPixels(frame,sources,{wavelength,minWavelength,maxWavelength}){
 const values=Float32Array.from(frame.values),estimated=new Uint8Array(values.length);let count=0,interpolated=0;
 for(let i=0;i<values.length;i++){
  if(Number.isFinite(values[i]))continue;
  let lower,upper,nearest;
  for(const source of sources){
   if(source.width!==frame.width||source.height!==frame.height)continue;
   const value=source.values[i],wave=source.wavelengths[i];
   if(!Number.isFinite(value)||!Number.isFinite(wave)||!source.quality[i]||wave<minWavelength||wave>maxWavelength)continue;
   const sample={value,wave};
   if(!nearest||Math.abs(wave-wavelength)<Math.abs(nearest.wave-wavelength))nearest=sample;
   if(wave<=wavelength&&(!lower||wave>lower.wave))lower=sample;
   if(wave>=wavelength&&(!upper||wave<upper.wave))upper=sample;
  }
  if(lower&&upper&&upper.wave>lower.wave){values[i]=lower.value+(upper.value-lower.value)*(wavelength-lower.wave)/(upper.wave-lower.wave);interpolated++;}
  else if(nearest)values[i]=nearest.value;
  else continue;
  estimated[i]=1;count++;
 }
 return {...frame,values,estimated,estimatedCount:count,interpolatedCount:interpolated,coverage:values.reduce((n,v)=>n+Number.isFinite(v),0)/values.length};
}
