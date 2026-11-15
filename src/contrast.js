// Display-only background correction. Original flux/variance arrays stay intact.
const quantile=(sorted,q)=>sorted[Math.floor((sorted.length-1)*q)];
const median=a=>quantile([...a].sort((x,y)=>x-y),.5);
export function estimateBackground(frame){
  const valid=[] , errors=[];
  for(let i=0;i<frame.values.length;i++)if(frame.quality?.[i]&&Number.isFinite(frame.values[i])){
    valid.push(frame.values[i]);if(frame.variance?.[i]>0&&Number.isFinite(frame.variance[i]))errors.push(Math.sqrt(frame.variance[i]));
  }
  if(valid.length<24)return null;
  let sample=valid,background=median(sample),sigma=0;
  for(let pass=0;pass<4;pass++){
    background=median(sample);sigma=1.4826*median(sample.map(v=>Math.abs(v-background)));
    if(!(sigma>0))break;
    const next=sample.filter(v=>Math.abs(v-background)<3*sigma);
    if(next.length<24||next.length===sample.length)break;sample=next;
  }
  // Prevent a blank/over-clipped field from acquiring effectively infinite gain.
  sigma=Math.max(sigma,errors.length?median(errors):0,Number.EPSILON);
  return {background,sigma,samples:sample.length};
}
export function createContrast(frames){
  const backgrounds=frames.map(estimateBackground);
  const usable=backgrounds.filter(Boolean);
  if(!usable.length)return {backgrounds,sigma:1,high:12};
  const sigma=median(usable.map(b=>b.sigma)),peaks=[];
  frames.forEach((f,k)=>{if(!backgrounds[k])return;const v=[];
    for(let i=0;i<f.values.length;i++)if(f.quality?.[i]&&Number.isFinite(f.values[i]))v.push(f.values[i]-backgrounds[k].background);
    v.sort((a,b)=>a-b);peaks.push(quantile(v,.995));
  });
  return {backgrounds,sigma,high:Math.max(12*sigma,median(peaks))};
}
export function contrastLevel(value,background,scale){
  if(!Number.isFinite(value))return 0;
  const excess=Math.max(0,value-background);
  const level=Math.min(1,Math.asinh(excess/(3*scale.sigma))/Math.asinh(scale.high/(3*scale.sigma)));
  // A continuous toe keeps one-sigma grain dark, without thresholding science data.
  return level*level;
}
export function drawContrast(canvas,frame,background,scale){
  canvas.width=frame.width;canvas.height=frame.height;
  const ctx=canvas.getContext('2d'),image=ctx.createImageData(frame.width,frame.height);
  for(let i=0;i<frame.values.length;i++){
    const valid=frame.quality?.[i]&&Number.isFinite(frame.values[i]);
    const value=valid?Math.round(255*contrastLevel(frame.values[i],background,scale)):10;
    image.data[i*4]=value;image.data[i*4+1]=value;image.data[i*4+2]=valid?value:13;image.data[i*4+3]=255;
  }
  ctx.putImageData(image,0,0);
}
