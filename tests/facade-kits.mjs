// 立面構件（facade-kits.glb＋facade-kits.js）：每筆精修樣式都有構件、構件只凸出牆面、
// 擺放矩陣正交且貼在牆外、略過已有街屋精細立面的牆、數量在預算內。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {project,nearestStreet} from '../dist/xinyi-street-world.js';
import {overrideIndex,fillBuildings,styleOf} from '../dist/xinyi-facades.js';
import {kitPlacements,hasKit,KIT_FH} from '../dist/facade-kits.js';

const read=f=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+f,import.meta.url)));
const od=read('building-overrides-xinyi.json'),district=read('district-xinyi.json'),streets=read('streets-xinyi.json');
district.buildings.push(...fillBuildings(od,district));
const ov=overrideIndex(od);

const buf=fs.readFileSync(new URL('../dist/assets/facade-kits.glb',import.meta.url));
const gltf=await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');
const kits=new Map();gltf.scene.traverse(o=>{if(o.userData?.kit)kits.set(o.userData.kit,o);});
const entries=od.streets.flatMap(s=>s.buildings).filter(e=>e.variant||e.style===1);
for(const e of entries){
 const k=kits.get(e.name);assert(k,'kit for '+e.name);
 assert.equal(k.userData.fh,KIT_FH);
 k.traverse(o=>{if(!o.isMesh)return;o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;
  assert(b.min.z>=-1e-3&&b.max.z<1.2,'kit only projects outward: '+e.name);
  assert(b.min.y>=-1e-3&&b.max.y<=KIT_FH+.3,'kit within one floor: '+e.name);
  assert(b.max.x-b.min.x<=k.userData.bay+.35,'kit within one bay: '+e.name);});
}

const nearRoad=(x,z)=>!!nearestStreet(streets.features,x,z,10);
const P=kitPlacements(district.buildings,ov,{project,facesStreet:nearRoad});
const n=Object.values(P).reduce((s,v)=>s+v.length,0);
assert(n>5000&&n<60000,'kit instances within budget: '+n);
for(const name of Object.keys(P))assert(kits.has(name),'placed kit exists: '+name);
for(const list of Object.values(P))for(const m of list){
 assert.equal(m.length,16);for(const v of m)assert(Number.isFinite(v));
 assert(Math.abs(Math.hypot(m[0],m[2])-1)<1e-6&&Math.abs(Math.hypot(m[8],m[10])-1)<1e-6,'unit wall axes');
 assert(Math.abs(m[0]*m[8]+m[2]*m[10])<1e-3,'along-wall ⟂ normal');
 assert(m[5]>=2.8/KIT_FH-1e-6&&m[5]<=5/KIT_FH+1e-6,'floor-height scale');
}
// 第一個構件就在某面牆外 4 cm
const [name,list]=Object.entries(P)[0],m=list[0];
const b=district.buildings.find(b=>ov[b.id]&&styleOf({},b,ov).name===name);
const d=Math.min(...b.walls.map(w=>{const [ax,az]=project(w.a[0],w.a[1]);return Math.abs((m[12]-ax)*m[8]+(m[14]-az)*m[10]);}));
assert(Math.abs(d-.04)<.01,'kit sits 4 cm off the wall: '+d);
// skipWall：全部略過則不擺
assert.equal(Object.keys(kitPlacements(district.buildings,ov,{project,facesStreet:nearRoad,skipWall:()=>true})).length,0);
assert(entries.every(e=>hasKit(e)));
console.log('facade kits',kits.size,'instances',n);
