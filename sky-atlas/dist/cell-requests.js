export const IMAGE_CONCURRENCY=10;
export const INSPECTION_CONCURRENCY=12;
// One shared pool also covers additional wavelength layers and both panes.
export function createRequestPool(concurrency=IMAGE_CONCURRENCY){
 let active=0;const queue=[];
 function pump(){while(active<concurrency&&queue.length){
  const job=queue.shift();job.signal?.removeEventListener('abort',job.cancel);
  if(job.signal?.aborted){job.reject(job.signal.reason);continue;}
  active++;
  Promise.resolve().then(()=>{job.signal?.throwIfAborted();return job.task();}).then(job.resolve,job.reject).finally(()=>{active--;pump();});
 }}
 return {run(task,signal){return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(signal.reason);return;}
  const job={task,signal,resolve,reject};job.cancel=()=>{const index=queue.indexOf(job);if(index>=0){queue.splice(index,1);reject(signal.reason);}};
  signal?.addEventListener('abort',job.cancel,{once:true});queue.push(job);pump();
 });}};
}
export async function forEachConcurrent(items,task,{concurrency=INSPECTION_CONCURRENCY,signal}={}){
 let index=0;
 await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
  while(!signal?.aborted&&index<items.length){const item=items[index++];await task(item);}
 }));
}

// Inspect ahead in parallel, then dispatch image work oldest-first. Responses may
// complete out of order; each completion is published immediately to the UI.
export async function forEachChronological(items,inspect,consume,{concurrency=IMAGE_CONCURRENCY,lookahead=INSPECTION_CONCURRENCY,signal}={}){
 const ordered=[...items].sort((a,b)=>a.mjd-b.mjd||a.path.localeCompare(b.path));
 const prepared=new Map(),running=new Set(),errors=[];let next=0;
 const fill=()=>{while(!signal?.aborted&&next<ordered.length&&prepared.size<lookahead){const i=next++,item=ordered[i];prepared.set(i,Promise.resolve().then(()=>{signal?.throwIfAborted();return inspect(item);}).then(value=>({value}),error=>({error})));}};
 fill();
 for(let i=0;i<ordered.length&&!signal?.aborted;i++){
  const result=await prepared.get(i);prepared.delete(i);fill();if(signal?.aborted)break;
  let work;work=Promise.resolve().then(()=>consume(ordered[i],result)).catch(error=>errors.push(error)).finally(()=>running.delete(work));running.add(work);
  if(running.size>=concurrency)await Promise.race(running);
 }
 await Promise.all(running);if(errors.length)throw errors[0];
}
