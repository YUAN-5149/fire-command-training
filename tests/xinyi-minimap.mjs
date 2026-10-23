import assert from 'node:assert/strict';
import {MINI_ZOOM_LEVELS,miniZoom,stepMiniZoom,miniMapMetrics} from '../dist/xinyi-minimap.js';
assert.equal(miniZoom(undefined),1);assert.equal(miniZoom('bad'),1);assert.equal(miniZoom(Infinity),1);assert.equal(miniZoom(-5),1);assert.equal(miniZoom(1e300),8);assert.equal(miniZoom(.0001),.125);
assert.equal(stepMiniZoom(8,1),8);assert.equal(stepMiniZoom(.125,-1),.125);assert.equal(stepMiniZoom(1,1),1.5);assert.equal(stepMiniZoom(1,-1),.75);
for(const mode of ['walk','drive'])for(const displaySize of [114,134,214])for(const zoom of MINI_ZOOM_LEVELS){
 let previous=null;
 for(const dpr of [1,1.5,2]){const canvasSize=(displaySize+6)*dpr,m=miniMapMetrics({mode,zoom,mapScale:3072/7000,canvasSize,displaySize});
  assert.ok(m.meters>0&&m.barPixels>0&&m.barPixels<=54+1e-8);
  assert.ok(Math.abs(m.barPixels/m.pixelsPerMeter-m.meters)<1e-8,'scale-bar length represents its labelled meters');
  const sourceMeters=displaySize/m.pixelsPerMeter;assert.ok(Math.abs(sourceMeters-canvasSize/(3072/7000*m.scale))<1e-7,'scale matches canvas-to-CSS map transform');
  if(previous){assert.ok(Math.abs(previous.pixelsPerMeter-m.pixelsPerMeter)<1e-10,'device pixel ratio does not change visible ground extent');assert.equal(previous.label,m.label);}previous=m;
 }
}
const input={mapScale:3072/7000,canvasSize:440,displaySize:214};const walk=miniMapMetrics({...input,mode:'walk',zoom:1}),close=miniMapMetrics({...input,mode:'walk',zoom:2}),drive=miniMapMetrics({...input,mode:'drive',zoom:1});assert.equal(close.pixelsPerMeter,walk.pixelsPerMeter*2);assert.ok(drive.pixelsPerMeter<walk.pixelsPerMeter,'driving retains wider view');assert.throws(()=>miniMapMetrics({...input,displaySize:0}),/dimensions/);
console.log('Mini-map: zoom bounds, nice-distance scale bars, walk/drive ranges and consistent ground extent at 1x/1.5x/2x DPR passed.');
