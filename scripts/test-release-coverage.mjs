import test from 'node:test';
import assert from 'node:assert/strict';
import {handleObservations,validatedImagePath} from '../src/sequence-api.js';
import {uniqueExposures,matchingExposures} from '../sky-atlas/dist/cell-selection.js';
test('active observation API queries both releases and deep collections and retains QR3 dates',async()=>{
  const old=globalThis.fetch;let query;
  const fields=['access_url','t_min','obs_id','energy_bandpassname','obs_collection'];
  const records=[['https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/early.fits','60800','early','SPHEREx-D1','spherex_dr1'],['https://irsa.ipac.caltech.edu/ibe/data/spherex/qr3/level2/late.fits','61200','late','SPHEREx-D1','spherex_qr3']];
  globalThis.fetch=async url=>{query=new URL(url);return new Response('<VOTABLE><TABLE>'+fields.map(name=>'<FIELD name="'+name+'"/>').join('')+'<DATA><TABLEDATA>'+records.map(row=>'<TR>'+row.map(value=>'<TD>'+value+'</TD>').join('')+'</TR>').join('')+'</TABLEDATA></DATA></TABLE></VOTABLE>');};
  try{
    const response=await handleObservations(new Request('http://localhost/api/observations?ra=123.456&dec=-12&size=.2&wavelength=1&tolerance=.02&mode=single'));
    assert.equal(response.status,200);const data=await response.json();
    assert.deepEqual(query.searchParams.getAll('COLLECTION'),['spherex_dr1','spherex_qr3','spherex_dr1_deep','spherex_qr3_deep']);
    assert.equal(data.observations.length,2);assert(data.observations[1].path.includes('/qr3/'));assert(data.observations[0].date<data.observations[1].date);
    assert.equal(validatedImagePath(data.observations[1].path),data.observations[1].path);
  }finally{globalThis.fetch=old;}
});
test('there is no three/five exposure display cap and nearby wavelengths remain excluded',()=>{
  const observations=Array.from({length:45},(_,i)=>({id:'exposure-'+i,path:'/dr1/'+i,band:'D1',mjd:60000+i/1440,match:true}));
  const list=matchingExposures(uniqueExposures(observations));assert.equal(list.length,45);
  assert.equal(matchingExposures([...list,{id:'wrong-wavelength',mjd:60001,match:false}]).length,45);
});
