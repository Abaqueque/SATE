let starPromise;
function starData() { return starPromise ||= fetch('/assets/stars.json').then(r => { if (!r.ok) throw new Error('Star catalog unavailable'); return r.json(); }); }
export async function drawAtlas(canvas, options = {}) {
  if (!canvas) return;
  let stars;
  try { stars = await starData(); } catch { canvas.setAttribute('aria-label', 'Star context unavailable; region selection remains available'); return; }
  if (!canvas.isConnected) return;
  const rect = canvas.getBoundingClientRect(), width = rect.width, height = rect.height;
  if (!width || !height) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = width * dpr; canvas.height = height * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.fillStyle = '#0c1a20'; ctx.fillRect(0, 0, width, height);
  const b = options.bounds || { west: 360, east: 0, north: 90, south: -90 };
  const polar = options.polar;
  function position(ra, dec) {
    if (polar) {
      const theta = ra * Math.PI / 180, radius = (90 - dec) / 180 * width * .56;
      return [width / 2 + Math.sin(theta) * radius, height / 2 - Math.cos(theta) * radius];
    }
    return [(b.west - ra) / (b.west - b.east) * width, (b.north - dec) / (b.north - b.south) * height];
  }
  ctx.strokeStyle = '#a8b7c613'; ctx.lineWidth = .7;
  if (polar) {
    for (let i = 1; i <= 6; i++) { ctx.beginPath();ctx.arc(width/2,height/2,width*.55*i/6,0,Math.PI*2);ctx.stroke(); }
    for (let i = 0; i < 12; i++) { const a=i*Math.PI/6;ctx.beginPath();ctx.moveTo(width/2,height/2);ctx.lineTo(width/2+Math.sin(a)*width,height/2+Math.cos(a)*height);ctx.stroke(); }
  } else {
    for (let i=1;i<12;i++){ctx.beginPath();ctx.moveTo(width*i/12,0);ctx.lineTo(width*i/12,height);ctx.stroke();}
    for (let i=1;i<6;i++){ctx.beginPath();ctx.moveTo(0,height*i/6);ctx.lineTo(width,height*i/6);ctx.stroke();}
  }
  // Every plotted point is a real catalog star, not a SPHEREx detection.
  for (const [ra, dec, mag] of stars) {
    if (!polar && (ra<b.east || ra>b.west || dec<b.south || dec>b.north)) continue;
    const [x,y]=position(ra,dec);
    if (x<0 || y<0 || x>width || y>height) continue;
    const radius=Math.max(.35,(6.6-mag)*.33) * (options.bounds ? 1.5 : 1);
    const alpha=Math.min(.95,.22+(6.4-mag)*.11);
    if(mag<2.2){ctx.fillStyle=`rgba(177,191,205,${alpha*.10})`;ctx.beginPath();ctx.arc(x,y,radius*4.5,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle=`rgba(216,222,228,${alpha})`;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
    if(mag<1.5){ctx.strokeStyle=`rgba(206,216,225,${alpha*.42})`;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x-radius*3,y);ctx.lineTo(x+radius*3,y);ctx.moveTo(x,y-radius*3);ctx.lineTo(x,y+radius*3);ctx.stroke();}
  }
  if(!options.bounds&&!polar){
    const labels=[['ORION',85,-6],['CYGNUS',305,42],['URSA MAJOR',165,56],['SCORPIUS',246,-32],['CASSIOPEIA',25,62],['SOUTHERN CROSS',186,-62],['PEGASUS',340,20]];
    ctx.font='8px ui-monospace,monospace';ctx.fillStyle='#9dabb950';ctx.textAlign='center';
    for(const [label,ra,dec]of labels){const[x,y]=position(ra,dec);ctx.fillText(label,x,y+16);}
  }
}
