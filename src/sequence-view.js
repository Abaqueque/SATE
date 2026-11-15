import {parseSpectralImage,createSkyGrid,alignImage,rawDetectorFrame,sharedStretch,drawAligned} from './spectral.js';
import {averageNearby} from './stack.js';
import {composeMosaic} from './mosaic.js';
import {spreadOrder,nearbyObservations} from './sequence-model.js';
import {cachedFrame,cacheFrame,frameCacheKey} from './frame-cache.js';

export function initSequenceViewer(root){
  const q=s=>root.querySelector(s),time=q('#sate-time'),wave=q('#sate-wavelength'),canvas=q('#sate-science-canvas');
  const date=mjd=>new Date((mjd-40587)*86400000).toISOString();
  let stripTimer=null,region=null,active=null,generation=0,controller=null,busy=false,hasRetrieved=false,timer=null,waveTimer=null,cursorMjd=null;
  const sequences=new Map();
  function displayAverage(b,j){
    if(q('#sate-layout').value==='mosaic'||!q('#sate-average').checked||!j?.frame)return null;
    const key=[b.revision??0,q('#sate-average-hours').value,q('#sate-average-wave').value].join('|');
    if(b.averagesKey!==key){b.averagesKey=key;b.averages=new Map();}
    if(!b.averages.has(j))b.averages.set(j,averageNearby(b.jobs,j,{hours:Number(q('#sate-average-hours').value),wavelengthPercent:Number(q('#sate-average-wave').value)}));
    const result=b.averages.get(j);if(b.averages.size>32)b.averages.delete(b.averages.keys().next().value);return result;
  }
  // Pixels of one frame that can enter the mosaic at this wavelength.
  function inBand(b,f,tolerance=b.region.tolerance){if(!f?.aligned||!f.variance||!f.quality||!f.wavelengths)return 0;let n=0;for(let i=0;i<f.values.length;i++)if(f.quality[i]&&Number.isFinite(f.values[i])&&f.variance[i]>0&&Math.abs(f.wavelengths[i]-b.wave)<=tolerance)n++;return n;}
  // Exposures up to three search widths away are kept as separate, labelled images.
  const RELATED=3;
  // Timeline stops: in the mosaic only exposures that really contribute an image.
  // Mosaic images covering less than this share of the field are left out everywhere.
  const MIN_COVERAGE=.8;
  // Coverage and identity of the image a time produces. Cached per exposure and only
  // recomputed when an exposure inside its own time window arrives or a setting changes.
  function sceneInfo(b,j){
    const hours=Number(q('#sate-grid-hours').value),inWindow=b.jobs.reduce((n,o)=>n+(o.status==='ready'&&Math.abs(o.obs.mjd-j.obs.mjd)<=hours/48?1:0),0);
    const key=[inWindow,hours,q('#sate-average').checked,q('#sate-average-hours').value,q('#sate-average-wave').value].join('|');
    if(j.sceneKey!==key){j.sceneKey=key;let m=mosaicAt(b,b.jobs,j);if(!m.frame)m=mosaicAt(b,b.jobs,j,b.wave,b.region.tolerance*RELATED);
      j.scene={coverage:m.frame?.coverage??0,id:m.members.map(o=>o.obs.path).join('|')};}
    return j.scene;
  }
  const isStop=(b,j)=>j.status==='ready'&&(!b.region.mosaic||((j.inBand>0||j.inRelated>0)&&sceneInfo(b,j).coverage>=MIN_COVERAGE));
  function nearestStop(b,mjd,all=false){let best=-1;b.jobs.forEach((j,i)=>{if((all||!b.region.mosaic||isStop(b,j))&&(best<0||Math.abs(j.obs.mjd-mjd)<Math.abs(b.jobs[best].obs.mjd-mjd)))best=i;});return best;}
  function stretchFor(b,frames){return sharedStretch(frames,b.region.mosaic?{quality:true,wavelength:b.wave,tolerance:b.region.tolerance}:{});}
  function gridRows(b){return b?nearbyObservations(b.jobs,b.index,Number(q('#sate-grid-hours').value),b.jobs.length):[];}
  const mosaicAt=(b,jobs,job,wavelength=b.wave,tolerance=b.region.tolerance)=>composeMosaic(jobs,b.grid,{mjd:job.obs.mjd,hours:Number(q('#sate-grid-hours').value),wavelength,tolerance,average:q('#sate-average').checked,averageHours:Number(q('#sate-average-hours').value),wavelengthPercent:Number(q('#sate-average-wave').value)});
  // The scene at one time split into narrow overlapping wavelength bands that have data.
  function sceneBands(b,jobs,job){
    const key=[b.revision??0,b.jobs.indexOf(job),q('#sate-grid-hours').value,q('#sate-average').checked,q('#sate-average-hours').value,q('#sate-average-wave').value].join('|');
    if(b.bandsKey!==key){b.bandsKey=key;const half=b.region.tolerance/5,step=b.region.tolerance/10;
      b.bandList=Array.from({length:17},(_,i)=>{const centre=Number((b.wave+(i-8)*step).toFixed(4));return {centre,half,mosaic:mosaicAt(b,jobs,job,centre,half)};}).filter(band=>band.mosaic.frame?.coverage>=MIN_COVERAGE);}
    return b.bandList;
  }
  const sceneId=(b,job)=>sceneInfo(b,job).id;
  // Play walks every separate image: each time's full-band mosaic, then its narrow
  // wavelength bands in order, then the next time whose contributing exposures differ.
  function playStep(){
    const b=active,job=selected();if(!b||!job){stop();return;}
    if(b.region.mosaic){
      const bands=sceneBands(b,b.jobs,job),at=b.focusBand?bands.findIndex(band=>band.centre===b.focusBand.centre):-1;
      if(at<bands.length-1){const band=bands[at+1];b.focusBand={centre:band.centre,half:band.half};render();return;}
      const current=sceneId(b,job),next=b.jobs.findIndex((j,i)=>i>b.index&&isStop(b,j)&&sceneId(b,j)!==current);
      if(next<0){stop();return;}b.focusBand=null;chooseIndex(next);return;
    }
    const next=b.jobs.findIndex((j,i)=>i>b.index&&isStop(b,j));if(next<0){stop();return;}chooseIndex(next);
  }
  function renderMosaic(b,jobs,job){
    q('#sate-average-details').hidden=true;q('#sate-scene-coverage').textContent='';
    const strip=q('#sate-bands');
    const key=[b?.focusBand?.centre??'all',q('#sate-palette').value,b?.stretch?.low,b?.stretch?.high,b?.revision??0,b?.index,Number(wave.value),q('#sate-grid-hours').value,q('#sate-average').checked,q('#sate-average-hours').value,q('#sate-average-wave').value].join('|');
    let mosaic=null;
    if(b&&job){
      if(b.mosaicKey!==key){
        b.mosaic=mosaicAt(b,jobs,job);b.mosaicKey=key;
        // Nothing at the requested wavelength here: show the nearby-wavelength exposures instead, labelled as such.
        if(!b.mosaic.frame){const nearby=mosaicAt(b,jobs,job,b.wave,b.region.tolerance*RELATED);if(nearby.frame){nearby.related=true;b.mosaic=nearby;}}
        if(b.mosaic.frame&&b.mosaic.frame.coverage<MIN_COVERAGE)b.mosaic={frame:null,members:[],reason:'The image at this time covers only '+Math.round(b.mosaic.frame.coverage*100)+'% of the field. Images under 80% are left out.'};
        b.focusMosaic=b.focusBand?mosaicAt(b,jobs,job,b.focusBand.centre,b.focusBand.half):null;
        if(b.focusBand&&!(b.focusMosaic.frame?.coverage>=MIN_COVERAGE)){b.focusBand=null;b.focusMosaic=null;}
        // The same scene in narrow overlapping bands stepped across the search width,
        // from exposures already loaded: closely related wavelengths as separate images.
        // Built just after the main image so scrubbing the timeline stays responsive.
        clearTimeout(stripTimer);stripTimer=setTimeout(()=>{
          if(active!==b||b.mosaicKey!==key)return;
          const palette=q('#sate-palette').value,scroll=strip.scrollLeft;
          strip.replaceChildren(...sceneBands(b,jobs,job).map(({centre,half,mosaic:band})=>{
            const on=b.focusBand?.centre===centre;
            const button=document.createElement('button'),thumb=document.createElement('canvas'),label=document.createElement('span');
            button.type='button';button.className='sky-band'+(on?' is-active':'');button.setAttribute('aria-pressed',String(on));
            label.textContent=centre.toFixed(2)+' µm · '+Math.round(band.frame.coverage*100)+'%';
            drawAligned(thumb,band.frame,b.stretch,palette);
            button.title=centre.toFixed(3)+' ± '+half.toFixed(3)+' µm. Click to enlarge; click again for the full band.';
            button.onclick=()=>{stop();b.focusBand=on?null:{centre,half};render();};button.append(thumb,label);return button;
          }));strip.querySelector('.is-active')?.scrollIntoView({block:'nearest',inline:'nearest'});if(!strip.querySelector('.is-active'))strip.scrollLeft=scroll;
        },120);
      }
      mosaic=b.focusMosaic??b.mosaic;
    }
    const frame=mosaic?.frame;canvas.hidden=!frame;q('#sate-image-empty').hidden=!!frame;q('#sate-mosaic-details').hidden=!frame;strip.hidden=!frame;
    if(frame){
      drawAligned(canvas,frame,b.stretch,q('#sate-palette').value);
      const count=mosaic.members.length,span=((mosaic.endMjd-mosaic.startMjd)*24).toFixed(2),actual=mosaic.waveMin.toFixed(3)+'–'+mosaic.waveMax.toFixed(3)+' µm';
      const shown=b.focusBand;q('#sate-image-caption').textContent='Mosaic 3 × 3 · '+(shown?shown.centre.toFixed(2)+' ± '+shown.half.toFixed(2)+' µm':mosaic.related?'nearby wavelength '+mosaic.waveMin.toFixed(2)+'–'+mosaic.waveMax.toFixed(2)+' µm':b.wave.toFixed(2)+' ± '+b.region.tolerance.toFixed(2)+' µm')+' · '+b.region.size.toFixed(2)+'° field · N ↑ E ←';
      q('#sate-frame-count').textContent=count+' source exposures · '+span+' h span';
      q('#sate-frame-meta').textContent=date(mosaic.startMjd).replace('T',' ').slice(0,19)+' to '+date(mosaic.endMjd).replace('T',' ').slice(0,19)+' UTC · actual λ '+actual;
      q('#sate-scene-coverage').textContent=Math.round(frame.coverage*100)+'% covered · actual λ '+actual;
      q('#sate-frame-quality').textContent=Math.round(frame.coverage*100)+'% valid coverage. Empty pixels have no suitable measurement in this time and wavelength window.';
      q('#sate-mosaic-meta').textContent='Nine adjacent sky sections on one continuous coordinate grid. Each source is placed by celestial WCS; repeated central images are not tiled. Closest local wavelength wins in overlaps.'+(q('#sate-average').checked?' Compatible overlaps are uncertainty-weighted: '+mosaic.averagedPixels+' averaged pixels; '+mosaic.rejected+' rejected outlier samples.':'')+' False colour shares one brightness scale. Intensity seams may remain where calibration or wavelength differs.';
      q('#sate-mosaic-members').replaceChildren(...mosaic.members.map(j=>{const li=document.createElement('li');li.textContent=j.obs.date+' · '+j.obs.id+' · '+j.obs.band+' · '+mosaic.contributions.get(j)+' contributing pixels';return li;}));
      canvas.setAttribute('aria-label','Joined 3 by 3 sky mosaic, '+b.region.size.toFixed(2)+' degrees wide, '+count+' source exposures, '+Math.round(frame.coverage*100)+' percent coverage');
    }else{
      q('#sate-image-caption').textContent='';
      q('#sate-image-empty').textContent=b?.error||(b?.searching?'Searching the archive…':busy&&!b?.jobs.some(j=>isStop(b,j))?'Downloading exposures… the mosaic appears once one time covers at least 80% of the field.':b?.discovered&&!busy&&!b.jobs.some(j=>isStop(b,j))?'No image at '+b.wave.toFixed(2)+' µm covers at least 80% of this field. Try another wavelength, a wider search width, a longer scene span or a smaller tile width.':mosaic?.reason??(region?'Press Retrieve images to load this field.':'Choose a target, then retrieve its images.'));
      q('#sate-frame-quality').textContent=mosaic?.reason??'';q('#sate-frame-meta').textContent='';
    }
  }
  function stop(){clearInterval(timer);timer=null;q('#sate-play').textContent='Play';q('#sate-play').setAttribute('aria-label','Play observations');}
  function cancel(){generation++;controller?.abort();controller=null;busy=false;stop();if(active){if(active.searching&&!active.discovered)active.error='Search stopped. Retrieve images to try again.';active.searching=false;for(const j of active.jobs)if(j.status==='loading')j.status='pending';}}
  function selected(){return active?.jobs[active.index]??null;}
  function render(){
    const b=active,jobs=b?.jobs??[],job=selected(),frames=jobs.filter(j=>j.status==='ready'),failed=jobs.filter(j=>j.status==='failed'),unavailable=jobs.filter(j=>j.status==='unavailable'),skipped=jobs.filter(j=>j.status==='skipped'),stops=b?jobs.filter(j=>isStop(b,j)):[];
    const checked=frames.length+failed.length+unavailable.length+skipped.length;
    q('#sate-wavelength-value').textContent=Number(wave.value).toFixed(2)+' µm';wave.setAttribute('aria-valuetext',Number(wave.value).toFixed(2)+' micrometres');
    q('#sate-cancel-load').hidden=!busy;q('#sate-retrieve').disabled=!region||busy;
    q('#sate-retry').hidden=busy||!jobs.some(j=>['failed','pending'].includes(j.status));
    q('#sate-retry').textContent=jobs.some(j=>j.status==='pending')?'Resume loading':'Retry failed images';
    q('#sate-retrieval-detail').textContent=b?.error||(!b?'Select a region, then retrieve the selected wavelength.':b.searching?'Finding every exposure near '+b.wave.toFixed(2)+' µm…':!jobs.length?'No observations returned for this wavelength.':(busy?'Loading '+b.wave.toFixed(2)+' µm':checked<jobs.length?'Loading stopped':'Retrieval finished')+' · '+checked+'/'+jobs.length+' checked · '+frames.length+' images · '+failed.length+' failed'+(unavailable.length?' · '+unavailable.length+' unavailable':'')+(skipped.length?' · '+skipped.length+' skipped (wavelength too far from the request)':'')+(b.cached?' · '+b.cached+' from cache':''));
    q('#sate-load-status').textContent=b?.error||(!b?(region?'Ready to retrieve':''):b.searching?'Finding observations…':(busy?'Loading · '+checked+' / '+jobs.length+' checked':'Ready')+' · '+stops.length+(b.region.mosaic?' images ('+stops.filter(j=>!j.inBand).length+' at nearby wavelengths)':' images')+(failed.length?' · '+failed.length+' download issues':''));
    q('#sate-load-status').classList.toggle('is-error',!!b?.error);q('#sate-progress').hidden=!busy;q('#sate-progress').firstElementChild.style.width=(b?.searching||!jobs.length?4:Math.max(4,100*checked/jobs.length))+'%';
    time.disabled=!jobs.length;time.min=jobs[0]?.obs.mjd??0;time.max=jobs.at(-1)?.obs.mjd??1;time.step='any';time.value=job?.obs.mjd??0;
    time.setAttribute('aria-valuetext',job?job.obs.date+'; '+job.status:'No observations loaded');
    q('#sate-date').textContent=job?job.obs.date.replace('T',' ').slice(0,16)+' UTC':'No observations loaded';
    q('label[for="sate-time"]').textContent=q('#sate-layout').value==='mosaic'?'Scene reference time':'Observation timeline';
    q('#sate-frame-count').textContent=job?'Exposure '+(b.index+1)+' / '+jobs.length+' · '+frames.length+' loaded':'0 images';
    q('#sate-time-start').textContent=jobs[0]?.obs.date.slice(0,10)??'—';q('#sate-time-end').textContent=jobs.at(-1)?.obs.date.slice(0,10)??'—';q('#sate-play').disabled=stops.length<(b?.region.mosaic?1:2);
    const ticks=q('.sky-ticks');ticks.replaceChildren();for(const j of jobs){if(b.region.mosaic&&!isStop(b,j))continue;const tick=document.createElement('i');tick.style.left=(jobs.length>1&&jobs.at(-1).obs.mjd!==jobs[0].obs.mjd?100*(j.obs.mjd-jobs[0].obs.mjd)/(jobs.at(-1).obs.mjd-jobs[0].obs.mjd):0)+'%';tick.classList.toggle('active',j===job);tick.classList.toggle('related',!!b.region.mosaic&&!j.inBand);ticks.append(tick);}
    const averaging=q('#sate-average').checked;
    q('#sate-average-hours').disabled=!averaging;q('#sate-average-wave').disabled=!averaging;
    const average=displayAverage(b,job),isMosaic=q('#sate-layout').value==='mosaic';
    q('#sate-grid-hours').disabled=!isMosaic;q('#sate-width-label').textContent=isMosaic?'Tile width':'Sky width';
    q('#sate-colour-legend').classList.toggle('is-grayscale',q('#sate-palette').value==='grayscale');
    q('#sate-colour-note').textContent=(q('#sate-palette').value==='grayscale'?'Grayscale':'False colour')+' · shared brightness scale';
    const frame=average?.frame??job?.frame;canvas.hidden=!frame;q('#sate-image-empty').hidden=!!frame;
    if(frame){drawAligned(canvas,frame,b.stretch,q('#sate-palette').value);const actual=Number.isFinite(frame.wavelength)?frame.wavelength.toFixed(3)+' µm':'not available';
      q('#sate-image-caption').textContent=job.obs.date.slice(0,10)+' · actual λ '+actual+(frame.aligned?' · N ↑ E ←':' · unaligned image');
      q('#sate-frame-meta').textContent=job.obs.date.replace('T',' ').slice(0,19)+' UTC · actual λ '+actual+' · '+(frame.aligned?'north up, east left':'unaligned detector view')+' · '+job.obs.id;
      const notes=[];if(Number.isFinite(frame.wavelength)&&Math.abs(frame.wavelength-b.wave)>b.region.tolerance)notes.push('Actual wavelength differs from the search setting; shown as requested.');
      notes.push(Math.round(frame.coverage*100)+'% finite pixel coverage.');if(frame.flaggedFraction>0)notes.push(Math.round(frame.flaggedFraction*100)+'% of displayed pixels carry quality flags or unknown quality; retained.');if(!frame.aligned)notes.push('Sky alignment unavailable: '+frame.alignmentReason);
      q('#sate-frame-quality').textContent=notes.join(' ');canvas.setAttribute('aria-label','SPHEREx exposure '+job.obs.id+', '+job.obs.date+', actual wavelength '+actual);
    }else{q('#sate-image-caption').textContent=job?job.obs.date.slice(0,10):'';q('#sate-image-empty').textContent=job?(job.status==='failed'?'Download failed. Use Retry failed images.':job.status==='unavailable'?'This file has no renderable science image.': 'This exposure is still loading…'):(b?.error||(busy?'Searching the archive…':region?'Press Retrieve images to load this field.':'Choose a target, then retrieve its images.'));q('#sate-frame-meta').textContent=job?job.obs.date+' · '+job.obs.id:'';q('#sate-frame-quality').textContent=job?.reason??'';}
    q('#sate-average-details').hidden=!average?.frame;
    if(average?.frame){
      const count=average.members.length,span=((average.endMjd-average.startMjd)*24).toFixed(2),waves=average.centreWaveMin.toFixed(4)+'–'+average.centreWaveMax.toFixed(4)+' µm';
      q('#sate-image-caption').textContent='Average of '+count+' exposures · '+span+' h span · actual centre λ '+waves+(busy?' · still loading':'');
      q('#sate-frame-meta').textContent=date(average.startMjd).replace('T',' ').slice(0,19)+' to '+date(average.endMjd).replace('T',' ').slice(0,19)+' UTC · north up, east left';
      q('#sate-frame-quality').textContent=Math.round(frame.coverage*100)+'% coverage with at least two valid measurements · '+average.minCount+'–'+average.maxCount+' exposures per displayed pixel · '+average.rejected+' outlier samples rejected.';
      q('#sate-average-meta').textContent='Inverse-variance weighted average; 5σ outlier rejection when at least three samples are available. Actual wavelengths across all contributing pixels: '+average.waveMin.toFixed(4)+'–'+average.waveMax.toFixed(4)+' µm. Contrast matches the original exposures.';
      q('#sate-average-members').replaceChildren(...average.members.map(j=>{const li=document.createElement('li');li.textContent=j.obs.date+' · '+j.frame.wavelength.toFixed(4)+' µm · '+j.obs.id+' · '+j.obs.band+' · '+j.obs.collection;return li;}));
      canvas.setAttribute('aria-label','Average of '+count+' aligned SPHEREx exposures over '+span+' hours');
    }else if(average){q('#sate-image-caption').textContent='Original · no compatible average · '+q('#sate-image-caption').textContent;q('#sate-frame-quality').textContent=average.reason+' '+q('#sate-frame-quality').textContent;}
    q('#sate-mosaic-details').hidden=true;q('#sate-scene-coverage').textContent='';q('#sate-bands').hidden=true;
    if(isMosaic)renderMosaic(b,jobs,job);
    const issues=jobs.filter(j=>['failed','unavailable'].includes(j.status));q('#sate-details-summary').textContent='Image details'+(issues.length?' · '+issues.length+' file issues':'');q('#sate-issues').hidden=!issues.length;q('#sate-issues-summary').textContent=issues.length+' download or file issues';q('#sate-issues-list').replaceChildren(...issues.map(j=>{const li=document.createElement('li');li.textContent=j.obs.date+' · '+j.obs.id+': '+j.reason;return li;}));
  }
  async function fetchResponse(url,signal){const response=await fetch(url,{signal});if(response.ok)return response;let message='Request failed ('+response.status+').';let retryAfter=0;try{const data=await response.json();message=data.error||message;retryAfter=data.retryAfter||0;}catch{}const error=new Error(message);error.retryAfter=retryAfter;throw error;}
  function showFirstReady(b,arrived){
    if(b.userSelected)return;
    // A ready exposure may have few or no pixels at the chosen wavelength. Until the
    // user picks a time, follow the scene with the best coverage found so far.
    if(b.region.mosaic&&b.preferMjd!=null){const near=nearestStop(b,b.preferMjd);if(near>=0)b.index=near;return;}
    if(b.region.mosaic){const found=mosaicAt(b,b.jobs,arrived).frame?.coverage??0,shown=b.autoShown?b.mosaic?.frame?.coverage??0:-1;if(found>=MIN_COVERAGE&&found>shown+.05){b.index=b.jobs.indexOf(arrived);b.autoShown=true;}return;}
    if(selected()?.status!=='ready'){const first=b.jobs.findIndex(j=>j.status==='ready');if(first>=0)b.index=first;}
  }
  async function loadQueue(b,run,signal,jobs){
    const nearby=gridRows(b).map(r=>r.job).filter(j=>jobs.includes(j)),priority=new Set(nearby);
    const queue=[...nearby,...spreadOrder(jobs.filter(j=>!priority.has(j)))];let next=0;
    async function worker(){while(next<queue.length&&!signal.aborted){
      const wait=Math.max(0,(b.cooldownUntil||0)-Date.now());
      if(wait)await new Promise(resolve=>{const done=()=>{clearTimeout(id);signal.removeEventListener('abort',done);resolve();};const id=setTimeout(done,wait);signal.addEventListener('abort',done,{once:true});});
      if(signal.aborted||run!==generation)return;
      const j=queue[next++];if(!j)return;j.status='loading';
      try{const key=frameCacheKey(b.region,j.obs.path);let frame=await cachedFrame(key);if(run!==generation)return;
        if(frame)b.cached++;
        else{const p=new URLSearchParams({...b.region,wavelength:b.wave,image:j.obs.path});const response=await fetchResponse('/api/frame?'+p,signal);if(response.status===204){if(run!==generation)return;j.status='skipped';j.reason='No pixels near this wavelength in this field.';continue;}const data=await response.arrayBuffer();if(run!==generation)return;
          try{const image=parseSpectralImage(data);try{frame=alignImage(image,b.grid,b.wave,b.region.tolerance,{showAll:true});}catch(e){frame=rawDetectorFrame(image,e.message);}}
          catch(e){j.status='unavailable';j.reason=e.message;continue;}
          await cacheFrame(key,frame);
        }
        if(run!==generation)return;j.frame=frame;j.inBand=b.region.mosaic?inBand(b,frame):1;j.inRelated=b.region.mosaic&&!j.inBand?inBand(b,frame,b.region.tolerance*RELATED):0;b.revision=(b.revision??0)+1;j.status='ready';j.reason='';if(!b.hasStretch){b.stretch=stretchFor(b,[frame]);b.hasStretch=b.stretch.samples>0;}showFirstReady(b,j);
      }catch(e){if(run!==generation)return;j.status=signal.aborted?'pending':'failed';j.reason=e.message;if(e.retryAfter)b.cooldownUntil=Date.now()+e.retryAfter*1000;}
      finally{if(run===generation)render();}
    }}await Promise.all(Array.from({length:b.region.mosaic?2:3},worker));
  }
  async function activate(){
    if(!region)return;cancel();hasRetrieved=true;if(matchMedia('(max-width:900px)').matches&&!root.classList.contains('is-panel-closed'))q('#sate-panel-toggle').click();
    const mosaic=q('#sate-layout').value==='mosaic',tileSize=Number(q('#sate-cutout-size').value);
    const setting={...region,size:tileSize*(mosaic?3:1),tolerance:Number(q('#sate-wave-tolerance').value),...(mosaic?{mosaic:true}:{})},wavelength=Number(wave.value),key=JSON.stringify([setting,wavelength]);
    active=sequences.get(key)??{wave:wavelength,region:setting,grid:createSkyGrid(setting.ra,setting.dec,setting.size,mosaic?3*Math.max(32,Math.min(80,Math.ceil(tileSize*3600/6.2))):undefined),jobs:[],discovered:false,searching:false,error:'',index:0,cached:0,stretch:{low:0,high:1},hasStretch:false,userSelected:false};sequences.set(key,active);
    const b=active,run=generation;controller=new AbortController();const signal=controller.signal;busy=true;b.error='';render();
    if(!b.discovered){b.searching=true;render();try{const p=new URLSearchParams({...setting,wavelength});const response=await fetchResponse('/api/observations?'+p,signal),result=await response.json();if(run!==generation)return;if(!result.complete)throw new Error('The archive returned an incomplete search.');b.jobs=result.observations.map(obs=>({obs,status:'pending'}));b.discovered=true;
      if(cursorMjd!=null&&b.jobs.length){b.index=nearestStop(b,cursorMjd,true);if(mosaic)b.preferMjd=cursorMjd;else b.userSelected=true;}
    }catch(e){if(run!==generation)return;b.error=e.message;busy=false;b.searching=false;render();return;}b.searching=false;render();}
    // Failed requests retry after the rest of the sequence, so one slow file
    // cannot hold up the first pass through all available observations.
    for(let pass=0;pass<3&&run===generation;pass++){
      const remaining=b.jobs.filter(j=>j.status==='pending'||j.status==='failed');if(!remaining.length)break;
      if(pass)await new Promise(resolve=>setTimeout(resolve,1000*pass));
      if(run!==generation)return;await loadQueue(b,run,signal,remaining);
    }
    if(run!==generation)return;busy=false;b.stretch=stretchFor(b,b.jobs.filter(j=>j.frame).map(j=>j.frame));render();
  }
  function chooseIndex(index){if(!active?.jobs.length||index<0)return;active.index=Math.max(0,Math.min(active.jobs.length-1,index));active.userSelected=true;cursorMjd=selected().obs.mjd;render();}
  for(const id of ['#sate-average','#sate-average-hours','#sate-average-wave','#sate-grid-hours','#sate-palette'])q(id).onchange=()=>{stop();render();};
  q('#sate-layout').onchange=()=>{cancel();active=null;render();if(hasRetrieved)activate();};
  q('#sate-retrieve').onclick=activate;q('#sate-retry').onclick=activate;
  q('#sate-cancel-load').onclick=()=>{cancel();if(active)active.stretch=stretchFor(active,active.jobs.filter(j=>j.frame).map(j=>j.frame));render();};
  function wavelengthChanged(){clearTimeout(waveTimer);if(active&&Number(wave.value)===active.wave)return;cancel();active=null;render();if(hasRetrieved)activate();}
  wave.oninput=()=>{q('#sate-wavelength-value').textContent=Number(wave.value).toFixed(2)+' µm';clearTimeout(waveTimer);waveTimer=setTimeout(wavelengthChanged,450);};wave.onchange=wavelengthChanged;
  for(const control of [q('#sate-wave-tolerance'),q('#sate-cutout-size')])control.onchange=()=>{cancel();active=null;render();if(hasRetrieved)activate();};
  time.oninput=()=>{stop();const value=Number(time.value);if(active?.jobs.length)chooseIndex(nearestStop(active,value));};
  time.onkeydown=e=>{if(!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End'].includes(e.key)||!active?.jobs.length)return;e.preventDefault();stop();const order=active.jobs.map((j,i)=>!active.region.mosaic||isStop(active,j)?i:-1).filter(i=>i>=0),forward=['ArrowRight','ArrowUp'].includes(e.key);chooseIndex(e.key==='Home'?order[0]??-1:e.key==='End'?order.at(-1)??-1:(forward?order.find(i=>i>active.index):order.findLast(i=>i<active.index))??-1);};
  q('#sate-play').onclick=()=>{if(timer){stop();return;}const ready=active.jobs.map((j,i)=>isStop(active,j)?i:-1).filter(i=>i>=0);if(active.index>=ready.at(-1)){active.focusBand=null;chooseIndex(ready[0]);}q('#sate-play').textContent='Pause';q('#sate-play').setAttribute('aria-label','Pause observations');timer=setInterval(playStep,active.region.mosaic?550:800);};
  const viewer=q('#sate-viewer'),expand=q('#sate-expand');
  let savedOverflow='',outside=[];
  function expandViewer(value){
    viewer.classList.toggle('is-expanded',value);expand.setAttribute('aria-expanded',String(value));expand.textContent=value?'Exit full screen':'Full screen';
    if(value){savedOverflow=document.body.style.overflow;document.body.style.overflow='hidden';outside=[...root.querySelectorAll('.sky-bar,.sky-panel,#sate-image-details')].map(el=>[el,el.inert]);for(const [el] of outside)el.inert=true;}
    else{document.body.style.overflow=savedOverflow;for(const [el,inert] of outside)el.inert=inert;outside=[];expand.focus();}
  }
  expand.onclick=()=>expandViewer(!viewer.classList.contains('is-expanded'));
  viewer.addEventListener('keydown',event=>{
    if(!viewer.classList.contains('is-expanded'))return;
    if(event.key==='Escape'){event.preventDefault();expandViewer(false);}
    if(event.key==='Tab'){const focusable=[...viewer.querySelectorAll('button,input,select,summary')].filter(el=>!el.disabled&&el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  });
  document.addEventListener('visibilitychange' ,()=>{if(document.hidden)stop();});render();
  return {selectRegion(value){clearTimeout(waveTimer);cancel();region={ra:value.ra,dec:value.dec};sequences.clear();active=null;hasRetrieved=false;cursorMjd=null;render();}};
}
