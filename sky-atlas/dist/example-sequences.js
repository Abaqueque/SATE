import {uniqueExposures} from './cell-selection.js';
export function exampleSequenceUrl(params){
 const id=params.get('example'),target=params.get('target');
 if(/^[0-7]$/.test(id||''))return '/assets/example-sequences/region-'+id+'.json';
 if(['barnard','kapteyn','groombridge'].includes(target))return '/assets/example-sequences/'+(target==='barnard'?'region-0':target)+'.json';
 return null;
}
export function compatibleExampleSequence(data,region,preferred={}){
 const p=data?.region;
 if(!p||!Array.isArray(data.observations)||!data.observations.length||region.mode!=='single'||p.channel!==region.channel||p.nearby!==region.nearby||['ra','dec','size'].some(k=>!Number.isFinite(p[k])||Math.abs(p[k]-region[k])>1e-8))return false;
 // A saved date must not be silently replaced by a different starting example.
 return Object.values(preferred).filter(Boolean).every(id=>data.observations.some(obs=>obs.id===id));
}
export function mergeExposureLists(existing,incoming){
 // Keep validated state and the selected file when the archive lists the same
 // exposure again (including another reduction or a rounded timestamp).
 const seen=new Set(existing.map(o=>o.id+'|'+o.band));
 return uniqueExposures([...existing,...incoming.filter(obs=>{const key=obs.id+'|'+obs.band;if(seen.has(key))return false;seen.add(key);return true;})]);
}
