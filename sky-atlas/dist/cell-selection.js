export function channelRange(wavelengths,index){
 const centre=wavelengths[index];
 return {centre,low:index? (wavelengths[index-1]+centre)/2:.75,high:index<wavelengths.length-1?(centre+wavelengths[index+1])/2:5};
}
export function selectionRanges(wavelengths,mode,channel,mix=[]){return mode==='all'?[]:(mode==='mix'?mix:[channel]).map(i=>channelRange(wavelengths,i));}
export function inRanges(wavelength,ranges){return Number.isFinite(wavelength)&&(!ranges.length||ranges.some(r=>wavelength>=r.low&&wavelength<r.high));}
export function uniqueExposures(observations){const seen=new Set();return [...observations].sort((a,b)=>a.mjd-b.mjd||a.path.localeCompare(b.path)).filter(o=>{const key=o.id+'|'+o.band;if(seen.has(key))return false;seen.add(key);return true;});}
export function matchingExposures(items){return items.filter(o=>o.match&&!o.unusable).sort((a,b)=>a.mjd-b.mjd||a.path.localeCompare(b.path));}
export function stackCandidates(rows,anchor){return rows.filter(o=>o.path!==anchor.path&&o.band===anchor.band&&Math.abs(o.mjd-anchor.mjd)<=3/24&&Math.abs(o.wavelength-anchor.wavelength)<=anchor.wavelength*.005).sort((a,b)=>Math.abs(a.mjd-anchor.mjd)-Math.abs(b.mjd-anchor.mjd));}

export function timelineLayout(observations){
 const list=[...observations].sort((a,b)=>a.mjd-b.mjd),start=list[0]?.mjd,end=list.at(-1)?.mjd,span=end-start;
 const sameDay=!!list.length&&list[0].date.slice(0,10)===list.at(-1).date.slice(0,10);
 const points=list.map(obs=>({obs,position:span>0?(obs.mjd-start)/span:.5}));
 const positions=span>0?[0,1/3,2/3,1]:list.length?[.5]:[];
 const labels=positions.map(position=>({position,date:new Date(Math.round(((span>0?start+span*position:start)-40587)*86400)*1000).toISOString()}));
 return {points,labels,sameDay};
}
