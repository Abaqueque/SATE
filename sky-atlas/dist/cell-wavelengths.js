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

export function mountWavelengthViews({root,metadata,position,loadFrame,draw,transform,bindStage,anchor,onChange}){
 const panels=new Map(),button=root.querySelector('#cell-add-wavelength'),container=root.querySelector('.cell-viewers'),layerList=root.querySelector('#cell-layer-list');
 let nextId=0,dead=false;
 const options=metadata.wavelengths.map((w,i)=>`<option value="${i}">${w.toFixed(3)} µm</option>`).join('');
 const update=()=>{
  let number=2;
  for(const panel of panels.values()){
   const name=`Layer ${number++}`;
   panel.card.setAttribute('aria-label',name);panel.card.querySelector('h2').textContent=name;
   panel.card.querySelector('select').setAttribute('aria-label',`${name} wavelength`);
   panel.card.querySelector('button').setAttribute('aria-label',`Remove ${name.toLowerCase()}`);
   panel.el.setAttribute('aria-label',`${name} image`);panel.canvas.setAttribute('aria-label',`${name} SPHEREx exposure`);
   panel.el.querySelector('.cell-layer-name').textContent=name;
   panel.el.querySelector('.cell-layer-band').textContent=metadata.wavelengths[panel.channel].toFixed(3)+' µm';
   panel.el.querySelector('.cell-remove-wavelength').setAttribute('aria-label',`Remove ${name.toLowerCase()} image`);
  }
  container.classList.toggle('has-wavelengths',panels.size>0);button.disabled=panels.size>=4;root.querySelector('#cell-wavelength-limit').hidden=panels.size<4;onChange([...panels.values()].map(p=>p.channel));transform();
 };
 const message=(panel,title,busy=false)=>{panel.message.hidden=false;panel.message.querySelector('strong').textContent=title;panel.message.querySelector('p').textContent='';panel.message.querySelector('.cell-spinner').hidden=!busy;};
 async function load(panel){
  panel.controller?.abort();const controller=new AbortController();panel.controller=controller;const {signal}=controller;
  panel.current=null;panel.canvas.hidden=true;panel.el.querySelector('.cell-compass').hidden=true;panel.el.querySelector('.cell-image-caption').textContent='';panel.el.querySelector('time').textContent='';panel.el.querySelector('.cell-retry').hidden=true;
  const params=wavelengthParameters(position,metadata.wavelengths,panel.channel),target=anchor();
  message(panel,'Finding this wavelength…',true);
  const read=async url=>{const r=await fetch(url,{signal}),data=await r.json();if(!r.ok)throw Error(data.error||'Archive unavailable.');return data;};
  try{
   const data=await read('/api/observations?'+params);
   const {obs,failures}=await findWavelengthObservation({observations:data.observations,wavelengths:metadata.wavelengths,channel:panel.channel,anchorMjd:target?.mjd,signal,inspect:o=>{const query=new URLSearchParams(params);query.set('image',o.path);return read('/api/frame-info?'+query);}});
   if(dead||signal.aborted)return;
   if(!obs){message(panel,failures?'Some observations are unavailable':'No observations at this wavelength');panel.message.querySelector('p').textContent=failures?'Retry or choose another wavelength.':'Choose another wavelength for this cell.';panel.el.querySelector('.cell-retry').hidden=!failures;return;}
   message(panel,'Loading wavelength image…',true);
   const frame=await loadFrame(obs,signal,params,panel.channel);if(dead||signal.aborted)return;
   panel.current={...frame,individual:frame,obs};draw(panel);transform();
   panel.el.querySelector('time').textContent=new Date(obs.date).toLocaleString('en-AU',{timeZone:'UTC'})+' UTC';
   panel.el.querySelector('.cell-image-caption').textContent=`${obs.wavelength.toFixed(3)} µm · ${failures?'Some dates unavailable':target?'Closest to '+new Date(target.date).toLocaleDateString('en-AU',{timeZone:'UTC'}):'Earliest available observation'}`;
  }catch(error){if(dead||signal.aborted)return;message(panel,'Could not load wavelength');panel.message.querySelector('p').textContent=error.message;panel.el.querySelector('.cell-retry').hidden=false;}
 }
 function add(channel,{focus=true}={}){
  if(dead||panels.size>=4)return;
  const id=++nextId,el=document.createElement('section');el.className='cell-pane cell-wavelength-pane';el.setAttribute('aria-label',`Additional wavelength ${id}`);
  el.innerHTML=`<div class="cell-wavelength-heading"><strong class="cell-layer-name"></strong><span class="cell-layer-band"></span><button class="cell-remove-wavelength">×</button><time></time></div><div class="cell-stage"><canvas hidden></canvas><div class="cell-image-message" role="status"><span class="cell-spinner"></span><strong></strong><p></p><button class="cell-retry" hidden>Retry</button></div><div class="cell-compass" hidden>N ↑<br>E ←</div><div class="cell-image-caption"></div></div>`;
  const card=document.createElement('section');card.className='cell-layer-card';card.innerHTML=`<div class="cell-layer-title"><h2></h2><button type="button" class="cell-layer-remove">×</button></div><label class="cell-field">Wavelength<select>${options}</select></label>`;
  const panel={side:`wave-${id}`,channel,el,card,canvas:el.querySelector('canvas'),message:el.querySelector('.cell-image-message'),current:null,combined:false};
  panels.set(id,panel);container.append(el);layerList.append(card);const select=card.querySelector('select');select.value=String(channel);
  select.onchange=()=>{panel.channel=Number(select.value);update();void load(panel);};
  const remove=()=>{panel.controller?.abort();panels.delete(id);el.remove();card.remove();update();button.focus();};
  el.querySelector('.cell-remove-wavelength').onclick=remove;card.querySelector('button').onclick=remove;
  el.querySelector('.cell-retry').onclick=()=>void load(panel);bindStage(panel);update();void load(panel);if(focus){select.focus();card.scrollIntoView({block:'nearest'});}
 }
 button.disabled=false;button.onclick=()=>{const used=new Set([Number(root.querySelector('#cell-wave').value),...[...panels.values()].map(p=>p.channel)]),base=Number(root.querySelector('#cell-wave').value),start=Number.isInteger(base)?base:62;let chosen=(start+1)%metadata.wavelengths.length;while(used.has(chosen))chosen=(chosen+1)%metadata.wavelengths.length;add(chosen);};
 return {panels,add,close(){dead=true;for(const p of panels.values())p.controller?.abort();panels.clear();}};
}
