import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {SURVEY_CAR,createSurveyCar} from '../dist/xinyi-street-survey-car.js';
import {staging,aerialStaging,tankerStaging,surveyCarStaging} from '../dist/staging.js';

// 臺北市消防局 Outlander 勤務車（第三代小改款，依實車照片）GLB：骨架節點、警示燈材質與外廓尺寸。
const buf=readFileSync(new URL('../dist/assets/survey-car.glb',import.meta.url));
assert.equal(buf.toString('ascii',0,4),'glTF');
const len=buf.readUInt32LE(12),gl=JSON.parse(buf.toString('utf8',20,20+len));
const names=new Set(gl.nodes.map(n=>n.name));

// 四輪轉動節點（前輪掛在轉向節點下）、整車節點。
assert.equal(gl.nodes.filter(n=>/^Wheel spin/.test(n.name??'')).length,4,'4 個車輪轉動節點');
for(const n of ['Vehicle','Steer F L','Steer F R'])assert(names.has(n),n);
const byName=Object.fromEntries(gl.nodes.map((n,i)=>[n.name,i]));
for(const s of ['L','R'])assert(gl.nodes[byName['Steer F '+s]].children.includes(byName['Wheel spin F '+s]),'前輪 '+s+' 掛在轉向節點下');
// 與水庫車相同的紅色燈罩材質名稱，既有的閃爍程式可直接套用。
assert(gl.materials.some(m=>m.name==='Red beacon lens'),'紅色警示燈材質');
assert(gl.materials.some(m=>m.name==='Tail lamp lens'),'尾燈材質');

// 外廓：依節點階層把每個網格的 POSITION 範圍轉到世界座標（glTF Y 向上；車頭朝 -X）。
const box=new T.Box3(),local=new T.Matrix4();
function walk(i,parent){
 const n=gl.nodes[i],m=new T.Matrix4();
 if(n.matrix)m.fromArray(n.matrix);
 else m.compose(new T.Vector3(...(n.translation??[0,0,0])),new T.Quaternion(...(n.rotation??[0,0,0,1])),new T.Vector3(...(n.scale??[1,1,1])));
 const w=parent.clone().multiply(m);
 if(n.mesh!=null)for(const p of gl.meshes[n.mesh].primitives){
  const a=gl.accessors[p.attributes.POSITION];
  for(const x of [a.min[0],a.max[0]])for(const y of [a.min[1],a.max[1]])for(const z of [a.min[2],a.max[2]])
   box.expandByPoint(new T.Vector3(x,y,z).applyMatrix4(w));}
 for(const c of n.children??[])walk(c,w);}
for(const r of gl.scenes[gl.scene??0].nodes)walk(r,local.identity());
const size=box.getSize(new T.Vector3());
// Outlander 第三代（臺灣 2019–21）：4,695 × 1,810 × 1,710 mm；含後視鏡約 2.10 m，含車頂警示燈約 1.86 m。
assert(size.x>4.66&&size.x<4.74,'車長 '+size.x.toFixed(3));
assert(size.z>2.05&&size.z<=2.12,'車寬 '+size.z.toFixed(3));
assert(size.y>1.82&&size.y<=1.90,'車高 '+size.y.toFixed(3));
assert(Math.abs(box.min.y)<.005,'輪胎底在 0：'+box.min.y.toFixed(4));
assert(Math.abs(box.min.z+box.max.z)<.02,'左右對稱');

// 車輪節點：軸距 2.670 m、輪距 1.54 m、225/55 R18 輪胎半徑 0.352 m。
const wheel=n=>new T.Vector3(...gl.nodes[byName[n]].translation);
const steer=n=>new T.Vector3(...gl.nodes[byName[n]].translation);
const vehicle=gl.nodes[byName['Vehicle']];
assert(!vehicle.translation||vehicle.translation.every(v=>Math.abs(v)<1e-6),'整車節點在原點');
const fl=steer('Steer F L'),rl=wheel('Wheel spin R L'),rr=wheel('Wheel spin R R');
assert(Math.abs((rl.x-fl.x)-2.670)<.005,'軸距 '+(rl.x-fl.x).toFixed(3));
assert(Math.abs(Math.abs(rr.z-rl.z)-1.54)<.005,'輪距 '+Math.abs(rr.z-rl.z).toFixed(3));
assert(Math.abs(fl.y-.352)<.005,'輪心高＝輪胎半徑 0.352 m');

// 消防演練首頁：勤務車停放位置不與四個車組、水庫車、雲梯作業區重疊，在道路範圍內、順向。
const half=size.x/2;
for(const p of staging){if(Math.abs(p.z-surveyCarStaging.z)>2.6)continue;assert(Math.abs(p.x-surveyCarStaging.x)-half-3.72>=2,'與車組車輛保持間隔 '+p.x);}
assert(Math.abs(tankerStaging.x-surveyCarStaging.x)>half+9.45/2+2,'與水庫車不重疊');
assert(surveyCarStaging.x-half>aerialStaging.workMaxX,'不占雲梯作業區');
assert(surveyCarStaging.x+half<=45,'在道路範圍內');assert.equal(surveyCarStaging.heading,staging[3].heading,'順向');

// 信義街景：與水庫車共用出勤邏輯（方格路網，同水庫車測試），不載水、不補水。
const nodes=[],adj=[],idx=(i,j)=>i*7+j;for(let i=0;i<7;i++)for(let j=0;j<7;j++){nodes.push({x:(j-3)*40,z:(i-3)*40});adj.push([]);}
for(let i=0;i<7;i++)for(let j=0;j<7;j++){if(j<6){adj[idx(i,j)].push([idx(i,j+1),40]);adj[idx(i,j+1)].push([idx(i,j),40]);}if(i<6){adj[idx(i,j)].push([idx(i+1,j),40]);adj[idx(i+1,j)].push([idx(i,j),40]);}}
const graph={nodes,adj},site={x:0,z:-10,nx:0,nz:1};
const blockB=(x,z)=>x>-15&&x<15&&z>-30&&z<-10;
const colliders={resolve:(x,z,r)=>({x,z,hit:blockB(x,z)||blockB(x+r,z)||blockB(x-r,z)||blockB(x,z+r)||blockB(x,z-r)})};
const tpl=new T.Group();for(const n of ['F L','F R','R L','R R']){const w=new T.Object3D();w.name='Wheel spin '+n;tpl.add(w);}
tpl.add(new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({name:'Red beacon lens'})));
const kit=createSurveyCar({scene:new T.Scene(),template:tpl,ground:{at:()=>0},colliders,graph});
kit.setRouter((x0,z0,x1,z1)=>({points:[[x0,z0],[x1,z0],[x1,z1]]}));
const pose=kit.dispatch(site,{home:{x:120,z:120,heading:0,exit:{x:120,z:100}},existing:[{x:0,z:15}]});
assert(pose,'找得到停車點');const dd=Math.hypot(pose.x-site.x,pose.z-site.z);assert(dd>=SURVEY_CAR.stagingMin&&dd<=SURVEY_CAR.stagingMax,'停車距離 '+dd);
assert.equal(kit.vehicle.log[0].text,SURVEY_CAR.dispatchText);assert.equal(kit.water,0,'不載水');
let t=0;for(let i=0;i<20*600&&kit.state!=='parked';i++){t+=.05;kit.update(.05,{t,now:t,blockers:()=>[]});}
assert.equal(kit.state,'parked','抵達停車點');assert(t>=SURVEY_CAR.turnout,'先經出勤準備');
const spun=kit.vehicle.wheels[0].rotation.z;assert(Math.abs(spun*SURVEY_CAR.tyreRadius-kit.vehicle.len)<.5,'車輪轉動距離與路線長度一致');
assert.equal(kit.vehicle.log.at(-1).text,SURVEY_CAR.arriveText);
assert.equal(kit.update(.5,{t,now:t,truck:{x:pose.x+5,z:pose.z,water:0,capacity:2000}}),0,'不補水');
assert.equal(kit.circles().length,2);kit.hide();assert.equal(kit.circles().length,0);
console.log('survey-car OK',size.toArray().map(v=>v.toFixed(3)).join(' x '));
