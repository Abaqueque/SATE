import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameCache,createFrameLoader} from '../sky-atlas/dist/cell-frame-cache.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('preloads share in-flight work, prioritize selected frames, bound concurrency and retry failure',async()=>{
 const started=[],resolvers=new Map();let active=0,max=0,fail=true;
 const loader=createFrameLoader({concurrency:2,load:async o=>{started.push(o.path);max=Math.max(max,++active);await new Promise(r=>resolvers.set(o.path,r));active--;if(o.path==='b'&&fail){fail=false;throw Error('temporary');}return o.path;}});
 const a=loader.get({path:'a'}),b=loader.get({path:'b'}).catch(e=>e.message),c=loader.get({path:'c'}),d=loader.get({path:'d'});assert.equal(loader.get({path:'a'},true),a);assert.equal(loader.get({path:'d'},true),d);await tick();assert.deepEqual(started,['a','b']);resolvers.get('a')();await a;await tick();assert.deepEqual(started,['a','b','d']);resolvers.get('b')();await b;await tick();resolvers.get('c')();resolvers.get('d')();await Promise.all([c,d]);await tick();const retry=loader.get({path:'b'});await tick();resolvers.get('b')();assert.equal(await retry,'b');assert.equal(max,2);await tick();assert.deepEqual(loader.counts(),{ready:4,failed:0,total:4,skipped:0});
});
test('closing a search rejects queued preloads without starting them',async()=>{
 let release;const started=[],loader=createFrameLoader({concurrency:1,load:async o=>{started.push(o.path);await new Promise(r=>release=r);return o.path;}});const a=loader.get({path:'a'}),b=loader.get({path:'b'});const rejected=assert.rejects(b,{name:'AbortError'});await tick();loader.close();await rejected;release();await a;assert.deepEqual(started,['a']);
});
test('bounded memory retains recent arrays and works when persistent storage is unavailable',async()=>{
 const cache=createFrameCache({memoryBytes:16,indexedDB:null}),frame=n=>({raw:{values:new Float32Array([n])},clean:{values:new Float32Array([n])}});
 await cache.set('a',frame(1));await cache.set('b',frame(2));assert.equal(cache.peek('a').raw.values[0],1);await cache.set('c',frame(3));assert.equal(cache.peek('b'),null);assert.equal((await cache.get('a')).clean.values[0],1);cache.clearMemory();assert.equal(await cache.get('c'),null);
});
