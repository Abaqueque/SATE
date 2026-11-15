const SOURCE='https://science.nasa.gov/photojournal/spherexs-dust-cloud-reveal/';
export function demoReturn(search=''){
 const value=new URLSearchParams(search).get('return');
 if(!value||!/^\/explore\/(?:\?|$)/.test(value))return '/explore/';
 const url=new URL(value,'https://sate.invalid');
 return url.origin==='https://sate.invalid'&&url.pathname==='/explore/'?url.pathname+url.search:'/explore/';
}
export function wavelengthDemoMarkup(){return `<main id="main" class="wave-demo" data-wave-demo>
<a class="wave-back" id="wave-return" href="/explore/">← Back to the atlas</a>
<div class="wave-intro"><p class="eyebrow">Interactive wavelength demo · real SPHEREx images</p><h1>Same sky.<br>A different part of the story.</h1><p>A wavelength is the spacing between light’s waves. Choosing one selects a different slice of the light arriving from space. Try these two infrared views of the same region in the Large Magellanic Cloud.</p></div>
<section class="wave-lab" aria-label="Compare infrared wavelengths">
<div class="wave-steps" aria-label="Demo views"><button type="button" data-reveal="0" aria-pressed="true"><span>01 · Starlight</span><strong>0.98 µm</strong></button><button type="button" data-reveal="100" aria-pressed="false"><span>02 · Reveal dust</span><strong>3.29 µm</strong></button><button type="button" data-reveal="50" aria-pressed="false"><span>03 · Overlay</span><strong>Compare both</strong></button></div>
<div class="wave-image" id="wave-image"><img src="/assets/wavelength-098.jpg" width="2280" height="1282" alt="At 0.98 micrometres, a dense star field is visible without the prominent dust cloud."/><img id="wave-dust" src="/assets/wavelength-329.jpg" width="2280" height="1282" alt="At 3.29 micrometres, a large branching dust cloud appears across the same star field." style="opacity:0"/><span class="wave-image-label" id="wave-image-label">0.98 µm · starlight view</span><p id="wave-image-error" hidden>Image unavailable. Reload to retry, or open the NASA source below.</p></div>
<div class="wave-controls"><label for="wave-opacity">Reveal the 3.29 µm layer <output id="wave-opacity-value">0%</output></label><input id="wave-opacity" type="range" min="0" max="100" value="0" step="1" aria-label="3.29 micrometre layer opacity"/><div class="wave-range-labels"><span>0.98 µm only</span><span>3.29 µm only</span></div><label class="wave-gray"><input id="wave-gray" type="checkbox"/> View in grayscale to compare structure</label></div>
<div class="wave-observation" role="status"><strong id="wave-observation-title">Start with the stars.</strong><p id="wave-observation-copy">Notice the bright points and the central star cluster. Now choose “Reveal dust” and look for the broad, branching cloud around the centre.</p></div>
<p class="wave-credit">NASA/JPL-Caltech · SPHEREx, April 2025 · <a href="${SOURCE}" target="_blank" rel="noreferrer">Image source &amp; science ↗</a></p>
</section>
<section class="wave-lessons" aria-label="What the difference means"><article><span>WHY IT APPEARS</span><h2>Materials leave a signature.</h2><p>The cloud contains polycyclic aromatic hydrocarbons (PAHs): soot-like molecules that emit at particular wavelengths. Their emission stands out at 3.29 µm; this cloud is not visible in the 0.98 µm image.</p></article><article><span>WHAT COLOUR MEANS</span><h2>Wavelength is data. Hue is display.</h2><p>Both views are infrared, beyond human vision. NASA assigned their visible colours. The grayscale switch removes those hues while the cloud remains. Changing a layer’s hue in SATE recolours its existing image; changing its wavelength loads a different measurement.</p></article><article><span>HOW TO USE IT</span><h2>Look for patterns across layers.</h2><p>In a cell, add a second wavelength, then toggle its visibility or opacity. Compare the same position and check each layer’s actual date. A feature appearing in one wavelength can be a clue to its composition; it does not by itself mean a new object or a change over time.</p></article></section>
<div class="wave-next"><div><h2>Try it on a cell.</h2><p>Add layer → choose another wavelength → compare the structure.</p></div><a id="wave-try" class="button lime" href="/explore/">Try wavelength layers ↗</a></div>
<details class="wave-notes"><summary>About this demonstration</summary><p>These are NASA’s published images of the same region, not the cell you currently have open. The slider blends two images; it does not simulate intermediate wavelengths. This is a visual comparison of structure, not a calibrated brightness or flux-ratio measurement. Image processing and angular resolution can also affect appearances. A longer wavelength does not make every object more visible.</p><p>µm means micrometre: one millionth of a metre. 3.29 µm is about 3.4 times the wavelength of 0.98 µm. SPHEREx samples approximately 0.75–5 µm. <a href="https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/overview.html" target="_blank" rel="noreferrer">Instrument overview ↗</a></p></details>
</main>`;}
export function mountWavelengthDemo(){
 const root=document.querySelector('[data-wave-demo]');if(!root)return ()=>{};
 const q=s=>root.querySelector(s),events=new AbortController(),on={signal:events.signal};
 const back=demoReturn(location.search);q('#wave-return').href=back;q('#wave-try').href=back;
 if(back.includes('view=cell'))q('#wave-return').textContent='← Back to your cell';
 function reveal(value){
  const n=Math.max(0,Math.min(100,Number(value)||0));q('#wave-opacity').value=n;q('#wave-opacity-value').textContent=n+'%';q('#wave-dust').style.opacity=n/100;
  q('#wave-opacity').setAttribute('aria-valuetext',n===0?'0.98 micrometres only':n===100?'3.29 micrometres only':n+' percent 3.29 micrometre overlay');
  for(const b of root.querySelectorAll('[data-reveal]'))b.setAttribute('aria-pressed',String(Number(b.dataset.reveal)===n));
  q('#wave-image-label').textContent=n===0?'0.98 µm · starlight view':n===100?'3.29 µm · dust emission':'0.98 + 3.29 µm · blended views';
  q('#wave-observation-title').textContent=n===0?'Start with the stars.':n===100?'The cloud was there all along.':'Same position, different light.';
  q('#wave-observation-copy').textContent=n===0?'Notice the bright points and the central star cluster. Now choose “Reveal dust” and look for the broad, branching cloud around the centre.':n===100?'The broad cloud now stands out around the central stars. This wavelength picks up emission from molecules in the dust. Switch back to 0.98 µm to see how much structure disappears.':'Use the slider to follow the cloud as it appears over the star field. You are blending two measured wavelengths, not watching the cloud form or move.';
 }
 q('#wave-opacity').addEventListener('input',e=>reveal(e.target.value),on);
 for(const b of root.querySelectorAll('[data-reveal]'))b.addEventListener('click',()=>reveal(b.dataset.reveal),on);
 q('#wave-gray').addEventListener('change',e=>q('#wave-image').classList.toggle('grayscale',e.target.checked),on);
 for(const img of root.querySelectorAll('.wave-image img')){const failed=()=>{q('#wave-image-error').hidden=false;};img.addEventListener('error',failed,on);if(img.complete&&!img.naturalWidth)failed();}
 reveal(0);return ()=>events.abort();
}
