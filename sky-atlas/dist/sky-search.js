// Suggestions are names only. The existing CDS resolver supplies every position.
const COMMON=[
 ['Sirius'],['Canopus'],['Arcturus'],['Vega'],['Capella'],['Rigel'],['Betelgeuse'],['Procyon'],['Achernar'],['Altair'],['Aldebaran'],['Antares'],['Spica'],['Pollux'],['Fomalhaut'],['Deneb'],['Regulus'],['Polaris'],['Alpha Centauri'],['Proxima Centauri'],["Barnard's Star",'Barnard'],['WISE 0855','WISE J085510.83-071442.5'],['Luhman 16','WISE J104915.57-531906.1'],['M31','Andromeda Galaxy'],['M33','Triangulum Galaxy'],['M42','Orion Nebula'],['M45','Pleiades'],['M51','Whirlpool Galaxy'],['M81','Bode Galaxy'],['M82','Cigar Galaxy'],['M87','Virgo A'],['M104','Sombrero Galaxy'],['NGC 5128','Centaurus A'],['NGC 3372','Carina Nebula'],['47 Tucanae','NGC 104'],['Omega Centauri','NGC 5139'],['Sagittarius A*']
];
const KEY='sate-object-searches-v1';
const normalize=value=>String(value).toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z0-9]/g,'');
const valid=value=>typeof value==='string'&&value.trim().length>0&&value.length<=120&&!/[\x00-\x1f\x7f]/.test(value);
export function recentSearches(storage){try{const list=JSON.parse(storage?.getItem(KEY)||'[]');return Array.isArray(list)?list.filter(valid).slice(0,8):[];}catch{return [];}}
export function rememberSearch(storage,value){if(!valid(value))return;const list=[value.trim(),...recentSearches(storage).filter(s=>normalize(s)!==normalize(value))].slice(0,8);try{storage?.setItem(KEY,JSON.stringify(list));}catch{}}
export function searchSuggestions(value,recent=[]){
 const needle=normalize(value),rows=[...recent.filter(valid).map(name=>({name,label:name,recent:true,aliases:[]})),...COMMON.map(([name,...aliases])=>({name,label:aliases.length&&/^M\d|^NGC/.test(name)?name+' · '+aliases[0]:name,aliases})),...Array.from({length:110},(_,i)=>({name:'M'+(i+1),label:'M'+(i+1),aliases:[]}))];
 const seen=new Set();return rows.map((r,index)=>({...r,index,score:!needle?(r.recent?0:1):[r.name,...r.aliases].reduce((n,s)=>Math.min(n,normalize(s)===needle?0:normalize(s).startsWith(needle)?1:normalize(s).includes(needle)?2:3),3)})).filter(r=>{const key=normalize(r.name);if(r.score===3||seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>a.score-b.score||a.index-b.index).slice(0,8);
}
export function mountSearchSuggestions(form){
 const input=form.querySelector('#sky-object-query'),list=form.querySelector('#sky-object-suggestions');let storage;try{storage=localStorage;}catch{}
 const events=new AbortController(),options={signal:events.signal};let rows=[],active=-1,composing=false;
 function close(){list.hidden=true;active=-1;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
 function highlight(index){active=index;[...list.children].forEach((el,i)=>el.setAttribute('aria-selected',String(i===active)));if(active>=0){input.setAttribute('aria-activedescendant',list.children[active].id);list.children[active].scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
 function render(){if(composing||input.disabled)return;rows=searchSuggestions(input.value,recentSearches(storage));list.replaceChildren();active=-1;input.removeAttribute('aria-activedescendant');for(const [i,row] of rows.entries()){const option=document.createElement('div');option.id='sky-suggestion-'+i;option.role='option';option.dataset.suggestion=i;option.setAttribute('aria-selected','false');option.textContent=row.label;list.append(option);}list.hidden=!rows.length;input.setAttribute('aria-expanded',String(!!rows.length));}
 function choose(index){const row=rows[index];if(!row)return;input.value=row.name;close();form.requestSubmit();}
 input.addEventListener('focus',render,options);input.addEventListener('input',render,options);
 input.addEventListener('compositionstart',()=>{composing=true;close();},options);input.addEventListener('compositionend',()=>{composing=false;render();},options);
 input.addEventListener('keydown',event=>{if(composing||event.isComposing)return;if(event.key==='Escape'){event.preventDefault();close();}else if(event.key==='Tab'){close();}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(list.hidden)render();if(rows.length)highlight(active<0?(event.key==='ArrowDown'?0:rows.length-1):(active+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length);}else if(event.key==='Enter'&&!list.hidden&&active>=0){event.preventDefault();choose(active);}},options);
 list.addEventListener('pointerdown',e=>e.preventDefault(),options);list.addEventListener('click',e=>{const row=e.target.closest('[data-suggestion]');if(row)choose(Number(row.dataset.suggestion));},options);
 form.addEventListener('focusout',e=>{if(!form.contains(e.relatedTarget))close();},options);
 return {close,remember(value){rememberSearch(storage,value);},destroy(){events.abort();close();}};
}
