// 消防車車輪重組：靜止時頂點與原車型完全相同；轉動時只有車輪零件繞輪軸移動。
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as T from 'three';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {rigWheels} from '../dist/wheel-rig.js';
const loader=new GLTFLoader();loader.register(()=>({name:'headless-textures',loadTexture:()=>Promise.resolve(new T.Texture())}));
const bytes=await fs.readFile(new URL('../dist/assets/geo-fire-engine.glb',import.meta.url));
const load=async()=>(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
// 以 1 mm 格網雜湊比對頂點（容許 0.1 mm 浮點誤差），避免四捨五入邊界誤判。
function snapshot(root){root.updateMatrixWorld(true);const pts=[],v=new T.Vector3();let tris=0;
 root.traverse(m=>{if(!m.isMesh)return;const pos=m.geometry.attributes.position,idx=m.geometry.index;tris+=idx.count/3;for(let t=0;t<idx.count;t++){v.fromBufferAttribute(pos,idx.getX(t)).applyMatrix4(m.matrixWorld);pts.push([m.material.name,v.x,v.y,v.z]);}});return {pts,tris};}
function unmatched(a,b,tol=1e-4){const grid=new Map(),cell=p=>p.slice(1).map(x=>Math.floor(x*1000));
 for(const p of b.pts){const k=p[0]+cell(p).join(',');if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p);}
 let miss=0;for(const p of a.pts){const [i,j,k]=cell(p);let ok=false;for(let x=-1;x<=1&&!ok;x++)for(let y=-1;y<=1&&!ok;y++)for(let z=-1;z<=1&&!ok;z++)for(const q of grid.get(p[0]+[i+x,j+y,k+z].join(','))??[])if(Math.abs(q[1]-p[1])<tol&&Math.abs(q[2]-p[2])<tol&&Math.abs(q[3]-p[3])<tol){ok=true;break;}if(!ok)miss++;}return miss;}
const original=await load(),before=snapshot(original);
const model=await load(),rig=rigWheels(model);
assert.ok(rig,'wheels rigged');assert.equal(rig.wheels.length,4,'four wheel pivots');
const fronts=rig.wheels.filter(w=>w.front);assert.equal(fronts.length,2);
for(const w of rig.wheels){assert.ok(Math.abs(w.axle.y-0.54)<.02,'axle height');assert.ok(Math.abs(w.axle.x-(w.front?-2.5:1.4))<.03,'axle position');}
const after=snapshot(model);assert.equal(after.tris,before.tris,'triangle count unchanged');
assert.equal(after.pts.length,before.pts.length);assert.equal(unmatched(before,after),0,'every vertex identical at rest');assert.equal(unmatched(after,before),0);
assert.equal(rig.fixed,0,'every wheel-node part follows an axle');
// 轉動 1 rad 並左轉 0.4 rad：車輪頂點仍在輪軸半徑內，車身頂點不動。
rig.update(rig.radius*1,0.4);model.updateMatrixWorld(true);const v=new T.Vector3();
for(const w of rig.wheels)w.spin.traverse(m=>{if(!m.isMesh)return;const pos=m.geometry.attributes.position;for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i);assert.ok(Math.hypot(v.x,v.y)<=rig.radius+.06,'wheel part stays on axle');}});
const wheelMeshes=new Set();for(const w of rig.wheels)w.steer.traverse(m=>m.isMesh&&wheelMeshes.add(m));
const body={pts:[]};model.traverse(m=>{if(!m.isMesh||wheelMeshes.has(m))return;const pos=m.geometry.attributes.position,idx=m.geometry.index;for(let t=0;t<idx.count;t++){v.fromBufferAttribute(pos,idx.getX(t)).applyMatrix4(m.matrixWorld);body.pts.push([m.material.name,v.x,v.y,v.z]);}});
assert.ok(body.pts.length>0);assert.equal(unmatched(body,before),0,'body untouched while wheels turn');
console.log(`Wheel rig: 4 pivots (front axle x=${fronts[0].axle.x.toFixed(2)} m), ${before.tris} triangles, rest pose identical, wheels spin/steer about axles, body unchanged.`);
