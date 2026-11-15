// Aladin pixels are relative to its image viewport, below the search bar.
export function viewportPoint(point, viewport, container){
 return point?.every(Number.isFinite)?[point[0]+viewport.left-container.left,point[1]+viewport.top-container.top]:null;
}
