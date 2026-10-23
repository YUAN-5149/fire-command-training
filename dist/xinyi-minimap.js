// Mini-map zoom is independent from the 3D camera and full-screen map.
export const MINI_ZOOM_LEVELS=[.125,.25,.5,.75,1,1.5,2,3,4,6,8];
export function miniZoom(value){const raw=Number(value);if(!Number.isFinite(raw)||raw<=0)return 1;const n=Math.max(MINI_ZOOM_LEVELS[0],Math.min(MINI_ZOOM_LEVELS.at(-1),raw));return MINI_ZOOM_LEVELS.reduce((a,b)=>Math.abs(b-n)<Math.abs(a-n)?b:a);}
export function stepMiniZoom(value,direction){const i=MINI_ZOOM_LEVELS.indexOf(miniZoom(value));return MINI_ZOOM_LEVELS[Math.max(0,Math.min(MINI_ZOOM_LEVELS.length-1,i+Math.sign(direction)))];}
export function miniMapMetrics({mode='walk',zoom=1,mapScale,canvasSize,displaySize}){
 if(![mapScale,canvasSize,displaySize].every(v=>Number.isFinite(v)&&v>0))throw Error('Invalid mini-map dimensions');
 const pixelRatio=canvasSize/displaySize,scale=(mode==='drive'?.55:.9)*miniZoom(zoom)*pixelRatio,pixelsPerMeter=mapScale*scale/pixelRatio;
 const target=54/pixelsPerMeter,power=10**Math.floor(Math.log10(target)),meters=[5,2,1].map(n=>n*power).find(n=>n<=target)??power;
 return {scale,pixelRatio,pixelsPerMeter,meters,barPixels:meters*pixelsPerMeter,label:meters>=1000?(meters/1000)+' km':meters+' m'};
}
