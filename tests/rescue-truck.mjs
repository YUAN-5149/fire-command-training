import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {MeshoptDecoder} from '../dist/vendor/jsm/libs/meshopt_decoder.module.js';
import {rigRescueCrane,CRANE} from '../dist/imported-rescue-truck.js';
import {RESCUE_TRUCK,createRescueTruck,craneSlewToward} from '../dist/xinyi-street-rescue-truck.js';
import {staging,aerialStaging,tankerStaging,surveyCarStaging,smokeTruckStaging,rescueTruckStaging} from '../dist/staging.js';

// 救助器材車「信義71」網頁版 GLB：容量、壓縮擴充、rig 節點與外廓。
const file=new URL('../dist/assets/rescue-truck.glb',import.meta.url),bytes=statSync(file).size;
assert(bytes<1.2*1048576,'網頁版模型 < 1.2 MB：'+(bytes/1048576).toFixed(2)+' MB');
const buf=readFileSync(file);assert.equal(buf.toString('ascii',0,4),'glTF');
const len=buf.readUInt32LE(12),gl=JSON.parse(buf.toString('utf8',20,20+len));
for(const e of ['EXT_meshopt_compression','KHR_mesh_quantization'])assert(gl.extensionsRequired.includes(e),e);
assert(gl.meshes.length<=32,'同一 rig 節點下的零件已合併：'+gl.meshes.length+' 個網格');
const names=new Set(gl.nodes.map(n=>n.name));
for(const n of ['Vehicle','Stabiliser extend L','Stabiliser leg R','Light mast stage 2','Light mast stage 3','Light head pan','Light head tilt',
 'Crane slew','Crane inner boom','Crane outer boom','Crane extension','Crane hook hang','Crane hook lower','Hook rope','Hoist wire','Hoist wire end',
 ...['Lift','Knuckle','Extension'].flatMap(r=>['anchor','eye','barrel','rod'].map(p=>r+' ram '+p))])assert(names.has(n),n);
assert.equal(gl.nodes.filter(n=>/^Wheel spin [^ ]+ [LR]( (inner|outer))?$/.test(n.name??'')).length,6,'6 個車輪轉動節點（後輪雙胎）');
assert(gl.materials.some(m=>m.name==='Red beacon lens'),'紅色警示燈材質');

// meshopt 實際解碼後計算外廓與 rig。Node 沒有 Image：解析前拿掉貼圖（徽章 PNG），幾何與 rig 不受影響。
const strip=JSON.parse(JSON.stringify(gl));delete strip.images;delete strip.textures;delete strip.samplers;
for(const m of strip.materials){for(const k of Object.keys(m))if(/Texture$/.test(k))delete m[k];if(m.pbrMetallicRoughness)for(const k of Object.keys(m.pbrMetallicRoughness))if(/Texture$/.test(k))delete m.pbrMetallicRoughness[k];delete m.extensions;}
let js=Buffer.from(JSON.stringify(strip));js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,0x20)]);
const rest=buf.subarray(20+len),glb=Buffer.concat([Buffer.alloc(20),js,rest]);glb.write('glTF',0,'ascii');glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(js.length,12);glb.writeUInt32LE(0x4E4F534A,16);
const gltf=await new Promise((ok,no)=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength),'',ok,no));
const model=gltf.scene;model.updateMatrixWorld(true);
const bb=new T.Box3().setFromObject(model),size=bb.getSize(new T.Vector3());
// 71 車：全長約 8.0 m（含前絞盤掛鉤與吊臂捲揚機）、寬 3.08 m（含後視鏡）、收車高約 3.69 m（燈塔燈頭）；與 Blender 原檔相同。
assert(size.x>7.9&&size.x<8.05,'車長 '+size.x.toFixed(3));
assert(size.z>3.0&&size.z<3.15,'車寬 '+size.z.toFixed(3));
assert(size.y>3.6&&size.y<3.75,'車高 '+size.y.toFixed(3));
assert(Math.abs(bb.min.y)<.025,'輪胎底在 0：'+bb.min.y.toFixed(4));

const rig=rigRescueCrane(model);assert(rig,'吊臂 rig');
const node=n=>{let o=null;model.traverse(x=>{if(!o&&x.name.replace(/_/g,' ')===n)o=x;});return o;};
const world=n=>{model.updateMatrixWorld(true);return new T.Vector3().setFromMatrixPosition(node(n).matrixWorld);};
const meshMinY=n=>{let y=1e9;node(n).traverse(o=>{if(o.isMesh){const b=new T.Box3().setFromObject(o);y=Math.min(y,b.min.y);}});return y;};
// 油壓缸兩節：區域 +Y 對準另一端銷；兩節長度和大於兩銷距離（伸縮不脫出）。
function ramCheck(tag){model.updateMatrixWorld(true);const out={};
 for(const r of ['Lift','Knuckle','Extension']){const a=world(r+' ram anchor'),b=world(r+' ram eye'),L=a.distanceTo(b);
  for(const [part,from,to] of [[r+' ram barrel',a,b],[r+' ram rod',b,a]]){const y=new T.Vector3(0,1,0).transformDirection(node(part).matrixWorld),d=to.clone().sub(from).normalize();assert(y.dot(d)>.999,tag+' '+part+' 對準 '+y.dot(d).toFixed(4));}
  out[r]=L;}
 return out;}
// 吊鉤垂直：懸掛點的區域 +Y 在世界中朝上。鋼索：Hoist wire 的區域 -Z 對準 Hoist wire end。
function hookCheck(tag){model.updateMatrixWorld(true);const up=new T.Vector3(0,1,0).transformDirection(node('Crane hook hang').matrixWorld);assert(up.y>.9999,tag+' 吊鉤垂直 '+up.y.toFixed(5));
 const w=node('Hoist wire'),dir=new T.Vector3(0,0,-1).transformDirection(w.matrixWorld),to=world('Hoist wire end').sub(world('Hoist wire')).normalize();assert(dir.dot(to)>.999,tag+' 鋼索對準臂端 '+dir.dot(to).toFixed(4));}
const foot0=meshMinY('Stabiliser leg L'),hook0=world('Crane hook lower'),L0=ramCheck('收車');hookCheck('收車');
assert(foot0>.2&&foot0<.35,'收車時腳墊離地 '+foot0.toFixed(3));
// 作業：u=1、迴轉朝車尾（90°）。
rig.set(1,Math.PI/2);const L1=ramCheck('作業');hookCheck('作業');
assert(Math.abs(meshMinY('Stabiliser leg L'))<.01&&Math.abs(meshMinY('Stabiliser leg R'))<.01,'腳墊著地 '+meshMinY('Stabiliser leg L').toFixed(3));
assert(L1.Lift>L0.Lift+.2,'內臂抬起時昇舉缸伸長 '+L0.Lift.toFixed(3)+' → '+L1.Lift.toFixed(3));
assert(L1.Extension>L0.Extension+CRANE.ext-.01,'伸縮臂伸出時伸縮缸同步伸長 '+L0.Extension.toFixed(3)+' → '+L1.Extension.toFixed(3));
const hook1=world('Crane hook lower');
assert(hook1.x>hook0.x+3,'吊鉤轉到車尾後方 '+hook0.x.toFixed(2)+' → '+hook1.x.toFixed(2));
assert(hook1.y>1&&hook1.y<3,'放索後吊鉤高度 '+hook1.y.toFixed(2));
const mast=world('Light head tilt');assert(mast.y>5.5,'燈塔升起 '+mast.y.toFixed(2));
console.log('crane: hook',hook0.toArray().map(v=>v.toFixed(2)).join(','),'->',hook1.toArray().map(v=>v.toFixed(2)).join(','),
 'rams',Object.entries(L1).map(([k,v])=>k+' '+L0[k].toFixed(2)+'->'+v.toFixed(2)).join(', '));
// 迴轉到乘客側（180°）時吊鉤仍垂直、鋼索仍對準。
rig.set(1,Math.PI);ramCheck('乘客側');hookCheck('乘客側');
rig.set(0);assert(world('Crane hook lower').distanceTo(hook0)<1e-4,'收回後回到收車位置');ramCheck('收回');

// 演練首頁：停在對向側車道東段，與車組、水庫車、勤務車、排煙車、雲梯作業區都不重疊，在道路範圍內、順向。
const s=rescueTruckStaging,half=7.7/2,hw=2.5/2;
const clear=(x,z,l,w)=>Math.abs(x-s.x)>=half+l/2+1||Math.abs(z-s.z)>=hw+w/2+.5;
for(const p of staging)assert(clear(p.x,p.z,7.44,2.5),'與車組車輛保持間隔 '+p.x);
assert(clear(tankerStaging.x,tankerStaging.z,9.45,2.5),'與水庫車不重疊');assert(clear(surveyCarStaging.x,surveyCarStaging.z,4.7,1.85),'與勤務車不重疊');
assert(clear(smokeTruckStaging.x,smokeTruckStaging.z,7.4,2.45),'與排煙車不重疊');
assert(s.x+half<aerialStaging.workMinX||s.x-half>aerialStaging.workMaxX,'不占雲梯作業區');
assert(s.x-half>=-45&&s.x+half<=45&&s.z-hw>=4.5&&s.z+hw<=17.5,'在道路範圍內');assert.equal(s.heading,staging[0].heading,'順向');

// 迴轉角：只在車尾半圈內。heading 0 時車尾朝 +z、乘客側朝 +x、駕駛側朝 -x。
const v0={x:0,z:0,heading:0};
assert(Math.abs(craneSlewToward(v0,0,10)-Math.PI/2)<1e-9,'目標在車尾 → 90°');
assert(Math.abs(craneSlewToward(v0,-10,0))<1e-9,'目標在駕駛側 → 0°');
assert(Math.abs(craneSlewToward(v0,10,0)-Math.PI)<1e-9,'目標在乘客側 → 180°');
assert(Math.abs(craneSlewToward(v0,-3,-10))<1e-9&&Math.abs(craneSlewToward(v0,3,-10)-Math.PI)<1e-9,'目標在車頭前方：不越過車身，停在最近的一側');

// 信義街景：共用出勤邏輯（同排煙車測試的方格路網）；到場後架設支撐腳、展開吊臂，不補水。
const nodes=[],adj=[],idx=(i,j)=>i*7+j;for(let i=0;i<7;i++)for(let j=0;j<7;j++){nodes.push({x:(j-3)*40,z:(i-3)*40});adj.push([]);}
for(let i=0;i<7;i++)for(let j=0;j<7;j++){if(j<6){adj[idx(i,j)].push([idx(i,j+1),40]);adj[idx(i,j+1)].push([idx(i,j),40]);}if(i<6){adj[idx(i,j)].push([idx(i+1,j),40]);adj[idx(i+1,j)].push([idx(i,j),40]);}}
const graph={nodes,adj},site={x:0,z:-10,nx:0,nz:1};
const blockB=(x,z)=>x>-15&&x<15&&z>-30&&z<-10;
const colliders={resolve:(x,z,r)=>({x,z,hit:blockB(x,z)||blockB(x+r,z)||blockB(x-r,z)||blockB(x,z+r)||blockB(x,z-r)})};
const kit=createRescueTruck({scene:new T.Scene(),template:model,ground:{at:()=>0},colliders,graph});
assert(kit.crane,'街景救助器材車帶 rig');
kit.setRouter((x0,z0,x1,z1)=>({points:[[x0,z0],[x1,z0],[x1,z1]]}));
const pose=kit.dispatch(site,{home:{x:120,z:120,heading:0,exit:{x:120,z:100}},existing:[{x:0,z:15}]});
assert(pose,'找得到停車點');const dd=Math.hypot(pose.x-site.x,pose.z-site.z);assert(dd>=RESCUE_TRUCK.stagingMin&&dd<=RESCUE_TRUCK.stagingMax,'停車距離 '+dd);
let t=0;for(let i=0;i<20*600&&kit.state!=='parked';i++){t+=.05;kit.update(.05,{t,now:t,blockers:()=>[]});}
assert.equal(kit.state,'parked','抵達停車點');assert(t>=RESCUE_TRUCK.turnout,'先經出勤準備');
const spun=kit.vehicle.wheels[0].rotation.z;assert(Math.abs(spun*RESCUE_TRUCK.tyreRadius-kit.vehicle.len)<.5,'車輪轉動距離與路線長度一致');
for(let i=0;i<(RESCUE_TRUCK.deployTime+1)/.05;i++){t+=.05;assert.equal(kit.update(.05,{t,now:t,truck:{x:pose.x+5,z:pose.z,water:0,capacity:2000}}),0,'不補水');}
assert.equal(kit.vehicle.crane.state,'ready','吊臂與照明就位');assert.equal(kit.crane.u,1,'展開完成');
assert(kit.vehicle.log.some(l=>/支撐腳著地/.test(l.text)),'任務紀錄');
assert(kit.vehicle.crane.slew>=0&&kit.vehicle.crane.slew<=Math.PI,'迴轉在車尾半圈 '+(kit.vehicle.crane.slew*180/Math.PI).toFixed(0)+'°');
assert.equal(kit.circles().length,3);kit.hide();assert.equal(kit.circles().length,0);assert.equal(kit.vehicle.crane.state,'stowed','結束任務收回');assert.equal(kit.crane.u,0);
console.log('rescue-truck OK',(bytes/1048576).toFixed(2)+' MB',size.toArray().map(v=>v.toFixed(3)).join(' x '));
