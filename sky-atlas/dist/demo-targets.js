import {targetCatalogue,predictPosition} from './targets.js';
import {cellAt} from './sky-model.js';
import {motionExampleUrl} from './motion-examples.js';
// Use the existing SIMBAD snapshot and a documented survey-era query centre.
// The query centre stays fixed for the entire exposure sequence.
export const demoTargets=[...targetCatalogue.slice(0,5).map((t,i)=>{
  const supplied=t.name==='WISE 0855';
  const position=supplied?{ra:15*(8+55/60+10.831/3600),dec:-(7+14/60+42.53/3600)}:predictPosition(t,'2026-01-01T00:00:00Z');
  return {...t,...position,id:String(i),size:supplied||i===0?.2:.12,
    positionNote:supplied?'User-supplied position: 08h55m10.831s, −07°14′42.53″. Wider 0.20° field accommodates motion; the query centre stays fixed.':
      'Fixed query centre predicted for 1 January 2026 from the existing SIMBAD J2000 position and linear proper motion. No parallax correction.',
    description:t.name==='Epsilon Indi B'?'Unresolved brown-dwarf pair; the display does not resolve or separately measure its components.':t.kind==='motion'?'Proper-motion target; compare movement against a fixed background.':'Variable-star target; display brightness alone is not calibrated photometry.'};
}),
  {id:'5',name:'Orion Nebula',ra:83.8221,dec:-5.3911,wave:3.29,size:.30,kind:'extended',
    positionNote:'Fixed Orion Nebula landmark coordinates from the existing project presets.',
    description:'A 0.30° field centred on the Orion Nebula core; the full nebula extends beyond this view.'},
  {id:'6',name:'Galactic Centre',ra:266.4168,dec:-29.0078,wave:4.678,size:.30,kind:'extended',
    positionNote:'Fixed Galactic Centre landmark coordinates from the existing project presets.',
    description:'A 0.30° field in the central Milky Way. Crowding and diffuse emission complicate source comparisons.'},
  {id:'7',name:'Andromeda',ra:10.6847,dec:41.269,wave:1.286,size:.35,kind:'extended',
    positionNote:'Fixed Andromeda landmark coordinates from the existing project presets.',
    description:'A 0.35° field around the galaxy nucleus; the full galaxy extends far beyond this cutout.'},
];

export const demoTarget=id=>demoTargets.find(target=>target.id===id);
export function demoTargetUrl(id,metadata){
 const target=demoTarget(id);if(!target)return null;
 const channel=metadata.wavelengths.reduce((best,w,i)=>!metadata.blankFrames.includes(i)&&(best<0||Math.abs(w-target.wave)<Math.abs(metadata.wavelengths[best]-target.wave))?i:best,-1);
 if(channel<0)return null;
 const params=new URLSearchParams({hpx:cellAt(target.ra,target.dec),order:9,view:'cell',example:target.id,channel,mode:'single',sourceRa:target.ra,sourceDec:target.dec,size:target.size,framing:'full',stretch:target.kind==='extended'?'detail':'sources',zoom:target.kind==='motion'?2:1});
 if(target.kind!=='extended'){params.set('dual','1');params.set('dates','ends');params.set('known','1');}
 if(target.kind==='motion')params.set('tracking','1');
 if(target.kind==='extended')params.set('nearby','1');
 if(target.id==='0'){const motion=new URLSearchParams(motionExampleUrl('barnard').split('?')[1]);for(const key of ['target','exposure','compare','nearby'])params.set(key,motion.get(key));}
 return '/explore/?'+params;
}
