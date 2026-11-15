import {CELL_COUNT,center,boundary} from './sky-model.js';

export function cellInvestigation(id,wave=3.293){
  if(!Number.isInteger(id)||id<0||id>=CELL_COUNT)throw Error('Invalid search cell');
  const c=center(id),r=Math.PI/180;
  const radius=Math.max(...boundary(id,9,16).map(([ra,dec])=>Math.acos(Math.max(-1,Math.min(1,Math.sin(c.dec*r)*Math.sin(dec*r)+Math.cos(c.dec*r)*Math.cos(dec*r)*Math.cos((ra-c.ra)*r))))/r));
  return{cellId:id,id:'cell-'+id,name:'Search cell '+id,...c,wave,autoLoad:true,size:Math.min(.35,Math.max(.05,Math.ceil(radius*2.04*10000)/10000)),
    positionNote:'Fixed centre and surrounding field of HEALPix cell '+id+'. The square image includes a margin around the cell.',
    description:'The observation index records exposures covering the cell centre; it does not establish coverage of every pixel or a completed scientific review.'};
}

