import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {demoTargets,demoTargetUrl} from '../sky-atlas/dist/demo-targets.js';
import {motionExamples,motionExampleUrl} from '../sky-atlas/dist/motion-examples.js';
import {initialExposure} from '../sky-atlas/dist/cell-selection.js';
import {exampleSequenceUrl,compatibleExampleSequence,mergeExposureLists} from '../sky-atlas/dist/example-sequences.js';
const metadata=JSON.parse(await readFile(new URL('../sky-atlas/dist/assets/spherex-survey.json',import.meta.url)));
const params=url=>new URL(url,'https://local').searchParams;

test('each example opens its target with tools appropriate to its task',()=>{
 for(const target of demoTargets){const q=params(demoTargetUrl(target.id,metadata));assert.equal(q.get('view'),'cell');assert.equal(q.get('sourceRa'),String(target.ra));assert.equal(q.get('sourceDec'),String(target.dec));assert.equal(q.get('example'),target.id);assert(!metadata.blankFrames.includes(Number(q.get('channel'))));
  if(target.kind==='extended'){assert.equal(q.get('stretch'),'detail');assert.equal(q.get('nearby'),'1');assert.equal(q.has('dual'),false);assert.equal(q.has('tracking'),false);assert.equal(q.has('known'),false);}
  else{assert.equal(q.get('dual'),'1');assert.equal(q.get('known'),'1');assert.equal(q.get('dates'),'ends');assert.equal(q.get('tracking')==='1',target.kind==='motion');assert.equal(q.get('stretch'),'sources');}
 }
 for(const target of motionExamples){const q=params(motionExampleUrl(target.id));assert.equal(q.get('dual'),'1');assert.equal(q.get('tracking'),'1');assert.equal(q.get('known'),'1');assert.equal(q.get('exposure'),target.first);assert.equal(q.get('compare'),target.last);}
 assert.equal(demoTargetUrl('missing',metadata),null);
});
test('example comparison endpoints wait for validation and reject unsuitable endpoints',()=>{
 const items=[0,1,2,3].map(i=>({id:String(i),path:'/f'+i,mjd:i,band:'D2',checked:i===1||i===2,match:i===1||i===2}));
 assert.equal(initialExposure(items,{oldest:true,endpoints:true}),null);assert.equal(initialExposure(items,{endpoints:true}),null);
 assert.equal(initialExposure(items,{oldest:true}).id,'1');assert.equal(initialExposure(items).id,'2');
 items[0].checked=true;assert.equal(initialExposure(items,{oldest:true,endpoints:true}).id,'1');
 items[3].checked=true;items[3].match=true;items[3].unusable=true;assert.equal(initialExposure(items,{endpoints:true}).id,'2');
 items[3].checked=false;assert.equal(initialExposure(items,{preferred:'3'}),null);items[3].checked=true;assert.equal(initialExposure(items,{preferred:'3'}).id,'2');assert.equal(initialExposure(items,{preferred:'1'}).id,'1');
});
test('archive additions retain selected files and validated state without duplicate exposures',()=>{
 const selected={id:'a',band:'D2',path:'/old',mjd:60000,match:true,checked:true};const extra={id:'b',band:'D2',path:'/new',mjd:61000};
 const rows=mergeExposureLists([selected],[{...selected,path:'/new-reduction',mjd:59999.999999,match:false},extra,extra]);assert.equal(rows.length,2);assert.equal(rows[0],selected);assert.equal(rows[1],extra);
});
test('starting sequences apply only to their matching field and preserve saved exposure choices',async()=>{
 const links=[...demoTargets.map(t=>demoTargetUrl(t.id,metadata)),...motionExamples.filter(t=>!t.curated).map(t=>motionExampleUrl(t.id))];
 for(const link of links){const q=params(link),path=exampleSequenceUrl(q);assert(path);const data=JSON.parse(await readFile(new URL('../sky-atlas/dist'+path,import.meta.url))),region={ra:Number(q.get('sourceRa')),dec:Number(q.get('sourceDec')),size:Number(q.get('size')||.2),channel:Number(q.get('channel')),nearby:q.get('nearby')==='1',mode:'single'},preferred={left:q.get('exposure'),right:q.get('compare')};assert(data.observations.length>0,path);assert(compatibleExampleSequence(data,region,preferred),path);assert(!compatibleExampleSequence(data,{...region,channel:region.channel+1}));assert(!compatibleExampleSequence(data,{...region,ra:region.ra+.01}));assert(!compatibleExampleSequence(data,{...region,size:region.size/2}));assert(!compatibleExampleSequence(data,region,{left:'saved-date-outside-starting-set'}));for(const obs of data.observations){assert(obs.verifiedCoverage>=.8);assert(Number.isFinite(obs.wavelength));assert(Number.isFinite(Date.parse(obs.date)));}
 }
 assert.equal(exampleSequenceUrl(params('/?example=../../file')),null);
});
