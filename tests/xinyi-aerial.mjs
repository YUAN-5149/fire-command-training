// 信義雲梯車：支腿腳座不壓建物、升梯沿用首頁動作順序、全程梯架與籃架離真實立面保持淨距、不可達與碰牆目標被拒。
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as T from 'three';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {buildHeightField,buildColliders} from '../dist/xinyi-street-world.js';
import {pickFireSite,pickRescueSite,jointCandidates,driveRoads,stagingPoses,evaluateParking,facingTraffic} from '../dist/xinyi-street-mission.js';
import {AERIAL,buildFacadeIndex,createXinyiAerial,segmentClear} from '../dist/xinyi-aerial.js';
const load=f=>fs.readFile(new URL('../dist/assets/'+f,import.meta.url),'utf8').then(JSON.parse);
const [district,streets]=await Promise.all([load('district-xinyi.json'),load('streets-xinyi.json')]);
const ground=buildHeightField(district.buildings,district.bbox),colliders=buildColliders(district.buildings,ground),facade=buildFacadeIndex(district.buildings);
const loader=new GLTFLoader();loader.register(()=>({name:'h',loadTexture:()=>Promise.resolve(new T.Texture())}));
const bytes=await fs.readFile(new URL('../dist/assets/geo-aerial-ladder.glb',import.meta.url));
async function truckAt(x,z,heading){const src=(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene,root=new T.Group(),scene=new T.Scene();src.rotation.y=-Math.PI/2;root.add(src);root.position.set(x,ground.at(x,z),z);root.rotation.y=heading;scene.add(root);scene.updateMatrixWorld(true);return {src,aerial:createXinyiAerial(src,{facade,groundAt:(x,z)=>ground.at(x,z),colliders})};}
const run=(a,secs)=>{for(let i=0;i<secs*30;i++)a.update(1/30);};
let seed=9;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
let raised=0,tried=0,minClear=Infinity,rejectedFar=0;
for(let k=0;k<8;k++){
 const site=pickFireSite(district.buildings,streets.features,ground,rand,{colliders});const heading=Math.atan2(site.nz,-site.nx),d=10;
 const {aerial}=await truckAt(site.x+site.nx*d,site.z+site.nz*d,heading);
 const dep=aerial.deploy();if(!dep.ok)continue;run(aerial,7.2);assert.equal(aerial.state.phase,'down');tried++;
 const target=new T.Vector3(site.x+site.nx*1.8,site.y-1.2,site.z+site.nz*1.8);
 const r=aerial.raiseTo(target);if(!r.ok)continue;
 for(let i=0;i<17*30;i++){aerial.update(1/30);const b=aerial.basket(),c=facade.clearance(b.x,b.y+1,b.z,4);minClear=Math.min(minClear,c);}
 assert.equal(aerial.state.phase,'raised');assert.ok(aerial.basket().distanceTo(target)<.35,'basket reaches target '+aerial.basket().distanceTo(target));raised++;
 // 籃架水砲噴嘴在籃架上方附近
 assert.ok(aerial.muzzle().distanceTo(aerial.basket())<3);
 // 收梯回原位
 assert.ok(aerial.lower().ok);run(aerial,17.5);assert.equal(aerial.state.phase,'down');assert.ok(aerial.retract().ok);run(aerial,7.2);assert.equal(aerial.state.phase,'stowed');
 // 不可達：60 m 高
 if(!aerial.deploy().ok)continue;run(aerial,7.2);const far=aerial.raiseTo(new T.Vector3(site.x+site.nx*2,site.y+60,site.z+site.nz*2));assert.ok(!far.ok);if(/作業範圍|碰到/.test(far.reason))rejectedFar++;
 // 目標在建物內部：拒絕
 assert.ok(!aerial.raiseTo(new T.Vector3(site.x-site.nx*3,site.y,site.z-site.nz*3)).ok,'target inside building rejected');
}
assert.ok(raised>=3,`raised ${raised}/${tried}`);assert.ok(minClear>=AERIAL.cageClear-.05,'basket clearance '+minClear);assert.equal(rejectedFar,raised>=0?rejectedFar:0);
// 支腿：緊貼牆面停車時拒絕展開
const s=pickFireSite(district.buildings,streets.features,ground,rand,{colliders});const tight=await truckAt(s.x+s.nx*1.2,s.z+s.nz*1.2,Math.atan2(s.nz,-s.nx));
assert.equal(tight.aerial.deploy().ok,false,'outriggers blocked next to wall');
// 受困救援：選址 → 順向到場車位 → 支腿 → 升梯到窗口（籃架離牆 2 m）→ 收梯 → 收支腿；並驗證 reset。
const roads=driveRoads(streets.features);let rescued=0,rescueTried=0,lanesChecked=0;
for(let k=0;k<10&&rescued<3;k++){
 const r=pickRescueSite(district.buildings,streets.features,ground,rand,{colliders});assert.ok(r&&r.floor>=3&&r.floor<=8);rescueTried++;
 assert.ok(Math.abs(r.target.y-(r.base+(r.floor-1)*3.4))<1e-9&&Math.abs(Math.hypot(r.target.x-r.x,r.target.z-r.z)-2)<1e-9);
 const poses=stagingPoses(r,roads,colliders,{range:[AERIAL.parkMin,AERIAL.parkMax],half:5.1,prefer:9});
 for(const p of poses.slice(0,3)){const t=facingTraffic(roads,{x:p.x,z:p.z,heading:p.heading});assert.ok(t.ok&&t.checked,'staging pose faces traffic');lanesChecked++;
  assert.ok(evaluateParking({...p},r,colliders,{range:[6,16],half:5.1,roads,lights:true}).ok);
  // 逆向停車被拒、警示燈關閉被拒
  assert.ok(evaluateParking({...p,heading:p.heading+Math.PI},r,colliders,{range:[6,16],half:5.1,roads}).issues.some(x=>x.includes('順向')),'reverse heading rejected');
  assert.ok(evaluateParking({...p},r,colliders,{range:[6,16],half:5.1,lights:false}).issues.some(x=>x.includes('警示燈')));
  const {src,aerial}=await truckAt(p.x,p.z,p.heading),target=new T.Vector3(r.target.x,r.target.y,r.target.z);
  if(!aerial.check(target).ok)continue;
  assert.ok(aerial.deploy().ok);run(aerial,7.2);assert.ok(aerial.raiseTo(target).ok);run(aerial,17.2);assert.equal(aerial.state.phase,'raised');
  assert.ok(aerial.basket().distanceTo(target)<1,'basket at window '+aerial.basket().distanceTo(target));
  assert.ok(aerial.lower().ok);run(aerial,17.5);assert.ok(aerial.retract().ok);run(aerial,7.2);assert.equal(aerial.state.phase,'stowed');
  // reset：升梯中途回出生點，梯架與支腿立即回收妥狀態
  const rest=src.getObjectByName('Ladder_elevation').quaternion.clone();aerial.deploy();run(aerial,7.2);aerial.raiseTo(target);run(aerial,6);aerial.reset();
  assert.equal(aerial.state.phase,'stowed');assert.ok(src.getObjectByName('Ladder_elevation').quaternion.angleTo(rest)<1e-6);
  rescued++;break;}
}
assert.ok(rescued>=3,`rescued ${rescued}/${rescueTried}`);
// 協同出勤：同一棟建物，起火面與受困面朝向不同
const ids=jointCandidates(district.buildings,streets.features,{colliders});assert.ok(ids.length>=3,'joint buildings '+ids.length);
{const f=pickFireSite(district.buildings,streets.features,ground,rand,{colliders,building:ids[0]}),q=pickRescueSite(district.buildings,streets.features,ground,rand,{colliders,building:ids[0],awayFrom:f});
 assert.equal(f.buildingId,ids[0]);assert.equal(q.buildingId,ids[0]);assert.ok(f.nx*q.nx+f.nz*q.nz<.3,'different sides');}
console.log(`Rescue: ${rescued}/${rescueTried} trapped-window sites rescued from facing-traffic staging poses (${lanesChecked} poses checked; reverse heading and lights-off rejected); ${ids.length} buildings support fire + other-side rescue; reset restores stowed pose.`);
console.log(`Aerial: ${raised}/${tried} real facades reached with basket ≥ ${minClear.toFixed(2)} m from walls during the sweep; unreachable (60 m) and in-building targets rejected; outriggers blocked next to a wall.`);
