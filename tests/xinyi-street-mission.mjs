// 消防任務：起火點在落地牆面且鄰近車道、停車評估（距離／側別／車身）、射水命中條件。
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {buildHeightField,buildColliders} from '../dist/xinyi-street-world.js';
import {RULES,pickFireSite,evaluateParking,sprayHits} from '../dist/xinyi-street-mission.js';
const load=f=>fs.readFile(new URL('../dist/assets/'+f,import.meta.url),'utf8').then(JSON.parse);
const [district,streets]=await Promise.all([load('district-xinyi.json'),load('streets-xinyi.json')]);
const ground=buildHeightField(district.buildings,district.bbox),colliders=buildColliders(district.buildings,ground);
let seed=5;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
let ok=0;const sites=[];
for(let i=0;i<40;i++){const s=pickFireSite(district.buildings,streets.features,ground,rand,{exclude:new Set([357399]),colliders});assert.ok(s);sites.push(s);
 assert.notEqual(s.buildingId,357399);
 // 起火面外側 10 m 內不得穿過其他牆（不被裙樓遮住）
 {const crosses=colliders.segs.filter(([ax,az,bx,bz])=>{const p=[s.x+s.nx*.4,s.z+s.nz*.4],q=[s.x+s.nx*10,s.z+s.nz*10],d=(q[0]-p[0])*(bz-az)-(q[1]-p[1])*(bx-ax);if(Math.abs(d)<1e-9)return false;const u=((ax-p[0])*(bz-az)-(az-p[1])*(bx-ax))/d,v=((ax-p[0])*(q[1]-p[1])-(az-p[1])*(q[0]-p[0]))/d;return u>0&&u<1&&v>0&&v<1;});assert.equal(crosses.length,0,'fire wall exposed to street');}assert.ok(s.floor>=2&&s.floor<=5);assert.ok(s.y>s.base+3);assert.ok(Math.abs(Math.hypot(s.nx,s.nz)-1)<1e-6);
 // 外側 15 m、與牆平行停車：應可停（除非該處剛好被其他建物占用）
 const heading=Math.atan2(-(-s.nz),-(s.nx)),truck={x:s.x+s.nx*15,z:s.z+s.nz*15,heading};const e=evaluateParking(truck,s,colliders);if(e.ok)ok++;
 assert.ok(!evaluateParking({...truck,x:s.x+s.nx*4,z:s.z+s.nz*4},s,colliders).ok,'too close rejected');
 assert.ok(!evaluateParking({...truck,x:s.x+s.nx*45,z:s.z+s.nz*45},s,colliders).ok,'too far rejected');
 assert.ok(!evaluateParking({...truck,x:s.x-s.nx*15,z:s.z-s.nz*15},s,colliders).ok,'wrong side rejected');
 assert.ok(!evaluateParking(truck,s,colliders,{speed:5}).ok,'moving rejected');
 // 射水：正對火點 15 m 命中；背對不命中；水線超長不命中
 const p={x:s.x+s.nx*15,z:s.z+s.nz*15},aim=Math.atan2(-(s.x-p.x),-(s.z-p.z));
 assert.ok(sprayHits(p,aim,s,{x:p.x,z:p.z}).hit);assert.ok(!sprayHits(p,aim+Math.PI,s,{x:p.x,z:p.z}).hit);assert.ok(!sprayHits(p,aim,s,{x:p.x+RULES.hoseLength+5,z:p.z}).hit);
 assert.ok(!sprayHits({x:s.x+s.nx*40,z:s.z+s.nz*40},aim,s,{x:s.x+s.nx*40,z:s.z+s.nz*40}).hit,'out of reach');}
assert.ok(ok>=24,`parkable sites ${ok}/40`);
console.log(`Mission: 40 fire sites on ground-level road-facing walls (floors 2–5); ${ok}/40 parkable at 15 m parallel; distance, side, motion, reach, aim and hose-length rules passed.`);
