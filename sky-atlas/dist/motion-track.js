import {motionExamples,motionExample,motionExampleUrl} from './motion-examples.js';
import {centroidNear} from './motion-centroid.js';
import {targetCatalogue,predictPosition} from './targets.js';
import {cellAt} from './sky-model.js';
export function skyAtPixel(grid,x,y){
 const r=Math.PI/180,xi=-(x+.5-grid.pixels/2)*grid.size/grid.pixels*r,eta=-(y+.5-grid.pixels/2)*grid.size/grid.pixels*r,d=grid.dec*r,a=grid.ra*r,den=Math.cos(d)-eta*Math.sin(d);
 return {ra:((a+Math.atan2(xi,den))/r+360)%360,dec:Math.atan2(Math.sin(d)+eta*Math.cos(d),Math.hypot(den,xi))/r};
}
export function motionStats(points){
 const sorted=[...points].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));if(sorted.length<2)return null;
 const a=sorted[0],b=sorted.at(-1),r=Math.PI/180,da=((b.ra-a.ra+540)%360-180)*r,dd=(b.dec-a.dec)*r;
 const h=Math.sin(dd/2)**2+Math.cos(a.dec*r)*Math.cos(b.dec*r)*Math.sin(da/2)**2;
 const arcsec=2*Math.asin(Math.sqrt(Math.min(1,h)))/r*3600,days=(Date.parse(b.date)-Date.parse(a.date))/86400000;
 return {arcsec,days,perYear:days>0?arcsec*365.25/days:null};
}
export function barnardExampleUrl(){return motionExampleUrl('barnard');}

export function mountMotion(root,{panes,cell,project,unproject,toPixel,toSky,getSequence,load}){
 const q=s=>root.querySelector(s),params=new URLSearchParams(location.search),key='sate-motion-points-v1-'+cell.id,events=new AbortController();
 let enabled=params.get('tracking')==='1',example=motionExample(params.get('target')),points=[],run=0,busy=false,progress='',exampleStarted=false;
 try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))points=saved.filter(p=>typeof p.path==='string'&&Number.isFinite(Date.parse(p.date))&&Number.isFinite(p.ra)&&p.ra>=0&&p.ra<360&&Number.isFinite(p.dec)&&Math.abs(p.dec)<=90).slice(-200);}catch{}
 const layers=Object.values(panes).map(panel=>{const area=panel.el.querySelector('.cell-stage'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('motion-overlay');svg.setAttribute('aria-label','Object motion positions');area.append(svg);let down;
  area.addEventListener('pointerdown',e=>{down=enabled&&e.button===0?{x:e.clientX,y:e.clientY}:null;},{signal:events.signal});
  area.addEventListener('pointerup',e=>{const start=down;down=null;if(!enabled||!start||Math.hypot(e.clientX-start.x,e.clientY-start.y)>6||!panel.current||panel.combined)return;const sky=unproject(panel,e.clientX,e.clientY);if(!sky)return;
   const point={...sky,path:panel.current.obs.path,date:panel.current.obs.date,wavelength:panel.current.obs.wavelength,method:'manual'};if(q('#motion-auto').checked){void track(point);}else{run++;busy=false;progress='';points=points.filter(p=>p.path!==point.path);points.push(point);save();draw();}},{signal:events.signal});
  return{panel,area,svg};
 });
 function save(){points=points.slice(-200);try{localStorage.setItem(key,JSON.stringify(points));}catch{}}
 async function track(anchor){
  const token=++run;busy=true;points=[];save();let seed=toPixel(anchor),misses=0,skipped=0,checked=0;seed={x:seed[0],y:seed[1]};
  const sequence=getSequence().filter(o=>Date.parse(o.date)>=Date.parse(anchor.date)).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
  for(const obs of sequence){if(token!==run)return;progress=`Tracking ${++checked} / ${sequence.length}`;draw();
   let found;try{const frame=await load(obs);if(token!==run)return;const expected=obs.expected?toPixel(obs.expected):null;found=centroidNear(frame.raw,expected?{x:expected[0],y:expected[1]}:seed,expected?3:5);}catch{}
   if(found){const sky=toSky(found.x,found.y);points.push({...sky,path:obs.path,date:obs.date,wavelength:obs.wavelength,method:'centroid',flagged:found.flagged});seed=found;misses=0;save();}
   else{misses++;skipped++;}draw();if(misses>=3){progress='Stopped after 3 missing matches';break;}
  }
  if(token!==run)return;busy=false;if(!progress.startsWith('Stopped'))progress=`Track complete${skipped?' · '+skipped+' missing matches':''}`;draw();
 }
 function draw(){
  root.classList.toggle('tracking-motion',enabled);q('#motion-mark').checked=enabled;
  const stats=motionStats(points);q('#motion-summary').textContent=stats?`${points.length} positions · ${stats.arcsec>=60?(stats.arcsec/60).toFixed(2)+'′':stats.arcsec.toFixed(2)+'″'} over ${stats.days<1/24?(stats.days*1440).toFixed(2)+' minutes':stats.days<2?(stats.days*24).toFixed(2)+' hours':stats.days.toFixed(1)+' days'}`:`${points.length} positions marked`;

  q('#motion-progress').textContent=progress+(points.some(p=>p.flagged)?' · includes flagged pixels':'');q('#motion-stop').hidden=!busy;
  q('#motion-export').disabled=!points.length;
  q('#motion-points').textContent=[...points].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).map(p=>`${p.date.slice(0,10)} · RA ${p.ra.toFixed(6)}° · Dec ${p.dec.toFixed(6)}°`).join('\n');
  for(const {panel,area,svg} of layers){svg.replaceChildren();if(!area.clientWidth||!area.clientHeight||!panel.current||panel.canvas.hidden)continue;svg.setAttribute('viewBox',`0 0 ${area.clientWidth} ${area.clientHeight}`);
   const add=(name,attrs,text)=>{const el=document.createElementNS(svg.namespaceURI,name);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);if(text)el.textContent=text;svg.append(el);return el;};
   const ordered=[...points].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).filter(p=>Date.parse(p.date)<=Date.parse(panel.current.obs.date)),xy=ordered.map(p=>project(panel,p.ra,p.dec));
   if(enabled){for(let i=1;i<xy.length;i++)if(xy[i-1]&&xy[i])add('line',{x1:xy[i-1][0],y1:xy[i-1][1],x2:xy[i][0],y2:xy[i][1],stroke:'#ffb55c','stroke-width':1.5});
    xy.forEach((p,i)=>{if(!p||(i!==0&&i!==xy.length-1))return;add('circle',{cx:p[0],cy:p[1],r:ordered[i].path===panel.path?6:4,fill:'none',stroke:i===0?'#6dffc2':'#ffb55c','stroke-width':i===0?1.5:1.25,'stroke-opacity':.4});add('text',{x:p[0]+10,y:p[1]+(i===0?20:-10),fill:i===0?'#6dffc2':'#ffcf8b','font-size':11,stroke:'#080808','stroke-width':3,'stroke-linejoin':'round','paint-order':'stroke fill'},i===0?'Start':'End');});}

  }
 }
 q('#motion-mark').onchange=e=>{enabled=e.target.checked;if(!enabled){run++;busy=false;progress='Tracking stopped';}draw();};q('#motion-auto').onchange=e=>{if(!e.target.checked){run++;busy=false;progress='Automatic tracking off';draw();}};
 q('#motion-stop').onclick=()=>{run++;busy=false;progress='Tracking stopped';draw();};
 q('#motion-clear').onclick=()=>{run++;busy=false;progress='';points=[];try{localStorage.removeItem(key);}catch{}draw();};
 q('#motion-demo').innerHTML='<option value="">Choose a motion demo…</option>'+motionExamples.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');q('#motion-demo').value=example?.id||'';q('#motion-demo').onchange=e=>{const url=motionExampleUrl(e.target.value);if(url)location.href=url;};if(example?.curated)q('#motion-example-note').innerHTML='NASA ephemeris guides the object search; the path uses image centroids. These exposures use different wavelengths. <a href="'+example.source+'" target="_blank" rel="noreferrer">Observation source ↗</a>';
 q('#motion-export').onclick=()=>{const blob=new Blob([JSON.stringify({cell:cell.id,method:'Manual seeds and local intensity centroids; approximate positions',points,summary:motionStats(points)},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sate-motion-'+cell.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 draw();return{draw,cancel(){run++;busy=false;progress='';},startExample(){if(exampleStarted||!example||!enabled||points.length)return;const first=getSequence()[0];if(!first||(example.curated&&!first.expected))return;exampleStarted=true;void track({...(first.expected||predictPosition(example.target,first.date)),path:first.path,date:first.date,method:'predicted seed'});},get enabled(){return enabled;},destroy(){run++;events.abort();for(const l of layers)l.svg.remove();}};
}
