// Local intensity centroid on original aligned pixels. Never use repaired or
// denoised display pixels. A failed match is left missing rather than predicted.
export function centroidNear(frame,seed,radius=5){
 const {width,height,values}=frame,valid=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&Number.isFinite(values[y*width+x]);
 const sample=[];let peak=null,best=-Infinity;
 for(let y=Math.max(0,Math.floor(seed.y-radius));y<=Math.min(height-1,Math.ceil(seed.y+radius));y++)for(let x=Math.max(0,Math.floor(seed.x-radius));x<=Math.min(width-1,Math.ceil(seed.x+radius));x++){
  const d=Math.hypot(x-seed.x,y-seed.y);if(d>radius||!valid(x,y))continue;sample.push(values[y*width+x]);
 }
 if(sample.length<12)return null;sample.sort((a,b)=>a-b);const bg=sample[Math.floor(sample.length*.4)],dev=sample.map(v=>Math.abs(v-bg)).sort((a,b)=>a-b),noise=Math.max(1e-12,1.4826*dev[Math.floor(dev.length*.4)]);
 for(let y=Math.max(0,Math.floor(seed.y-radius));y<=Math.min(height-1,Math.ceil(seed.y+radius));y++)for(let x=Math.max(0,Math.floor(seed.x-radius));x<=Math.min(width-1,Math.ceil(seed.x+radius));x++){
  const d=Math.hypot(x-seed.x,y-seed.y);if(d>radius||!valid(x,y))continue;const excess=values[y*width+x]-bg,score=excess*Math.exp(-d*d/(2*radius*radius));if(score>best){best=score;peak={x,y,excess};}
 }
 if(!peak||peak.excess<5*noise)return null;let sum=0,sx=0,sy=0,count=0,flagged=false;
 for(let y=peak.y-2;y<=peak.y+2;y++)for(let x=peak.x-2;x<=peak.x+2;x++)if(valid(x,y)){
  const w=Math.max(0,values[y*width+x]-bg);sum+=w;sx+=x*w;sy+=y*w;count++;if(frame.quality&&!frame.quality[y*width+x])flagged=true;
 }
 if(!sum||count<9)return null;const x=sx/sum,y=sy/sum;if(Math.hypot(x-seed.x,y-seed.y)>radius)return null;
 return{x,y,flagged};
}
