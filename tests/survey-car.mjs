import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';

// 災情勘查車（Outlander 車體）GLB：骨架節點、警示燈材質與外廓尺寸。
const buf=readFileSync(new URL('../dist/assets/survey-car.glb',import.meta.url));
assert.equal(buf.toString('ascii',0,4),'glTF');
const len=buf.readUInt32LE(12),gl=JSON.parse(buf.toString('utf8',20,20+len));
const names=new Set(gl.nodes.map(n=>n.name));

// 四輪轉動節點（前輪掛在轉向節點下）、攝影機桅桿三段、整車節點。
assert.equal(gl.nodes.filter(n=>/^Wheel spin/.test(n.name??'')).length,4,'4 個車輪轉動節點');
for(const n of ['Vehicle','Steer F L','Steer F R','Camera mast','Camera pan','Camera tilt'])assert(names.has(n),n);
const byName=Object.fromEntries(gl.nodes.map((n,i)=>[n.name,i]));
for(const s of ['L','R'])assert(gl.nodes[byName['Steer F '+s]].children.includes(byName['Wheel spin F '+s]),'前輪 '+s+' 掛在轉向節點下');
assert(gl.nodes[byName['Camera mast']].children.includes(byName['Camera pan']));
assert(gl.nodes[byName['Camera pan']].children.includes(byName['Camera tilt']));
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
// 臺北市消防局「災情勘查車」：車長約 4.71 m、車寬約 2.19 m（含後視鏡）、車高約 1.98 m（含燈具與攝影機）。
assert(size.x>4.70&&size.x<4.80,'車長 '+size.x.toFixed(3));
assert(size.z>2.15&&size.z<=2.20,'車寬 '+size.z.toFixed(3));
assert(size.y>1.95&&size.y<=1.985,'車高 '+size.y.toFixed(3));
assert(Math.abs(box.min.y)<.005,'輪胎底在 0：'+box.min.y.toFixed(4));
assert(Math.abs(box.min.z+box.max.z)<.02,'左右對稱');

// 車輪節點：前後軸距 2.705 m、輪距 1.60 m（Outlander 第四代）。
const wheel=n=>new T.Vector3(...gl.nodes[byName[n]].translation);
const steer=n=>new T.Vector3(...gl.nodes[byName[n]].translation);
const vehicle=gl.nodes[byName['Vehicle']];
assert(!vehicle.translation||vehicle.translation.every(v=>Math.abs(v)<1e-6),'整車節點在原點');
const fl=steer('Steer F L'),rl=wheel('Wheel spin R L'),rr=wheel('Wheel spin R R');
assert(Math.abs((rl.x-fl.x)-2.705)<.005,'軸距 '+(rl.x-fl.x).toFixed(3));
assert(Math.abs(Math.abs(rr.z-rl.z)-1.60)<.005,'輪距 '+Math.abs(rr.z-rl.z).toFixed(3));
assert(Math.abs(fl.y-.369)<.005,'輪心高＝輪胎半徑 0.369 m');
console.log('survey-car OK',size.toArray().map(v=>v.toFixed(3)).join(' x '));
