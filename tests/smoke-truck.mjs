import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {MeshoptDecoder} from '../dist/vendor/jsm/libs/meshopt_decoder.module.js';
import {rigSmokeFan,FAN} from '../dist/imported-smoke-truck.js';
import {SMOKE_TRUCK,createSmokeTruck,slewToward} from '../dist/xinyi-street-smoke-truck.js';
import {staging,aerialStaging,tankerStaging,surveyCarStaging,smokeTruckStaging} from '../dist/staging.js';

// 排煙車「劍潭76」網頁版 GLB：容量、壓縮擴充、rig 節點與外廓。
const file=new URL('../dist/assets/smoke-truck.glb',import.meta.url),bytes=statSync(file).size;
assert(bytes<1.2*1048576,'網頁版模型 < 1.2 MB：'+(bytes/1048576).toFixed(2)+' MB');
const buf=readFileSync(file);assert.equal(buf.toString('ascii',0,4),'glTF');
const len=buf.readUInt32LE(12),gl=JSON.parse(buf.toString('utf8',20,20+len));
for(const e of ['EXT_meshopt_compression','KHR_mesh_quantization'])assert(gl.extensionsRequired.includes(e),e);
assert(gl.meshes.length<=30,'同一 rig 節點下的零件已合併：'+gl.meshes.length+' 個網格');
const names=new Set(gl.nodes.map(n=>n.name));
for(const n of ['Vehicle','Fan slew','Fan boom lift','Fan boom extend','Fan tilt','Fan rotor','Lift ram anchor','Lift ram eye','Lift ram barrel','Lift ram rod'])assert(names.has(n),n);
assert.equal(gl.nodes.filter(n=>/^Wheel spin [^ ]+ [LR]( (inner|outer))?$/.test(n.name??'')).length,6,'6 個車輪轉動節點（後輪雙胎）');
assert(gl.materials.some(m=>m.name==='Red beacon lens'),'紅色警示燈材質');

// 實際解碼（meshopt wasm）後計算外廓與 rig。
// Node 沒有 Image：解析前拿掉貼圖（徽章 PNG），幾何與 rig 不受影響。
const strip=JSON.parse(JSON.stringify(gl));delete strip.images;delete strip.textures;delete strip.samplers;
for(const m of strip.materials){for(const k of Object.keys(m))if(/Texture$/.test(k))delete m[k];if(m.pbrMetallicRoughness)for(const k of Object.keys(m.pbrMetallicRoughness))if(/Texture$/.test(k))delete m.pbrMetallicRoughness[k];delete m.extensions;}
let js=Buffer.from(JSON.stringify(strip));js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,0x20)]);
const rest=buf.subarray(20+len),glb=Buffer.concat([Buffer.alloc(20),js,rest]);glb.write('glTF',0,'ascii');glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(js.length,12);glb.writeUInt32LE(0x4E4F534A,16);
const gltf=await new Promise((ok,no)=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength),'',ok,no));
const model=gltf.scene;model.updateMatrixWorld(true);
const size=new T.Box3().setFromObject(model).getSize(new T.Vector3()),bb=new T.Box3().setFromObject(model);
// 76 車：全長約 7.4 m（含保險桿與尾梯）、車身寬 2.45 m（含後視鏡約 3.08 m）、高約 3.23 m（收納的排煙機頂）；與 Blender 原檔相同。
assert(size.x>7.38&&size.x<7.48,'車長 '+size.x.toFixed(3));
assert(size.z>3.0&&size.z<3.15,'車寬 '+size.z.toFixed(3));
assert(size.y>3.15&&size.y<3.3,'車高 '+size.y.toFixed(3));
assert(Math.abs(bb.min.y)<.025,'輪胎底在 0（接地處略壓扁）：'+bb.min.y.toFixed(4));

const rig=rigSmokeFan(model);assert(rig,'排煙機 rig');
const world=n=>{let o=null;model.traverse(x=>{if(x.name.replace(/_/g,' ')===n)o=x;});model.updateMatrixWorld(true);return new T.Vector3().setFromMatrixPosition(o.matrixWorld);};
const node=n=>{let o=null;model.traverse(x=>{if(x.name.replace(/_/g,' ')===n)o=x;});return o;};
const drum0=world('Fan rotor'),bodyTop=3.4;
// 油壓缸兩節：區域 +Y 對準另一端銷；兩節重疊（伸縮不脫出）。
function ramCheck(tag){model.updateMatrixWorld(true);const a=world('Lift ram anchor'),b=world('Lift ram eye'),L=a.distanceTo(b);
 for(const [part,from,to] of [['Lift ram barrel',a,b],['Lift ram rod',b,a]]){const y=new T.Vector3(0,1,0).transformDirection(node(part).matrixWorld),d=to.clone().sub(from).normalize();assert(y.dot(d)>.999,tag+' '+part+' 對準 '+y.dot(d).toFixed(4));}
 return L;}
const L0=ramCheck('收納');
rig.set(1,0);const L1=ramCheck('展開');assert(L1>L0+.3,'起臂時油壓缸伸長 '+L0.toFixed(3)+' → '+L1.toFixed(3));
const drum1=world('Fan rotor');assert(drum1.y>drum0.y+1.2,'排煙機升高 '+drum0.y.toFixed(2)+' → '+drum1.y.toFixed(2));
assert(drum1.y>bodyTop-.3&&drum1.y<6,'展開高度合理 '+drum1.y.toFixed(2));
// 調平：起臂 65°、排煙機 -45°，出風口（葉輪軸 +X）下俯約 20°。
const axis=new T.Vector3(1,0,0).transformDirection(node('Fan rotor').matrixWorld),pitch=Math.asin(-axis.y)*180/Math.PI;
assert(Math.abs(Math.abs(pitch)-20)<1.5,'出風口俯角約 20°：'+pitch.toFixed(1));
rig.set(1,Math.PI/2);model.updateMatrixWorld(true);const sideAxis=new T.Vector3(1,0,0).transformDirection(node('Fan rotor').matrixWorld);
assert(Math.abs(sideAxis.x)<.02&&Math.abs(Math.abs(sideAxis.z)-Math.cos(20*Math.PI/180))<.03,'旋轉 90° 後出風口朝車側 '+sideAxis.toArray().map(v=>v.toFixed(2)));
console.log('fan head: stowed',drum0.toArray().map(v=>v.toFixed(2)).join(','),'deployed',drum1.toArray().map(v=>v.toFixed(2)).join(','),'ram',L0.toFixed(3),'->',L1.toFixed(3),'pitch',pitch.toFixed(1));
rig.set(0);const back=world('Fan rotor');assert(back.distanceTo(drum0)<1e-4,'收回後回到收納位置');

// 演練首頁：停在對向側車道，與四個車組、水庫車、勤務車、雲梯作業區都不重疊，在道路範圍內、順向。
const s=smokeTruckStaging,half=7.4/2,hw=2.45/2;
const clear=(x,z,l,w)=>Math.abs(x-s.x)>=half+l/2+1||Math.abs(z-s.z)>=hw+w/2+.5;
for(const p of staging)assert(clear(p.x,p.z,7.44,2.5),'與車組車輛保持間隔 '+p.x);
assert(clear(tankerStaging.x,tankerStaging.z,9.45,2.5),'與水庫車不重疊');assert(clear(surveyCarStaging.x,surveyCarStaging.z,4.7,1.85),'與勤務車不重疊');
assert(s.x+half<aerialStaging.workMinX||s.x-half>aerialStaging.workMaxX,'不占雲梯作業區');
assert(s.x-half>=-45&&s.x+half<=45&&s.z-hw>=4.5&&s.z+hw<=17.5,'在道路範圍內');assert.equal(s.heading,staging[0].heading,'順向');

// 排煙機朝向：車尾方向為 0，正側方為 ±90°。
assert(Math.abs(slewToward({x:0,z:0,heading:0},0,10))<1e-9);
assert(Math.abs(Math.abs(slewToward({x:0,z:0,heading:0},10,0))-Math.PI/2)<1e-9);

// 信義街景：共用出勤邏輯（同勤務車測試的方格路網）；到場後展開排煙機、葉輪起轉，不補水。
const nodes=[],adj=[],idx=(i,j)=>i*7+j;for(let i=0;i<7;i++)for(let j=0;j<7;j++){nodes.push({x:(j-3)*40,z:(i-3)*40});adj.push([]);}
for(let i=0;i<7;i++)for(let j=0;j<7;j++){if(j<6){adj[idx(i,j)].push([idx(i,j+1),40]);adj[idx(i,j+1)].push([idx(i,j),40]);}if(i<6){adj[idx(i,j)].push([idx(i+1,j),40]);adj[idx(i+1,j)].push([idx(i,j),40]);}}
const graph={nodes,adj},site={x:0,z:-10,nx:0,nz:1};
const blockB=(x,z)=>x>-15&&x<15&&z>-30&&z<-10;
const colliders={resolve:(x,z,r)=>({x,z,hit:blockB(x,z)||blockB(x+r,z)||blockB(x-r,z)||blockB(x,z+r)||blockB(x,z-r)})};
const kit=createSmokeTruck({scene:new T.Scene(),template:model,ground:{at:()=>0},colliders,graph});
assert(kit.fan,'街景排煙車帶 rig');
kit.setRouter((x0,z0,x1,z1)=>({points:[[x0,z0],[x1,z0],[x1,z1]]}));
const pose=kit.dispatch(site,{home:{x:120,z:120,heading:0,exit:{x:120,z:100}},existing:[{x:0,z:15}]});
assert(pose,'找得到停車點');const dd=Math.hypot(pose.x-site.x,pose.z-site.z);assert(dd>=SMOKE_TRUCK.stagingMin&&dd<=SMOKE_TRUCK.stagingMax,'停車距離 '+dd);
let t=0;for(let i=0;i<20*600&&kit.state!=='parked';i++){t+=.05;kit.update(.05,{t,now:t,blockers:()=>[]});}
assert.equal(kit.state,'parked','抵達停車點');assert(t>=SMOKE_TRUCK.turnout,'先經出勤準備');
const spun=kit.vehicle.wheels[0].rotation.z;assert(Math.abs(spun*SMOKE_TRUCK.tyreRadius-kit.vehicle.len)<.5,'車輪轉動距離與路線長度一致');
for(let i=0;i<(SMOKE_TRUCK.deployTime+SMOKE_TRUCK.spinUp+1)/.05;i++){t+=.05;assert.equal(kit.update(.05,{t,now:t,truck:{x:pose.x+5,z:pose.z,water:0,capacity:2000}}),0,'不補水');}
assert.equal(kit.vehicle.fan.state,'running','排煙機展開並送風');assert.equal(kit.vehicle.fan.level,1,'葉輪全速');
assert(kit.vehicle.log.some(l=>/排煙機展開完成/.test(l.text)),'任務紀錄');
assert(Math.abs(kit.fan.slew-kit.vehicle.fan.slew)<1e-9&&Math.abs(kit.vehicle.fan.slew)<=FAN.slewMax,'朝向火場 '+(kit.vehicle.fan.slew*180/Math.PI).toFixed(0)+'°');
assert.equal(kit.circles().length,3);kit.hide();assert.equal(kit.circles().length,0);assert.equal(kit.vehicle.fan.state,'stowed','結束任務收回');
console.log('smoke-truck OK',(bytes/1048576).toFixed(2)+' MB',size.toArray().map(v=>v.toFixed(3)).join(' x '));
