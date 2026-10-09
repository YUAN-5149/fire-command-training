// 信義街景雲梯作業：框架不變性、量體避碰、作業距離核對、真實量體上的完整作業時間軸。
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {load} from './load-aerial.mjs';
import {createAerialMotion} from '../dist/aerial-motion.js';
import {createXinyiAerial,buildObstacleIndex,rectTri,aerialFrame,toFrameXZ,fromFrameXZ,TIMELINE,AERIAL} from '../dist/xinyi-street-aerial.js';
import {buildHeightField} from '../dist/xinyi-street-world.js';
import {pickFireSite} from '../dist/xinyi-street-mission.js';

function person(root){const body=new T.Group();root.add(body);const boots=[-1,1].map(x=>{const b=new T.Mesh(new T.BoxGeometry(.15,.2,.3));b.position.set(x*.1,.1,0);body.add(b);return b;});return {body,boots,legs:[new T.Group(),new T.Group()],arms:[new T.Group(),new T.Group()]};}
const rig=source=>{const get=n=>source.getObjectByName(n),floor=get('Cage_floor');floor.geometry.computeBoundingBox();const anchor=floor.geometry.boundingBox.getCenter(new T.Vector3());anchor.y=floor.geometry.boundingBox.max.y;return {slew:get('Turntable_slew'),elevation:get('Ladder_elevation'),level:get('Cage_level'),floor,extensions:[2,3,4].map(n=>get('Ladder_extend_'+n)),anchor};};

// 1. 框架不變性：放在旋轉、平移後的父節點中，以框架座標規劃，結果與首頁（世界原點）相同。
{const plain=await load();plain.position.set(0,-.065,10);plain.updateMatrixWorld(true);const m0=createAerialMotion(plain,rig(plain));
 const moved=await load(),parent=new T.Group();parent.position.set(-123.4,7.5,456.7);parent.rotation.y=2.1;parent.add(moved);moved.position.set(0,-.065,10);parent.updateMatrixWorld(true);const m1=createAerialMotion(moved,rig(moved));
 assert(m0.origin.distanceTo(m1.origin)<1e-6&&m0.rest.distanceTo(m1.rest)<1e-6,'框架座標下原點與收梯位置一致');
 const target=new T.Vector3(-4,4.17,6.2),p0=m0.plan(target),p1=m1.plan(target);assert(p0&&p1);
 for(let t=0;t<=19;t+=.25){const a=m0.move(m0.at(p0,t,true)),b=m1.move(m1.at(p1,t,true));assert(a.safe&&b.safe);assert(a.position.distanceTo(b.position)<1e-6,'t='+t);}
 const r1=rig(moved),floorWorld=r1.floor.localToWorld(r1.anchor.clone()),expect=parent.localToWorld(m1.clearance().position.clone());assert(floorWorld.distanceTo(expect)<1e-6,'框架座標可轉回世界座標');}

// 2. 長方形與三角形相交
assert(rectTri(0,0,1,1,[.5,.5,3,.5,.5,3]));assert(!rectTri(0,0,1,1,[1.2,0,3,0,3,2]));assert(rectTri(0,0,4,4,[-1,-1,10,-1,-1,10]),'三角形包覆長方形');assert(!rectTri(0,0,1,1,[2,-1,3,3,1.6,3]));
// 框架轉換往返；-Z 朝建物
{const site={x:10,z:20,nx:.6,nz:.8},f=aerialFrame(site,10+.6*7,20+.8*7);assert(Math.abs(f.dist-7)<1e-9&&Math.abs(f.along)<1e-9);const [lx,lz]=toFrameXZ(f,site.x,site.z);assert(Math.abs(lx)<1e-9&&Math.abs(lz+7)<1e-9);const [x,z]=fromFrameXZ(f,3,-2);const back=toFrameXZ(f,x,z);assert(Math.abs(back[0]-3)<1e-9&&Math.abs(back[1]+2)<1e-9);}

// 3. 合成立面（z<0 為建物，高 60 m）
const block=(id,x0,z0,x1,z1,h,y0=-1)=>[[x0,z0,x1,z0,x1,z1],[x0,z0,x1,z1,x0,z1]].map(tri=>({id,tri,y0,y1:h,cx:(x0+x1)/2,cz:(z0+z1)/2}));
const flat={at:()=>0};
const scene=new T.Scene(),a=createXinyiAerial({scene,source:await load(),createPerson:person,ground:flat,obstacleIndex:block('B',-40,-30,40,0,60)});
const site=(floor,o={})=>({x:0,z:0,nx:0,nz:1,base:0,floor,y:(floor-.5)*3.4,...o});
{const r=a.check(site(3),4,6);assert(r.ok,JSON.stringify(r.issues));assert.equal(r.standoff,1.2);
 // 太近：支腿外緣距牆不足
 const near=a.preview(site(3),4,2.6);assert(!near.ok&&near.issues.some(s=>s.includes('支腿外緣')),JSON.stringify(near.issues));
 // 錯側
 assert(a.preview(site(3),4,-6).issues.includes('不在起火面這一側'));
 // 與水箱車重疊
 const eng=a.preview(site(3),4,6,{engine:{x:-4,z:6,heading:Math.PI/2}});assert(eng.issues.some(s=>s.includes('水箱車')),JSON.stringify(eng.issues));
 // 支腿壓到建物
 const b2=createXinyiAerial({scene:new T.Scene(),source:await load(),createPerson:person,ground:flat,obstacleIndex:[...block('B',-40,-30,40,0,60),...block('kiosk',0,7.6,3,9,3)]});
 assert(b2.preview(site(3),4,6).issues.some(s=>s.includes('壓到建物')));
 // 可達範圍：轉台正對窗口太近時拒絕，並說明為模型可達範圍
 const close=a.check(site(3),-4,6);assert(!close.ok&&close.issues[0].includes('可達範圍'),JSON.stringify(close.issues));
 // 升梯掃掠：車頭上方 7–10 m 有空橋（不影響停車與最終梯位），終點可解但升梯途中會碰到，必須拒絕。
 // 框架：車輛中心在世界 (4,6)、車頭朝 -X；空橋在框架 x −4…−1、z −1.5…2。
 const b3=createXinyiAerial({scene:new T.Scene(),source:await load(),createPerson:person,ground:flat,obstacleIndex:[...block('B',-40,-30,40,0,60),...block('skybridge',0,4.5,3,8,10,7)]});
 const swept=b3.check(site(3),4,6);assert(!swept.ok&&swept.issues[0].includes('掃掠'),JSON.stringify(swept.issues));
 assert(b3.preview(site(3),4,6).ok,'空橋不影響車位核對');
 // 地形高差過大
 const slope=createXinyiAerial({scene:new T.Scene(),source:await load(),createPerson:person,ground:{at:(x,z)=>x*.08},obstacleIndex:block('B',-40,-30,40,0,60)});
 assert(slope.preview(site(3),4,6).issues.some(s=>s.includes('高差')));
}

// 4. 完整時間軸：支腿→登車→升梯→到位出水→收梯，全程無碰撞、支腿以墊板落地。
function runTimeline(ac,s,result,fire){
 assert(ac.deploy(result,s));let arrived=false;const dt=1/20;
 for(let t=0;t<TIMELINE.raise[1]+3;t+=dt){const e=ac.update(dt,{fire,fireActive:true});assert(!e?.blocked,e?.reason);if(e?.arrived)arrived=true;}
 assert(arrived&&ac.state.phase==='ready','升梯到位');assert(ac.motion.clearance().safe);
 const fp=ac.motion.clearance().position;assert(fp.distanceTo(result.target)<.05,'籃架在窗口外');
 assert(ac.state.spraying,'到位後砲塔對準起火點出水');const {origin,dir}=ac.nozzle();const toFire=new T.Vector3(fire.x,fire.y,fire.z).sub(origin).normalize();assert(dir.angleTo(toFire)<.35,'水由噴嘴朝向起火點');
 // 支腿底面與墊板頂面一致（不懸空、不穿地）
 ac.frame.updateMatrixWorld(true);ac.source.updateMatrixWorld(true);
 const feet=ac.grounding.jacks.map(j=>new T.Box3().setFromObject(j.moving.find(m=>/Jack_foot/.test(m.o.name)).o).min.y);
 assert(ac.retract());for(let t=0;t<40;t+=dt){const e=ac.update(dt,{});assert(!e?.blocked,e?.reason);}
 assert.equal(ac.state.phase,'parked');assert(ac.motion.clearance().position.distanceTo(ac.motion.rest)<1e-6,'收回到收梯位置');
 return feet;
}
{const s=site(3),r=a.check(s,4,6),fire={x:0,y:s.y,z:-.5};const feet=runTimeline(a,s,r,fire);for(const y of feet)assert(Math.abs(y)<.02,"支腿落在平地："+y);}

// 5. 真實量體：隨機起火點，在起火面前方搜尋可行車位；找到時跑完整時間軸。
const district=JSON.parse(await readFile(new URL('../dist/assets/district-xinyi.json',import.meta.url)));
const streets=JSON.parse(await readFile(new URL('../dist/assets/streets-xinyi.json',import.meta.url)));
const ground=buildHeightField(district.buildings,district.bbox),index=buildObstacleIndex(district.buildings);
const real=createXinyiAerial({scene:new T.Scene(),source:await load(),createPerson:person,ground,obstacleIndex:index});
let seed=7;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
let tried=0,found=0,firstShown=false;const t0=Date.now();
while(tried<12){const s=pickFireSite(district.buildings,streets.features,ground,rand);if(!s)continue;tried++;s.floor=Math.min(s.floor,4);s.y=s.base+(s.floor-.5)*3.4;
 let ok=null;
 search:for(const d of [6,8,10,12,15])for(const along of [4,6,8,2,10,-4,0]){const x=s.x+s.nx*d-s.nz*along,z=s.z+s.nz*d+s.nx*along;const r=real.check(s,x,z,{features:streets.features});if(r.ok){ok=r;break search;}}
 if(!ok)continue;found++;
 // 真實量體上：路徑全程與鄰近量體保持淨距（envelope 每步檢查），籃架在起火面外側。
 const feet=runTimeline(real,s,ok,{x:s.x-s.nx*.5,y:s.y,z:s.z-s.nz*.5});
 ok.frame&&feet.forEach((y,i)=>{const [lx,lz]=real.layout.feet[i],g=ground.at(...fromFrameXZ(ok.frame,lx,lz));assert(y>=g-.02,'支腿不穿地');});
 real.dismiss();
 if(!firstShown){firstShown=true;console.log('example',{building:s.buildingId,floor:s.floor,dist:+ok.dist.toFixed(1),standoff:ok.standoff,warnings:ok.warnings});}
}
console.log({tried,found,seconds:(Date.now()-t0)/1000});
assert(found>=tried*.5,'至少一半的隨機起火面可找到雲梯車位');
console.log('xinyi-street-aerial: ok');
