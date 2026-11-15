// Motion view: one stacked image per visit, so an object's shift between visits
// is visible. SPHEREx returns to a patch of sky roughly every six months and
// takes a burst of exposures each time; within a burst nothing moves measurably.
const median = values => { const a = Float64Array.from(values).sort(), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : NaN; };

// Split time-ordered exposures into visits wherever the gap exceeds `gapDays`.
export function groupVisits(jobs, gapDays = 45) {
  const visits = [];
  for (const job of [...jobs].sort((a, b) => a.obs.mjd - b.obs.mjd)) {
    const visit = visits.at(-1);
    if (visit && job.obs.mjd - visit.at(-1).obs.mjd <= gapDays) visit.push(job); else visits.push([job]);
  }
  return visits;
}

// Per-pixel median of background-subtracted frames on one shared sky grid.
// The median rejects cosmic rays and one-off artefacts; each frame's own median
// is removed first so differing sky levels do not print through.
export function stackFrames(frames) {
  if (!frames.length) return null;
  const length = frames[0].length, values = new Float32Array(length).fill(NaN);
  const levels = frames.map(frame => { const sample = []; for (let i = 0; i < length; i += 3) if (Number.isFinite(frame[i])) sample.push(frame[i]); return sample.length ? median(sample) : 0; });
  const column = [];
  for (let i = 0; i < length; i++) {
    column.length = 0;
    for (let k = 0; k < frames.length; k++) if (Number.isFinite(frames[k][i])) column.push(frames[k][i] - levels[k]);
    if (column.length) values[i] = median(column);
  }
  return values;
}

// Flux-weighted centre of the brightest source, in pixels. Only pixels above a
// fifth of the peak count, which keeps the sky and neighbours out of the sum.
export function brightestCentroid(values, width, radius = 8) {
  let peak = -Infinity, at = -1;
  for (let i = 0; i < values.length; i++) if (values[i] > peak) { peak = values[i]; at = i; }
  if (at < 0 || !(peak > 0)) return null;
  const cx = at % width, cy = Math.floor(at / width), height = values.length / width;
  let sum = 0, sx = 0, sy = 0;
  for (let y = Math.max(0, cy - radius); y <= Math.min(height - 1, cy + radius); y++) for (let x = Math.max(0, cx - radius); x <= Math.min(width - 1, cx + radius); x++) {
    const v = values[y * width + x];
    if (v > peak * .2) { sum += v; sx += v * x; sy += v * y; }
  }
  return { x: sx / sum, y: sy / sum, peak };
}

// One brightness scale for every visit: sky at zero, near-peak at one.
export function sharedScale(stacks) {
  const sample = [];
  for (const stack of stacks) for (let i = 0; i < stack.length; i += 2) if (Number.isFinite(stack[i])) sample.push(stack[i]);
  if (!sample.length) return { low: 0, high: 1 };
  const sorted = Float64Array.from(sample).sort(), at = q => sorted[Math.floor((sorted.length - 1) * q)];
  const low = at(.5), high = at(.997);
  return { low, high: high > low ? high : low + 1 };
}

// Later minus earlier. A source that moved leaves a dark hole where it was and
// a bright spot where it now is; anything that stayed put cancels.
export function difference(later, earlier) {
  const out = new Float32Array(later.length);
  for (let i = 0; i < out.length; i++) out[i] = later[i] - earlier[i];
  return out;
}

// Calendar nights are UTC dates, not a sliding gap between exposures.
export function groupNights(jobs) {
  const groups=new Map();
  for(const job of [...jobs].sort((a,b)=>a.obs.mjd-b.obs.mjd)){
    if(!Number.isFinite(job.obs.mjd))continue;
    const key=Math.floor(job.obs.mjd);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(job);
  }
  return [...groups.values()];
}

export function matchingFrame(frame,wavelength,halfWidth=.01){
  if(!(wavelength>0)||!(halfWidth>0)||!frame?.aligned||!Number.isFinite(frame.wavelength)||!frame.wavelengths||!frame.quality)return null;
  if(Math.abs(frame.wavelength/wavelength-1)>halfWidth+1e-12)return null;
  const values=Float32Array.from(frame.values,(v,i)=>Number.isFinite(frame.wavelengths[i])&&Math.abs(frame.wavelengths[i]/wavelength-1)<=halfWidth+1e-12?v:NaN);
  if(!values.some(Number.isFinite))return null;
  return {...frame,values};
}

// Track the selected central source, never the brightest pixel anywhere in the field.
// A nearby rival, implausible jump or flagged core withholds a scientific fit.
export function sourceNear(values,width,anchor,{searchRadius=16,apertureRadius=8,quality=null}={}){
  const height=values.length/width,finite=Array.from(values).filter(Number.isFinite);
  if(finite.length<25)return null;
  const background=median(finite),noise=Math.max(1.4826*median(finite.map(v=>Math.abs(v-background))),1e-10),peaks=[];
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x,v=values[i];if(!Number.isFinite(v)||v-background<8*noise||Math.hypot(x-anchor.x,y-anchor.y)>searchRadius)continue;
    let maximum=true;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&values[(y+dy)*width+x+dx]>v)maximum=false;
    if(maximum)peaks.push({x,y,peak:v});
  }
  // Several interpolation maxima inside one PSF belong to one source.
  peaks.sort((a,b)=>b.peak-a.peak);const candidates=[];
  for(const p of peaks)if(!candidates.some(c=>Math.hypot(c.x-p.x,c.y-p.y)<apertureRadius*.75))candidates.push(p);
  candidates.sort((a,b)=>Math.hypot(a.x-anchor.x,a.y-anchor.y)-Math.hypot(b.x-anchor.x,b.y-anchor.y));
  if(!candidates.length)return null;
  const p=candidates[0];
  if(candidates.some((r,i)=>i>0&&r.peak-background>(p.peak-background)*.2&&Math.hypot(r.x-p.x,r.y-p.y)<apertureRadius*2))return null;
  const distance=Math.hypot(p.x-anchor.x,p.y-anchor.y);
  if(candidates[1]&&Math.hypot(candidates[1].x-anchor.x,candidates[1].y-anchor.y)-distance<2)return null;
  let sum=0,sx=0,sy=0,good=0,count=0;
  for(let y=Math.max(0,p.y-apertureRadius);y<=Math.min(height-1,p.y+apertureRadius);y++)for(let x=Math.max(0,p.x-apertureRadius);x<=Math.min(width-1,p.x+apertureRadius);x++){
    if(Math.hypot(x-p.x,y-p.y)>apertureRadius)continue;
    const i=y*width+x,v=values[i]-background;
    if(Number.isFinite(v)&&v>(p.peak-background)*.2){sum+=v;sx+=x*v;sy+=y*v;count++;if(quality?.[i])good++;}
  }
  if(count<4||!(sum>0))return null;
  const x=sx/sum,y=sy/sum;
  if(Math.hypot(x-anchor.x,y-anchor.y)>searchRadius||x<apertureRadius||y<apertureRadius||x>=width-apertureRadius||y>=height-apertureRadius)return null;
  // Missing or off-wavelength core pixels can bias even the remaining good wings.
  let completeCore=true;
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
    const i=(p.y+dy)*width+p.x+dx;
    if(!Number.isFinite(values[i])||!quality?.[i])completeCore=false;
  }
  const trusted=!!quality&&good===count&&completeCore;
  return {x,y,peak:p.peak,qualityFraction:good/count,trusted,reason:trusted?'':'Flagged or missing source pixels; position is a visual estimate.'};
}

export function trackSource(images,width,arcsecPerPixel){
  // Field centre specifies which source is being examined. This never uses an
  // expected catalogue motion or forces measurements onto a straight line.
  const origin={x:(width-1)/2,y:(width-1)/2};let previous=null,previousMjd=null;
  const radius=Math.min(24,30/arcsecPerPixel);
  return images.map(image=>{
    const anchor=previous??origin;
    const centre=sourceNear(image.values,width,anchor,{searchRadius:previous?Math.min(radius,(6+30*Math.max(0,image.mjd-previousMjd)/365.25)/arcsecPerPixel):radius,quality:image.quality});
    if(centre&&Math.hypot(centre.x-origin.x,centre.y-origin.y)<=radius){previous=centre;previousMjd=image.mjd;return {...image,centre};}
    return {...image,centre:null};
  });
}

export function fitMotion(images,arcsecPerPixel){
  const points=images.filter(v=>v.centre?.trusted&&Number.isFinite(v.centre.x)&&Number.isFinite(v.centre.y)&&Number.isFinite(v.mjd)).sort((a,b)=>a.mjd-b.mjd);
  const unique=new Set(points.map(v=>v.mjd));
  if(unique.size<3)return {valid:false,reason:'Motion fit needs three reliable dates at matched wavelengths.',used:points.length};
  const span=points.at(-1).mjd-points[0].mjd;
  if(span<90)return {valid:false,reason:'Motion fit needs at least 90 days of reliable matched-wavelength coverage.',used:points.length};
  const t0=points.reduce((s,p)=>s+p.mjd,0)/points.length;
  const fit=axis=>{const mean=points.reduce((s,p)=>s+p.centre[axis],0)/points.length;let numerator=0,denominator=0;for(const p of points){numerator+=(p.mjd-t0)*(p.centre[axis]-mean);denominator+=(p.mjd-t0)**2;}return {mean,slope:numerator/denominator};};
  const x=fit('x'),y=fit('y');
  const rms=Math.sqrt(points.reduce((s,p)=>s+(p.centre.x-x.mean-x.slope*(p.mjd-t0))**2+(p.centre.y-y.mean-y.slope*(p.mjd-t0))**2,0)/points.length)*arcsecPerPixel;
  return {valid:true,rate:Math.hypot(x.slope,y.slope)*365.25*arcsecPerPixel,east:-x.slope*365.25*arcsecPerPixel,north:-y.slope*365.25*arcsecPerPixel,rms,used:points.length,start:points[0],end:points.at(-1)};
}

// One physical exposure per detector; alternative archive reductions are not
// independent observations. Keep first arrival so loading cannot change it.
export function uniqueExposures(jobs){
  const seen=new Set();
  return jobs.filter(({obs})=>{const key=obs.id&&obs.band?obs.id+'|'+obs.band:obs.path;if(seen.has(key))return false;seen.add(key);return true;});
}

// Retain flagged pixels for an explicitly labelled visual preview. A stack
// pixel is reliable only if every finite contributor passes the quality mask.
export function stackMeasurements(frames){
  if(!frames.length)return null;
  const first=frames[0];
  if(frames.some(f=>!f.aligned||f.gridKey!==first.gridKey||f.unit!==first.unit||f.backgroundRemoved!==first.backgroundRemoved||f.values.length!==first.values.length))return null;
  const values=stackFrames(frames.map(f=>f.values)),quality=new Uint8Array(values.length);
  for(let i=0;i<values.length;i++)quality[i]=Number.isFinite(values[i])&&frames.every(f=>!Number.isFinite(f.values[i])||f.quality?.[i])?1:0;
  return {values,quality};
}

// Use bands supported by loaded exposures as slider stops. Cluster centres
// keep observations from repeat visits together within the ±1% science filter.
// The science filter stays fixed at ±1% around the chosen stop.
export function wavelengthStops(jobs){
  const waves=jobs.filter(j=>j.frame?.aligned&&Number.isFinite(j.frame.wavelength)&&j.frame.wavelength>=.75&&j.frame.wavelength<=5).map(j=>j.frame.wavelength).sort((a,b)=>a-b),groups=[];
  for(const wave of waves){const g=groups.at(-1);if(g&&wave/g[0]-1<=.018)g.push(wave);else groups.push([wave]);}
  return groups.map(g=>Math.sqrt(g[0]*g.at(-1)));
}
export function nearestWavelength(stops,wavelength){
  return stops.length?stops.reduce((a,b)=>Math.abs(Math.log(b/wavelength))<Math.abs(Math.log(a/wavelength))?b:a):wavelength;
}

// Keep one detector throughout a quantitative comparison, including overlap
// wavelengths where two detectors can have different PSFs/calibration offsets.
export function matchedJobs(jobs,wavelength,halfWidth=.01){
  const bands=new Map();
  for(const job of jobs){const selected=matchingFrame(job.frame,wavelength,halfWidth);if(!selected)continue;
    const band=job.obs.band||'unknown';if(!bands.has(band))bands.set(band,[]);bands.get(band).push({...job,selected});}
  const score=members=>{const times=members.map(j=>j.obs.mjd),days=new Set(times.map(Math.floor)).size;return [days,Math.max(...times)-Math.min(...times),members.length];};
  return [...bands.values()].sort((a,b)=>{const x=score(a),y=score(b);return y[0]-x[0]||y[1]-x[1]||y[2]-x[2]||String(a[0].obs.band).localeCompare(String(b[0].obs.band));})[0]||[];
}

// Cross-check motion in disjoint narrow wavelength groups. Each group gets its
// own position intercept, so colour/PSF offsets are never interpreted as motion.
// All eligible groups enter the summary; selection never uses a catalogue rate.
export function fitAcrossBands(measurements,arcsecPerPixel){
  const ordered=measurements.filter(m=>m.centre?.trusted&&Number.isFinite(m.mjd)&&Number.isFinite(m.wavelength)&&m.wavelength>0).sort((a,b)=>String(a.band).localeCompare(String(b.band))||a.wavelength-b.wavelength);
  const groups=[];
  for(const m of ordered){const last=groups.at(-1);if(last&&m.band===last[0].band&&m.wavelength/last[0].wavelength<=1.02)last.push(m);else groups.push([m]);}
  const fits=[];
  for(const rawGroup of groups){
    const centralWave=Math.sqrt(rawGroup[0].wavelength*rawGroup.at(-1).wavelength);
    const group=rawGroup.filter(m=>(m.minWavelength??m.wavelength)>=centralWave*.99&&(m.maxWavelength??m.wavelength)<=centralWave*1.01);
    if(!group.length)continue;
    const dates=new Map();for(const m of group){const d=Math.floor(m.mjd);if(!dates.has(d))dates.set(d,[]);dates.get(d).push(m);}
    const points=[...dates.values()].map(g=>({mjd:g.reduce((s,m)=>s+m.mjd,0)/g.length,x:median(g.map(m=>m.centre.x)),y:median(g.map(m=>m.centre.y))})).sort((a,b)=>a.mjd-b.mjd);
    const span=points.at(-1).mjd-points[0].mjd;
    if(points.length<2||span<300)continue;
    const t0=points.reduce((s,p)=>s+p.mjd,0)/points.length,den=points.reduce((s,p)=>s+(p.mjd-t0)**2,0);
    const slope=axis=>{const mean=points.reduce((s,p)=>s+p[axis],0)/points.length;return points.reduce((s,p)=>s+(p.mjd-t0)*(p[axis]-mean),0)/den*365.25*arcsecPerPixel;};
    fits.push({east:-slope('x'),north:-slope('y'),band:group[0].band,low:group[0].wavelength,high:group.at(-1).wavelength,dates:points.length,span,measurements:group.length});
  }
  if(fits.length<3)return {valid:false,reason:'Cross-band motion needs three independent clean wavelength groups spanning at least 300 days.',groups:fits.length};
  const east=median(fits.map(f=>f.east)),north=median(fits.map(f=>f.north)),rate=Math.hypot(east,north);
  // This is empirical band-to-band dispersion, not a formal confidence interval.
  const spread=Math.sqrt(fits.reduce((s,f)=>s+(f.east-east)**2+(f.north-north)**2,0)/fits.length);
  const agreement=fits.filter(f=>f.east*east+f.north*north>0).length/fits.length;
  return {valid:agreement>=.8&&rate>3*spread,reason:agreement<.8||rate<=3*spread?'Motion differs too much between wavelength groups.':'',east,north,rate,spread,agreement,groups:fits.length,measurements:fits.reduce((s,f)=>s+f.measurements,0),fits};
}


export function measureSourceFrame(frame,width,arcsecPerPixel){
  const centre=sourceNear(frame.values,width,{x:(width-1)/2,y:(width-1)/2},{searchRadius:Math.min(24,30/arcsecPerPixel),quality:frame.quality});
  if(!centre)return {centre:null,wavelength:frame.wavelength};
  let minWavelength=Infinity,maxWavelength=-Infinity;
  const x0=Math.round(centre.x),y0=Math.round(centre.y);
  // Require the full measurement aperture to share the narrow wavelength band.
  for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){
    if(dx*dx+dy*dy>64)continue;
    const w=frame.wavelengths?.[(y0+dy)*width+x0+dx];
    if(!Number.isFinite(w))return {centre:{...centre,trusted:false},wavelength:frame.wavelength};
    minWavelength=Math.min(minWavelength,w);maxWavelength=Math.max(maxWavelength,w);
  }
  return {centre,wavelength:frame.wavelength,minWavelength,maxWavelength};
}
