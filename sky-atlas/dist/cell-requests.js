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
