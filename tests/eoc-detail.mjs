// 災害應變中心併入信義街景漫遊：本體模型帶場地（停車場、車、樹、鋪面）並標記 drape、
// 鋪面與車輛貼合地形、寫實化材質與夜間亮窗、獨立模型檢視頁已刪且沒有殘留連結。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {drapeSite,enhanceEoc} from '../dist/eoc-detail.js';

const url=f=>new URL('../dist/'+f,import.meta.url);
const buf=fs.readFileSync(url('assets/taipei-eoc-core.glb'));
const gltf=await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');
const root=gltf.scene;root.position.set(100,9.66,200);root.rotation.y=-.02;

const count={surface:0,object:0,cars:0,trees:0};
root.traverse(o=>{const d=o.userData.drape;if(d)count[d]++;if(d&&/^Parked_car/.test(o.name))count.cars++;if(d&&/^EOC_tree/.test(o.name))count.trees++;});
assert(count.cars>100,'parked cars in the lot: '+count.cars);
assert(count.trees>60,'trees: '+count.trees);
assert(count.surface>=5&&count.object>=count.cars+count.trees,'drape flags '+JSON.stringify(count));
for(const n of ['EOC_building','EOC_helipad_deck','EOC_site_paving','EOC_parking_lot'])assert(root.getObjectByName(n),'has '+n);
// 不帶完整模型裡示意的周邊建物、道路與遠景地面
root.traverse(o=>assert(!/^(Shophouse|Walk-up|World_Trade|Xinyi_JHS|Taipei_101|EOC_site_ground|EOC_alley$)/.test(o.name),'no invented surroundings: '+o.name));

// 地形：西低東高的斜面
const ground={at:(x,z)=>9.2+(x-100)*.004};
const lot=root.getObjectByName('EOC_parking_lot'),car=root.getObjectByName('Parked_car_01');
drapeSite(root,ground);root.updateMatrixWorld(true);
const p=new T.Vector3(),g=[];lot.traverse(m=>{if(!m.isMesh)return;const a=m.geometry.attributes.position;
 for(let i=0;i<a.count;i+=7){p.fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld);g.push(p.y-ground.at(p.x,p.z));}});
// 停車場面只保留模型本身 2 cm 的地坪高，不另加防閃爍抬升（防閃爍改用 polygonOffset），可步行高度不會是假的高差
assert(g.length&&g.every(d=>d>=0&&d<.03),'lot follows the ground, no visual lift: '+Math.min(...g).toFixed(3)+'…'+Math.max(...g).toFixed(3));
lot.traverse(m=>{if(m.isMesh)for(const mt of [].concat(m.material))assert(mt.polygonOffset,'draped paving uses polygonOffset');});
car.getWorldPosition(p);const box=new T.Box3().setFromObject(car);
assert(Math.abs(box.min.y-ground.at(p.x,p.z))<.4,'car stands on the ground');

const d=enhanceEoc(root);
assert(d.lit.length>=2,'glass lights up at night');assert(d.edge.length===1,'helipad edge light');assert(d.sock,'windsock');
d.setNight(1);assert(d.lit.every(m=>m.emissiveIntensity>0));d.setNight(0);assert(d.lit.every(m=>m.emissiveIntensity===0));

// 模型檢視頁與完整模型已刪，網站沒有連過去的地方
for(const f of ['taipei-eoc.html','taipei-eoc.js','taipei-eoc.css','assets/taipei-eoc.glb'])assert(!fs.existsSync(url(f)),f+' removed');
for(const f of fs.readdirSync(url('')).filter(f=>/\.(html|js)$/.test(f)))assert(!/taipei-eoc\.(html|glb)/.test(fs.readFileSync(url(f),'utf8')),f+' links the removed page');
assert.equal(JSON.parse(fs.readFileSync(url('assets/eoc-anchor.json'))).detailPage,null);
console.log('eoc detail ok',JSON.stringify(count));
