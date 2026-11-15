// Same tangent-plane footprint as the fixed north-up science image grid.
export function insideImageField(source,field){
 const r=Math.PI/180,d=source.dec*r,d0=field.dec*r,da=(source.ra-field.ra)*r;
 const den=Math.sin(d)*Math.sin(d0)+Math.cos(d)*Math.cos(d0)*Math.cos(da);
 if(den<=0)return false;
 const x=Math.cos(d)*Math.sin(da)/den/r,y=(Math.sin(d)*Math.cos(d0)-Math.cos(d)*Math.sin(d0)*Math.cos(da))/den/r;
 return Math.abs(x)<=field.size/2&&Math.abs(y)<=field.size/2;
}
