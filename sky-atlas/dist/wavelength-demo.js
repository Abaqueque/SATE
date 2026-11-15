import {ORDER,parseSky,center,boundary,channelTransportHz} from './sky-model.js';
export const DEMO_CELL=1372138; // HEALPix NESTED order 9, containing M42 (CDS Sesame).
export function demoReturn(search=''){
 const value=new URLSearchParams(search).get('return');
 if(!value||!/^\/explore\/(?:\?|$)/.test(value))return '/explore/';
 const url=new URL(value,'https://sate.invalid');
 return url.origin==='https://sate.invalid'&&url.pathname==='/explore/'?url.pathname+url.search:'/explore/';
}
export function demoSelection(search=''){
 const params=new URLSearchParams(search),back=new URL(demoReturn(search),'https://sate.invalid');
 const direct=parseSky(search),returned=parseSky(back.search);
 const cell=direct?.order===ORDER?direct:returned?.order===ORDER?returned:{id:DEMO_CELL,order:ORDER};
 const raw=params.get('channel')??back.searchParams.get('channel'),n=raw===null?62:Number(raw);
 return {...cell,channel:Number.isInteger(n)&&n>=0&&n<102?n:62};
}
export function availableChannels(metadata){return metadata.wavelengths.map((w,index)=>({index,wavelength:w})).filter(v=>Number.isFinite(v.wavelength)&&!metadata.blankFrames.includes(v.index));}
export function wavelengthDemoMarkup(){const cell=demoSelection(location.search),p=center(cell.id);return `<main id="main" class="wave-demo" data-wave-demo>
<a class="wave-back" id="wave-return" href="/explore/">← Back to the atlas</a>
<div class="wave-intro"><p class="eyebrow">Real SPHEREx data · wavelength explorer</p><h1>Cell ${cell.id}</h1><p>${cell.id===DEMO_CELL?'This cell contains the Orion Nebula (M42).':'This is the cell selected in your atlas.'} Move the slider to view the same sky area in different measured infrared channels.</p><p class="wave-coordinate">Cell centre · RA ${p.ra.toFixed(5)}° · Dec ${p.dec.toFixed(5)}°<br>HEALPix NESTED · order 9 · cell boundary shown in blue</p></div>
<section class="wave-lab" aria-label="Real SPHEREx wavelength channels">
<div class="wave-controls"><label for="wave-channel">Wavelength <output id="wave-value">Loading channels…</output></label><input id="wave-channel" type="range" min="0" max="99" step="1" value="0" aria-label="SPHEREx wavelength" disabled/><div class="wave-range-labels"><span>Shorter · 0.753 µm</span><span>Longer · 4.988 µm</span></div><div class="wave-presets"><button type="button" data-channel="11" disabled>0.978 µm</button><button type="button" data-channel="62" disabled>3.293 µm</button><button type="button" data-channel="90" disabled>4.600 µm</button></div><p id="wave-band" class="wave-band"></p></div>
<div class="wave-sky-wrap"><div id="wave-sky" aria-label="SPHEREx survey image of cell ${cell.id}"></div><div id="wave-loading" role="status">Loading SPHEREx survey…</div><span class="wave-image-label" id="wave-image-label">Cell ${cell.id}</span></div>
<div class="wave-observation"><strong>One measured channel at a time.</strong><p>The slider switches channels in NASA/IPAC’s SPHEREx DR1 sky cube. There is no image blending, generated imagery, or interpolation between wavelengths. The view stays centred on this cell.</p><p id="wave-status" role="status"></p><button type="button" id="wave-retry" hidden>Reload survey</button></div>
<p class="wave-credit">NASA/IPAC IRSA · SPHEREx DR1 · <a href="https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube/properties" target="_blank" rel="noreferrer">Exact dataset &amp; channel wavelengths ↗</a></p>
</section>
<section class="wave-lessons" aria-label="Reading the wavelength changes"><article><h2>Follow the same structure.</h2><p>Try 0.978 µm, then 3.293 µm. Look at compact bright sources and the more extended emission around them. Changing wavelength samples different light from the same position; different materials can emit or absorb differently across these channels.</p></article><article><h2>Wavelength, not time.</h2><p>This is a real survey mosaic combining observations across dates. Moving the slider does not show an object evolving. Use the cell viewer’s dated exposures to investigate changes over time.</p></article><article><h2>Check the observations.</h2><p>These survey images are for visual exploration, with approximately 12.9 arcseconds per pixel. Display scaling and coverage can affect brightness. Open the cell for individual observations, their dates, and original FITS data.</p></article></section>
<div class="wave-next"><div><h2>Investigate cell ${cell.id}.</h2><p>Open the selected wavelength in the full cell viewer.</p></div><a id="wave-open-cell" class="button lime" href="/explore/?hpx=${cell.id}&amp;order=9&amp;view=cell&amp;channel=${cell.channel}">Open this cell ↗</a></div>
<p class="wave-footnote">µm means micrometre. Two blank dichroic channels are skipped. Missing or dark pixels are not evidence that an object is absent. <a href="https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/overview.html" target="_blank" rel="noreferrer">SPHEREx data guide ↗</a></p>
</main>`;}
export function mountWavelengthDemo(){
 const root=document.querySelector('[data-wave-demo]');if(!root)return ()=>{};
 const q=s=>root.querySelector(s),events=new AbortController(),on={signal:events.signal},cell=demoSelection(location.search),p=center(cell.id);
 let dead=false,viewer,survey,metadata,channels=[],channel=cell.channel,ready=false,timer;
 q('#wave-return').href=demoReturn(location.search);
 if(demoReturn(location.search).includes('view=cell'))q('#wave-return').textContent='← Back to your cell';
 function showSelection(){
  const selected=channels.find(v=>v.index===channel);if(!selected)return;
  q('#wave-channel').value=channels.indexOf(selected);q('#wave-value').textContent=selected.wavelength.toFixed(3)+' µm';
  q('#wave-channel').setAttribute('aria-valuetext',selected.wavelength.toFixed(3)+' micrometres');
  q('#wave-band').textContent='Band '+(Math.floor(channel/17)+1)+' · channel '+(channel%17+1)+' · cube plane '+(channel+1)+' / 102';
  q('#wave-image-label').textContent='Cell '+cell.id+' · '+selected.wavelength.toFixed(3)+' µm';
  q('#wave-sky').setAttribute('aria-label','SPHEREx '+selected.wavelength.toFixed(3)+' micrometre survey image of cell '+cell.id);
  q('#wave-open-cell').href='/explore/?'+new URLSearchParams({hpx:cell.id,order:9,view:'cell',mode:'single',channel});
  for(const b of root.querySelectorAll('[data-channel]'))b.setAttribute('aria-pressed',String(Number(b.dataset.channel)===channel));
  const u=new URL(location.href);u.searchParams.set('hpx',cell.id);u.searchParams.set('order',9);u.searchParams.set('channel',channel);history.replaceState({},'',u.pathname+u.search);
 }
 function choose(index){if(!ready||!channels.some(v=>v.index===index))return;channel=index;survey.setFrequency({unit:'Hz',value:channelTransportHz(channel)});showSelection();}
 q('#wave-channel').addEventListener('input',e=>choose(channels[Number(e.target.value)]?.index),on);
 for(const b of root.querySelectorAll('[data-channel]'))b.addEventListener('click',()=>choose(Number(b.dataset.channel)),on);
 q('#wave-retry').addEventListener('click',()=>location.reload(),on);
 function failed(message){if(dead)return;ready=false;q('#wave-loading').hidden=false;q('#wave-loading').textContent=message;q('#wave-status').textContent='No substitute image is shown. Retry when the archive is available.';q('#wave-retry').hidden=false;q('#wave-channel').disabled=true;for(const b of root.querySelectorAll('[data-channel]'))b.disabled=true;}
 (async()=>{try{
  const result=await Promise.all([import('./vendor/aladin-3.8.1.js'),fetch('/assets/spherex-survey.json',{signal:events.signal}).then(r=>{if(!r.ok)throw Error('Channel metadata unavailable');return r.json();})]);if(dead)return;
  const A=result[0].default;metadata=result[1];channels=availableChannels(metadata);if(!channels.length)throw Error('No measured channels available');if(!channels.some(v=>v.index===channel))channel=channels[0].index;
  q('#wave-channel').max=channels.length-1;showSelection();await A.init;if(dead)return;
  survey=A.imageHiPS(metadata.url,{imgFormat:'png',successCallback:h=>{if(dead)return;survey=h;h.setFrequency({unit:'Hz',value:channelTransportHz(channel)});h.setColormap('native');ready=true;q('#wave-loading').hidden=true;q('#wave-channel').disabled=false;for(const b of root.querySelectorAll('[data-channel]'))b.disabled=false;q('#wave-status').textContent='Live archive tiles load as you change channels. Black areas can indicate missing coverage.';clearTimeout(timer);},errorCallback:()=>failed('SPHEREx imagery unavailable. Please retry.')});
  viewer=A.aladin('#wave-sky',{survey,target:p.ra+' '+p.dec,fov:.32,projection:'TAN',cooFrame:'ICRSd',showZoomControl:false,showLayersControl:false,showFullscreenControl:false,showFrame:false,showProjectionControl:false,showStatusBar:false,showGotoControl:false,showReticle:false,showCooGrid:false,showFov:false,showCooLocation:false,log:false,inertia:false,backgroundColor:'#080e16'});
  const overlay=A.graphicOverlay({color:'#98c3ed',lineWidth:1.5});viewer.addOverlay(overlay);overlay.addFootprints([A.polygon(boundary(cell.id),{color:'#98c3ed',lineWidth:1.5})]);
  timer=setTimeout(()=>{if(!dead&&!ready)q('#wave-loading').textContent='Waiting for the SPHEREx archive…';},15000);
 }catch(error){if(!dead)failed('Could not load SPHEREx data. Please retry in a WebGL2 browser.');}})();
 return()=>{dead=true;events.abort();clearTimeout(timer);};
}
