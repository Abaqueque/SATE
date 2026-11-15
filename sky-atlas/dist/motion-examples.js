import {targetCatalogue,predictPosition} from './targets.js';
import {cellAt} from './sky-model.js';
export const motionExamples=[
 {id:'barnard',name:'Barnard’s Star',target:targetCatalogue[0],channel:32,first:'2025W35_1A_0146_3',last:'2026W34_1A_0363_3'},
 {id:'kapteyn',name:'Kapteyn’s Star',target:targetCatalogue[5],channel:32,first:'2025W34_1B_0044_2',last:'2026W34_2A_0143_2'},
 {id:'groombridge',name:'Groombridge 1830',target:targetCatalogue[6],channel:32,first:'2025W20_2D_0458_1',last:'2026W21_2A_0589_2'},
 {id:'3i-atlas',name:'3I/ATLAS · 14 December 2025',centre:{ra:167.202,dec:5.1486},channel:81,first:'2025W50_2A_0685_2',last:'2025W50_2A_0712_4',curated:'/assets/motion-3i-atlas.json',source:'https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html'},
 {id:'vesta',name:'Vesta · June–July 2025',centre:{ra:216.110564,dec:-6.987388},channel:32,first:'2025W27_1A_0191_1',last:'2025W27_1A_0404_3',curated:'/assets/motion-vesta.json',source:'https://irsa.ipac.caltech.edu/applications/MOST/MOSTProgramInterface.html'},
 {id:'ceres',name:'Ceres · 22–23 December 2025',centre:{ra:8.326168,dec:-6.780154},channel:32,first:'2025W52_1A_0074_1',last:'2025W52_1A_0257_1',curated:'/assets/motion-ceres.json',source:'https://irsa.ipac.caltech.edu/applications/MOST/MOSTProgramInterface.html'},
 {id:'swan',name:'Comet SWAN · 27 October 2025',centre:{ra:314.242,dec:-5.6895},channel:52,zoom:3,first:'2025W44_1A_0045_1',last:'2025W44_1A_0045_4',curated:'/assets/motion-swan.json',source:'https://irsa.ipac.caltech.edu/applications/MOST/MOSTProgramInterface.html'},
];
export const motionExample=id=>motionExamples.find(e=>e.id===id);
export function motionExampleUrl(id){
 const e=motionExample(id);if(!e)return null;const p=e.centre||predictPosition(e.target,'2026-01-01T00:00:00Z');
 return '/explore/?'+new URLSearchParams({hpx:cellAt(p.ra,p.dec),order:9,channel:e.channel,view:'cell',mode:'single',nearby:1,tracking:1,target:e.id,framing:'full',quality:'off',exposure:e.first,compare:e.last,sourceRa:p.ra,sourceDec:p.dec,zoom:e.zoom??(e.curated?1:3)});
}
