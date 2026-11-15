import * as hp from './vendor/healpix.js';
export const ORDER=9, NSIDE=512, CELL_COUNT=12*NSIDE*NSIDE;
export const CELL_ARCMIN=Math.sqrt(4*Math.PI/CELL_COUNT)*180/Math.PI*60;
const R=Math.PI/180;
export const normRA=ra=>((ra%360)+360)%360;
// Standard HEALPix NESTED angular mapping. Use face coordinates directly to
// avoid round-off in the dependency's projected-coordinate path at face seams.
export function cellAt(ra,dec,order=ORDER){
 const n=2**order,z=Math.sin(dec*R),za=Math.abs(z),tt=normRA(ra)/90;
 let face,x,y;
 if(za<=2/3){const t1=n*(.5+tt),t2=n*z*.75,jp=Math.floor(t1-t2),jm=Math.floor(t1+t2),fp=Math.floor(jp/n),fm=Math.floor(jm/n);face=fp===fm?(fp|4):fp<fm?fp:fm+8;x=jm&(n-1);y=n-(jp&(n-1))-1;}
 else {const f=Math.min(3,Math.floor(tt)),t=tt-f,v=n*Math.sqrt(3*(1-za)),jp=Math.min(n-1,Math.floor(t*v)),jm=Math.min(n-1,Math.floor((1-t)*v));if(z>=0){face=f;x=n-jm-1;y=n-jp-1;}else{face=f+8;x=jp;y=jm;}}
 return hp.fxy2nest(n,face,x,y);
}
export function center(id,order=ORDER){const a=hp.pix2ang_nest(2**order,id);return{ra:normRA(a.phi/R),dec:90-a.theta/R};}
const sky=v=>({ra:normRA(Math.atan2(v[1],v[0])/R),dec:Math.asin(Math.max(-1,Math.min(1,v[2])))/R});
export function boundary(id,order=ORDER,steps=4){const n=2**order,p=[];for(let e=0;e<4;e++)for(let i=0;i<steps;i++){const t=i/steps,[x,y]=[[t,0],[1,t],[1-t,1],[0,1-t]][e];const v=sky(hp.pixcoord2vec_nest(n,id,x,y));p.push([v.ra,v.dec]);}p.push(p[0]);return p;}
export function nearby(id){const ids=new Set([id]),eps=1e-7;for(const v of hp.corners_nest(NSIDE,id)){let e=[-v[1],v[0],0],len=Math.hypot(...e);if(len<1e-10){e=[1,0,0];len=1;}e=e.map(x=>x/len);const n=[v[1]*e[2]-v[2]*e[1],v[2]*e[0]-v[0]*e[2],v[0]*e[1]-v[1]*e[0]];for(let k=0;k<16;k++){const a=(k+.371)*Math.PI/8,w=v.map((x,i)=>x+eps*(Math.cos(a)*e[i]+Math.sin(a)*n[i]));const l=Math.hypot(...w);const p=sky(w.map(x=>x/l));ids.add(cellAt(p.ra,p.dec));}}return [...ids];}
export function visibleCells(ra,dec,fov,order){const n=2**order,ids=[];if(fov>=80)return Array.from({length:12*n*n},(_,i)=>i);hp.query_disc_inclusive_nest(n,hp.ang2vec((90-dec)*R,normRA(ra)*R),Math.min(Math.PI/2-1e-5,fov*R*.8),i=>ids.push(i));return ids;}
export const gridOrder=fov=>fov>=80?2:Math.max(0,Math.min(ORDER,Math.ceil(Math.log2(180/Math.max(.02,fov)))+2));
export const MIRA_CELL=cellAt(225.5412877,59.5224654);
export function parseSky(search){const q=new URLSearchParams(search),id=Number(q.get('hpx')),order=Number(q.get('order')??9);return q.has('hpx')&&Number.isInteger(order)&&order>=0&&order<=9&&Number.isInteger(id)&&id>=0&&id<12*4**order?{id,order}:null;}
// Aladin 3.8.1 indexes conventional HiPS cubes linearly in frequency. SPHEREx
// supplies irregular wavelength labels: use a channel-index transport coordinate,
// then label ONLY from data_cube_crval3_arr. This is not a physical frequency.
export function channelTransportHz(index){return 299792458/5.009e-6+(index+.5)/102*(299792458/.743e-6-299792458/5.009e-6);}
