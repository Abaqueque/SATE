import {parseLayerHue} from './cell-colour.js';
import {channelRange,inRanges,uniqueExposures} from './cell-selection.js';

export function wavelengthParameters(position,wavelengths,channel){
 const range=channelRange(wavelengths,channel);
 return new URLSearchParams({ra:position.ra,dec:position.dec,size:.2,wavelength:range.centre,tolerance:Math.min(.5,Math.max(.01,range.centre-range.low,range.high-range.centre)),mode:'single'});
}

// Check the actual wavelength at the cell centre, not just detector coverage.
// Try closest dates first, with bounded requests and deterministic selection.
export async function findWavelengthObservation({observations,wavelengths,channel,anchorMjd,inspect,signal}){
 const range=channelRange(wavelengths,channel),rows=uniqueExposures(observations);
 if(Number.isFinite(anchorMjd))rows.sort((a,b)=>Math.abs(a.mjd-anchorMjd)-Math.abs(b.mjd-anchorMjd)||a.mjd-b.mjd||a.path.localeCompare(b.path));
 let failures=0;
 for(let i=0;i<rows.length;i+=4){
  signal.throwIfAborted();
  const checked=await Promise.all(rows.slice(i,i+4).map(async obs=>{
   try{const info=await inspect(obs);return info.covered&&inRanges(info.wavelength,[range])?{...obs,wavelength:info.wavelength}:null;}
   catch(error){if(signal.aborted)throw error;failures++;return null;}
  }));
  signal.throwIfAborted();
  const obs=checked.find(Boolean);if(obs)return {obs,failures};
 }
 return {obs:null,failures};
}

export function composeLayers(context,layers){
 context.save();context.globalCompositeOperation='source-over';
 for(const layer of layers){if(!layer.visible||!layer.canvas||layer.opacity<=0)continue;context.globalAlpha=layer.opacity;context.drawImage(layer.canvas,0,0);}
 context.restore();
}

// One generation per viewport. Commit a complete stack only after every layer
// has resolved; superseded requests can never replace a newer timeline position.
export function createLayerTimeline({layers,load,onPending=()=>{},onCommit=()=>{}}){
 const jobs=new Map();let closed=false;
 async function sync(side,target){
  jobs.get(side)?.controller.abort();
  const job={controller:new AbortController(),pending:!!target};jobs.set(side,job);
  const selected=[...layers()];onPending(side,target,selected);
  if(!target){job.pending=false;onCommit(side,[],target);return;}
  const results=await Promise.all(selected.map(async layer=>{try{return {layer,value:await load(layer,target,job.controller.signal)};}catch(error){return {layer,error};}}));
  if(closed||job.controller.signal.aborted||jobs.get(side)!==job)return;
  job.pending=false;onCommit(side,results,target);
 }
 return {sync,pending:side=>jobs.get(side)?.pending??false,clear(){for(const job of jobs.values())job.controller.abort();jobs.clear();},close(){closed=true;this.clear();}};
}

export function mountWavelengthViews({root,metadata,position,loadFrame,redraw,anchor,onChange}){
 const panels=new Map(),button=root.querySelector('#cell-add-wavelength'),layerList=root.querySelector('#cell-layer-list');
 let nextId=0,dead=false;
 const saved=new URLSearchParams(location.search),hidden=(saved.get('hiddenLayers')||'').split(','),opacities=(saved.get('layerOpacity')||'').split(',');
 const savedHues=(saved.get('layerHue')||'').split(',').map(parseLayerHue);
 const base={visible:!hidden.includes('1'),opacity:1,hue:savedHues[0]??210,colour:savedHues[0]!==null};
 const colourMarkup='<div class="cell-layer-colour"><label class="cell-layer-colour-toggle"><span>Colour</span><input type="checkbox" class="cell-colour-toggle"></label><label class="cell-layer-hue"><span>Hue <output>Grayscale</output><i class="cell-colour-swatch" aria-hidden="true"></i></span><input type="range" min="0" max="359" step="1" value="210" title="Adjust hue while preserving brightness"></label></div>';
 const options=metadata.wavelengths.map((w,i)=>`<option value="${i}">${w.toFixed(3)} µm</option>`).join('');
 function controls(layer,number){
  const toggle=layer.card.querySelector('.cell-layer-visible');toggle.textContent=layer.visible?'Visible':'Hidden';toggle.setAttribute('aria-pressed',String(layer.visible));toggle.setAttribute('aria-label',`Layer ${number} visibility`);
  layer.card.classList.toggle('layer-hidden',!layer.visible);
  const opacity=layer.card.querySelector('.cell-layer-opacity input');if(opacity){opacity.setAttribute('aria-label',`Layer ${number} opacity`);layer.card.querySelector('.cell-layer-opacity output').textContent=Math.round(layer.opacity*100)+'%';}
  const colour=layer.card.querySelector('.cell-colour-toggle'),hue=layer.card.querySelector('.cell-layer-hue input');
  colour.checked=layer.colour;colour.setAttribute('aria-label',`Layer ${number} colour`);
  hue.value=layer.hue;hue.setAttribute('aria-label',`Layer ${number} hue`);hue.setAttribute('aria-valuetext',layer.colour?layer.hue+' degrees':'Grayscale; adjust to add colour');
  layer.card.querySelector('.cell-layer-hue output').textContent=layer.colour?layer.hue+'°':'Grayscale';
  layer.card.querySelector('.cell-colour-swatch').style.background=layer.colour?'hsl('+layer.hue+' 85% 65%)':'#c3c3c3';
 }
 function update(){
  let number=2;const hiddenNumbers=base.visible?[]:[1];
  for(const panel of panels.values()){
   panel.number=number;const name=`Layer ${number}`;
   panel.card.setAttribute('aria-label',name);panel.card.querySelector('h2').textContent=name;panel.card.querySelector('select').setAttribute('aria-label',`${name} wavelength`);panel.card.querySelector('.cell-layer-remove').setAttribute('aria-label',`Remove ${name.toLowerCase()}`);
   controls(panel,number);if(!panel.visible)hiddenNumbers.push(number);number++;
  }
  controls(base,1);button.disabled=panels.size>=4;root.querySelector('#cell-wavelength-limit').hidden=panels.size<4;
  onChange([...panels.values()].map(p=>p.channel));
  const u=new URL(location.href);if(hiddenNumbers.length)u.searchParams.set('hiddenLayers',hiddenNumbers.join(','));else u.searchParams.delete('hiddenLayers');
  if(panels.size)u.searchParams.set('layerOpacity',[...panels.values()].map(p=>Math.round(p.opacity*100)).join(','));else u.searchParams.delete('layerOpacity');const colourLayers=[base,...panels.values()];if(colourLayers.some(l=>l.colour))u.searchParams.set('layerHue',colourLayers.map(l=>l.colour?l.hue:'gray').join(','));else u.searchParams.delete('layerHue');history.replaceState({},'',u.pathname+u.search);
  redraw();
 }
 function bindColour(layer){
  layer.card.querySelector('.cell-colour-toggle').onchange=e=>{layer.colour=e.target.checked;update();};
  layer.card.querySelector('.cell-layer-hue input').oninput=e=>{layer.hue=Number(e.target.value);layer.colour=true;update();};
 }
 const sideNames={left:'L',right:'R'};
 function details(panel){
  const messages=[];
  for(const side of ['left','right']){
   const current=panel.current[side],time=panel.card.querySelector(`[data-layer-date="${side}"]`),band=panel.card.querySelector(`[data-layer-band="${side}"]`);
   time.textContent=current?new Date(current.obs.date).toLocaleString('en-AU',{timeZone:'UTC'})+' UTC':'—';
   band.textContent=current?current.obs.wavelength.toFixed(3)+' µm':'';
   if(panel.status[side])messages.push(sideNames[side]+': '+panel.status[side]);
  }
  panel.card.querySelector('.cell-layer-status').textContent=messages.join(' · ');
  panel.card.querySelector('.cell-retry').hidden=!Object.values(panel.errors).some(Boolean);
 }
 function resetLayer(panel){
  panel.controller?.abort();panel.controller=new AbortController();panel.catalog=null;panel.infos=new Map();panel.current={};panel.status={};panel.errors={};details(panel);
 }
 async function read(url,signal){const r=await fetch(url,{signal}),data=await r.json();if(!r.ok)throw Error(data.error||'Archive unavailable.');return data;}
 async function loadAt(panel,target,seekSignal){
  const signal=AbortSignal.any([seekSignal,panel.controller.signal]),params=wavelengthParameters(position,metadata.wavelengths,panel.channel),channel=panel.channel;
  // Share catalogue/header work between dates, while cancelling obsolete frames.
  if(!panel.catalog){const request=read('/api/observations?'+params,panel.controller.signal);panel.catalog=request;request.catch(()=>{if(panel.catalog===request)panel.catalog=null;});}
  const data=await panel.catalog;signal.throwIfAborted();
  const {obs,failures}=await findWavelengthObservation({observations:data.observations,wavelengths:metadata.wavelengths,channel,anchorMjd:target.mjd,signal,inspect:o=>{
   if(!panel.infos.has(o.path)){const query=new URLSearchParams(params);query.set('image',o.path);const request=read('/api/frame-info?'+query,panel.controller.signal);panel.infos.set(o.path,request);request.catch(()=>{if(panel.infos.get(o.path)===request)panel.infos.delete(o.path);});}
   return panel.infos.get(o.path);
  }});
  signal.throwIfAborted();if(!obs)return {current:null,error:failures>0,status:failures?'Some observations unavailable. Retry.':'No observations at this wavelength.'};
  const frame=await loadFrame(obs,signal,params,channel);signal.throwIfAborted();
  return {current:{...frame,individual:frame,obs},error:failures>0,status:failures?'Some dates unavailable':''};
 }
 const timeline=createLayerTimeline({layers:()=>panels.values(),load:loadAt,
  onPending(side,target,selected){for(const panel of selected){panel.status[side]=target?'Updating layers…':'Choose a timeline date';panel.errors[side]=false;details(panel);}redraw();},
  onCommit(side,results,target){
   for(const panel of panels.values()){const result=results.find(r=>r.layer===panel);panel.current[side]=result?.value?.current||null;panel.errors[side]=!!(result?.error||result?.value?.error);panel.status[side]=result?.error?'Could not load: '+result.error.message:result?.value?.status||(!target?'Choose a timeline date':'');details(panel);}
   redraw();
  }
 });
 const refresh=()=>{for(const side of ['left','right'])void timeline.sync(side,anchor(side));};
 function add(channel,{focus=true}={}){
  if(dead||panels.size>=4)return;
  const id=++nextId,index=panels.size,card=document.createElement('section');card.className='cell-layer-card';
  card.innerHTML=`<div class="cell-layer-title"><h2></h2><button type="button" class="cell-layer-visible" aria-pressed="true">Visible</button><button type="button" class="cell-layer-remove">×</button></div><label class="cell-field">Wavelength<select>${options}</select></label>${colourMarkup}<label class="cell-field cell-layer-opacity"><span>Opacity <output>100%</output></span><input type="range" min="0" max="100" step="1" value="100"></label><div class="cell-layer-dates"><div><b>L</b> <time data-layer-date="left">—</time><span data-layer-band="left"></span></div><div><b>R</b> <time data-layer-date="right">—</time><span data-layer-band="right"></span></div></div><p class="cell-layer-status" role="status"></p><button type="button" class="cell-retry" hidden>Retry</button>`;
  const restoredOpacity=Number(opacities[index]),savedHue=focus?null:savedHues[index+1],panel={hue:savedHue??210,colour:savedHue!=null,channel,card,current:{},status:{},errors:{},visible:focus||!hidden.includes(String(index+2)),opacity:!focus&&opacities[index]?.trim()&&Number.isFinite(restoredOpacity)?Math.max(0,Math.min(100,restoredOpacity))/100:1};
  panels.set(id,panel);layerList.append(card);resetLayer(panel);const select=card.querySelector('select');select.value=String(channel);card.querySelector('.cell-layer-opacity input').value=panel.opacity*100;bindColour(panel);
  select.onchange=()=>{panel.channel=Number(select.value);resetLayer(panel);refresh();update();};
  card.querySelector('.cell-layer-visible').onclick=()=>{panel.visible=!panel.visible;update();};
  card.querySelector('.cell-layer-opacity input').oninput=e=>{panel.opacity=Number(e.target.value)/100;update();};
  card.querySelector('.cell-layer-remove').onclick=()=>{panel.controller?.abort();panels.delete(id);card.remove();refresh();update();button.focus();};
  card.querySelector('.cell-retry').onclick=refresh;update();refresh();if(focus){select.focus();card.scrollIntoView({block:'nearest'});}
 }
 base.card=root.querySelector('.cell-base-layer');base.card.insertAdjacentHTML('beforeend',colourMarkup);bindColour(base);controls(base,1);base.card.querySelector('.cell-layer-visible').onclick=()=>{base.visible=!base.visible;update();};
 button.disabled=false;button.onclick=()=>{const used=new Set([Number(root.querySelector('#cell-wave').value),...[...panels.values()].map(p=>p.channel)]),baseChannel=Number(root.querySelector('#cell-wave').value),start=Number.isInteger(baseChannel)?baseChannel:62;let chosen=(start+1)%metadata.wavelengths.length;while(used.has(chosen))chosen=(chosen+1)%metadata.wavelengths.length;add(chosen);};
 return {panels,base,add,sync:timeline.sync,pending:timeline.pending,clear(){timeline.clear();for(const panel of panels.values()){panel.current={};panel.status={};details(panel);}},close(){dead=true;timeline.close();for(const p of panels.values())p.controller?.abort();panels.clear();}};
}
