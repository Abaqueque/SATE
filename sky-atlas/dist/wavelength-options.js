// Familiar reference-band regions; each shortcut selects one real SPHEREx
// channel, not a synthetic 2MASS/WISE broadband measurement. Sources in docs.
export const COMMON_WAVELENGTHS=[
 {name:'Near J · Starlight',band:'J',target:1.235},
 {name:'Near H · Starlight',band:'H',target:1.662},
 {name:'Near Kₛ · Through dust',band:'Kₛ',target:2.159},
 {name:'Near W1 · Compare with W2',band:'W1',target:3.4},
 {name:'Near W2 · Cool objects',band:'W2',target:4.6}
];
export function wavelengthShortcuts(wavelengths,disabled=[]){
 const unavailable=new Set(disabled);
 return COMMON_WAVELENGTHS.map(preset=>{
  const index=wavelengths.reduce((best,w,i)=>unavailable.has(i)||!Number.isFinite(w)?best:best<0||Math.abs(w-preset.target)<Math.abs(wavelengths[best]-preset.target)?i:best,-1);
  return {...preset,index,wavelength:wavelengths[index]};
 }).filter(preset=>preset.index>=0);
}
export function wavelengthOptions(wavelengths,{selected,disabled=[],modes=false}={}){
 const unavailable=new Set(disabled),shortcuts=wavelengthShortcuts(wavelengths,disabled);
 const common=shortcuts.map(p=>`<option value="${p.index}" title="Nearest SPHEREx channel to the ${p.band} band region; not a broadband image">${p.name} · ${p.wavelength.toFixed(3)} µm</option>`).join('');
 const all=wavelengths.map((w,i)=>`<option value="${i}"${i===selected?' selected':''}${unavailable.has(i)?' disabled':''}>${w.toFixed(3)} µm${unavailable.has(i)?' — no data':''}</option>`).join('');
 return `<optgroup label="Common wavelengths">${common}</optgroup><optgroup label="All wavelengths (${wavelengths.length})">${all}</optgroup>${modes?'<optgroup label="Other views"><option value="all">All wavelengths</option><option value="mix">Mix wavelengths</option></optgroup>':''}`;
}
