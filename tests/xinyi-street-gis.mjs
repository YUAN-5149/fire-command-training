// 信義街景 ↔ GIS 部署頁：朝向與座標轉換、人員排列與 GIS 頁一致、寫回與讀取、由搶救建物與入口產生起火面。
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {offsetPoint} from '../dist/geo-deployment.js';
import {GEO_UNITS,loadDeployment,saveDeployment,gisToStreetHeading,streetToGisHeading,forwardToGisHeading,crewOffsets,storeKey} from '../dist/deployment-store.js';
import {deploymentToStreet,streetToRecord,writeBack} from '../dist/xinyi-street-gis.js';
import {project,unproject,buildHeightField} from '../dist/xinyi-street-world.js';
import {siteFromBuilding} from '../dist/xinyi-street-mission.js';
import {aerialFrame,fromFrameXZ} from '../dist/xinyi-street-aerial.js';

const near=(a,b,e=1e-6)=>Math.abs(a-b)<e;
// 朝向：GIS 0° 北、90° 東；街景前方向量 (−sin h, −cos h)，x 東、z 南。
for(const [deg,fx,fz] of [[0,0,-1],[90,1,0],[180,0,1],[270,-1,0],[35,Math.sin(35*Math.PI/180),-Math.cos(35*Math.PI/180)]]){
 const h=gisToStreetHeading(deg);assert(near(-Math.sin(h),fx)&&near(-Math.cos(h),fz),'heading '+deg);
 assert(near(streetToGisHeading(h),deg%360));assert(near(forwardToGisHeading(fx,fz),deg%360));}
// 座標往返
{const [lon,lat]=unproject(123.4,-56.7),[x,z]=project(lon,lat);assert(near(x,123.4,1e-6)&&near(z,-56.7,1e-6));}

// GIS 部署 → 街景：車輛位置、朝向；人員排列與 GIS 頁 paint() 的 offsetPoint 結果相同。
const point={longitude:121.5651,latitude:25.0341};
const dep={items:{engine2:{kind:'vehicle',unitId:'engine2',point,heading:90,width:3.6,length:8.4,task:'滅火部署'},'engine2-crew':{kind:'crew',unitId:'engine2',point,heading:30,width:2,length:2},ambulance:{kind:'vehicle',unitId:'ambulance',point:offsetPoint(point,12,0),heading:180,task:'救護部署'}},logs:[],target:{id:'265427',point:{longitude:121.5658,latitude:25.0325,z:30}},entrance:{longitude:121.5658,latitude:25.0327}};
{const d=deploymentToStreet(dep),[px,pz]=project(point.longitude,point.latitude);
 const e2=d.vehicles.find(v=>v.unitId==='engine2');assert(near(e2.x,px)&&near(e2.z,pz));assert(near(-Math.sin(e2.heading),1),'90° 朝東');assert.equal(e2.task,'滅火部署');
 const amb=d.vehicles.find(v=>v.unitId==='ambulance');assert(near(amb.x-px,12,1e-3)&&near(amb.z,pz,1e-3),'東 12 m');
 assert.equal(d.crew.length,4);assert.deepEqual(d.crew.map(c=>c.rank),['小隊長','隊員','隊員','隊員']);
 const unit=GEO_UNITS.find(u=>u.id==='engine2'),a=30*Math.PI/180;
 unit.crew.forEach((_,i)=>{const x=(i%2-.5)*.9,y=(Math.floor(i/2)-.5)*.9,p=offsetPoint(point,x*Math.cos(a)+y*Math.sin(a),-x*Math.sin(a)+y*Math.cos(a)),[gx,gz]=project(p.longitude,p.latitude);assert(near(d.crew[i].x,gx,1e-3)&&near(d.crew[i].z,gz,1e-3),'人員 '+i);});
 assert(d.target.xz&&d.entrance.xz);
 assert.equal(deploymentToStreet(null),null);assert.deepEqual(deploymentToStreet({items:{bad:{kind:'vehicle',unitId:'nope',point}}}).vehicles,[]);}

// 街景 → GIS 紀錄：位置、朝向（GIS 度數）、車位尺寸與 GIS 頁放置規則相同；保留既有命令。
const models=JSON.parse(await readFile(new URL('../dist/assets/geo-models.json',import.meta.url)));
{const r=streetToRecord('engine1',10,-20,gisToStreetHeading(135),models,{task:'滅火部署'}),[x,z]=project(r.point.longitude,r.point.latitude);
 assert(near(x,10,1e-6)&&near(z,-20,1e-6));assert.equal(r.heading,135);assert.equal(r.task,'滅火部署');assert(near(r.width,models.engine.span+.6)&&near(r.length,models.engine.length+1));
 const a=streetToRecord('aerial',0,0,0,models);assert(near(a.width,Math.max(models.aerial.span+4,7))&&near(a.length,models.aerial.length+2));}
// 雲梯車框架 → GIS 朝向：街景 heading = 框架 heading + π/2 時，前方向量為框架 −X（車頭）。
{const f=aerialFrame({x:0,z:0,nx:.6,nz:.8},5,7),[cx,cz]=fromFrameXZ(f,0,0),[hx,hz]=fromFrameXZ(f,-1,0),h=f.heading+Math.PI/2;assert(near(-Math.sin(h),hx-cx)&&near(-Math.cos(h),hz-cz));}

// 寫回與讀取（模擬 localStorage）
{const mem=new Map(),storage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v)};
 assert.equal(loadDeployment('xinyi',storage),null);
 saveDeployment('xinyi',{...dep,logs:[{time:'t',message:'GIS'}]},'gis',storage);
 const saved=writeBack(loadDeployment('xinyi',storage),{engine:{x:3,z:4,heading:gisToStreetHeading(270)},aerial:{x:-8,z:2,heading:0}},models,storage);assert(saved);
 const back=loadDeployment('xinyi',storage);assert.equal(back.source,'street');assert.equal(back.items.engine1.heading,270);assert.equal(back.items.aerial.heading,0);assert(back.items.engine2&&back.items['engine2-crew'],'保留 GIS 其他車組');
 assert(back.logs[0].message.includes('由信義街景帶回')&&back.logs[1].message==='GIS');assert.equal(back.target.id,'265427');
 assert.equal(writeBack(back,{},models,storage),false,'無位置不寫入');
 mem.set(storeKey('xinyi'),'{broken');assert.equal(loadDeployment('xinyi',storage),null,'損壞資料不讓頁面出錯');
 assert.equal(saveDeployment('xinyi',back,'gis',{setItem(){throw Error('quota');}}),false);}

// 搶救建物 → 起火面：選該量體落地牆面中最靠近第一正面入口且面向入口者。
const district=JSON.parse(await readFile(new URL('../dist/assets/district-xinyi.json',import.meta.url)));
const streets=JSON.parse(await readFile(new URL('../dist/assets/streets-xinyi.json',import.meta.url)));
const ground=buildHeightField(district.buildings,district.bbox);
let checked=0;
for(const b of district.buildings){let base=Infinity,top=0;for(const w of b.walls){base=Math.min(base,w.a[2],w.b[2]);top=Math.max(top,w.h);}
 const walls=b.walls.filter(w=>w.w>=8&&Math.max(w.a[2],w.b[2])<=base+.4);if(top<15||walls.length<3)continue;
 for(const w of walls.slice(0,3)){const [ax,az]=project(w.a[0],w.a[1]),[bx,bz]=project(w.b[0],w.b[1]),l=Math.hypot(w.n[0],w.n[1]),nx=w.n[0]/l,nz=-w.n[1]/l,mx=(ax+bx)/2,mz=(az+bz)/2;
  const [elon,elat]=unproject(mx+nx*2,mz+nz*2),site=siteFromBuilding(district.buildings,streets.features,ground,{id:b.id,entrance:{longitude:elon,latitude:elat},rand:()=>.5});
  assert(site&&site.fromGis&&site.buildingId===b.id);
  const d=Math.hypot(site.x+site.nx*2-(mx+nx*2),site.z+site.nz*2-(mz+nz*2));
  // 同一牆面或共線相鄰的另一段落地牆：入口須在所選牆面外側且距離不超過入口到原牆的距離。
  assert(((mx+nx*2)-site.x)*site.nx+((mz+nz*2)-site.z)*site.nz>0,'入口在起火面外側');assert(d<w.w,'選到入口所在的牆面');
  assert(site.floor>=2&&site.y<site.base+site.height,'起火樓層在量體高度內');checked++;}
 if(checked>=24)break;}
assert(checked>=24);
// 以 GIS 點選位置（屋頂）找量體；找不到時回傳 null
{const b=district.buildings.find(v=>v.roofs?.length>=3&&v.walls.length>=4),r=b.roofs,[lon,lat]=[(r[0][0]+r[1][0]+r[2][0])/3,(r[0][1]+r[1][1]+r[2][1])/3];
 const s=siteFromBuilding(district.buildings,streets.features,ground,{id:'not-a-real-id',point:{longitude:lon,latitude:lat}});assert(s,'以屋頂位置找到量體');
 assert.equal(siteFromBuilding(district.buildings,streets.features,ground,{id:'nope',point:{longitude:121.40,latitude:25.20}}),null);}
console.log('xinyi-street-gis: ok',{checked});
