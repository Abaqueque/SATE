import {ang2pix_nest,bit_decombine} from './vendor/healpix.js';
// SPHEREx's published HiPS properties: order 5, 512-pixel tiles, ICRS,
// 102 zero-based spectral planes. Within a PNG tile, the nested NE axis
// runs down rows and its NW axis across columns (HiPS tile orientation).
const ORDER=5,WIDTH=512,NSIDE=2**ORDER*WIDTH,TILE_PIXELS=WIDTH*WIDTH;
export function surveyPixel(ra,dec){
 const index=ang2pix_nest(NSIDE,(90-dec)*Math.PI/180,((ra%360+360)%360)*Math.PI/180),tile=Math.floor(index/TILE_PIXELS),{x,y}=bit_decombine(index%TILE_PIXELS);
 return {tile,offset:(x*WIDTH+y)*4};
}
export function surveyTileUrl(metadata,tile,channel){
 return `${metadata.url}/Norder${ORDER}/Dir${Math.floor(tile/10000)*10000}/Npix${tile}_${channel}.png`;
}
// This is a labelled survey rendering only. It never becomes a timeline
// exposure, a photometric measurement or a saved observation record.
export async function loadSurveyPreview(metadata,grid,channel,signal){
 if(metadata.blankFrames.includes(channel))return null;
 const mapping=[],tiles=new Map();
 for(let i=0;i<grid.coordinates.length;i+=2){const pixel=surveyPixel(grid.coordinates[i],grid.coordinates[i+1]);mapping.push(pixel);tiles.set(pixel.tile,null);}
 if(tiles.size>12)throw Error('Survey preview field is too large.');
 await Promise.all([...tiles.keys()].map(async tile=>{
  const response=await fetch(surveyTileUrl(metadata,tile,channel),{signal});if(!response.ok)throw Error('Survey preview unavailable.');
  const bitmap=await createImageBitmap(await response.blob());
  try{signal.throwIfAborted();if(bitmap.width!==WIDTH||bitmap.height!==WIDTH)throw Error('Unexpected survey tile dimensions.');const canvas=document.createElement('canvas');canvas.width=canvas.height=WIDTH;const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);tiles.set(tile,context.getImageData(0,0,WIDTH,WIDTH).data);}finally{bitmap.close();}
 }));
 signal.throwIfAborted();
 const canvas=document.createElement('canvas');canvas.width=canvas.height=grid.pixels;const context=canvas.getContext('2d'),image=context.createImageData(grid.pixels,grid.pixels);
 for(let i=0;i<mapping.length;i++){const {tile,offset}=mapping[i],source=tiles.get(tile);image.data.set(source.subarray(offset,offset+4),i*4);}
 context.putImageData(image,0,0);return canvas;
}
