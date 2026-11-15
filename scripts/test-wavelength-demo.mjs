import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {DEMO_CELL,demoReturn,demoSelection,availableChannels} from '../sky-atlas/dist/wavelength-demo.js';
import {cellAt} from '../sky-atlas/dist/sky-model.js';
const metadata=JSON.parse(readFileSync(new URL('../sky-atlas/dist/assets/spherex-survey.json',import.meta.url)));
test('default demo cell contains the catalogue position of M42',()=>{
 assert.equal(DEMO_CELL,cellAt(83.8201,-5.3876));assert.deepEqual(demoSelection(),{id:DEMO_CELL,order:9,channel:62});
});
test('demo preserves selected cells and real channels without carrying overlay settings',()=>{
 const query='/explore/?hpx=1340163&order=9&view=cell&channel=77&overlay=1&waves=76';
 assert.deepEqual(demoSelection('?return='+encodeURIComponent(query)),{id:1340163,order:9,channel:77});
 assert.deepEqual(demoSelection('?hpx=1372138&order=9&channel=11&return='+encodeURIComponent(query)),{id:1372138,order:9,channel:11});
 assert.equal(demoReturn('?return='+encodeURIComponent(query)),query);
 assert.equal(demoReturn('?return=https://example.com'),'/explore/');
 assert.equal(demoSelection('?hpx=-1&channel=Infinity').id,DEMO_CELL);
 assert.equal(demoSelection('?hpx=10&order=2&channel=102').channel,62);
});
test('slider steps are exact measured cube channels, skipping only documented blanks',()=>{
 const channels=availableChannels(metadata);assert.equal(channels.length,100);
 assert.deepEqual(channels.slice(49,52).map(v=>v.index),[49,52,53]);
 assert.equal(channels[0].wavelength,.753);assert.equal(channels.at(-1).wavelength,4.988);
 for(const v of channels)assert.equal(v.wavelength,metadata.wavelengths[v.index]);
 assert.equal(channels.find(v=>v.index===11).wavelength,.978);
 assert.equal(channels.find(v=>v.index===62).wavelength,3.293);
 assert.equal(channels.find(v=>v.index===90).wavelength,4.600);
});
