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

export function mountWavelengthViews({root,metadata,position,loadFrame,redraw,anchor,onChange}){
 const panels=new Map(),button=root.querySelector('#cell-add-wavelength'),layerList=root.querySelector('#cell-layer-list');
 let nextId=0,dead=false;
 const saved=new URLSearchParams(location.search),hidden=(saved.get('hiddenLayers')||'').split(','),opacities=(saved.get('layerOpacity')||'').split(',');
 const base={visible:!hidden.includes('1'),opacity:1};
 const options=metadata.wavelengths.map((w,i)=>`<option value="${i}">${w.toFixed(3)} µm</option>`).join('');
 function controls(layer,number){
  const toggle=layer.card.querySelector('.cell-layer-visible');toggle.textContent=layer.visible?'Visible':'Hidden';toggle.setAttribute('aria-pressed',String(layer.visible));toggle.setAttribute('aria-label',`Layer ${number} visibility`);
  layer.card.classList.toggle('layer-hidden',!layer.visible);
  const opacity=layer.card.querySelector('[type=range]');if(opacity){opacity.setAttribute('aria-label',`Layer ${number} opacity`);layer.card.querySelector('output').textContent=Math.round(layer.opacity*100)+'%';}
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
  if(panels.size)u.searchParams.set('layerOpacity',[...panels.values()].map(p=>Math.round(p.opacity*100)).join(','));else u.searchParams.delete('layerOpacity');history.replaceState({},'',u.pathname+u.search);
  redraw();
 }
 const message=(panel,text)=>{panel.card.querySelector('.cell-layer-status').textContent=text;};
 async function load(panel){
  panel.controller?.abort();const controller=new AbortController();panel.controller=controller;const {signal}=controller;
  panel.current=null;panel.card.querySelector('time').textContent='';panel.card.querySelector('.cell-layer-source').textContent='';panel.card.querySelector('.cell-retry').hidden=true;redraw();
  const params=wavelengthParameters(position,metadata.wavelengths,panel.channel),target=anchor();message(panel,'Finding this wavelength…');
  const read=async url=>{const r=await fetch(url,{signal}),data=await r.json();if(!r.ok)throw Error(data.error||'Archive unavailable.');return data;};
  try{
   const data=await read('/api/observations?'+params);
   const {obs,failures}=await findWavelengthObservation({observations:data.observations,wavelengths:metadata.wavelengths,channel:panel.channel,anchorMjd:target?.mjd,signal,inspect:o=>{const query=new URLSearchParams(params);query.set('image',o.path);return read('/api/frame-info?'+query);}});
   if(dead||signal.aborted)return;
   if(!obs){message(panel,failures?'Some observations unavailable. Retry or choose another wavelength.':'No observations at this wavelength. Choose another band.');panel.card.querySelector('.cell-retry').hidden=!failures;return;}
   message(panel,'Loading image…');const frame=await loadFrame(obs,signal,params,panel.channel);if(dead||signal.aborted)return;
   panel.current={...frame,individual:frame,obs};message(panel,failures?'Some dates unavailable':'');
   panel.card.querySelector('time').textContent=new Date(obs.date).toLocaleString('en-AU',{timeZone:'UTC'})+' UTC';
   panel.card.querySelector('.cell-layer-source').textContent=`${obs.wavelength.toFixed(3)} µm · ${target?'Closest to '+new Date(target.date).toLocaleDateString('en-AU',{timeZone:'UTC'}):'Earliest available observation'}`;redraw();
  }catch(error){if(dead||signal.aborted)return;message(panel,'Could not load: '+error.message);panel.card.querySelector('.cell-retry').hidden=false;}
 }
 function add(channel,{focus=true}={}){
  if(dead||panels.size>=4)return;
  const id=++nextId,index=panels.size,card=document.createElement('section');card.className='cell-layer-card';
  card.innerHTML=`<div class="cell-layer-title"><h2></h2><button type="button" class="cell-layer-visible" aria-pressed="true">Visible</button><button type="button" class="cell-layer-remove">×</button></div><label class="cell-field">Wavelength<select>${options}</select></label><label class="cell-field cell-layer-opacity"><span>Opacity <output>100%</output></span><input type="range" min="0" max="100" step="1" value="100"></label><time></time><p class="cell-layer-source"></p><p class="cell-layer-status" role="status"></p><button type="button" class="cell-retry" hidden>Retry</button>`;
  const restoredOpacity=Number(opacities[index]),panel={channel,card,current:null,visible:focus||!hidden.includes(String(index+2)),opacity:!focus&&opacities[index]?.trim()&&Number.isFinite(restoredOpacity)?Math.max(0,Math.min(100,restoredOpacity))/100:1};
  panels.set(id,panel);layerList.append(card);const select=card.querySelector('select');select.value=String(channel);card.querySelector('[type=range]').value=panel.opacity*100;
  select.onchange=()=>{panel.channel=Number(select.value);void load(panel);update();};
  card.querySelector('.cell-layer-visible').onclick=()=>{panel.visible=!panel.visible;update();};
  card.querySelector('[type=range]').oninput=e=>{panel.opacity=Number(e.target.value)/100;update();};
  card.querySelector('.cell-layer-remove').onclick=()=>{panel.controller?.abort();panels.delete(id);card.remove();update();button.focus();};
  card.querySelector('.cell-retry').onclick=()=>void load(panel);update();void load(panel);if(focus){select.focus();card.scrollIntoView({block:'nearest'});}
 }
 base.card=root.querySelector('.cell-base-layer');controls(base,1);base.card.querySelector('.cell-layer-visible').onclick=()=>{base.visible=!base.visible;update();};
 button.disabled=false;button.onclick=()=>{const used=new Set([Number(root.querySelector('#cell-wave').value),...[...panels.values()].map(p=>p.channel)]),baseChannel=Number(root.querySelector('#cell-wave').value),start=Number.isInteger(baseChannel)?baseChannel:62;let chosen=(start+1)%metadata.wavelengths.length;while(used.has(chosen))chosen=(chosen+1)%metadata.wavelengths.length;add(chosen);};
 return {panels,base,add,close(){dead=true;for(const p of panels.values())p.controller?.abort();panels.clear();}};
}
