import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {TANKER,tankerTransfer,wheelAngle,createTanker} from '../dist/xinyi-street-tanker.js';
import {staging,aerialStaging,tankerStaging} from '../dist/staging.js';

// 補水規則：停妥、在水帶範圍內、雙方都有餘量才補；每秒 refill 公升，不超過任一方餘量。
assert.equal(TANKER.capacity,12000);
assert.equal(tankerTransfer({tankerWater:12000,truckWater:500,truckCapacity:2000,distance:20,dt:1}),TANKER.refill);
assert.equal(tankerTransfer({tankerWater:12000,truckWater:1990,truckCapacity:2000,distance:20,dt:1}),10,'只補到滿');
assert.equal(tankerTransfer({tankerWater:5,truckWater:0,truckCapacity:2000,distance:20,dt:1}),5,'水庫車只剩 5 L');
assert.equal(tankerTransfer({tankerWater:12000,truckWater:0,truckCapacity:2000,distance:TANKER.range+1,dt:1}),0,'超出水帶範圍');
assert.equal(tankerTransfer({tankerWater:12000,truckWater:0,truckCapacity:2000,distance:10,dt:1,parked:false}),0,'行駛中不補水');
// 車輪：滾動距離 = 轉角 × 輪胎半徑（不打滑）
assert(Math.abs(wheelAngle(1.09)*TANKER.tyreRadius-1.09)<1e-12);

// 方格路網（同分隊測試），起火面朝南位於 (0,-10)。
const nodes=[],adj=[],idx=(i,j)=>i*7+j;for(let i=0;i<7;i++)for(let j=0;j<7;j++){nodes.push({x:(j-3)*40,z:(i-3)*40});adj.push([]);}
for(let i=0;i<7;i++)for(let j=0;j<7;j++){if(j<6){adj[idx(i,j)].push([idx(i,j+1),40]);adj[idx(i,j+1)].push([idx(i,j),40]);}if(i<6){adj[idx(i,j)].push([idx(i+1,j),40]);adj[idx(i+1,j)].push([idx(i,j),40]);}}
const graph={nodes,adj},site={x:0,z:-10,nx:0,nz:1};
const block=(x,z)=>x>-15&&x<15&&z>-30&&z<-10;
const colliders={resolve:(x,z,r)=>({x,z,hit:block(x,z)||block(x+r,z)||block(x-r,z)||block(x,z+r)||block(x,z-r)})};
// 假模型：只帶車輪、水砲節點與紅色燈罩，驗證控制邏輯。
const tpl=new T.Group();const wheelNames=['F L','F R','R1 L outer','R1 L inner','R2 R outer'].map(n=>'Wheel spin '+n);
for(const n of wheelNames){const w=new T.Object3D();w.name=n;tpl.add(w);}
const slew=new T.Object3D();slew.name='Monitor slew';const elev=new T.Object3D();elev.name='Monitor elevation';slew.add(elev);tpl.add(slew);
const lens=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({name:'Red beacon lens'}));tpl.add(lens);
const scene=new T.Scene();
const kit=createTanker({scene,template:tpl,ground:{at:()=>0},colliders,graph});
// 直線路徑尋路（測試用）：取最近節點連線。
kit.setRouter((x0,z0,x1,z1)=>({points:[[x0,z0],[x1,z0],[x1,z1]]}));
const home={x:120,z:120,heading:0,exit:{x:120,z:100}};
const pose=kit.dispatch(site,{home,existing:[{x:0,z:15}]});
assert(pose,'找得到停車點');const d=Math.hypot(pose.x-site.x,pose.z-site.z);assert(d>=TANKER.stagingMin&&d<=TANKER.stagingMax,'停車距離 '+d);
assert(Math.hypot(pose.x-0,pose.z-15)>=TANKER.spacing,'不與中隊長車重疊');
assert.equal(kit.state,'wait');assert.equal(kit.vehicle.root.visible,false,'出勤準備時尚未出庫');
const truck={x:pose.x+20,z:pose.z,water:200,capacity:2000};let t=0,moved=0,spun=0;
for(let i=0;i<20*600&&kit.state!=='parked';i++){t+=.05;kit.update(.05,{t,now:t,truck,blockers:()=>[]});}
assert.equal(kit.state,'parked','抵達停車點');assert(t>=TANKER.turnout,'先經出勤準備');
assert(Math.abs(kit.vehicle.x-pose.x)<1e-9&&Math.abs(kit.vehicle.z-pose.z)<1e-9);
spun=kit.vehicle.wheels[0].rotation.z;assert(Math.abs(spun*TANKER.tyreRadius-kit.vehicle.len)<.5,'車輪轉動距離與路線長度一致');
for(let i=0;i<140;i++){const m=kit.update(.5,{t,now:t,truck,blockers:()=>[]});truck.water+=m;moved+=m;}
assert(Math.abs(moved-1800)<1e-6,'補到水箱滿（200→2000 L）');assert.equal(truck.water,2000);
assert(Math.abs(kit.water-(12000-1800))<1e-6,'水庫車扣水');assert(kit.vehicle.supplying&&kit.vehicle.hose.visible,'鋪設水帶');
truck.x=pose.x+200;kit.update(.5,{t,now:t,truck});assert(!kit.vehicle.supplying&&!kit.vehicle.hose.visible,'超出範圍收回');
assert.equal(kit.circles().length,3);
kit.setPose(.5,.3);assert.equal(kit.vehicle.slew.rotation.y,.5);assert.equal(kit.vehicle.elev.rotation.z,-.3);assert.equal(kit.vehicle.wheels.length,wheelNames.length);
kit.hide();assert.equal(kit.state,'home');assert.equal(kit.circles().length,0);

// 消防演練：水庫車與四個車組、雲梯作業區不重疊（車長 9.45 m，各車半長取 3.72 m）。
const half=9.45/2;
for(const p of staging){if(Math.abs(p.z-tankerStaging.z)>2.6)continue;assert(Math.abs(p.x-tankerStaging.x)-half-3.72>=2,'與車組車輛保持間隔 '+p.x);}
assert(tankerStaging.x+half<aerialStaging.workMinX,'不占雲梯作業區');assert.equal(tankerStaging.heading,staging[1].heading,'順向');
assert(tankerStaging.x-half>=-45,'在道路範圍內');

// GLB：骨架節點與燈罩材質都在。
const buf=readFileSync(new URL('../dist/assets/water-tanker.glb',import.meta.url));
assert.equal(buf.toString('ascii',0,4),'glTF');const len=buf.readUInt32LE(12),gl=JSON.parse(buf.toString('utf8',20,20+len));
const names=new Set(gl.nodes.map(n=>n.name));
assert.equal(gl.nodes.filter(n=>/^Wheel spin/.test(n.name??'')).length,10,'10 個車輪轉動節點');
for(const n of ['Vehicle','Monitor slew','Monitor elevation'])assert(names.has(n),n);
assert(gl.materials.some(m=>m.name==='Red beacon lens'),'紅色警示燈材質');
console.log('xinyi-street-tanker OK');
