import {insideImageField} from './inventory-field.js';
import {cellAt} from './sky-model.js';

const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function inventoryRows(data,{scope='cell',search=''}={}){
  return data.sources.filter(s=>(scope==='field'?data.field&&insideImageField(s,data.field):scope==='margin'||cellAt(s.ra,s.dec)===data.cell)&&s.name.toLowerCase().includes(search.toLowerCase()));
}

export function mountInventory(root,getViewer,{areas,project,field,onInvestigate=()=>{},investigateLabel="Open source region ↗"}={}){
  const host=root.querySelector('#regional-inventory');
  const layers=(areas||[root.querySelector('.sky-area')]).map(area=>{const markers=document.createElement('div');markers.className='inventory-markers';area.append(markers);return{area,markers};});
  let snapshot,active=false,scope=field?'field':'cell',search='',selected=null,shown=false,disposed=false,controller,cellId=null;
  const memory=new Map(),matchesField=data=>!field||['ra','dec','size'].every(key=>data.field?.[key]===field[key]);
  const visible=()=>snapshot?inventoryRows(snapshot,{scope,search}):[];
  function detail(){
    const s=snapshot?.sources.find(s=>s.name===selected),el=host.querySelector('.inventory-detail');if(!el)return;
    el.innerHTML=s?`<div class="eyebrow">Selected catalogue source</div><strong>${escape(s.name)}</strong><p>RA ${s.ra.toFixed(6)}° · Dec ${s.dec.toFixed(6)}°</p><dl><dt>Catalogue</dt><dd>AllWISE</dd><dt>W1 / W2 magnitude</dt><dd>${s.w1??'—'} / ${s.w2??'—'}</dd><dt>Contamination flags</dt><dd>${escape(s.flags)}</dd><dt>Extension flag</dt><dd>${s.extended}</dd></dl><button type="button" class="button full-width" data-investigate-source="${escape(s.name)}">${escape(investigateLabel)}</button><a href="https://irsa.ipac.caltech.edu/cgi-bin/Gator/nph-query?catalog=allwise_p3as_psd&spatial=cone&objstr=${s.ra}%20${s.dec}&radius=3&radunits=arcsec" target="_blank" rel="noreferrer">Inspect at IRSA ↗</a>`:'Select a marker to inspect its catalogue record.';
  }
  function select(name){selected=name;renderSummary();detail();draw();}
  function renderSummary(){
    const count=host.querySelector('#inventory-count');if(count)count.textContent=`${visible().length} catalogue sources`;
  }
  function draw(){
    for(const {area,markers} of layers){
      markers.replaceChildren();if(!area.clientWidth||!area.clientHeight)continue;const viewer=getViewer?.();if(!active||!shown||!snapshot||(!project&&!viewer))continue;
      for(const source of visible()){
        let xy;try{xy=project?project(area,source.ra,source.dec):viewer.world2pix(source.ra,source.dec);}catch{continue;}
        if(!xy||!xy.every(Number.isFinite))continue;const[x,y]=xy;
        if(x<0||x>area.clientWidth||y<0||y>area.clientHeight)continue;
        const b=document.createElement('button');b.type='button';b.className='inventory-marker'+(source.name===selected?' selected':'')+(scope==='margin'&&cellAt(source.ra,source.dec)!==cellId?' margin':'');
        b.style.left=x+'px';b.style.top=y+'px';b.title=source.name;b.setAttribute('aria-label','Catalogue source '+source.name);
        b.onclick=e=>{e.stopPropagation();select(source.name);};markers.append(b);
      }
    }
  }
  async function load(id,signal,refresh){
    const spec=JSON.stringify([id,field||null]),key='/__sate_inventory__/v3/'+encodeURIComponent(spec);
    if(!refresh&&memory.has(spec)&&matchesField(memory.get(spec))&&Date.now()-Date.parse(memory.get(spec).retrieved)<86400000)return memory.get(spec);
    let cache;try{cache=await globalThis.caches?.open('sate-regional-inventory-v1');
      if(!refresh){const saved=await cache?.match(key);if(saved&&Number(saved.headers.get('x-inventory-expires'))>Date.now()){const data=await saved.json();if(matchesField(data))return data;}}
    }catch{}
    signal.throwIfAborted();const params=new URLSearchParams({cell:id});if(field)for(const key of ['ra','dec','size'])params.set(key,field[key]);if(refresh)params.set('refresh','1');const response=await fetch('/api/inventory?'+params,{signal,cache:'no-store'});const data=await response.json();
    if(!response.ok)throw Error(data.error||'Catalogue unavailable');if(!matchesField(data))throw Error('Catalogue field mismatch');signal.throwIfAborted();
    memory.set(spec,data);while(memory.size>24)memory.delete(memory.keys().next().value);
    try{if(cache){await cache.put(key,new Response(JSON.stringify(data),{headers:{'content-type':'application/json','x-inventory-expires':String(Date.now()+86400000)}}));const keys=await cache.keys();for(const old of keys.slice(0,Math.max(0,keys.length-64)))await cache.delete(old);}}catch{}
    return data;
  }
  async function update(cell,refresh=false){
    const next=cell?.order===9?cell.id:null;
    active=next!=null;host.hidden=!active;for(const {markers}of layers)markers.hidden=!active;
    if(next===cellId&&!refresh&&(snapshot||controller))return;
    controller?.abort();cellId=next;snapshot=null;selected=null;search='';for(const {markers}of layers)markers.replaceChildren();
    if(!active)return;
    const own=new AbortController();controller=own;
    host.innerHTML='<p role="status">Loading regional inventory…</p>';
    try{const data=await load(next,own.signal,refresh);if(disposed||own.signal.aborted||cellId!==next)return;snapshot=data;}
    catch(e){if(!disposed&&!own.signal.aborted&&cellId===next)host.innerHTML='<p role="alert">Catalogue unavailable.</p><button type="button" data-inventory-retry>Retry</button>';return;}
    finally{if(controller===own)controller=null;}
    host.innerHTML='<div class="inventory-heading"><span class="eyebrow">Regional inventory</span><button type="button" data-inventory-retry>Refresh</button></div><p class="inventory-intro">AllWISE · '+(field?'image field':'cell '+cellId)+'</p><div class="inventory-controls"><label><input id="inventory-toggle" type="checkbox" '+(shown?'checked':'')+'> Show catalogue markers</label><label class="inventory-filter">Region<select id="inventory-scope">'+(field?'<option value="field" '+(scope==='field'?'selected':'')+'>Full image field</option>':'')+'<option value="cell" '+(scope==='cell'?'selected':'')+'>Selected cell only</option>'+(field?'':'<option value="margin" '+(scope==='margin'?'selected':'')+'>Include surrounding area</option>')+'</select></label><input id="inventory-search" type="search" aria-label="Search inventory" placeholder="Search catalogue identifier"></div><div class="inventory-summary"><strong id="inventory-count"></strong><span>'+(snapshot.truncated?'Limited to '+snapshot.limit:'')+'</span></div><div class="inventory-detail" aria-live="polite"></div><details class="inventory-provenance"><summary>Catalogue details</summary><p>AllWISE · NASA/IPAC IRSA · '+escape(snapshot.retrieved.slice(0,10))+'</p><p>Catalogue positions; no proper-motion correction.</p><a href="https://irsa.ipac.caltech.edu/Missions/wise.html" target="_blank" rel="noreferrer">Catalogue information ↗</a></details>';
    renderSummary();detail();draw();
  }
  host.addEventListener('click',e=>{if(e.target.closest('[data-inventory-retry]')){void update({id:cellId,order:9},true);return;}const investigate=e.target.closest('[data-investigate-source]');if(investigate){const source=snapshot?.sources.find(s=>s.name===investigate.dataset.investigateSource);if(source)onInvestigate(source);return;}});
  host.addEventListener('change',e=>{if(e.target.id==='inventory-toggle')shown=e.target.checked;if(e.target.id==='inventory-scope')scope=e.target.value;renderSummary();draw();});
  host.addEventListener('input',e=>{if(e.target.id==='inventory-search'){search=e.target.value;renderSummary();draw();}});
  return{update,draw,destroy(){disposed=true;controller?.abort();for(const {markers}of layers)markers.remove();}};
}
