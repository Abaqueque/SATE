import test from 'node:test';
import assert from 'node:assert/strict';
import {cellKey,appendSnapshot,applyReview,catalogueLinks,candidatePosition,fitsLink,displaySettings} from '../sky-atlas/dist/cell-documents-store.js';
const snapshot={id:'one',savedAt:'2026-11-15T10:00:00.000Z',cellId:1340163,order:9,position:{ra:101.25,dec:-16.72},viewerUrl:'/explore/?hpx=1340163&order=9&view=cell&layerHue=253,0',previews:{left:'data:image/png;base64,AA==',right:'data:image/png;base64,AA=='},layers:[{number:1,observations:{left:{id:'first',date:'2025-09-27T16:37:17Z'},right:{id:'second',date:'2026-04-05T23:53:59Z'}}}]};
const patch={title:'Possible variable',status:'investigating',notes:'Changed between the two dates.',reference:'Catalogue evidence',candidate:{ra:101.251,dec:-16.721,radius:15},checks:{epochs:true}};
test('a documented cell retains exact settings, source records and image previews',()=>{
 const record=appendSnapshot(null,snapshot);assert.equal(record.key,'9:1340163');assert.equal(record.status,'unreviewed');assert.deepEqual(record.snapshots[0],snapshot);assert.equal(record.candidate.radius,600);
 assert.equal(cellKey(0),'9:0');assert.throws(()=>cellKey(-1));assert.throws(()=>cellKey(3145728));
});
test('later saves append history without replacing notes, review state or previous observations',()=>{
 const first=appendSnapshot(null,snapshot),reviewed=applyReview(first,patch),second=appendSnapshot(reviewed,{...snapshot,id:'two',savedAt:'2026-11-15T11:00:00.000Z'});
 assert.equal(second.snapshots.length,2);assert.equal(second.snapshots[1].id,'one');assert.equal(second.notes,patch.notes);assert.equal(second.status,'investigating');assert.equal(first.notes,'');assert.equal(reviewed.snapshots.length,1);
 assert.equal(appendSnapshot(second,snapshot).snapshots.length,2);assert.throws(()=>appendSnapshot({...first,key:'9:1'},snapshot));
});
test('review updates retain history and never automatically confirm discovery',()=>{
 const record=applyReview(appendSnapshot(null,snapshot),{...patch,status:'candidate',checks:{catalogues:true,epochs:true,artifacts:true}});
 assert.equal(record.status,'candidate');assert.equal(record.snapshots.length,1);assert.throws(()=>applyReview(record,{...patch,status:'confirmed'}));assert.throws(()=>applyReview(record,{...patch,title:''}));assert.throws(()=>applyReview(record,{...patch,notes:'x'.repeat(20001)}));
});
test('catalogue searches use the candidate position, sign and explicit arcsecond radius',()=>{
 const links=catalogueLinks({ra:0,dec:-89.5,radius:30}),s=new URL(links.simbad),v=new URL(links.vizier);
 assert.equal(s.searchParams.get('Coord'),'0.0000000 -89.5000000');assert.equal(s.searchParams.get('Radius'),'30');assert.equal(s.searchParams.get('Radius.unit'),'arcsec');assert.equal(v.searchParams.get('-c.rs'),'30');
 for(const values of [{ra:'',dec:0,radius:10},{ra:360,dec:0,radius:10},{ra:1,dec:91,radius:10},{ra:1,dec:0,radius:0}])assert.throws(()=>candidatePosition(values));
});
test('source downloads are restricted to IRSA and saved viewer links stay local',()=>{
 const good=fitsLink('/ibe/data/spherex/dr1/level2/test.fits',snapshot.position);assert.equal(new URL(good).hostname,'irsa.ipac.caltech.edu');assert.equal(new URL(good).searchParams.get('center'),'101.25,-16.72');
 for(const path of ['https://evil.test/ibe/data/spherex/test.fits','//evil.test/file','javascript:alert(1)','/other/file'])assert.equal(fitsLink(path,snapshot.position),null);
 assert.throws(()=>appendSnapshot(null,{...snapshot,viewerUrl:'https://evil.test/'}));
});
test('saved display settings restore real controls and bound malformed values',()=>{
 const values=displaySettings({quality:false,background:false,original:true,contrast:1.7,noise:0,zoom:3,pan:{x:.2,y:-.4},combined:{left:true}});
 assert.equal(values.quality,false);assert.equal(values.contrast,1.7);assert.equal(values.noise,0);assert.equal(values.zoom,3);assert.deepEqual(values.pan,{x:.2,y:-.4});assert.equal(values.combined.left,true);
 assert.equal(displaySettings({zoom:Infinity,contrast:999,noise:10}).contrast,2.5);assert.equal(displaySettings({zoom:Infinity}).zoom,1);assert.equal(displaySettings(null).quality,false);assert.equal(displaySettings({quality:true}).quality,true);
});
