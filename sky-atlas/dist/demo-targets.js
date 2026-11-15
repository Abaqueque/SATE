import {targetCatalogue,predictPosition} from './targets.js';
// Use the existing SIMBAD snapshot and a documented survey-era query centre.
// The query centre stays fixed for the entire exposure sequence.
export const demoTargets=[...targetCatalogue.slice(0,5).map((t,i)=>{
  const supplied=t.name==='WISE 0855';
  const position=supplied?{ra:15*(8+55/60+10.831/3600),dec:-(7+14/60+42.53/3600)}:predictPosition(t,'2026-01-01T00:00:00Z');
  return {...t,...position,id:String(i),size:supplied?.2:.05,
    positionNote:supplied?'User-supplied position: 08h55m10.831s, −07°14′42.53″. Wider 0.20° field accommodates motion; the query centre stays fixed.':
      'Fixed query centre predicted for 1 January 2026 from the existing SIMBAD J2000 position and linear proper motion. No parallax correction.',
    description:t.name==='Epsilon Indi B'?'Unresolved brown-dwarf pair; the display does not resolve or separately measure its components.':t.kind==='motion'?'Proper-motion target; compare movement against a fixed background.':'Variable-star target; display brightness alone is not calibrated photometry.'};
}),
  {id:'5',name:'Orion Nebula',ra:83.8221,dec:-5.3911,wave:3.29,size:.05,kind:'extended',
    positionNote:'Fixed Orion Nebula landmark coordinates from the existing project presets.',
    description:'A 0.05° field around the bright nebular core; this is a small part of the nebula.'},
  {id:'6',name:'Galactic Centre',ra:266.4168,dec:-29.0078,wave:4.5,size:.1,kind:'extended',
    positionNote:'Fixed Galactic Centre landmark coordinates from the existing project presets.',
    description:'A 0.10° field in the central Milky Way. Crowding and diffuse emission complicate source comparisons.'},
  {id:'7',name:'Andromeda',ra:10.6847,dec:41.269,wave:1.6,size:.1,kind:'extended',
    positionNote:'Fixed Andromeda landmark coordinates from the existing project presets.',
    description:'A 0.10° field around the galaxy nucleus; the full galaxy extends far beyond this cutout.'},
];
