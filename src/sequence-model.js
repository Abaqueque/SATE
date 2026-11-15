// Visit both ends early, then fill the entire sequence; never silently cap it.
export function spreadOrder(rows) {
  const result=[];
  for(let left=0,right=rows.length-1;left<=right;left++,right--){result.push(rows[left]);if(left!==right)result.push(rows[right]);}
  return result;
}

// Select by time, never by download completion. Sparse visits keep empty slots.
export function nearbyObservations(jobs,index,hours=24,limit=9){
  const anchor=jobs[index];if(!anchor)return [];
  const centre=anchor.obs.mjd,half=hours/48;
  if(!Number.isFinite(centre)||!Number.isFinite(hours)||hours<=0)return [];
  const seen=new Set();
  return jobs.map((job,index)=>({job,index}))
    .filter(({job})=>Number.isFinite(job.obs.mjd)&&Math.abs(job.obs.mjd-centre)<=half)
    .sort((a,b)=>Math.abs(a.job.obs.mjd-centre)-Math.abs(b.job.obs.mjd-centre)||(a.index===index?-1:b.index===index?1:a.index-b.index))
    .filter(({job})=>{const key=job.obs.id&&job.obs.band?job.obs.id+'|'+job.obs.band:job.obs.path;if(seen.has(key))return false;seen.add(key);return true;})
    .slice(0,limit).sort((a,b)=>a.job.obs.mjd-b.job.obs.mjd||a.index-b.index);
}

