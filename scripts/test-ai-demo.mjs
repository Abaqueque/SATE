import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemo,demoAction,demoCell,demoProgress,normalizeRegions,regionKey,loadRegionQueue,saveRegionQueue,regionViewUrl,QUEUE_KEY} from '../sky-atlas/dist/ai-demo-model.js';
import {center} from '../sky-atlas/dist/sky-model.js';
const regions=[{id:734163,order:9,label:'First cell'},{id:123,order:2,label:'Wide region'},{id:17,order:1,label:'Last region'}];
test('real region queue validates identities, deduplicates and derives canonical coordinates',()=>{
 const queue=normalizeRegions([...regions,regions[0],{id:-1},{id:12,order:0},{id:0,order:10},{id:'734163'},null]);assert.equal(queue.length,3);assert.deepEqual(queue.map(regionKey),['9:734163','2:123','1:17']);assert.deepEqual({ra:queue[0].ra,dec:queue[0].dec},center(734163,9));assert.equal(regionViewUrl(queue[0]),'/explore/?hpx=734163&order=9&view=cell');assert.equal(regionViewUrl(queue[1]),'/explore/?hpx=123&order=2');
 assert.equal(normalizeRegions(Array.from({length:110},(_,id)=>({id,order:9}))).length,100);
});
test('execution requires connection and processes only selected regions in exact queue order',()=>{
 let state=createDemo();state=demoAction(state,'connect');assert.equal(demoAction(state,'start').status,'ready');state=demoAction(state,'regions',regions);state=demoAction(state,'start');assert.equal(state.selected,'9:734163');
 const before={...state};assert.deepEqual(demoAction(state,'regions',[regions[0]]),before);assert.deepEqual(demoAction(state,'assistant','Claude'),before);
 for(let i=0;i<3;i++)state=demoAction(state,'tick');assert.equal(state.completed,1);assert.equal(state.selected,'2:123');assert.equal(demoCell(state,'9:734163'),'reviewed');assert.equal(demoCell(state,'1:99'),'unassigned');
 for(let i=0;i<6;i++)state=demoAction(state,'tick');assert.equal(state.status,'complete');assert.equal(state.completed,3);assert.equal(demoProgress(state),100);assert.deepEqual(demoAction(state,'tick'),state);
});
test('pause retains work, inspection leaves queue order unchanged, and disconnect resets only execution',()=>{
 const original=createDemo(regions);let state=demoAction(demoAction(original,'connect'),'start');state=demoAction(state,'tick');state=demoAction(state,'select','1:17');assert.equal(state.selected,'1:17');assert.deepEqual(state.regions,original.regions);state=demoAction(state,'pause');assert.equal(state.step,1);assert.deepEqual(demoAction(state,'tick'),state);state=demoAction(state,'start');assert.equal(state.step,1);assert.equal(state.selected,'9:734163');state=demoAction(state,'disconnect');assert.equal(state.status,'disconnected');assert.equal(state.completed,0);assert.equal(state.step,0);assert.deepEqual(state.regions,original.regions);assert.equal(original.status,'disconnected');
});
test('queue persistence is isolated, safe against malformed records and storage denial',()=>{
 const store=new Map([['sate-real-reviews','untouched']]),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};assert(saveRegionQueue(storage,regions));assert.equal(loadRegionQueue(storage).length,3);assert.equal(store.get('sate-real-reviews'),'untouched');assert(!store.get(QUEUE_KEY).includes('completed'));storage.setItem(QUEUE_KEY,'bad json');assert.deepEqual(loadRegionQueue(storage),[]);assert.equal(saveRegionQueue({setItem(){throw Error('Denied');}},regions),false);assert.deepEqual(loadRegionQueue(undefined),[]);
});
