import {parseSpectralImage,alignImage,createSkyGrid} from './spectral.js';
import {cachedFrame,cacheFrame,frameCacheKey} from './frame-cache.js';
import {groupVisits,groupNights,matchingFrame,matchedJobs,stackMeasurements,trackSource,measureSourceFrame,fitMotion,fitAcrossBands,uniqueExposures,wavelengthStops,nearestWavelength,sharedScale,difference} from './motion.js';

// Default: Van Maanen's Star, coordinates propagated to 2026 from SIMBAD.
// The catalogue motion only locates the field; it never enters the image fit.
// Any field can be opened with ?ra=&dec=&size=&name=&wavelength=.
const params=new URLSearchParams(location.search),number=(key,fallback,min,max)=>{const v=Number(params.get(key));return params.get(key)!==null&&Number.isFinite(v)&&v>=min&&v<=max?v:fallback;};
const region={ra:number('ra',12.300175987084266,0,360),dec:number('dec',5.369023575263056,-90,90),size:number('size',.05,.01,.35)};
// Three archive searches that together cover all six detectors (0.75–5.0 µm).
const SEARCHES=[{wavelength:1.25,tolerance:.5},{wavelength:3,tolerance:.5},{wavelength:4.5,tolerance:.5}];
const PIXELS=120,arcsec=region.size*3600/PIXELS,grid=createSkyGrid(region.ra,region.dec,region.size,PIXELS);
const $=id=>document.getElementById(id),day=job=>job.obs.date.slice(0,10);
let jobs=[],images=[],index=0,showDifference=false,nightly=true,timer=null,busy=false,failed=0,checked=0,userChose=false,searched=false;
const stacks=new Map();
let matched=true,wavelength=number('wavelength',1.6,.75,5),scale={low:0,high:1},motion={valid:false},selectedCount=0;
let seeded=false,frameRevision=0,measuredRevision=-1,crossBand={valid:false};
const measuredFrames=new WeakMap();
let stops=[],preferredWavelength=wavelength,preferredTime=null,waveTask=null;
$('wavelength').value=wavelength;
$('name').textContent=params.get('name')||(params.has('ra')?'Custom field':'Van Maanen’s Star');
$('where').textContent='RA '+region.ra.toFixed(4)+'°  Dec '+(region.dec<0?'−':'+')+Math.abs(region.dec).toFixed(4)+'° · '+(region.size*60).toFixed(1)+'′ field · N ↑ E ←';

function stop(){clearInterval(timer);timer=null;$('play').textContent='Play';}
// One image per visit (exposures less than ten days apart), or one per night.
function restack(){
  if(measuredRevision!==frameRevision){
    const measurements=jobs.filter(j=>j.frame).map(j=>{
      if(!measuredFrames.has(j.frame))measuredFrames.set(j.frame,measureSourceFrame(j.frame,PIXELS,arcsec));
      return {band:j.obs.band,mjd:j.obs.mjd,...measuredFrames.get(j.frame)};
    });
    crossBand=fitAcrossBands(measurements,arcsec);measuredRevision=frameRevision;
  }
  const chosen=preferredTime??images[index]?.mjd;
  stops=wavelengthStops(jobs);
  if(matched&&stops.length)wavelength=nearestWavelength(stops,preferredWavelength);
  updateWavelengthControls();
  const selected=matched?matchedJobs(jobs,wavelength,.05):jobs.filter(j=>j.frame).map(j=>({...j,selected:j.frame}));
  selectedCount=selected.length;
  if(matched&&selected.length)$('wave-note').textContent=new Set(selected.map(j=>Math.floor(j.obs.mjd))).size+' dates · '+stops.length+' available bands';
  function combine(groups){return groups.map(members=>{
    const key=[matched?wavelength:'overview',...members.map(j=>j.obs.path)].join('|');
    if(!stacks.has(key)){
      const stack=stackMeasurements(members.map(j=>j.selected));
      if(!stack)return null;
      stacks.set(key,{...stack,scale:sharedScale([stack.values])});
      if(stacks.size>200)stacks.delete(stacks.keys().next().value);
    }
    return {...stacks.get(key),members,date:day(members[0]),end:day(members.at(-1)),mjd:members.reduce((s,j)=>s+j.obs.mjd,0)/members.length};
  }).filter(Boolean);}
  // Always fit one measurement per UTC date, independent of the display mode.
  const nights=combine(groupNights(selected));
  const trackedNights=matched?trackSource(nights,PIXELS,arcsec):nights;
  motion=matched?fitMotion(trackedNights,arcsec):{valid:false};
  images=nightly?trackedNights:combine(groupVisits(selected,10));
  if(matched&&!nightly)images=trackSource(images,PIXELS,arcsec);
  scale=sharedScale(images.map(i=>i.values));
  if(!images.length){
    stop();index=0;$('image').hidden=true;$('marks').setAttribute('hidden','');$('empty').hidden=false;
    $('empty').textContent=matched?'No loaded exposures match '+wavelength.toFixed(2)+' µm ±5%. Try another wavelength or All wavelengths.':'Loading observations…';
    $('time').disabled=$('play').disabled=$('diff').disabled=true;$('nights').disabled=false;
    $('time').max=0;$('time').value=0;$('date').textContent='—';$('result').textContent='';
    $('nights').setAttribute('aria-pressed',String(nightly));report();return;
  }
  index=chosen!=null?images.reduce((best,v,i)=>Math.abs(v.mjd-chosen)<Math.abs(images[best].mjd-chosen)?i:best,0):0;
  render();
}
function paint(values,map){
  const canvas=$('image'),context=canvas.getContext('2d');canvas.width=canvas.height=PIXELS;
  const rgba=context.createImageData(PIXELS,PIXELS);
  for(let i=0;i<values.length;i++){const g=Number.isFinite(values[i])?map(values[i]):0;rgba.data[i*4]=rgba.data[i*4+1]=rgba.data[i*4+2]=g;rgba.data[i*4+3]=255;}
  context.putImageData(rgba,0,0);
}
// Comparable wavelengths use one scale, including the difference image.
// All-wavelength overview retains per-image contrast and has no motion fit.
const unit=image=>{const limits=matched?scale:image.scale,range=limits.high-limits.low,out=new Float32Array(image.values.length);for(let i=0;i<out.length;i++)out[i]=(image.values[i]-limits.low)/range;return out;};
function render(){
  const image=images[index];if(!image)return;
  $('image').hidden=false;$('marks').removeAttribute('hidden');$('empty').hidden=true;
  const first=images[0],last=images.at(-1),many=images.length>1;
  if(showDifference&&many){
    // Zero change is mid-grey: where the star was is dark, where it is now is bright.
    paint(difference(unit(last),unit(first)),v=>Math.round(127.5+127.5*Math.max(-1,Math.min(1,Math.asinh(8*v)/Math.asinh(8)))));
  }else paint(unit(image),v=>Math.round(255*Math.asinh(10*Math.max(0,Math.min(1,v)))/Math.asinh(10)));
  const time=$('time');time.max=images.length-1;time.value=index;time.disabled=!many;
  $('date').textContent=showDifference&&many?last.date+' − '+first.date:image.date+(image.end!==image.date?' to '+image.end.slice(5):'');
  time.setAttribute('aria-valuetext',image.date+', '+image.members.length+' exposures');
  $('diff').setAttribute('aria-pressed',String(showDifference));$('diff').disabled=!many||!matched;$('play').disabled=!many;
  $('nights').setAttribute('aria-pressed',String(nightly));$('nights').disabled=false;
  // Ring and dots follow the same local source. Flagged positions are hollow.
  const marks=$('marks');marks.setAttribute('viewBox','0 0 '+PIXELS+' '+PIXELS);
  const centres=images.filter(v=>v.centre);
  marks.innerHTML=(centres.length>1?'<polyline fill="none" stroke="#e8b565" stroke-width=".25" points="'+centres.map(v=>(v.centre.x+.5)+','+(v.centre.y+.5)).join(' ')+'"/>':'')+centres.map(v=>'<circle cx="'+(v.centre.x+.5)+'" cy="'+(v.centre.y+.5)+'" r="'+(v===image&&!showDifference?1.1:.6)+'" fill="'+(!v.centre.trusted?'none':v===image&&!showDifference?'#fff':'#e8b565')+'" stroke="#e8b565" stroke-width=".25"/>').join('')+(image.centre&&!showDifference?'<circle cx="'+(image.centre.x+.5)+'" cy="'+(image.centre.y+.5)+'" r="11" fill="none" stroke="#e8b565" stroke-width=".5"/>':'');
  if(!matched)$('result').textContent='All-wavelength overview · brightness and appearance vary with wavelength; no motion measurement.';
  else if(crossBand.valid)$('result').textContent='Apparent motion '+crossBand.rate.toFixed(1)+'″/year · '+crossBand.groups+' independent matched bands over ≥300 days · band-to-band spread '+crossBand.spread.toFixed(1)+'″/year. Not a formal uncertainty.';
  else if(motion.valid)$('result').textContent=(busy?'Provisional · ':'')+'Single-band apparent motion '+motion.rate.toFixed(1)+'″ per year across '+motion.used+' UTC dates · residual scatter '+motion.rms.toFixed(1)+'″. Includes parallax and alignment error; exploratory fit.';
  else{
    const flagged=centres.some(v=>!v.centre.trusted);
    $('result').textContent=flagged?'Hollow markers are visual estimates: source pixels are flagged or missing. No reliable motion rate.':motion.reason||'No unambiguous central source to track.';
  }
  $('image').setAttribute('aria-label',(showDifference?'Difference image':'Stacked image from '+image.date)+' of '+$('name').textContent);
  report();
}
$('time').oninput=()=>{stop();userChose=true;showDifference=false;index=Number($('time').value);preferredTime=images[index]?.mjd;render();};
$('diff').onclick=()=>{if(!matched||images.length<2)return;stop();showDifference=!showDifference;render();};
$('nights').onclick=()=>{stop();nightly=!nightly;restack();};
$('play').onclick=()=>{if(images.length<2)return;if(timer){stop();return;}showDifference=false;userChose=true;$('play').textContent='Pause';timer=setInterval(()=>{index=(index+1)%images.length;preferredTime=images[index]?.mjd;render();},nightly?350:700);render();};
$('mode').onchange=()=>{stop();matched=$('mode').value==='matched';showDifference=false;restack();};
const wavePosition=wave=>Math.log(wave/.75)/Math.log(5/.75)*1000;
const waveAt=position=>.75*Math.exp(position/1000*Math.log(5/.75));
function updateWavelengthControls(){
  const unavailable=!matched||!stops.length;
  $('wave-range').disabled=$('wavelength').disabled=unavailable;
  const at=stops.indexOf(wavelength);
  $('wave-prev').disabled=unavailable||at<=0;$('wave-next').disabled=unavailable||at>=stops.length-1;
  $('wave-range').value=wavePosition(wavelength);$('wavelength').value=wavelength.toFixed(3);
  $('wave-range').setAttribute('aria-valuetext',wavelength.toFixed(3)+' micrometres');
  $('coverage').innerHTML=stops.map(w=>'<rect x="'+wavePosition(w).toFixed(2)+'" y="2" width="2" height="6" fill="'+(w===wavelength?'#e8b565':'#596273')+'"/>').join('');
  $('wave-note').textContent=stops.length?stops.length+' available bands · snaps to data':'Finding available wavelengths…';
}
function chooseWavelength(value){
  if(!Number.isFinite(value)||value<.75||value>5){updateWavelengthControls();return;}
  stop();preferredTime??=images[index]?.mjd;preferredWavelength=value;showDifference=false;
  // At most one expensive restack per animation frame while dragging.
  if(waveTask!==null)cancelAnimationFrame(waveTask);
  waveTask=requestAnimationFrame(()=>{waveTask=null;restack();});
}
$('wavelength').onchange=()=>chooseWavelength(Number($('wavelength').value));
$('wave-range').oninput=()=>chooseWavelength(waveAt(Number($('wave-range').value)));
$('wave-range').onkeydown=event=>{
  if(!['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();const at=stops.indexOf(wavelength);
  const i=event.key==='Home'?0:event.key==='End'?stops.length-1:at+(['ArrowLeft','ArrowDown'].includes(event.key)?-1:1);
  if(stops[i]!=null)chooseWavelength(stops[i]);
};
$('wave-prev').onclick=()=>{const w=stops[stops.indexOf(wavelength)-1];if(w!=null)chooseWavelength(w);};
$('wave-next').onclick=()=>{const w=stops[stops.indexOf(wavelength)+1];if(w!=null)chooseWavelength(w);};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});

async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(58000)});if(r.ok)return r;let message='Request failed ('+r.status+').';try{message=(await r.json()).error||message;}catch{}throw new Error(message);}
// The observation list is kept for twelve hours, and a failed search is tried once
// more, so a slow moment at the archive does not stop a page that worked earlier.
async function list(search){
  const key='sate-list|'+[region.ra,region.dec,search.wavelength,search.tolerance].join('|');
  let saved=null;try{saved=JSON.parse(localStorage.getItem(key));}catch{}
  if(saved&&Date.now()-saved.at<12*3600e3)return saved.result;
  for(let attempt=0;;attempt++){
    try{const result=await (await get('/api/observations?'+new URLSearchParams({...region,...search}))).json();try{localStorage.setItem(key,JSON.stringify({at:Date.now(),result}));}catch{}return result;}
    catch(error){if(attempt){if(saved)return saved.result;throw error;}await new Promise(resolve=>setTimeout(resolve,3000));}
  }
}
function report(){
  const image=images[index],loaded=jobs.filter(j=>j.frame).length;
  $('status').textContent=(busy?'Loading '+checked+' / '+jobs.length+' exposures · ':loaded+' exposures · ')+images.length+(nightly?' UTC night':' visit')+(images.length===1?'':'s')+(image?' · this image: '+image.members.length+' exposures median-stacked':'')+(matched?' · '+wavelength.toFixed(2)+' µm ±5% · '+selectedCount+' matching exposures · '+(images[0]?.members[0]?.obs.band||'')+' · shared contrast':' · all six detectors, 0.75–5.0 µm · individual contrast')+(showDifference?' · difference may include flagged pixels':'')+(failed?' · '+failed+' failed':'')+(jobs.some(j=>j.unusable)?' · '+jobs.filter(j=>j.unusable).length+' unreadable':'');
}
// Real FITS cutouts bundled with the verified example make the first view
// independent of a slow archive. They use exactly the same parser and masks.
async function seedDemo(){
  if(seeded)return;seeded=true;
  let demo;try{demo=JSON.parse($('demo-data')?.textContent||'{}');}catch{return;}
  if(!demo.target||['ra','dec','size'].some(k=>Math.abs(demo.target[k]-region[k])>1e-6))return;
  const search={wavelength:1.25,tolerance:.5};
  jobs=demo.observations.map(obs=>({obs,search}));const byPath=new Map(jobs.map(j=>[j.obs.path,j]));
  for(const item of demo.frames){
    try{
      const bytes=Uint8Array.from(atob(item.data),c=>c.charCodeAt(0));
      const buffer=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      const job=byPath.get(item.path);if(!job)continue;
      job.frame=alignImage(parseSpectralImage(buffer),grid,search.wavelength,search.tolerance,{showAll:true});frameRevision++;
    }catch{continue;}
  }
  checked=jobs.filter(j=>j.frame).length;restack();
}
async function load(){
  if(busy)return;busy=true;failed=0;$('retry').hidden=true;
  try{
    await seedDemo();
    if(!searched){
      const seen=new Map(jobs.map(j=>[j.obs.path,j]));
      for(const search of SEARCHES){const result=await list(search);if(!result.complete)throw new Error('The archive returned an incomplete observation list.');for(const obs of result.observations)if(!seen.has(obs.path))seen.set(obs.path,{obs,search});}
      jobs=uniqueExposures([...seen.values()]).sort((a,b)=>a.obs.mjd-b.obs.mjd);searched=true;
    }
    if(!jobs.length){$('empty').textContent='SPHEREx has no released exposures of this position yet.';return;}
    for(let pass=0;pass<3;pass++){
    if(pass){if(!failed)break;failed=0;await new Promise(resolve=>setTimeout(resolve,4000));}
    // Take one exposure from each visit in turn, so every visit has an image early.
    const groups=groupVisits(jobs.filter(j=>!j.frame&&!j.unusable),10),queue=[];
    const bandCentres=[.91,1.37,2.04,3.02,4.13,4.70];
    for(const group of groups)group.sort((a,b)=>Math.abs(Math.log(bandCentres[Number(a.obs.band.slice(-1))-1]/wavelength))-Math.abs(Math.log(bandCentres[Number(b.obs.band.slice(-1))-1]/wavelength))||a.obs.mjd-b.obs.mjd);for(const j of jobs)delete j.error;
    for(let k=0;groups.some(g=>k<g.length);k++)for(const g of groups)if(k<g.length)queue.push(g[k]);
    let next=0;checked=jobs.length-queue.length;report();
    await Promise.all([0,1].map(async()=>{while(next<queue.length){const job=queue[next++];
      try{
        const key='motion-v2|'+PIXELS+'|'+frameCacheKey(region,job.obs.path);let frame=await cachedFrame(key);
        if(!frame?.aligned||!frame.wavelengths||!frame.quality){const response=await get('/api/frame?'+new URLSearchParams({...region,...job.search,image:job.obs.path}));
          try{frame=alignImage(parseSpectralImage(await response.arrayBuffer()),grid,job.search.wavelength,job.search.tolerance,{showAll:true});}catch(error){job.unusable=true;job.error=error.message;continue;}
          await cacheFrame(key,frame);}
        job.frame=frame;frameRevision++;restack();
      }catch(error){failed++;job.error=error.message;}
      finally{checked++;report();}
    }}));
    }
    restack();
  }catch(error){$('empty').hidden=false;$('empty').textContent='Could not load observations. '+error.message;}
  finally{busy=false;if(images.length)render();else report();$('retry').hidden=!(failed||!searched);}
}
$('retry').onclick=load;
load();
