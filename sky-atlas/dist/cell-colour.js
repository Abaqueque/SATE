// Tint display pixels only. Preserve linear-sRGB luminance and transparency;
// the underlying scientific arrays and grayscale render are never modified.
const linear=value=>{const v=value/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
const encoded=value=>Math.round(255*(value<=.0031308?12.92*value:1.055*value**(1/2.4)-.055));
const weights=[.2126,.7152,.0722],palettes=new Map();
export function parseLayerHue(value){
 if(value===null||value===undefined||String(value).trim()==='')return null;
 const hue=Number(value);return Number.isInteger(hue)&&hue>=0&&hue<360?hue:null;
}
function palette(hue){
 if(palettes.has(hue))return palettes.get(hue);
 const sector=hue/60,x=1-Math.abs(sector%2-1);
 const rgb=sector<1?[1,x,0]:sector<2?[x,1,0]:sector<3?[0,1,x]:sector<4?[0,x,1]:sector<5?[x,0,1]:[1,0,x];
 const colour=rgb.map(v=>linear(v*255)),luminance=colour.reduce((sum,v,i)=>sum+v*weights[i],0),table=new Uint8ClampedArray(256*3);
 for(let value=0;value<256;value++){
  const light=linear(value),chroma=.85*Math.min(light/luminance,(1-light)/(1-luminance));
  for(let channel=0;channel<3;channel++)table[value*3+channel]=encoded(Math.max(0,Math.min(1,light+chroma*(colour[channel]-luminance))));
 }
 palettes.set(hue,table);if(palettes.size>24)palettes.delete(palettes.keys().next().value);return table;
}
export function tintGrayscale(pixels,hue){
 const result=new Uint8ClampedArray(pixels),valid=parseLayerHue(hue);if(valid===null)return result;
 const table=palette(valid);
 for(let i=0;i<result.length;i+=4){if(!result[i+3])continue;const index=pixels[i]*3;result[i]=table[index];result[i+1]=table[index+1];result[i+2]=table[index+2];}
 return result;
}
