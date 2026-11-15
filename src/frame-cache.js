// Aligned science pixels are reusable across wavelength searches of the same patch.
const memory=new Map();
let database;
function openDatabase(){
  if(!database)database=new Promise(resolve=>{
    if(!globalThis.indexedDB){resolve(null);return;}
    const request=indexedDB.open('sate-image-cache',1);
    request.onupgradeneeded=()=>{const store=request.result.createObjectStore('frames',{keyPath:'key'});store.createIndex('savedAt','savedAt');};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);request.onblocked=()=>resolve(null);
  });return database;
}
export function frameCacheKey(region,path){return JSON.stringify([region.mosaic?'mosaic-planes-v3':'stack-planes-v2',region.ra,region.dec,region.size,path]);}
export async function cachedFrame(key){
  if(memory.has(key))return memory.get(key);
  const db=await openDatabase();if(!db)return null;
  return new Promise(resolve=>{const tx=db.transaction('frames','readonly'),request=tx.objectStore('frames').get(key);request.onsuccess=()=>resolve(request.result?.frame??null);request.onerror=()=>resolve(null);});
}
export async function cacheFrame(key,frame){
  memory.set(key,frame);if(memory.size>100)memory.delete(memory.keys().next().value);
  const db=await openDatabase();if(!db)return;
  await new Promise(resolve=>{const tx=db.transaction('frames','readwrite'),store=tx.objectStore('frames');store.put({key,frame,savedAt:Date.now()});
    const count=store.count();count.onsuccess=()=>{let excess=count.result-500;if(excess<=0)return;const cursor=store.index('savedAt').openCursor();cursor.onsuccess=()=>{if(cursor.result&&excess-->0){cursor.result.delete();cursor.result.continue();}};};
    tx.oncomplete=resolve;tx.onerror=resolve;tx.onabort=resolve;
  });
}
