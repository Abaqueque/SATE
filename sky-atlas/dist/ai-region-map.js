import {ORDER,cellAt,center,boundary,viewportGrid,channelTransportHz} from './sky-model.js';
import {MILKY_WAY_COLOURS} from './sky-palette.js';
import {demoTargets} from './demo-targets.js';
import {mountSearchSuggestions} from './sky-search.js';
export function mapRegion(id,order=ORDER){
 if(!Number.isInteger(order)||order<0||order>ORDER||!Number.isInteger(id)||id<0||id>=12*4**order)return null;
 return {key:`${order}:${id}`,id,order,...center(id,order),label:`${order===ORDER?'Cell':'Region'} ${id}`};
}
export function regionMapMarkup(){return `<section class="ai-region-map" data-ai-region-map aria-label="Select sky regions">
<div class="ai-map-tools"><form id="ai-map-search" role="search"><input id="sky-object-query" name="object" type="search" placeholder="Find an object" aria-label="Find an object" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sky-object-suggestions" maxlength="120" required><div id="sky-object-suggestions" role="listbox" aria-label="Object suggestions" hidden></div><button type="submit">Go</button></form><select id="ai-map-place" aria-label="Go to a known region"><option value="">Go to a region…</option>${demoTargets.map((t,i)=>`<option value="${i}">${t.name}</option>`).join('')}</select></div>
<div class="ai-map-view"><div id="ai-aladin" aria-label="Interactive SPHEREx sky map"></div><div class="ai-map-message" id="ai-map-message" role="status">Loading sky map…</div><div class="ai-map-bottom"><span id="ai-map-instruction">Click regions to add them. Zoom in for smaller regions.</span><div><button type="button" id="ai-map-whole">Whole sky</button><button type="button" id="ai-map-out" aria-label="Zoom out">−</button><button type="button" id="ai-map-in" aria-label="Zoom in">+</button></div></div></div>
<p class="ai-map-source">SPHEREx · NASA/IPAC IRSA <span id="ai-map-scale"></span></p></section>`;}
export function mountRegionMap(root,{onToggle=()=>{},onStatus=()=>{}}={}){
 let dead=false,viewer,A,overlay,markers,survey,selected=[],active=null,disabled=false,drawTimer,loadingTimer,controller,suggestions,paletteReady=false;
 const q=s=>root.querySelector(s),events=new AbortController();
 function message(text){if(dead)return;q('#ai-map-message').textContent=text;q('#ai-map-message').hidden=!text;onStatus(text);}
 function draw(){
  if(dead||!viewer||!overlay)return;clearTimeout(drawTimer);drawTimer=setTimeout(()=>{
   if(dead)return;const [ra,dec]=viewer.getRaDec(),fov=Math.max(...viewer.getFov()),grid=viewportGrid(ra,dec,fov);
   root.dataset.gridOrder=grid.order;root.dataset.gridCount=grid.ids.length;
   const shapes=grid.ids.map(id=>A.polygon(boundary(id,grid.order,grid.order<3?8:2),{color:'#aab5c15c',lineWidth:.8,hoverColor:'#b9d2efb3',selectionColor:'#8bb8ff',selectionLineWidth:1.5}));
   for(const region of selected){const current=active?.key===region.key;shapes.push(A.polygon(boundary(region.id,region.order,region.order<3?8:3),{color:current?'#ffffff':'#8bb8ff',lineWidth:current?2.4:1.7,hoverColor:'#b9d2ef',selectionColor:'#8bb8ff',selectionLineWidth:1.8}));}
   overlay.removeAll();overlay.addFootprints(shapes);markers.removeAll();markers.addSources(selected.map((r,i)=>A.source(r.ra,r.dec,{name:String(i+1)})));
   q('#ai-map-scale').textContent=grid.order===ORDER?'Individual cells':`Region grid · level ${grid.order}`;
  },60);
 }
 function focus(region){if(!viewer||!region||dead)return;viewer.gotoRaDec(region.ra,region.dec);viewer.setFoV(Math.min(160,Math.max(.42,58.63/2**region.order*3)));draw();}
 const api={setSelection(regions){selected=regions.map(r=>mapRegion(r.id,r.order??9)).filter(Boolean);draw();},setActive(region){const next=region?mapRegion(region.id,region.order??9):null;const changed=next?.key!==active?.key;active=next;if(changed&&active)focus(active);else draw();},setDisabled(value){disabled=!!value;q('#ai-map-instruction').textContent=disabled?'Following your selected regions. Choose Edit queue to change them.':'Click regions to add them. Zoom in for smaller regions.';},focus,destroy(){dead=true;events.abort();clearTimeout(drawTimer);clearTimeout(loadingTimer);controller?.abort();suggestions?.destroy();}};
 (async()=>{try{
  const [module,metadata]=await Promise.all([import('./vendor/aladin-3.8.1.js'),fetch('/assets/spherex-survey.json').then(r=>{if(!r.ok)throw Error('Metadata unavailable');return r.json();})]);if(dead)return;A=module.default;await A.init;if(dead)return;
  survey=A.imageHiPS(metadata.url,{imgFormat:'png',successCallback:h=>{if(dead)return;survey=h;h.setFrequency({unit:'Hz',value:channelTransportHz(62)});if(paletteReady)h.setColormap('sate-milky-way');message('');},errorCallback:()=>message('Sky imagery unavailable. Region selection is still available.')});
  viewer=A.aladin('#ai-aladin',{survey,target:'266.4 -29',fov:360,projection:'AIT',cooFrame:'ICRSd',showZoomControl:false,showLayersControl:false,showFullscreenControl:false,showFrame:false,showProjectionControl:false,showStatusBar:false,showGotoControl:false,showReticle:false,showCooGrid:false,showFov:false,showCooLocation:false,log:false,inertia:false,backgroundColor:'#000000'});
  const canvas=q('.aladin-imageCanvas'),black=()=>{if(dead)return;canvas?.getContext('webgl2')?.clearColor(0,0,0,1);viewer.setBackgroundColor('#000000');};black();canvas?.addEventListener('webglcontextrestored',black,{signal:events.signal});
  const project=viewer.pix2world.bind(viewer);viewer.pix2world=(...args)=>{try{return project(...args);}catch(e){if(e instanceof TypeError)return undefined;throw e;}};
  viewer.addColormap('sate-milky-way',MILKY_WAY_COLOURS);paletteReady=true;survey.setColormap('sate-milky-way');
  overlay=A.graphicOverlay({color:'#8bb8ff',lineWidth:1});viewer.addOverlay(overlay);markers=A.catalog({name:'Selected regions',shape:'circle',sourceSize:9,color:'#8bb8ff',displayLabel:true,labelColumn:'name',labelColor:'#ffffff',labelFont:'13px Public Sans, Arial, sans-serif'});viewer.addCatalog(markers);
  viewer.on('click',p=>{if(dead||disabled||p.isDragging||!Number.isFinite(p.ra)||!Number.isFinite(p.dec))return;const grid=viewportGrid(...viewer.getRaDec(),Math.max(...viewer.getFov()));onToggle(mapRegion(cellAt(p.ra,p.dec,grid.order),grid.order));});
  viewer.on('positionChanged',draw);viewer.on('zoomChanged',draw);viewer.on('resizeChanged',draw);root.dataset.ready='true';draw();if(active)focus(active);
  loadingTimer=setTimeout(()=>{if(!dead&&!q('#ai-map-message').hidden)message('Imagery is taking longer to load. You can select regions now.');},15000);
 }catch(e){message('The sky map could not start. Reload in a WebGL2 browser.');}})();
 for(const [id,scale]of [['#ai-map-in',.5],['#ai-map-out',2]])q(id).addEventListener('click',()=>{if(viewer)viewer.setFoV(Math.max(.12,Math.min(360,viewer.getFov()[0]*scale)));},{signal:events.signal});
 q('#ai-map-whole').addEventListener('click',()=>{if(viewer){viewer.gotoRaDec(266.4,-29);viewer.setFoV(360);}},{signal:events.signal});
 q('#ai-map-place').addEventListener('change',e=>{const target=e.target.value===''?null:demoTargets[Number(e.target.value)];if(viewer&&target){viewer.gotoRaDec(target.ra,target.dec);viewer.setFoV(Math.max(.5,target.size||.5));draw();}},{signal:events.signal});
 suggestions=mountSearchSuggestions(q('#ai-map-search'));
 q('#ai-map-search').addEventListener('submit',async e=>{e.preventDefault();e.stopPropagation();const name=q('#sky-object-query').value.trim();if(!name||!viewer)return;suggestions.close();controller?.abort();controller=new AbortController();const signal=controller.signal;message('Finding '+name+'…');try{const response=await fetch('/api/object-search?'+new URLSearchParams({q:name}),{signal}),object=await response.json();if(dead||signal.aborted)return;if(!response.ok||!Number.isFinite(object.ra)||!Number.isFinite(object.dec))throw Error(object.error||'Object unavailable');viewer.gotoRaDec(object.ra,object.dec);viewer.setFoV(.6);suggestions.remember(name);message('');draw();}catch(e){if(!dead&&!signal.aborted)message(e.message);}},{signal:events.signal});
 return api;
}
