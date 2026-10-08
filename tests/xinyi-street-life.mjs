// 街道生活層（示意）：標線在路口中斷、店面不覆蓋研究中量體、行道樹不在建物內、車道靠右、車流可循環。
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {buildHeightField,buildColliders,project} from '../dist/xinyi-street-world.js';
import {findJunctions,buildLaneMarkings,buildShopfronts,buildStreetTrees,buildLanes,lanePose} from '../dist/xinyi-street-life.js';
const load=f=>fs.readFile(new URL('../dist/assets/'+f,import.meta.url),'utf8').then(JSON.parse);
const [district,streets,fixtures]=await Promise.all(['district-xinyi.json','streets-xinyi.json','street-fixtures-xinyi.json'].map(load));
const ground=buildHeightField(district.buildings,district.bbox),colliders=buildColliders(district.buildings,ground),f=streets.features;

const junctions=findJunctions(f),marks=buildLaneMarkings(f,ground);assert.ok(junctions.length>20&&marks.lines>50);
for(const g of Object.values(marks.groups))for(let i=0;i<g.position.length;i+=12){const x=(g.position[i]+g.position[i+9])/2,z=(g.position[i+2]+g.position[i+11])/2;assert.ok(!junctions.some(j=>Math.hypot(j.x-x,j.z-z)<j.r-1.5),'marking inside junction');}

const exclude=new Set([357399,265936,266115,266138]),shops=buildShopfronts(district.buildings,f,ground,{exclude});assert.ok(shops.shops>100,'shops '+shops.shops);
assert.ok(shops.owners.every(id=>!exclude.has(id)),'no shop on excluded volume');
const ex=district.buildings.filter(b=>exclude.has(b.id)).flatMap(b=>b.walls.map(w=>project((w.a[0]+w.b[0])/2,(w.a[1]+w.b[1])/2)));let shared=0;
for(let i=0;i<shops.sign.position.length;i+=12){const x=shops.sign.position[i],z=shops.sign.position[i+2];if(ex.some(([ox,oz])=>Math.hypot(ox-x,oz-z)<.5))shared++;}
assert.equal(shared,0,'no shop over a protected facade');
const trees=buildStreetTrees(f,ground,colliders,{avoid:fixtures.lamps.map(l=>project(l.lon,l.lat))});assert.ok(trees.length>20);
for(const [x,,z] of trees)assert.equal(colliders.resolve(x,z,1.2).hit,false);

const lanes=buildLanes(f);assert.ok(lanes.length>50);let right=0,checked=0;
for(const l of lanes){const way=f.find(w=>w.id===l.way);if(['yes','1','-1'].includes(way.tags.oneway))continue;const p=lanePose(l,l.length/2),q=lanePose(l,l.length/2+1),dx=q.x-p.x,dz=q.z-p.z;
 let best=Infinity,side=0;for(const path of way.paths)for(let i=1;i<path.length;i++){const [ax,az]=project(...path[i-1]),[bx,bz]=project(...path[i]),ux=bx-ax,uz=bz-az,l2=ux*ux+uz*uz||1,t=Math.max(0,Math.min(1,((p.x-ax)*ux+(p.z-az)*uz)/l2)),cx=ax+ux*t,cz=az+uz*t,d=Math.hypot(p.x-cx,p.z-cz);if(d<best){best=d;side=(p.x-cx)*(-dz)+(p.z-cz)*dx;}}
 checked++;if(side>0)right++;}
assert.ok(right/checked>.95,`right-hand lanes ${right}/${checked}`);
assert.ok(lanes.filter(l=>l.next.length||l.back).length/lanes.length>.9,'lanes connect');
console.log(`Street life: ${marks.lines} marking lines (${junctions.length} junction gaps), ${shops.shops} shopfronts, ${trees.length} added trees, ${lanes.length} lanes (${right}/${checked} two-way lanes on right).`);
