import {positionAt} from './known-positions.js';
import {insideImageField} from './inventory-field.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountKnownObjects(root,{panes,field,project,visibleSides,isComparing,isLayered=()=>false}){
 const toggle=root.querySelector('#cell-known'),box=root.querySelector('#known-objects-info'),summary=root.querySelector('#known-objects-status'),detail=root.querySelector('#known-object-detail');
 const states=new Map(),cache=new Map();let enabled=false,dead=false,catalogue,catError='',catController,selected;
 for(const [side,panel] of Object.entries(panes)){const layer=document.createElement('div');layer.className='known-markers';panel.el.querySelector('.cell-stage').append(layer);states.set(side,{layer,key:null,data:null,error:'',timer:null,controller:null});}
 const params=kind=>new URLSearchParams({kind,...field});
 async function read(query,signal){const r=await fetch('/api/known-objects?'+query,{signal});const data=await r.json();if(!r.ok)throw Error(data.error||'Known objects unavailable');return data;}
 async function loadCatalogue(){catController?.abort();const controller=catController=new AbortController();catError='';try{const result=await read(params('catalogue'),controller.signal);if(dead||controller.signal.aborted)return;catalogue=result;}catch(e){if(controller.signal.aborted)return;catError=e.message;}draw();}
 function choose(source,side,date){selected={...source,side,date};renderDetail();draw();}
 function renderDetail(){if(!selected){detail.textContent='Select a marker for its name and source.';return;}const s=selected,solar=s.kind==='solar',url=solar?'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr='+encodeURIComponent(s.name):'https://simbad.cds.unistra.fr/simbad/sim-id?Ident='+encodeURIComponent(s.name);detail.innerHTML=`<strong>${escape(s.name)}</strong><span>${escape(s.type||'Catalogue object')} · ${s.side==='left'?'L':'R'}</span><span>RA ${s.ra.toFixed(6)}° · Dec ${s.dec.toFixed(6)}°</span><span>${solar?'Predicted at exposure midpoint · Earth centre':s.propagated?'Proper-motion estimate · no parallax':'Catalogue position · motion unavailable'}</span>${s.date?`<time>${escape(s.date)} UTC</time>`:''}<a href="${escape(url)}" target="_blank" rel="noreferrer">${solar?'JPL object record':'SIMBAD record'} ↗</a>`;}
 function sync(){
  for(const [side,state]of states){const panel=panes[side],obs=enabled&&!isComparing()&&!panel.combined&&!isLayered(side)&&visibleSides().includes(side)&&!panel.loading&&panel.current?.obs,path=obs?.path||null;
   if(path===state.key)continue;clearTimeout(state.timer);state.controller?.abort();state.controller=null;state.key=path;state.data=path?cache.get(path):null;state.error='';if(selected?.side===side){selected=null;renderDetail();}
   if(!path||state.data)continue;
   state.timer=setTimeout(async()=>{state.timer=null;const controller=state.controller=new AbortController(),query=params('solar');query.set('image',path);
    try{const data=await read(query,controller.signal);if(dead||controller.signal.aborted||state.key!==path)return;state.data=data;cache.set(path,data);while(cache.size>40)cache.delete(cache.keys().next().value);}catch(e){if(controller.signal.aborted)return;state.error=e.message;}finally{if(state.controller===controller)state.controller=null;}draw();
   },650);
  }
 }
 function draw(){
  if(dead)return;sync();const messages=[];
  for(const [side,state]of states){state.layer.replaceChildren();state.layer.hidden=!enabled;const panel=panes[side],obs=panel.current?.obs;
   if(!enabled||!visibleSides().includes(side)||!obs||panel.loading||panel.canvas.hidden||!panel.displayState?.visible||!panel.message.hidden)continue;
   // A composite has more than one observing time; avoid assigning one prediction to it.
   if(isComparing()||panel.combined||isLayered(side)){messages.push(`${side==='left'?'L':'R'}: use one dated layer for positions`);continue;}
   const mjd=state.data?.mjd??obs.mjd,date=state.data?.date||obs.date;
   const sources=[...(catalogue?.sources||[]).map(s=>positionAt(s,mjd)).filter(s=>insideImageField(s,field)),...(state.data?.sources||[])];let count=0;
   for(const source of sources){const xy=project(panel,source.ra,source.dec);if(!xy||!xy.every(Number.isFinite))continue;const [x,y]=xy,area=panel.el.querySelector('.cell-stage');if(x<0||y<0||x>area.clientWidth||y>area.clientHeight)continue;count++;
    const marker=document.createElement('button');marker.type='button';marker.className='known-marker '+source.kind+(selected?.name===source.name&&selected?.side===side?' selected':'');marker.style.left=x+'px';marker.style.top=y+'px';marker.setAttribute('aria-label',source.name+' · '+(source.kind==='solar'?'predicted asteroid or comet':'catalogue source'));marker.title=source.name;marker.innerHTML='<span>'+escape(source.name)+'</span>';marker.onclick=e=>{e.stopPropagation();choose(source,side,date);};state.layer.append(marker);
   }
   messages.push(`${side==='left'?'L':'R'}: ${count} shown${state.error?' · '+state.error:!state.data?' · predicting asteroids / comets…':''}`);
  }
  if(enabled)summary.textContent=[catError||(!catalogue?'Loading SIMBAD…':catalogue.truncated?'SIMBAD result limit reached · partial list':''),...messages].filter(Boolean).join('\n')||'Choose an exposure.';
 }
 toggle.onchange=()=>{enabled=toggle.checked;box.hidden=!enabled;if(enabled&&!catalogue)void loadCatalogue();if(!enabled)catController?.abort();draw();};
 root.querySelector('#known-objects-retry').onclick=()=>{if(!enabled)return;catalogue=null;void loadCatalogue();cache.clear();for(const state of states.values()){state.key=null;state.controller?.abort();}draw();};
 renderDetail();return {draw,destroy(){dead=true;catController?.abort();for(const s of states.values()){clearTimeout(s.timer);s.controller?.abort();s.layer.remove();}}};
}
