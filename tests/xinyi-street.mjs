// 信義街景漫遊：投影、地面高程、牆面、碰撞與道路條帶檢查。
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {project,unproject,buildHeightField,buildWallArrays,buildColliders,buildRoadArrays,nearestStreet,spawnPoint} from '../dist/xinyi-street-world.js';
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

// 牆面：每面牆一個四邊形，頂點完全來自官方端點與高度；索引有效；正面朝向官方法向量。
const walls=buildWallArrays(district.buildings);let quads=0;
for(const g of [walls.low,walls.tower]){quads+=g.position.length/12;assert.equal(g.index.length,g.position.length/12*6);assert.ok(g.index.every(i=>i<g.position.length/3));}
const kept=district.buildings.reduce((n,b)=>n+b.walls.filter(w=>{const [ax,az]=project(w.a[0],w.a[1]),[bx,bz]=project(w.b[0],w.b[1]);return Math.hypot(bx-ax,bz-az)>=0.05&&w.h>=0.2;}).length,0);
assert.equal(quads,kept);
{const g=walls.low,b=district.buildings.find(b=>b.walls.length>3),w=b.walls[0];// 抽查第一面牆的三角形法向量
 const [ax,az]=project(w.a[0],w.a[1]);let k=0;for(;k<g.position.length;k+=12)if(Math.abs(g.position[k]-ax)<1e-6&&Math.abs(g.position[k+2]-az)<1e-6)break;
 const q=k/3,tri=g.index.slice(g.index.indexOf(q),g.index.indexOf(q)+3).map(i=>[g.position[i*3],g.position[i*3+1],g.position[i*3+2]]);
 const u=tri[1].map((v,i)=>v-tri[0][i]),v=tri[2].map((v,i)=>v-tri[0][i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 assert.ok(n[0]*w.n[0]+n[2]*-w.n[1]>0,'wall faces outward');}
assert.equal(walls.roof.position.length,district.buildings.reduce((n,b)=>n+b.roofs.length,0)*3);

// 碰撞：圓不能停留在牆內；空曠道路上不受影響。
const col=buildColliders(district.buildings,ground);assert.ok(col.count>5000);
const [ax,az,bx,bz]=col.segs[100],mx=(ax+bx)/2,mz=(az+bz)/2,p=col.resolve(mx,mz,.38);
assert.ok(p.hit);for(const [sx,sz,ex,ez] of col.segs){const dx=ex-sx,dz=ez-sz,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((p.x-sx)*dx+(p.z-sz)*dz)/l2));const d=Math.hypot(p.x-sx-dx*t,p.z-sz-dz*t);if(d<.3)assert.fail('still inside wall '+d);}
const spawn=spawnPoint(streets.features);assert.equal(spawn.road,'松智路');assert.equal(col.resolve(spawn.x,spawn.z,.38).hit,false,'spawn is clear');
assert.equal(nearestStreet(streets.features,spawn.x,spawn.z),'松智路');

// 道路：只使用來源路段，無車道標線類別；頂點貼合地面上方 0.2 m 內。
const roads=buildRoadArrays(streets.features,ground);
assert.deepEqual(Object.keys(roads).sort(),['crossing','cycle','road','sidewalk','walk','zebra']);
for(const g of Object.values(roads)){assert.ok(g.index.every(i=>i<g.position.length/3));for(let i=0;i<g.position.length;i+=3){const d=g.position[i+1]-ground.at(g.position[i],g.position[i+2]);assert.ok(d>0&&d<.2);}}
console.log(`Xinyi street: ${quads} official wall quads, ${col.count} colliders, ${Object.values(roads).reduce((n,g)=>n+g.position.length/3,0)} road vertices; projection, outward faces, collision and draping passed.`);
