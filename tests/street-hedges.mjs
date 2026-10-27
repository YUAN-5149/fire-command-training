// 逐街精修所見綠籬（street-hedges-xinyi.json）：只做照片確認的臨街面、不占車道、避開行道樹穴、
// 每段標明概略與待核對；植栽系統載入後以共用灌木加入、不推測台階（高度取可步行面）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {project} from '../dist/xinyi-street-world.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+f,import.meta.url)));
const data=read('street-hedges-xinyi.json'),streets=read('streets-xinyi.json'),furniture=read('street-furniture-xinyi.json');
const ov=read('building-overrides-xinyi.json'),names=new Set(ov.streets.flatMap(s=>s.buildings.map(b=>b.name)));
assert(data.hedges.length>0&&data.hedges.length<=12,'only photo-confirmed frontages');
let total=0;
for(const h of data.hedges){
 assert(names.has(h.name),'hedge tied to a refined building: '+h.name);
 assert(h.photo&&/待核對/.test(h.status),'photo source and pending-verification status');
 const segs=streets.features.filter(f=>f.kind==='road'&&f.tags.name===h.street).flatMap(f=>f.paths.flatMap(p=>p.slice(1).map((q,i)=>[project(p[i][0],p[i][1]),project(q[0],q[1]),f.width||8])));
 for(const [x,z,ry] of h.points){assert([x,z,ry].every(Number.isFinite));
  const [d,w]=segs.reduce((best,[[ax,az],[bx,bz],w])=>{const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(x-ax-dx*t,z-az-dz*t);return d<best[0]?[d,w]:best;},[1e9,8]);
  assert(d>=w/2+1.5-1e-6,'shrub off the carriageway');
  for(const [tx,tz] of furniture.trees||[])assert(Math.hypot(tx-x,tz-z)>=1.6-1e-6,'tree pit kept clear');}
 total+=h.points.length;}
assert(total<400,'no street-wide scattering: '+total);
const src=fs.readFileSync(new URL('../dist/xinyi-realistic-trees.js',import.meta.url),'utf8');
assert.match(src,/function addHedges/);assert(!/fixedY/.test(src.slice(src.indexOf('function addHedges'),src.indexOf('return {group'))),'hedges use the walk surface height');
console.log('hedges',data.hedges.length,'frontages',total,'shrubs');
