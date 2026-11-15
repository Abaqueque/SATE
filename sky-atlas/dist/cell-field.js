// Field widths are square sky spans in degrees, matching the archive API limits.
export const DEFAULT_FIELD_WIDTH=.2;
export function fieldWidth(value){
 const width=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN;
 return Number.isFinite(width)&&width>=.01&&width<=.35?width:DEFAULT_FIELD_WIDTH;
}
