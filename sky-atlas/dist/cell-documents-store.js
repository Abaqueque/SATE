export const REVIEW_STATUSES={unreviewed:'Not reviewed',investigating:'Investigating',known:'Known object',candidate:'Possible new object — unconfirmed',artifact:'Likely imaging artifact'};
export const CHECKS={catalogues:'Checked known-source catalogues',epochs:'Compared independent observations',artifacts:'Checked masks and imaging artifacts'};
export function cellKey(id,order=9){if(!Number.isInteger(order)||order<0||order>9||!Number.isInteger(id)||id<0||id>=12*4**order)throw Error('Invalid cell.');return order+':'+id;}
export function candidatePosition(value){
 const number=v=>v===null||v===undefined||String(v).trim()===''?NaN:Number(v),ra=number(value.ra),dec=number(value.dec),radius=number(value.radius);
 if(!Number.isFinite(ra)||ra<0||ra>=360||!Number.isFinite(dec)||dec< -90||dec>90||!Number.isFinite(radius)||radius<1||radius>3600)throw Error('Use RA 0–360°, Dec −90–90°, and a search radius of 1–3600 arcseconds.');
 return {ra,dec,radius};
}
export function catalogueLinks(position){
 const p=candidatePosition(position),coord=p.ra.toFixed(7)+' '+(p.dec>=0?'+':'')+p.dec.toFixed(7);
 return {simbad:'https://simbad.cds.unistra.fr/simbad/sim-coo?'+new URLSearchParams({Coord:coord,Radius:p.radius,'Radius.unit':'arcsec',CooFrame:'ICRS'}),vizier:'https://vizier.cds.unistra.fr/viz-bin/VizieR?'+new URLSearchParams({'-c':coord,'-c.rs':p.radius,'-c.eq':'J2000'})};
}
export function fitsLink(path,position,width=.2){
 try{const url=new URL(path,'https://irsa.ipac.caltech.edu');if(url.origin!=='https://irsa.ipac.caltech.edu'||!url.pathname.startsWith('/ibe/data/spherex/'))return null;url.searchParams.set('center',position.ra+','+position.dec);url.searchParams.set('size',String(Number((width*1.5).toPrecision(12))));url.searchParams.set('gzip','false');return url.href;}catch{return null;}
}
export function displaySettings(value={}){
 if(!value||typeof value!=='object')value={};
 const n=(key,fallback,min,max)=>Number.isFinite(value[key])?Math.max(min,Math.min(max,value[key])):fallback,b=(key,fallback)=>typeof value[key]==='boolean'?value[key]:fallback;
 return {original:b('original',false),quality:b('quality',false),background:b('background',true),noise:Math.round(n('noise',2,0,2)),interpolate:b('interpolate',true),repair:b('repair',false),contrast:n('contrast',1,.4,2.5),zoom:n('zoom',1,1,12),pan:{x:Number.isFinite(value.pan?.x)?value.pan.x:0,y:Number.isFinite(value.pan?.y)?value.pan.y:0},combined:{left:value.combined?.left===true,right:value.combined?.right===true}};
}
export function appendSnapshot(existing,snapshot){
 const key=cellKey(snapshot.cellId,snapshot.order),position=candidatePosition({...snapshot.position,radius:600});
 if(!snapshot.id||!Number.isFinite(Date.parse(snapshot.savedAt))||!snapshot.viewerUrl?.startsWith('/explore/?')||new URL(snapshot.viewerUrl,'https://sate.invalid').origin!=='https://sate.invalid')throw Error('Invalid observation record.');
 if(existing&&existing.key!==key)throw Error('Cell mismatch.');
 const record=existing||{key,cellId:snapshot.cellId,order:snapshot.order,ra:position.ra,dec:position.dec,title:'Cell '+snapshot.cellId,status:'unreviewed',notes:'',reference:'',candidate:position,checks:{},createdAt:snapshot.savedAt,snapshots:[]};
 if(record.snapshots.some(s=>s.id===snapshot.id))return record;
 return {...record,updatedAt:snapshot.savedAt,snapshots:[snapshot,...record.snapshots]};
}
export function applyReview(record,patch,now=new Date().toISOString()){
 if(!record)throw Error('Saved cell not found.');
 if(!Object.hasOwn(REVIEW_STATUSES,patch.status))throw Error('Choose a review status.');
 const title=String(patch.title||'').trim();if(!title||title.length>160)throw Error('Enter a title of up to 160 characters.');
 const notes=String(patch.notes||''),reference=String(patch.reference||'');if(notes.length>20000||reference.length>5000)throw Error('Notes or references are too long.');
 return {...record,title,status:patch.status,notes,reference,candidate:candidatePosition(patch.candidate),checks:Object.fromEntries(Object.keys(CHECKS).map(key=>[key,patch.checks?.[key]===true])),updatedAt:now};
}
let database;
function open(){
 if(database)return database;
 database=new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(Error('Browser storage is unavailable. Enable site storage to save cells.'));return;}
  const request=indexedDB.open('sate-cell-documents',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('cells',{keyPath:'key'});
  request.onerror=()=>reject(Error('Could not open saved cells. Check browser storage permissions.'));
  request.onblocked=()=>reject(Error('Close other SATE tabs and try again.'));
  request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();database=null;};resolve(request.result);};
 }).catch(error=>{database=null;throw error;});return database;
}
async function transaction(mode,work){
 const db=await open();return new Promise((resolve,reject)=>{
  const tx=db.transaction('cells',mode),store=tx.objectStore('cells');let result,failure;
  tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(failure||Error('Could not save or read cells. Browser storage may be full or unavailable.'));
  const done=value=>{result=value;},fail=error=>{failure=error;tx.abort();};
  try{work(store,done,fail);}catch(error){fail(error);}
 });
}
export const listDocuments=()=>transaction('readonly',(store,done)=>{const r=store.getAll();r.onsuccess=()=>done(r.result.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));});
export const getDocument=key=>transaction('readonly',(store,done)=>{const r=store.get(key);r.onsuccess=()=>done(r.result);});
export const saveSnapshot=snapshot=>transaction('readwrite',(store,done,fail)=>{const r=store.get(cellKey(snapshot.cellId,snapshot.order));r.onsuccess=()=>{try{const record=appendSnapshot(r.result,snapshot);store.put(record);done(record);}catch(error){fail(error);}};});
export const saveReview=(key,patch)=>transaction('readwrite',(store,done,fail)=>{const r=store.get(key);r.onsuccess=()=>{try{const record=applyReview(r.result,patch);store.put(record);done(record);}catch(error){fail(error);}};});
