const stops=[[0,[3,3,12]],[.18,[27,14,72]],[.4,[72,58,178]],[.62,[35,187,205]],[.82,[255,176,78]],[1,[255,247,218]]];
export function falseColour(value){
 const v=Math.max(0,Math.min(1,value));
 for(let i=1;i<stops.length;i++)if(v<=stops[i][0]){
  const [a,left]=stops[i-1],[b,right]=stops[i],f=(v-a)/(b-a);
  return left.map((channel,j)=>Math.round(channel+(right[j]-channel)*f));
 }
 return stops.at(-1)[1];
}
export function colourize(canvas){
 const ctx=canvas.getContext('2d'),image=ctx.getImageData(0,0,canvas.width,canvas.height);
 for(let i=0;i<image.data.length;i+=4){if(!image.data[i+3])continue;const rgb=falseColour(image.data[i]/255);image.data[i]=rgb[0];image.data[i+1]=rgb[1];image.data[i+2]=rgb[2];}
 ctx.putImageData(image,0,0);
}
// Infer the exposure footprint from raw finite row spans, before quality or
// wavelength masking. Enclosed bad pixels must not shrink the sky framing.
export function sharedCoverageCrop(frames,pixels){
 const full={x:0,y:0,size:pixels};if(!frames.length)return full;
 const spans=frames.map(frame=>Array.from({length:pixels},(_,y)=>{
  let left=pixels,right=-1;
  for(let x=0;x<pixels;x++)if(Number.isFinite(frame.values[y*pixels+x])){left=Math.min(left,x);right=x;}
  return[left,right];
 }));
 // Keep the same sky centre and pixel parity in both panes.
 for(let size=pixels;size>=Math.min(8,pixels);size-=2){
  const start=(pixels-size)/2,end=start+size-1;
  if(spans.every(rows=>rows.slice(start,end+1).every(([left,right])=>left<=start&&right>=end)))return{x:start,y:start,size};
 }
 return{...full,partial:true};
}
