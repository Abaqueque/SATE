import {center,ORDER,parseSky} from './sky-model.js';
import {parseSpectralImage,createSkyGrid,alignImage,drawAligned,sharedStretch} from './science/spectral.js';
import {processDisplay,displayScale,drawClean} from './cell-processing.js';
import {selectionRanges,inRanges,uniqueExposures,matchingExposures,stackCandidates,timelineLayout,nearestExposure} from './cell-selection.js';
import {averageNearby} from './cell-stack.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayLabel=date=>new Date(date).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const timeLabel=date=>date.slice(11,19);
export const isCellView=()=>new URLSearchParams(location.search).get('view')==='cell'&&parseSky(location.search)?.order===ORDER;
export function cellMarkup(){const selected=parseSky(location.search),p=center(selected.id);return `<main id="main" class="cell-workspace" data-cell>
<section class="cell-image-area" aria-label="SPHEREx observation"><div class="cell-image-bar"><a href="/explore/?hpx=${selected.id}&order=9" class="cell-back">← Sky atlas</a><span>SPHEREx <b>LEVEL 2</b></span><button id="cell-original" aria-pressed="false">Original</button></div>
<div class="cell-stage"><canvas id="cell-canvas" aria-label="SPHEREx exposure" hidden></canvas><div class="cell-image-message" role="status"><span class="cell-spinner"></span><strong id="cell-message">Loading observations…</strong><p id="cell-message-detail"></p><button id="cell-retry" hidden>Retry</button></div><div class="cell-compass" hidden>N ↑<br>E ←</div><div class="cell-image-caption" id="cell-caption"></div></div>
<div class="cell-image-footer"><output id="cell-pixel"></output><label>Zoom <input id="cell-zoom" type="range" min="1" max="4" step=".25" value="1" aria-label="Image zoom"></label><button id="cell-fit">Fit</button></div></section>
<aside class="cell-rail"><h1>Cell ${selected.id}</h1><p class="cell-coordinate">RA ${p.ra.toFixed(5)}°<br>Dec ${p.dec.toFixed(5)}°</p>
<label class="cell-field">Wavelength <select id="cell-wave" aria-label="Wavelength" disabled><option>Loading…</option></select></label><div id="cell-mix" hidden><div id="cell-mix-chips"></div><div class="cell-add-wave"><select id="cell-mix-add" aria-label="Add wavelength"></select><button id="cell-mix-button">Add</button></div></div>
<div class="cell-observation-info" id="cell-info"></div>
<div class="cell-tools"><h2>Image</h2><label class="cell-toggle"><span>Quality mask</span><input type="checkbox" id="cell-quality" checked></label><label class="cell-toggle"><span>Background removal</span><input type="checkbox" id="cell-background" checked></label><label class="cell-field">Denoise <select id="cell-noise" aria-label="Denoise"><option value="0">Off</option><option value="1">Low</option><option value="2" selected>High</option></select></label><label class="cell-toggle"><span>Smooth pixels</span><input type="checkbox" id="cell-interpolate" checked></label><label class="cell-toggle"><span>Repair small gaps</span><input type="checkbox" id="cell-repair"></label><label class="cell-field">Contrast <input id="cell-contrast" aria-label="Contrast" type="range" min=".4" max="2.5" step=".05" value="1"></label><button id="cell-combine" class="cell-combine" disabled>Combine exposures</button><output id="cell-combine-status"></output></div>
<a id="cell-fits" class="cell-download" hidden target="_blank" rel="noreferrer">Download FITS ↗</a></aside>
<section class="cell-timeline" aria-label="SPHEREx timeline"><div class="cell-timeline-heading"><div><span class="cell-timeline-label">Timeline · UTC</span><strong id="cell-date">Loading…</strong></div><div class="cell-timeline-controls"><button id="cell-prev" aria-label="Previous exposure" disabled>←</button><button id="cell-play" disabled>Play</button><button id="cell-next" aria-label="Next exposure" disabled>→</button></div><span id="cell-count" role="status"></span></div><div class="cell-time-axis" id="cell-dates"><div class="cell-scrub-track"><div id="cell-ticks" aria-hidden="true"></div><input id="cell-scrub" aria-label="Observation timeline" type="range" min="0" max="1" step="any" value="0" disabled></div><div class="cell-axis-labels" id="cell-axis-labels"></div></div><div class="cell-visit-times" id="cell-times"></div><div class="cell-index-status"><span id="cell-index-progress" role="status"></span><button id="cell-index-retry" hidden>Retry unavailable</button></div></section></main>`;}
export function mountCell(){
 const root=document.querySelector('[data-cell]'),q=s=>root.querySelector(s),cell=parseSky(location.search),p=center(cell.id),grid=createSkyGrid(p.ra,p.dec,.2),canvas=q('#cell-canvas'),message=q('.cell-image-message');
 let dead=false,metadata,channel=62,mode='single',mix=[62],items=[],path=null,current=null,original=false,playing=false,playTimer,searchController,frameController,generation=0,frameToken=0,checking=false,checked=0,failures=0,combined=false,scrubbing=false,scrubTimer,scrubPending=null;
 const frames=new Map(),infos=new Map(),scales=new Map();
 const ranges=()=>selectionRanges(metadata.wavelengths,mode,channel,mix);
 const parameters=()=>{const selected=ranges(),tolerance=Math.max(.01,...selected.map(r=>Math.max(r.centre-r.low,r.high-r.centre)));const params=new URLSearchParams({ra:p.ra,dec:p.dec,size:.2,wavelength:metadata.wavelengths[channel],tolerance:mode==='all'?.05:Math.min(.5,tolerance),mode});if(mode==='mix')params.set('wavelengths',mix.map(i=>metadata.wavelengths[i]).join(','));return params;};
 const rows=()=>matchingExposures(items);
 function status(title,detail='',busy=false){message.hidden=false;q('#cell-message').textContent=title;q('#cell-message-detail').textContent=detail;q('.cell-spinner').hidden=!busy;}
 function stop(){playing=false;clearTimeout(playTimer);q('#cell-play').textContent='Play';}
 function clearImage(){current=null;combined=false;canvas.hidden=true;q('.cell-compass').hidden=true;q('#cell-caption').textContent='';q('#cell-info').textContent='';q('#cell-pixel').textContent='';q('#cell-retry').hidden=true;q('#cell-fits').hidden=true;q('#cell-combine-status').textContent='';}
 function updateUrl(){const u=new URL(location.href);u.searchParams.set('channel',channel);u.searchParams.set('mode',mode);if(mode==='mix')u.searchParams.set('mix',mix.join(','));else u.searchParams.delete('mix');if(path)u.searchParams.set('exposure',items.find(o=>o.path===path)?.id||'');else u.searchParams.delete('exposure');u.searchParams.delete('date');history.replaceState({},'',u.pathname+u.search);q('.cell-back').href='/explore/?hpx='+cell.id+'&order=9&channel='+channel;}
 function updateCombine(){const choices=current?stackCandidates(rows(),current.obs):[];q('#cell-combine').disabled=!current||(!combined&&!choices.length);q('#cell-combine').textContent=combined?'Individual exposure':'Combine exposures';q('#cell-combine').title=choices.length?'Combine compatible exposures within six hours':'No compatible exposure within six hours';}
 function timeline(){
  const list=rows(),i=list.findIndex(o=>o.path===path),layout=timelineLayout(list),selected=list[i];
  const focused=document.activeElement?.dataset?.exposure;
  q('#cell-ticks').innerHTML=layout.points.map(({obs,position})=>`<i class="cell-scrub-tick ${obs.path===path?'selected':''}" style="left:${position*100}%"></i>`).join('');
  q('#cell-axis-labels').innerHTML=layout.labels.map(({date,position})=>`<span style="left:${position*100}%">${layout.sameDay?timeLabel(date):new Date(date).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'2-digit',timeZone:'UTC'})}</span>`).join('');
  const scrub=q('#cell-scrub');scrub.disabled=list.length<2;if(!scrubbing){scrub.value=layout.points[i]?.position??0;scrub.style.setProperty('--scrub-progress',Number(scrub.value)*100+'%');}
  scrub.setAttribute('aria-valuetext',selected?`${dayLabel(selected.date)}, ${timeLabel(selected.date)} UTC, exposure ${i+1} of ${list.length}`:'No exposure selected');
  const sameDay=selected?list.filter(o=>o.date.slice(0,10)===selected.date.slice(0,10)):[];
  q('#cell-times').innerHTML=sameDay.length>1?sameDay.map(o=>`<button data-exposure="${escape(o.path)}" class="${o.path===path?'selected':''}" aria-pressed="${o.path===path}">${timeLabel(o.date)} <span>${o.wavelength.toFixed(3)} µm</span></button>`).join(''):'';
  if(focused)q(`[data-exposure="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
  q('#cell-date').textContent=items.find(o=>o.path===path)?dayLabel(items.find(o=>o.path===path).date):checking?'Loading…':list.length?'Select an exposure':'No matches';
  q('#cell-count').textContent=list.length+' exposures';q('#cell-prev').disabled=i<=0;q('#cell-next').disabled=!list.length||i===list.length-1;q('#cell-play').disabled=list.length<2||checking;
  q('#cell-index-progress').textContent=checking?`${checked} / ${items.length} checked`:failures?`${failures} unavailable`:'';q('#cell-index-retry').hidden=checking||!failures;updateCombine();
 }
 function mixUi(){q('#cell-mix').hidden=mode!=='mix';q('#cell-mix-chips').innerHTML=mix.map(i=>`<button data-remove-wave="${i}" ${mix.length===1?'disabled':''}>${metadata.wavelengths[i].toFixed(3)} µm ×</button>`).join('');}
 function draw(){if(!current)return;const source=original?frames.get(current.obs.path).raw:!q('#cell-background').checked?current.raw:current.clean;
  const display=processDisplay(source,{quality:original?false:q('#cell-quality').checked,denoise:original?0:Number(q('#cell-noise').value),repair:original?false:q('#cell-repair').checked,ranges:ranges(),spectralMask:mode!=='all'});
  // Reference scaling remains fixed within the same selected spectral channel.
  const localGroup=metadata.wavelengths.reduce((best,w,i)=>Math.abs(w-source.wavelength)<Math.abs(metadata.wavelengths[best]-source.wavelength)?i:best,0),key=(mode==='single'?channel:localGroup)+'|'+(original?'original':q('#cell-background').checked?'clean':'raw');
  if(!scales.has(key))scales.set(key,{clean:displayScale(display),raw:sharedStretch([display])});const scale=scales.get(key);
  if(original)drawAligned(canvas,display,scale.raw);else drawClean(canvas,display,scale.clean,Number(q('#cell-contrast').value));
  canvas.style.imageRendering=!original&&q('#cell-interpolate').checked?'auto':'pixelated';canvas.hidden=false;message.hidden=true;if(!display.coverage)status('No unmasked pixels');q('.cell-compass').hidden=false;q('#cell-original').setAttribute('aria-pressed',String(original));q('#cell-original').textContent=original?'Cleaned':'Original';root.classList.toggle('showing-original',original);
  q('#cell-caption').textContent=combined&&!original?`${current.members} exposures combined`:'';
 }
 function show(frame,obs){current={...frame,obs};draw();
  q('#cell-info').innerHTML=`<span>${dayLabel(obs.date)} · ${timeLabel(obs.date)} UTC</span><strong>${frame.clean.wavelength.toFixed(3)} µm · ${escape(obs.band.replace('SPHEREx-',''))}</strong>`;
  const href=new URL(obs.path,'https://irsa.ipac.caltech.edu');href.searchParams.set('center',p.ra+','+p.dec);href.searchParams.set('size','.3');href.searchParams.set('gzip','false');q('#cell-fits').href=href.href;q('#cell-fits').hidden=false;updateCombine();
 }
 async function fetchFrame(obs,signal){if(frames.has(obs.path)){const saved=frames.get(obs.path);frames.delete(obs.path);frames.set(obs.path,saved);return saved;}const params=parameters();params.set('image',obs.path);const r=await fetch('/api/frame?'+params,{signal});if(!r.ok){const error=await r.json();throw Error(error.error||'Image unavailable.');}
  const image=parseSpectralImage(await r.arrayBuffer()),clean=alignImage(image,grid,metadata.wavelengths[channel],.08,{showAll:true}),raw=alignImage({...image,zodi:null},grid,metadata.wavelengths[channel],.08,{showAll:true});
  if(!inRanges(clean.wavelength,ranges()))throw Error('Exposure wavelength does not match.');const frame={clean,raw};frames.set(obs.path,frame);while(frames.size>48)frames.delete(frames.keys().next().value);return frame;
 }
 async function selectExposure(selected,{autoplay=false}={}){
  if(!autoplay)stop();const obs=items.find(o=>o.path===selected&&o.match&&!o.unusable);if(!obs)return;frameController?.abort();frameController=new AbortController();const signal=frameController.signal,token=++frameToken;path=selected;clearImage();timeline();updateUrl();status('Loading exposure…','',true);
  try{const frame=await fetchFrame(obs,signal);if(dead||signal.aborted||token!==frameToken)return;
   show(frame,obs);timeline();if(playing)playTimer=setTimeout(()=>{const list=rows(),i=list.findIndex(o=>o.path===path);if(i+1<list.length)selectExposure(list[i+1].path,{autoplay:true});else stop();},1600);
  }catch(e){if(dead||signal.aborted||token!==frameToken)return;stop();status('Could not load exposure',e.message);q('#cell-retry').hidden=false;}
 }
 async function checkItems(signal,token,onlyFailed=false,preferred=''){
  const pending=items.filter(o=>onlyFailed?o.infoError:!o.checked);checking=true;failures=items.filter(o=>o.infoError).length;timeline();
  await Promise.all(pending.map(async obs=>{
   if(signal.aborted)return;try{
    let info=infos.get(obs.path);if(!info){const params=parameters();params.set('image',obs.path);const r=await fetch('/api/frame-info?'+params,{signal});if(!r.ok){const error=await r.json();throw Error(error.error||'Unavailable.');}info=await r.json();infos.set(obs.path,info);}
    if(dead||signal.aborted||token!==generation)return;
    obs.wavelength=info.wavelength;obs.match=info.covered&&inRanges(info.wavelength,ranges());obs.infoError=false;
   }catch(e){if(dead||signal.aborted||token!==generation)return;obs.infoError=true;}
   obs.checked=true;checked=items.filter(o=>o.checked).length;failures=items.filter(o=>o.infoError).length;timeline();
   if(!path){const wanted=items.find(o=>o.id===preferred);if(!wanted||wanted.checked){const list=rows(),first=list.find(o=>o.id===preferred)||list[0];if(first)selectExposure(first.path);}}
  }));
  if(dead||signal.aborted||token!==generation)return;checking=false;timeline();if(!rows().length){status(failures?'Some observations are unavailable':'No matching exposures',failures?'Retry unavailable observations.':'');q('#cell-retry').hidden=!failures;}
 }
 async function search(){
  const preferred=new URLSearchParams(location.search).get('exposure')||'';cancelScrub();stop();searchController?.abort();frameController?.abort();frameToken++;const token=++generation;searchController=new AbortController();const signal=searchController.signal;items=[];path=null;checked=0;failures=0;checking=true;scales.clear();clearImage();timeline();mixUi();updateUrl();status('Finding observations…','',true);
  try{const r=await fetch('/api/observations?'+parameters(),{signal});const data=await r.json();if(!r.ok)throw Error(data.error||'Search unavailable.');if(dead||signal.aborted||token!==generation)return;items=uniqueExposures(data.observations);status('Matching wavelengths…','',true);await checkItems(signal,token,false,preferred);
  }catch(e){if(dead||signal.aborted||token!==generation)return;checking=false;timeline();status('Archive unavailable',e.message);q('#cell-retry').hidden=false;}
 }
 async function combine(){if(!current)return;stop();if(combined){combined=false;show(frames.get(current.obs.path),current.obs);q('#cell-combine-status').textContent='';return;}
  const anchor=current.obs;await fetchFrame(anchor,frameController.signal);const candidates=stackCandidates(rows(),anchor).slice(0,12),token=frameToken,signal=frameController.signal;if(!candidates.length)return;q('#cell-combine').disabled=true;q('#cell-combine-status').textContent='Combining…';
  try{
   const loaded=await Promise.allSettled(candidates.map(async obs=>{await fetchFrame(obs,signal);return obs;}));const available=[anchor,...loaded.filter(r=>r.status==='fulfilled').map(r=>r.value)];
   if(dead||signal.aborted||token!==frameToken)return;
   const blend=type=>{const jobs=available.map(obs=>({obs,status:'ready',frame:{...frames.get(obs.path)[type],quality:Uint8Array.from(frames.get(obs.path)[type].quality,(v,i)=>v&&inRanges(frames.get(obs.path)[type].wavelengths[i],ranges())?1:0)}})),a=jobs[0],result=averageNearby(jobs,a,{hours:6,wavelengthPercent:1});if(!result.frame)return result;const frame={...a.frame,values:Float32Array.from(a.frame.values),variance:Float64Array.from(a.frame.variance),quality:Uint8Array.from(a.frame.quality)};for(let i=0;i<frame.values.length;i++)if(result.frame.counts[i]>=2){frame.values[i]=result.frame.values[i];frame.variance[i]=result.frame.variance[i];frame.quality[i]=1;}return {frame,members:result.members.length};};
   const clean=blend('clean'),raw=blend('raw');if(!clean.frame||!raw.frame){q('#cell-combine-status').textContent='No compatible overlap';updateCombine();return;}
   combined=true;original=false;show({clean:clean.frame,raw:raw.frame,members:clean.members},anchor);q('#cell-combine-status').textContent='';
  }catch(e){if(!dead&&!signal.aborted&&token===frameToken){q('#cell-combine-status').textContent='Could not combine';updateCombine();}}
 }
 const clickExposure=e=>{const b=e.target.closest('[data-exposure]');if(b)selectExposure(b.dataset.exposure);};q('#cell-times').onclick=clickExposure;
 const step=n=>{const list=rows(),i=list.findIndex(o=>o.path===path),next=list[i+n];if(next)selectExposure(next.path);};q('#cell-prev').onclick=()=>step(-1);q('#cell-next').onclick=()=>step(1);q('#cell-dates').onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();if(e.key==='Home'||e.key==='End'){const list=rows();if(list.length)selectExposure((e.key==='Home'?list[0]:list.at(-1)).path);}else step(e.key==='ArrowLeft'?-1:1);}};
 function cancelScrub(){clearTimeout(scrubTimer);scrubPending=null;scrubbing=false;}
 const scrub=q('#cell-scrub');
 function commitScrub(){clearTimeout(scrubTimer);const chosen=scrubPending;scrubPending=null;if(chosen&&chosen!==path)selectExposure(chosen);}
 scrub.onpointerdown=()=>{scrubbing=true;stop();};
 scrub.oninput=()=>{stop();scrub.style.setProperty('--scrub-progress',Number(scrub.value)*100+'%');const chosen=nearestExposure(rows(),Number(scrub.value));if(!chosen||chosen.path===scrubPending)return;clearTimeout(scrubTimer);scrubPending=chosen.path;if(chosen.path===path){scrubPending=null;return;}scrubTimer=setTimeout(commitScrub,100);};
 const finishScrub=()=>{scrubbing=false;commitScrub();timeline();};
 scrub.onchange=finishScrub;scrub.onpointerup=finishScrub;scrub.onpointercancel=finishScrub;scrub.onblur=finishScrub;
 q('#cell-play').onclick=()=>{if(playing){stop();return;}const list=rows(),i=list.findIndex(o=>o.path===path);if(list.length<2)return;playing=true;q('#cell-play').textContent='Pause';selectExposure(list[(i+1)%list.length].path,{autoplay:true});};
 q('#cell-retry').onclick=()=>path?selectExposure(path):search();q('#cell-index-retry').onclick=()=>checkItems(searchController.signal,generation,true);q('#cell-original').onclick=()=>{original=!original;draw();};q('#cell-combine').onclick=combine;
 for(const id of ['quality','background','noise','interpolate','repair','contrast'])q('#cell-'+id).oninput=draw;
 q('#cell-zoom').oninput=e=>{canvas.style.width=`${Number(e.target.value)*100}%`;canvas.style.height=`${Number(e.target.value)*100}%`;};q('#cell-fit').onclick=()=>{q('#cell-zoom').value=1;canvas.style.width='100%';canvas.style.height='100%';};
 canvas.onpointermove=e=>{if(!current)return;const r=canvas.getBoundingClientRect(),side=Math.min(r.width,r.height),x=Math.floor((e.clientX-r.left-(r.width-side)/2)/side*grid.pixels),y=Math.floor((e.clientY-r.top-(r.height-side)/2)/side*grid.pixels);if(x<0||y<0||x>=grid.pixels||y>=grid.pixels)return;const i=y*grid.pixels+x,raw=frames.get(current.obs.path).raw,v=raw.values[i],w=raw.wavelengths[i];q('#cell-pixel').textContent=inRanges(w,ranges())&&Number.isFinite(v)?`${v.toPrecision(4)} ${current.raw.unit} · ${w.toFixed(3)} µm`:'';};
 q('#cell-wave').onchange=e=>{if(e.target.value==='all')mode='all';else if(e.target.value==='mix'){mode='mix';if(!mix.length)mix=[channel];}else{mode='single';channel=Number(e.target.value);}search();};
 q('#cell-mix-button').onclick=()=>{const i=Number(q('#cell-mix-add').value);if(!mix.includes(i)){mix.push(i);mix.sort((a,b)=>a-b);search();}};q('#cell-mix-chips').onclick=e=>{const b=e.target.closest('[data-remove-wave]');if(b&&mix.length>1){mix=mix.filter(i=>i!==Number(b.dataset.removeWave));search();}};
 (async()=>{try{const r=await fetch('/assets/spherex-survey.json');if(!r.ok)throw Error('Wavelength list unavailable.');metadata=await r.json();if(dead)return;const params=new URLSearchParams(location.search),requested=Number(params.get('channel'));if(params.has('channel')&&Number.isInteger(requested)&&requested>=0&&requested<metadata.wavelengths.length)channel=requested;mode=['single','all','mix'].includes(params.get('mode'))?params.get('mode'):'single';mix=(params.get('mix')||String(channel)).split(',').map(Number).filter((i,n,a)=>Number.isInteger(i)&&i>=0&&i<metadata.wavelengths.length&&a.indexOf(i)===n);if(!mix.length)mix=[channel];const options=metadata.wavelengths.map((w,i)=>`<option value="${i}">${w.toFixed(3)} µm</option>`).join('');q('#cell-wave').innerHTML='<option value="all">All wavelengths</option><option value="mix">Mix wavelengths</option>'+options;q('#cell-wave').value=mode==='single'?String(channel):mode;q('#cell-wave').disabled=false;q('#cell-mix-add').innerHTML=options;q('#cell-mix-add').value=String(Math.min(101,channel+1));await search();}catch(e){if(!dead)status('Could not start viewer',e.message);}})();
 return()=>{dead=true;cancelScrub();stop();searchController?.abort();frameController?.abort();frames.clear();infos.clear();};
}
