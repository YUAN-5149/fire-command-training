import assert from 'node:assert/strict';
import fs from 'node:fs';
import {furnitureParts} from '../dist/xinyi-furniture.js';
import {project} from '../dist/xinyi-street-world.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+f,import.meta.url)));
const d=read('street-furniture-xinyi.json'),district=read('district-xinyi.json');
const [x0,z1]=project(district.bbox[0],district.bbox[1]),[x1,z0]=project(district.bbox[2],district.bbox[3]);
const inside=(x,z)=>x>=x0-1&&x<=x1+1&&z>=z0-1&&z<=z1+1;
// 全區設施，數量遠多於原本中心 250 m 的資料
assert(d.lamps.length>2000,'city street lights across the district');
assert(d.trees.length>300&&d.signals.length>50&&d.hydrants.length>200&&d.busStops.length>40&&d.green.length>100);
for(const [x,z,h,q] of d.lamps){assert(inside(x,z));assert(h>=3&&h<=14);assert(q>=1);}
for(const [x,z] of d.trees)assert(inside(x,z));
for(const [nx,nz,px,pz] of d.signals){assert(inside(nx,nz));assert(Math.hypot(nx-px,nz-pz)<=22,'signal pole near its junction node');}
for(const [x,z,u] of d.hydrants){assert(inside(x,z));assert(u===0||u===1);}
for(const r of d.green){assert(r.length>=6&&r.length%2===0);}
assert.match(d.source.lamps,/TaipeiLight/);assert.match(d.source.osm,/OpenStreetMap/);
// 實例：路燈桿與燈具一一對應；號誌每處三燈
const P=furnitureParts(d);
assert.equal(P.pole.length,d.lamps.length);assert.equal(P.head.length,d.lamps.length);
assert.equal(P.sigLamp.length,d.signals.length*3);
assert.equal(P.hydrant.length+P.hydMark.length,d.hydrants.length);
assert.equal(P.hydOutlet.length,P.hydrant.length);assert.equal(P.hydBase.length,P.hydrant.length);
for(const list of Object.values(P))for(const p of list)assert([p.x,p.y,p.z,p.ry,p.sx,p.sy,p.sz].every(Number.isFinite)&&p.sx>0&&p.sy>0&&p.sz>0);
console.log('furniture',Object.fromEntries(Object.entries(P).map(([k,v])=>[k,v.length])));
