// Real, user-selected sky regions; only the connector's execution is simulated.
import {center} from './sky-model.js';
export const QUEUE_KEY='sate-ai-region-queue-v1';
export const DEMO_ASSISTANTS=['ChatGPT','Claude','Gemini'];
export const DEMO_STAGES=['Compare observation dates','Check matching wavelengths','Prepare a source-linked review'];
export const regionKey=region=>`${region.order??9}:${region.id}`;
export function normalizeRegions(input){
 if(!Array.isArray(input))return[];const seen=new Set(),out=[];
 for(const raw of input){if(!raw||typeof raw!=='object')continue;const order=raw.order??9,id=raw.id;if(!Number.isInteger(order)||order<0||order>9||!Number.isInteger(id)||id<0||id>=12*4**order)continue;const key=`${order}:${id}`;if(seen.has(key))continue;seen.add(key);const p=center(id,order);out.push({id,order,...p,label:typeof raw.label==='string'?raw.label.slice(0,80):`Region ${id}`});if(out.length===100)break;}return out;
}
export function loadRegionQueue(storage){try{return normalizeRegions(JSON.parse(storage.getItem(QUEUE_KEY)||'[]'));}catch{return[];}}
export function saveRegionQueue(storage,regions){try{storage.setItem(QUEUE_KEY,JSON.stringify(normalizeRegions(regions)));return true;}catch{return false;}}
export function createDemo(regions=[]){return {assistant:'ChatGPT',regions:normalizeRegions(regions),status:'disconnected',completed:0,step:0,selected:null};}
export function demoAction(state,action,value){
 const s={...state};
 if(action==='assistant'&&s.status==='disconnected'&&DEMO_ASSISTANTS.includes(value))s.assistant=value;
 if(action==='regions'&&['disconnected','ready'].includes(s.status)){s.regions=normalizeRegions(value);if(!s.regions.some(r=>regionKey(r)===s.selected))s.selected=s.regions[0]?regionKey(s.regions[0]):null;}
 if(action==='connect'&&s.status==='disconnected')s.status='ready';
 if(action==='disconnect')return {...createDemo(s.regions),assistant:s.assistant,selected:s.selected};
 if(action==='start'&&s.regions.length&&['ready','paused'].includes(s.status)){s.status='running';s.selected=regionKey(s.regions[s.completed]);}
 if(action==='pause'&&s.status==='running')s.status='paused';
 if(action==='reset'&&s.status!=='disconnected'){s.status='ready';s.completed=0;s.step=0;s.selected=s.regions[0]?regionKey(s.regions[0]):null;}
 if(action==='select'&&s.regions.some(r=>regionKey(r)===value))s.selected=value;
 if(action==='tick'&&s.status==='running'){
  s.step++;
  if(s.step===DEMO_STAGES.length){s.step=0;s.completed++;if(s.completed===s.regions.length)s.status='complete';else s.selected=regionKey(s.regions[s.completed]);}
 }
 return s;
}
export function demoCell(state,key){const order=state.regions.findIndex(r=>regionKey(r)===key);return order<0?'unassigned':order<state.completed?'reviewed':order===state.completed&&['running','paused'].includes(state.status)?state.status:'queued';}
export function demoProgress(state){return state.regions.length?Math.min(100,Math.round((state.completed+state.step/DEMO_STAGES.length)/state.regions.length*100)):0;}
export function regionViewUrl(region){return '/explore/?'+new URLSearchParams({hpx:region.id,order:region.order,...(region.order===9?{view:'cell'}:{})});}
