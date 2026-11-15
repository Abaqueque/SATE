// Coverage is measured on the fixed full field, before cropping, quality masks,
// wavelength masks or gap repair. Those display choices cannot qualify a frame.
export const MIN_FIELD_COVERAGE=.8;
export function hasFieldCoverage(info){return Number.isFinite(info.coverage)&&info.coverage>=MIN_FIELD_COVERAGE;}
export class InsufficientCoverageError extends Error{
 constructor(coverage){super(`Only ${Math.round(coverage*100)}% of the full field is covered; at least 80% is required.`);this.name='InsufficientCoverageError';this.coverage=coverage;}
}
export function requireFrameCoverage(frame){
 const values=frame.raw.values;let covered=0;
 for(const value of values)if(Number.isFinite(value))covered++;
 const coverage=values.length?covered/values.length:0;
 if(coverage<MIN_FIELD_COVERAGE)throw new InsufficientCoverageError(coverage);
 return frame;
}
