// 信義街景漫遊：投影、地面高程、牆面、碰撞與道路條帶檢查。
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {project,unproject,buildHeightField,toLocal,linearColors,buildColliders,buildStreetBase,nearestStreet,spawnPoint} from '../dist/xinyi-street-world.js';
import {buildDistrictBatch} from '../dist/geo-district.js';
import {focusedBuilding,buildXinyiDetail,inFocus} from '../dist/geo-xinyi-detail.js';
import {buildStreetDetail} from '../dist/geo-street-detail.js';
const load=f=>fs.readFile(new URL('../dist/assets/'+f,import.meta.url),'utf8').then(JSON.parse);
const [district,streets]=await Promise.all([load('district-xinyi.json'),load('streets-xinyi.json')]);

// 投影：往返誤差 < 1 mm；界框約 1 km 見方。
const [lon,lat]=unproject(...project(121.5671,25.0355));assert.ok(Math.abs(lon-121.5671)<1e-8&&Math.abs(lat-25.0355)<1e-8);
const [x0,z1]=project(district.bbox[0],district.bbox[1]),[x1,z0]=project(district.bbox[2],district.bbox[3]);
assert.ok(Math.abs(x1-x0-1009)<15&&Math.abs(z1-z0-995)<15,`bbox ${x1-x0} x ${z1-z0}`);

// 地面高程：介於官方牆腳高程範圍內。
const ground=buildHeightField(district.buildings,district.bbox);let lo=Infinity,hi=-Infinity;
for(const b of district.buildings)for(const w of b.walls){lo=Math.min(lo,w.a[2]);hi=Math.max(hi,w.a[2]);}
for(const v of ground.h)assert.ok(v>=lo-0.01&&v<=hi+0.01&&Number.isFinite(v));

// 建物：直接使用 GIS 頁的建構函式；本地轉換只改座標系，不增刪頂點，且公尺距離與原經緯度一致。
const refined=district.buildings.filter(focusedBuilding),basic=district.buildings.filter(b=>!focusedBuilding(b));
assert.equal(refined.length,316,'same refined set as GIS page');
const batch=buildDistrictBatch(basic),detail=buildXinyiDetail(refined,{arcade:false,attStudy:false});
for(const built of [batch,detail]){const local=toLocal(built.position,ground);assert.equal(local.length,built.position.length);assert.equal(linearColors(built.color).length,built.position.length);
 for(let i=0;i<local.length;i+=3)assert.equal(local[i+1],Math.fround(built.position[i+2]));
 const i=3*Math.floor(local.length/6),d1=Math.hypot(local[i]-local[0],local[i+2]-local[2]),[x,z]=project(built.position[i],built.position[i+1]),[x0,z0]=project(built.position[0],built.position[1]);assert.ok(Math.abs(d1-Math.hypot(x-x0,z-z0))<.01);}
const quads=batch.faces.length/3+Object.values(detail.groups).reduce((n,f)=>n+f.length/3,0);
// 碰撞：圓不能停留在牆內；空曠道路上不受影響。
const col=buildColliders(district.buildings,ground);assert.ok(col.count>5000);
const [ax,az,bx,bz]=col.segs[100],mx=(ax+bx)/2,mz=(az+bz)/2,p=col.resolve(mx,mz,.38);
assert.ok(p.hit);for(const [sx,sz,ex,ez] of col.segs){const dx=ex-sx,dz=ez-sz,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((p.x-sx)*dx+(p.z-sz)*dz)/l2));const d=Math.hypot(p.x-sx-dx*t,p.z-sz-dz*t);if(d<.3)assert.fail('still inside wall '+d);}
const spawn=spawnPoint(streets.features);assert.equal(spawn.road,'松智路');assert.equal(col.resolve(spawn.x,spawn.z,.38).hit,false,'spawn is clear');
assert.equal(nearestStreet(streets.features,spawn.x,spawn.z),'松智路');

// 道路：與 GIS 頁基本路面相同高度（人行道 0.12 m、其他 0.025 m 離地）與配色；精修鋪面頂點數與 GIS 頁相同。
const base=buildStreetBase(streets.features,ground,inFocus);let roadVertices=0;
assert.deepEqual([...new Set(base.map(g=>g.color))].sort(),['#30363a','#41474b','#657f79','#aaa99f','#b9b6ab']);
for(const g of base){roadVertices+=g.position.length/3;assert.ok(g.index.every(i=>i<g.position.length/3));for(let i=0;i<g.position.length;i+=3){const d=g.position[i+1]-ground.at(g.position[i],g.position[i+2]);assert.ok(Math.abs(d-(g.raised?.12:.025))<1e-3);}}
const surface=buildStreetDetail(streets.features),draped=toLocal(surface.position,ground,true);assert.equal(draped.length,surface.position.length);
console.log(`Xinyi street: ${quads} GIS-builder triangles, ${col.count} colliders, ${roadVertices} road vertices; same builders as GIS page, projection, collision and draping passed.`);
