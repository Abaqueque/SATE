// Presentation-only review states requested for the atlas walkthrough.
// This deterministic overlay does not read/write the scientific review notebook.
export const REVIEW_COLOURS={
 unreviewed:{label:'Unreviewed',stroke:'rgba(235,102,102,.46)',fill:'rgba(235,91,91,.085)',dot:'#eb6666'},
 reviewed:{label:'Reviewed',stroke:'rgba(92,204,146,.48)',fill:'rgba(71,194,133,.09)',dot:'#5ccc92'},
 followup:{label:'Needs further review',stroke:'rgba(244,176,75,.52)',fill:'rgba(240,163,60,.105)',dot:'#f4b04b'}
};
export function reviewGridState(id,order){const h=((Math.imul(id+1,2654435761)^Math.imul(order+11,1597334677))>>>0)%10;return h<5?'unreviewed':h<8?'reviewed':'followup';}
export function reviewGridStyle(id,order){const c=REVIEW_COLOURS[reviewGridState(id,order)];return {color:c.stroke,fill:true,fillColor:c.fill,lineWidth:.8,hoverColor:'#d4e4f4',selectionColor:'#b6d2f7',selectionLineWidth:1.3};}
export function reviewGridLegend(){return `<div class="sky-review-legend" aria-label="Review colours">${Object.values(REVIEW_COLOURS).map(c=>`<span><i style="background:${c.dot}" aria-hidden="true"></i>${c.label}</span>`).join('')}</div>`;}
// Do not close a filled screen polygon across the all-sky projection's seam.
export function continuousSkyPolygon(vertices,project,width){
 let previous;for(const [ra,dec] of vertices){let pixel;try{pixel=project(ra,dec);}catch{return false;}if(!pixel||!pixel.every(Number.isFinite))return false;if(previous&&Math.abs(pixel[0]-previous[0])>width/2)return false;previous=pixel;}return true;
}
