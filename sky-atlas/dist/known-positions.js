// SIMBAD ICRS positions are at J2000; pmRA includes cos(dec), in mas/year.
// Tangent-vector propagation remains finite at the poles and across RA zero.
export function positionAt(source,mjd){
 if(!Number.isFinite(mjd)||!Number.isFinite(source.pmra)||!Number.isFinite(source.pmdec))return {...source,propagated:false};
 const r=Math.PI/180,a=source.ra*r,d=source.dec*r,t=(mjd-51544.5)/365.25,scale=t*r/3600000;
 const u=[Math.cos(d)*Math.cos(a),Math.cos(d)*Math.sin(a),Math.sin(d)];
 const east=[-Math.sin(a),Math.cos(a),0],north=[-Math.sin(d)*Math.cos(a),-Math.sin(d)*Math.sin(a),Math.cos(d)];
 const v=u.map((x,i)=>x+scale*(source.pmra*east[i]+source.pmdec*north[i]));
 return {...source,ra:(Math.atan2(v[1],v[0])/r+360)%360,dec:Math.atan2(v[2],Math.hypot(v[0],v[1]))/r,propagated:true};
}
export function sexagesimal(value,hours=false){
 const parts=String(value).match(/\d+(?:\.\d*)?/g)?.map(Number);
 if(!parts||parts.length!==3||parts[1]>=60||parts[2]>=60)throw Error('Invalid ephemeris coordinate');
 return (String(value).trim().startsWith('-')?-1:1)*(parts[0]+parts[1]/60+parts[2]/3600)*(hours?15:1);
}
export function sexagesimalParameter(value,hours=false){
 const negative=value<0,n=Math.round(Math.abs(value)/(hours?15:1)*3600*1000),a=Math.floor(n/3600000),b=Math.floor(n/60000)%60,c=(n%60000)/1000;
 return (negative?'M':'')+[String(hours?a%24:a).padStart(2,'0'),String(b).padStart(2,'0'),c.toFixed(3).padStart(6,'0')].join('-');
}
