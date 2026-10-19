// 逐街精修（building-overrides-xinyi.json）：每筆都對得到量體、參數合理；缺漏量體依 OSM 外框補建正確。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {overrideIndex,styleOf,buildFacadeBatch,fillBuildings,earcut,facadeProps} from '../dist/xinyi-facades.js';
import {project} from '../dist/xinyi-street-world.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+f,import.meta.url)));
const data=read('building-overrides-xinyi.json'),district=read('district-xinyi.json');
const ids=new Set(district.buildings.map(b=>b.id));
const filled=fillBuildings(data,district);
for(const b of filled)ids.add(b.id);
assert(data.streets.length>0);
for(const st of data.streets){
 assert(st.street&&st.section&&st.checkedOn&&st.source,'section metadata');
 for(const e of st.buildings){
  assert(e.name&&e.ids.length,'named entry');
  for(const id of e.ids)assert(ids.has(id),'override id exists: '+id);
  assert(e.style>=0&&e.style<=6&&e.levels>=1&&e.levels<120);
  assert.match(e.colour,/^#[0-9a-f]{6}$/i);
  if(e.variant){assert(e.bay>.5&&e.bay<10);assert(e.win[0]>0&&e.win[0]<=1&&e.win[1]>0&&e.win[1]<=1);assert(e.podium.h>0&&e.podium.h<20);assert(['arcade','lobby'].includes(e.podium.kind));assert.match(e.glass,/^#[0-9a-f]{6}$/i);}
  if(e.footprint){assert(e.height>3&&e.height<400);assert(e.footprint.length>=3);}
 }
}
// 補建量體：牆數、外法線、屋頂三角化面積等於外框面積
for(const b of filled){
 assert(b.walls.length>=3&&b.roofs.length%3===0&&b.roofs.length>0);
 const pts=b.walls.map(w=>project(w.a[0],w.a[1]));let A=0;for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];A+=p[0]*q[1]-q[0]*p[1];}A=Math.abs(A)/2;
 let R=0;for(let i=0;i<b.roofs.length;i+=3){const [p,q,r]=b.roofs.slice(i,i+3).map(v=>project(v[0],v[1]));R+=Math.abs((q[0]-p[0])*(r[1]-p[1])-(r[0]-p[0])*(q[1]-p[1]))/2;}
 assert(Math.abs(R-A)/A<.01,'roof triangulation covers footprint '+R+' vs '+A);
 const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cz=pts.reduce((s,p)=>s+p[1],0)/pts.length;
 for(const w of b.walls){const [ax,az]=project(w.a[0],w.a[1]),[bx,bz]=project(w.b[0],w.b[1]),mx=(ax+bx)/2,mz=(az+bz)/2;
  assert((mx-cx)*w.n[0]+(mz-cz)*-w.n[1]>-1e-6,'wall normal points outward');}
}
assert.equal(earcut([[0,0],[4,0],[4,4],[2,1],[0,4]]).length,3,'concave ring triangulates');
// 精修參數進到頂點屬性；精修建物不掛直立招牌
const ov=overrideIndex(data),targets=[...district.buildings,...filled].filter(b=>ov[b.id]);
const batch=buildFacadeBatch(targets,{},ov);
assert.equal(batch.fac3.length,batch.fac.length);assert.equal(batch.fac4.length,batch.fac.length);
assert(batch.fac.some((v,i)=>i%4===3&&v===1)&&batch.fac.some((v,i)=>i%4===3&&v===2),'both variants present');
for(const b of targets)if(ov[b.id].variant)assert.equal(styleOf({},b,ov).signs,false);
assert.equal(facadeProps(targets,{},{project,overrides:ov}).sign.length,0);
console.log('overrides',data.streets.map(s=>s.street+' '+s.section+' '+s.buildings.length).join('; '),'filled',filled.length);
