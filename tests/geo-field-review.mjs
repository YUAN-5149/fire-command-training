import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildLaneReview,drapeReviewRings,buildJunctionReview,buildWaitingReview} from '../dist/geo-lane-review.js';
import {buildXinyiDetail} from '../dist/geo-xinyi-detail.js';
const roads=JSON.parse(fs.readFileSync(new URL('../dist/assets/streets-xinyi.json',import.meta.url))).features;
const saved=JSON.stringify(roads),rings=buildLaneReview(roads);assert.equal(JSON.stringify(roads),saved);assert.ok(rings.length>0);for(const r of rings){assert.deepEqual(r[0],r[4]);assert.ok(r.flat().every(Number.isFinite));for(const p of r)assert.ok(p[1]>=25.03412-1e-7&&p[1]<=25.035685+1e-7);}
assert.equal(buildLaneReview(roads.filter(r=>r.id!==1335559368)).length,0);
const buildings=JSON.parse(fs.readFileSync(new URL('../dist/assets/district-xinyi.json',import.meta.url))).buildings;
const source=JSON.stringify(buildings),candidate=buildings.find(b=>b.id===265936),mesh=buildXinyiDetail([candidate],{attStudy:true});assert.ok(mesh.groups.attMesh.length>0);assert.equal(buildXinyiDetail([candidate]).groups.attMesh.length,0);
const unrelated=buildings.filter(b=>![265936,266115,266138].includes(b.id)).slice(0,3);assert.deepEqual(buildXinyiDetail(unrelated),buildXinyiDetail(unrelated,{attStudy:true}));assert.equal(JSON.stringify(buildings),source);
for(const i of mesh.groups.attMesh){const lat=mesh.position[i*3+1];assert.ok(lat>=25.034923055-.181/110574&&lat<=25.034987861);}
const review=JSON.parse(fs.readFileSync(new URL('../dist/assets/songzhi-field-review.json',import.meta.url)));assert.equal(review.arcade.sidewalkToFloorCm,null);assert.equal(review.arcade.floorToThresholdCm,null);assert.equal(review.neighbor.buildingMatchVerified,false);assert.equal(review.road.widthMeasured,false);
console.log('Field review: bounded photo-reference double lines, unchanged roads and buildings, opt-in neighbor skin, unknown levels preserved.');

const plane={position:[121.565,25.034,10,121.566,25.034,11,121.565,25.035,12],groups:{asphalt:[0,1,2]}};
const draped=drapeReviewRings([[[121.5651,25.0341],[121.5652,25.0341],[121.5651,25.0342],[121.5651,25.0341]]],plane);assert.ok(Math.abs(draped[0][0][2]-10.306)<1e-6);assert.equal(drapeReviewRings([[[0,0]]],plane).length,0);assert.equal(drapeReviewRings(rings,null).length,0);

for(const ring of rings){let area=0;for(let i=1;i<ring.length;i++)area+=(ring[i-1][0]-121.5654)*(ring[i][1]-25.034)-(ring[i][0]-121.5654)*(ring[i-1][1]-25.034);assert.ok(area<0,"ArcGIS exterior rings must be clockwise");}

const oldRoads=JSON.stringify(roads),j=buildJunctionReview(roads);assert.equal(JSON.stringify(roads),oldRoads);assert.ok(j.dashes.length>10);assert.equal(j.arrows.length,6);assert.equal(j.stop.length,1);
for(const ring of Object.values(j).flat()){assert.deepEqual(ring[0],ring.at(-1));let area=0;for(let i=1;i<ring.length;i++)area+=(ring[i-1][0]-ring[0][0])*(ring[i][1]-ring[0][1])-(ring[i][0]-ring[0][0])*(ring[i-1][1]-ring[0][1]);assert.ok(area<0);assert.ok(ring.flat().every(Number.isFinite));for(const p of ring){assert.ok(p[1]>=25.03468-1e-8&&p[1]<=25.03570);assert.ok(Math.abs((p[0]-121.565448)*100850)<4.05);}}
assert.deepEqual(buildJunctionReview(roads.filter(r=>r.id!==1335559368)),{dashes:[],arrows:[],stop:[]});
// Southbound arrow tips must point south; northbound left tip remains west of its stem.
for(const r of j.arrows.slice(0,2))assert.ok(Math.min(...r.map(p=>p[1]))<25.03565-1.7/110574);
const review2=JSON.parse(fs.readFileSync(new URL('../dist/assets/songzhi-field-review.json',import.meta.url)));assert.equal(review2.junction.dimensionsMeasured,false);assert.equal(review2.junction.placementVerified,false);assert.equal(review2.junction.motorcycleBoxRendered,true);
console.log('Junction: clockwise rings, original source width and routes preserved, southbound arrow direction and missing measurements verified.');

const waiting=buildWaitingReview(roads);assert.ok(waiting.motorcycle.length>=20);assert.ok(waiting.grid.length>4);assert.equal(JSON.stringify(roads),oldRoads);assert.deepEqual(buildWaitingReview([]),{motorcycle:[],grid:[]});
for(const r of Object.values(waiting).flat()){assert.deepEqual(r[0],r.at(-1));let area=0;for(let i=1;i<r.length;i++)area+=(r[i-1][0]-r[0][0])*(r[i][1]-r[0][1])-(r[i][0]-r[0][0])*(r[i-1][1]-r[0][1]);assert.ok(area<0);assert.ok(r.flat().every(Number.isFinite));for(const p of r){const road=roads.find(f=>f.id===1335559368);let centre;for(const path of road.paths)for(let k=1;k<path.length;k++){const a=path[k-1],b=path[k];if(p[1]>=a[1]&&p[1]<=b[1])centre=a[0]+(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1]);}assert.ok(Number.isFinite(centre));assert.ok(Math.abs((p[0]-centre)*100850)<road.width/2);}}
const ledger=JSON.parse(fs.readFileSync(new URL('../dist/assets/songzhi-measurements.json',import.meta.url)));assert.ok(ledger.items.length>=9);for(const i of ledger.items){assert.equal(i.measured,null);assert.equal(i.verified,false);}assert.equal(review2.junction.gridTypeVerified,false);assert.equal(review2.junction.gridBoundaryVerified,false);
console.log('Waiting/grid studies: original bounds preserved; unknown measurements and grid type remain unverified.');

assert.ok(Math.max(...rings.flat().map(p=>p[1]))<25.03569,"Double yellow study must stop before the stop line");
assert.ok(rings.length>300);
const field3=JSON.parse(fs.readFileSync(new URL('../dist/assets/songzhi-field-review.json',import.meta.url)));assert.equal(field3.road.continuityVerified,false);assert.equal(field3.road.planningWidthReference.appliedToGeometry,false);assert.equal(field3.neighbor.addressReference.volumeMatchVerified,false);assert.equal(field3.neighbor.buildingMatchVerified,false);assert.equal(roads.find(f=>f.id===1335559368).width,8);

const matching=JSON.parse(fs.readFileSync(new URL('../dist/assets/att-frontage-review.json',import.meta.url)));assert.equal(matching.identityVerified,false);assert.equal(matching.dimensionsMeasured,false);assert.equal(matching.selectedWalls.length,3);assert.ok(matching.selectedWalls.every(w=>Math.max(...w.endpointDistanceM)<.3));
const {isNeighborFrontage}=await import('../dist/geo-neighbor-frontages.js');let selected=0;for(const b of buildings)for(const w of b.walls)if(isNeighborFrontage(b,w))selected++;assert.equal(selected,3);assert.equal(isNeighborFrontage(candidate,candidate.walls[5]),false);const interior={...candidate,walls:[candidate.walls[5]],roofs:[]};assert.equal(buildXinyiDetail([interior],{attStudy:true}).groups.attMesh.length,0);for(const w of matching.selectedWalls){const b=buildings.find(b=>b.id===w.buildingId);assert.deepEqual(b.walls[w.wallIndex].a,w.a);assert.ok(buildXinyiDetail([b],{attStudy:true}).groups.attMesh.length>0);}assert.equal(JSON.stringify(buildings),source);
console.log('Neighbor: exactly three source walls; interior wall excluded, identity and dimensions remain unverified.');
