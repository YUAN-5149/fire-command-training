// 信義街景漫遊・街道生活層（全部為示意，非實測、非實際店家／車流）：
// 車道標線、一樓店面招牌、補植行道樹、NPC 車流與行人、時段光影。
// 只加在本頁；不改動 GIS 頁的官方量體、道路寬度與既有樣板。
import * as T from 'three';
import {project} from './xinyi-street-world.js?v=s13';

const key=p=>p[0].toFixed(7)+','+p[1].toFixed(7);
const isOneway=t=>['yes','1','-1'].includes(t?.oneway);
const MARKED=new Set(['primary','secondary','tertiary','trunk','unclassified']);
const DRIVABLE=new Set(['primary','secondary','tertiary','trunk','unclassified','residential']);

function localPath(path,step=1){
 const pts=[];for(let i=0;i<path.length;i++){const p=project(path[i][0],path[i][1]);if(i){const q=pts[pts.length-1],n=Math.max(1,Math.ceil(Math.hypot(p[0]-q[0],p[1]-q[1])/step));for(let s=1;s<n;s++)pts.push([q[0]+(p[0]-q[0])*s/n,q[1]+(p[1]-q[1])*s/n]);}pts.push(p);}
 const along=[0];for(let i=1;i<pts.length;i++)along.push(along[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
 return {pts,along,length:along[along.length-1]};
}
function normalAt(pts,i){const a=pts[Math.max(i-1,0)],b=pts[Math.min(i+1,pts.length-1)],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;return [-dz/l,dx/l];}

// 路口：被兩條以上車道路段共用的節點；標線在路口半徑內中斷。
export function findJunctions(features){
 const ways=new Map(),width=new Map();
 for(const f of features){if(f.kind!=='road')continue;for(const path of f.paths)for(const p of path){const k=key(p);if(!ways.has(k))ways.set(k,new Set());ways.get(k).add(f.id);width.set(k,Math.max(width.get(k)||0,f.width||6));}}
 const out=[];for(const [k,set] of ways)if(set.size>=2){const [lon,lat]=k.split(',').map(Number),[x,z]=project(lon,lat);out.push({x,z,r:width.get(k)/2+2.5});}
 return out;
}

// 車道標線（示意）：邊線白實線、雙向道雙黃線、車道白虛線（線段 4 m、間隔 6 m）。車道數依 OSM lanes，缺值以寬度 ÷ 3.3 m 估計。
export function buildLaneMarkings(features,ground,{lift=.05}={}){
 const junctions=findJunctions(features),groups={white:{position:[],index:[]},yellow:{position:[],index:[]}};
 const nearJunction=(x,z)=>junctions.some(j=>Math.abs(j.x-x)<j.r&&Math.abs(j.z-z)<j.r&&Math.hypot(j.x-x,j.z-z)<j.r);
 let lines=0;
 for(const f of features){
  if(f.kind!=='road'||!MARKED.has(f.tags.highway)||!(f.width>=6))continue;
  const w=f.width,lanes=Math.max(1,parseInt(f.tags.lanes)||Math.round(w/3.3)),oneway=isOneway(f.tags),specs=[];
  specs.push([-(w/2-.3),.15,'white',false],[w/2-.3,.15,'white',false]);
  if(!oneway&&lanes>=2){specs.push([-.12,.12,'yellow',false],[.12,.12,'yellow',false]);const per=Math.max(1,Math.floor(lanes/2));for(let k=1;k<per;k++)for(const s of [-1,1])specs.push([s*k*(w/2)/per,.12,'white',true]);}
  else if(oneway)for(let k=1;k<lanes;k++)specs.push([-w/2+k*w/lanes,.12,'white',true]);
  for(const path of f.paths){const {pts,along}=localPath(path,1);
   const normals=pts.map((_,i)=>normalAt(pts,i));
   for(const [off,lw,color,dashed] of specs){const g=groups[color];lines++;const keep=pts.map(([x,z],i)=>!nearJunction(x+normals[i][0]*off,z+normals[i][1]*off));
    for(let i=0;i<pts.length-1;i++){
     if(!keep[i]||!keep[i+1])continue;if(dashed&&(along[i]%10)>=4)continue;
     const s=g.position.length/3;
     for(const j of [i,i+1])for(const side of [-1,1]){const [nx,nz]=normals[j],o=off+side*lw/2,x=pts[j][0]+nx*o,z=pts[j][1]+nz*o;g.position.push(x,ground.at(x,z)+lift,z);}
     g.index.push(s,s+1,s+2,s+1,s+3,s+2);
    }
   }
  }
 }
 return {groups,lines,junctions:junctions.length};
}

// 線段格網：查詢某點附近的道路與人行道中心線。
function streetGrid(features,kinds,cell=20){
 const grid=new Map(),segs=[];
 for(const f of features){if(!kinds.has(f.kind))continue;for(const path of f.paths)for(let i=1;i<path.length;i++){const [ax,az]=project(...path[i-1]),[bx,bz]=project(...path[i]),id=segs.length;segs.push([ax,az,bx,bz,(f.width||2)/2]);
  for(let x=Math.floor(Math.min(ax,bx)/cell);x<=Math.floor(Math.max(ax,bx)/cell);x++)for(let z=Math.floor(Math.min(az,bz)/cell);z<=Math.floor(Math.max(az,bz)/cell);z++){const k=x+','+z;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(id);}}}
 return {near(x,z,extra){for(let i=Math.floor((x-extra-12)/cell);i<=Math.floor((x+extra+12)/cell);i++)for(let j=Math.floor((z-extra-12)/cell);j<=Math.floor((z+extra+12)/cell);j++)for(const id of grid.get(i+','+j)??[]){const [ax,az,bx,bz,h]=segs[id],dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2));if(Math.hypot(x-ax-dx*t,z-az-dz*t)<=h+extra)return true;}return false;}};
}

export const SHOP_NAMES=['便利商店','咖啡','藥局','早餐店','麵館','書局','眼鏡行','手搖飲','牙醫診所','花店','烘焙坊','服飾','電信門市','火鍋','文具','小吃'];
// 一樓店面（示意）：落地、寬 ≥ 4 m、面向道路或人行道的牆面，每 4.5–6 m 一間；玻璃外推 0.24 m、招牌外推 0.32 m，
// 位於 GIS 精修外牆（最大 0.18 m）之外。排除已有照片／樣板研究的量體。
export function buildShopfronts(buildings,features,ground,{exclude=new Set(),radius=420}={}){
 const near=streetGrid(features,new Set(['road','sidewalk','walk']));
 const glass={position:[],uv:[],index:[]},sign={position:[],uv:[],index:[]},awning={position:[],color:[],index:[]},owners=[];let shops=0;
 const quad=(g,pts,uv)=>{const s=g.position.length/3;for(const p of pts)g.position.push(...p);if(uv)g.uv.push(...uv);g.index.push(s,s+1,s+2,s,s+2,s+3);};
 // 與排除量體牆面重疊（1 m 內）的其他量體牆面也不加，避免覆蓋研究中的正面。
 const guard=buildings.filter(b=>exclude.has(b.id)).flatMap(b=>b.walls.map(w=>[...project(w.a[0],w.a[1]),...project(w.b[0],w.b[1])]));
 const guarded=(x,z)=>guard.some(([ax,az,bx,bz])=>{const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2));return Math.hypot(x-ax-dx*t,z-az-dz*t)<1;});
 for(const b of buildings){
  if(exclude.has(b.id))continue;let base=Infinity;for(const w of b.walls)base=Math.min(base,w.a[2],w.b[2]);
  for(const w of b.walls){
   if(w.w<4||w.h<4.5||Math.max(w.a[2],w.b[2])>base+.4)continue;
   const [ax,az]=project(w.a[0],w.a[1]),[bx,bz]=project(w.b[0],w.b[1]),len=Math.hypot(bx-ax,bz-az);if(len<4)continue;
   const mx=(ax+bx)/2,mz=(az+bz)/2;if(Math.hypot(mx,mz)>radius||guarded(mx,mz))continue;
   const nl=Math.hypot(w.n[0],w.n[1])||1,nx=w.n[0]/nl,nz=-w.n[1]/nl;
   if(!near.near(mx+nx*6,mz+nz*6,3))continue;
   const ux=(bx-ax)/len,uz=(bz-az)/len,bays=Math.max(1,Math.round(len/5.2)),bay=len/bays,y=u=>w.a[2]+(w.b[2]-w.a[2])*u/len;
   const P=(u,h,d)=>[ax+ux*u+nx*d,y(u)+h,az+uz*u+nz*d];
   for(let k=0;k<bays;k++){
    const u0=k*bay+.35,u1=(k+1)*bay-.35,id=(b.id*7+k*13+Math.round(ax))%SHOP_NAMES.length,cell=[(id%4)/4,Math.floor(id/4)/4];shops++;owners.push(b.id);
    quad(glass,[P(u0,.25,.24),P(u1,.25,.24),P(u1,2.95,.24),P(u0,2.95,.24)],[0,0,(u1-u0)/1.6,0,(u1-u0)/1.6,1,0,1]);
    const s0=u0+.15,s1=u1-.15;quad(sign,[P(s0,3.2,.32),P(s1,3.2,.32),P(s1,3.95,.32),P(s0,3.95,.32)],[cell[0],1-cell[1]-.25,cell[0]+.25,1-cell[1]-.25,cell[0]+.25,1-cell[1],cell[0],1-cell[1]]);
    const c=[[.75,.2,.18],[.18,.45,.35],[.85,.6,.15],[.2,.35,.6],[.55,.2,.45]][id%5],s=awning.position.length/3;
    for(const p of [P(u0,3.05,.24),P(u1,3.05,.24),P(u1,2.75,1.15),P(u0,2.75,1.15)]){awning.position.push(...p);awning.color.push(...c);}awning.index.push(s,s+1,s+2,s,s+2,s+3);
   }
  }
 }
 return {glass,sign,awning,shops,owners};
}

// 補植行道樹（示意，非實際樹位）：沿 OSM 人行道每 10 m，避開路口、既有路燈／樹、建物內部。
export function buildStreetTrees(features,ground,colliders,{avoid=[],spacing=10}={}){
 const junctions=findJunctions(features),trees=[];
 for(const f of features){if(f.kind!=='sidewalk'||!(f.width>=1.5))continue;
  for(const path of f.paths){const {pts,along,length}=localPath(path,1);
   for(let d=spacing/2;d<length-2;d+=spacing){const i=along.findIndex(a=>a>=d),[x,z]=pts[i];
    if(junctions.some(j=>Math.hypot(j.x-x,j.z-z)<j.r+4))continue;if(avoid.some(([ox,oz])=>Math.hypot(ox-x,oz-z)<4))continue;if(colliders.resolve(x,z,1.2).hit)continue;
    trees.push([x,ground.at(x,z),z,1+((i*7)%5)/10]);}}}
 return trees;
}

// 車流路網：可行駛道路依行車方向建立車道（臺灣靠右行駛，雙向道各偏離中心 1/4 路寬）。
export function buildLanes(features){
 const lanes=[];
 for(const f of features){if(f.kind!=='road'||!DRIVABLE.has(f.tags.highway)||!(f.width>=5))continue;
  const oneway=isOneway(f.tags),reverseOnly=f.tags.oneway==='-1';
  for(const path of f.paths){if(path.length<2)continue;
   for(const dir of oneway?[reverseOnly?-1:1]:[1,-1]){const p=dir>0?path:[...path].reverse(),{pts,along,length}=localPath(p,2);if(length<8)continue;
    const off=oneway?0:f.width/4,shifted=pts.map((q,i)=>{const [nx,nz]=normalAt(pts,i);return [q[0]+nx*off,q[1]+nz*off];});// normalAt 即行進方向右側 (-dz,dx)
    lanes.push({id:lanes.length,way:f.id,pts:shifted,along,length,start:key(p[0]),end:key(p[p.length-1]),speed:{secondary:12,tertiary:10,primary:13,trunk:14}[f.tags.highway]??7,width:f.width});}}}
 const byStart=new Map();for(const l of lanes){if(!byStart.has(l.start))byStart.set(l.start,[]);byStart.get(l.start).push(l);}
 for(const l of lanes)l.next=(byStart.get(l.end)??[]).filter(n=>n.way!==l.way);
 for(const l of lanes)l.back=lanes.find(n=>n.way===l.way&&n.start===l.end&&n.end===l.start)??null;
 return lanes;
}
export function lanePose(lane,s){
 const a=lane.along;let i=1;while(i<a.length-1&&a[i]<s)i++;const t=Math.max(0,Math.min(1,(s-a[i-1])/((a[i]-a[i-1])||1))),p=lane.pts[i-1],q=lane.pts[i];
 return {x:p[0]+(q[0]-p[0])*t,z:p[1]+(q[1]-p[1])*t,heading:Math.atan2(-(q[0]-p[0]),-(q[1]-p[1]))};
}

// ---------- Three.js 呈現 ----------
function signAtlas(){
 const c=document.createElement('canvas');c.width=1024;c.height=512;const g=c.getContext('2d'),bg=['#b5262c','#1f6b54','#d79a1e','#24508f','#7a2f6b','#2a2a2a','#c45a1a','#3d7f8c'];
 SHOP_NAMES.forEach((name,i)=>{const x=(i%4)*256,y=Math.floor(i/4)*128;g.fillStyle=bg[i%bg.length];g.fillRect(x+3,y+3,250,122);g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=4;g.strokeRect(x+10,y+10,236,108);g.fillStyle='#fff8e6';g.font='bold 58px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(name,x+128,y+66,220);});
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;return t;
}
function shopGlassTexture(){
 const c=document.createElement('canvas');c.width=128;c.height=128;const g=c.getContext('2d'),grd=g.createLinearGradient(0,0,0,128);grd.addColorStop(0,'#3d5560');grd.addColorStop(.6,'#22333a');grd.addColorStop(1,'#495d63');g.fillStyle=grd;g.fillRect(0,0,128,128);
 g.fillStyle='#8b979b';g.fillRect(0,0,128,5);g.fillRect(0,0,5,128);g.fillRect(62,0,4,128);g.fillStyle='rgba(255,255,255,.12)';g.fillRect(14,0,10,128);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=T.RepeatWrapping;return t;
}
function geom(position,index,extra={}){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(position,3));for(const [k,[v,n]] of Object.entries(extra))g.setAttribute(k,new T.Float32BufferAttribute(v,n));g.setIndex(index);g.computeVertexNormals();g.computeBoundingSphere();return g;}

// 程序化車輛（無品牌）：轎車、計程車、機車騎士。
function vehicleKit(kind){
 const parts=(list)=>list.map(([w,h,d,x,y,z])=>new T.BoxGeometry(w,h,d).translate(x,y,z));
 const merge=gs=>{let pos=[],idx=[],off=0;for(const g of gs){const p=g.attributes.position.array,ix=g.index.array;pos.push(...p);for(const i of ix)idx.push(i+off);off+=p.length/3;}return geom(pos,idx);};
 if(kind==='scooter')return{paint:merge(parts([[.36,.45,1.5,0,.55,0],[.3,.5,.35,0,.9,-.55]])),trim:merge([...parts([[.12,.5,.5,0,.32,-.62],[.12,.5,.5,0,.32,.6],[.34,.5,.28,0,1.2,.05],[.3,.24,.3,0,1.62,.05]]),new T.SphereGeometry(.17,8,6).translate(0,1.66,.05)]),lights:merge(parts([[.16,.1,.05,0,.95,-.75],[.2,.08,.05,0,.75,.77]])),length:1.8,radius:.6};
 return{paint:merge(parts([[1.8,.7,4.4,0,.62,0],[1.6,.5,2.2,0,1.2,.25]])),trim:merge([...parts([[1.62,.42,2.0,0,1.22,.25]]),...[[-.82,-1.35],[.82,-1.35],[-.82,1.35],[.82,1.35]].map(([x,z])=>new T.CylinderGeometry(.33,.33,.24,10).rotateZ(Math.PI/2).translate(x,.33,z)),...(kind==='taxi'?parts([[.7,.22,.3,0,1.56,.35]]):[])]),lights:merge(parts([[.36,.14,.05,-.6,.72,-2.21],[.36,.14,.05,.6,.72,-2.21],[.4,.12,.05,-.6,.78,2.21],[.4,.12,.05,.6,.78,2.21]])),length:4.4,radius:1.3};
}

export function createStreetLife(scene,{features,buildings,ground,colliders,fixtures,exclude,spawn}){
 const life={groups:{},night:0};
 // 標線
 {const m=buildLaneMarkings(features,ground),g=new T.Group();for(const [color,arr] of Object.entries(m.groups)){if(!arr.index.length)continue;const mesh=new T.Mesh(geom(arr.position,arr.index),new T.MeshStandardMaterial({color:color==='white'?'#ecebe4':'#e3b23c',roughness:.7,polygonOffset:true,polygonOffsetFactor:-5,polygonOffsetUnits:-5}));mesh.receiveShadow=true;g.add(mesh);}scene.add(g);life.groups.markings=g;life.markingStats=m;}
 // 店面
 {const s=buildShopfronts(buildings,features,ground,{exclude}),g=new T.Group();
  const glassMat=new T.MeshStandardMaterial({map:shopGlassTexture(),roughness:.25,metalness:.3,emissive:'#ffc070',emissiveIntensity:0});
  const signTex=signAtlas(),signMat=new T.MeshStandardMaterial({map:signTex,emissiveMap:signTex,emissive:'#ffffff',emissiveIntensity:0,roughness:.6});
  g.add(new T.Mesh(geom(s.glass.position,s.glass.index,{uv:[s.glass.uv,2]}),glassMat),new T.Mesh(geom(s.sign.position,s.sign.index,{uv:[s.sign.uv,2]}),signMat));
  const aw=new T.Mesh(geom(s.awning.position,s.awning.index,{color:[s.awning.color,3]}),new T.MeshStandardMaterial({vertexColors:true,roughness:.8,side:T.DoubleSide}));aw.castShadow=true;g.add(aw);
  scene.add(g);life.groups.shops=g;life.shopStats=s.shops;life.shopMats=[glassMat,signMat];}
 // 補植行道樹
 {const avoid=[...fixtures.lamps,...fixtures.trees].map(f=>project(f.lon,f.lat)),trees=buildStreetTrees(features,ground,colliders,{avoid}),g=new T.Group(),d=new T.Object3D();
  const trunk=new T.InstancedMesh(new T.CylinderGeometry(.14,.2,2.6,7).translate(0,1.3,0),new T.MeshStandardMaterial({color:'#5d4a38'}),trees.length),crown=new T.InstancedMesh(new T.IcosahedronGeometry(1.9,1).translate(0,3.9,0),new T.MeshStandardMaterial({color:'#3f6f3a',roughness:.9,flatShading:true}),trees.length);
  trees.forEach(([x,y,z,s],i)=>{d.position.set(x,y,z);d.scale.set(s,s,s);d.rotation.set(0,i,0);d.updateMatrix();trunk.setMatrixAt(i,d.matrix);crown.setMatrixAt(i,d.matrix);crown.setColorAt(i,new T.Color().setHSL(.28+((i*37)%10)/120,.45,.26+((i*13)%7)/60));});
  trunk.castShadow=crown.castShadow=true;g.add(trunk,crown);scene.add(g);life.groups.trees=g;life.treeCount=trees.length;}
 // 車流
 const lanes=buildLanes(features);life.laneCount=lanes.length;
 const kits={car:vehicleKit('car'),taxi:vehicleKit('taxi'),scooter:vehicleKit('scooter')},counts={car:55,taxi:18,scooter:45},vehicles=[],traffic=new T.Group();
 const lightMat=new T.MeshStandardMaterial({color:'#fff3cf',emissive:'#ffe2a0',emissiveIntensity:.2});life.lightMat=lightMat;
 let seed=11;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647,total=lanes.reduce((n,l)=>n+l.length,0);
 const pickLane=()=>{let r=rand()*total;for(const l of lanes){r-=l.length;if(r<=0)return l;}return lanes[0];};
 const carColors=['#d9dcdf','#22262a','#8b1d22','#2b4a7a','#9aa3a8','#f2f2ee','#3d5c3a','#5a5f66'];
 for(const [kind,n] of Object.entries(counts)){const kit=kits[kind],paint=new T.InstancedMesh(kit.paint,new T.MeshStandardMaterial({roughness:.35,metalness:.4}),n),trim=new T.InstancedMesh(kit.trim,new T.MeshStandardMaterial({color:'#15191c',roughness:.4,metalness:.2}),n),lights=new T.InstancedMesh(kit.lights,lightMat,n);
  for(const m of [paint,trim,lights]){m.castShadow=true;m.frustumCulled=false;traffic.add(m);}
  for(let i=0;i<n;i++){let lane=pickLane(),s=rand()*lane.length;for(let k=0;k<20&&Math.hypot(lanePose(lane,s).x-spawn.x,lanePose(lane,s).z-spawn.z)<30;k++){lane=pickLane();s=rand()*lane.length;}
   paint.setColorAt(i,new T.Color(kind==='taxi'?'#f2c21b':kind==='scooter'?['#c8ccd0','#1e2226','#b33a2c','#3a6fb0','#e8e4da'][i%5]:carColors[i%carColors.length]));
   vehicles.push({kind,i,n,active:true,kit,meshes:{paint,trim,lights},lane,s,v:0,max:(lane.speed+rand()*3)*(kind==='scooter'?1.1:1),side:kind==='scooter'?Math.min(lane.width/4-.6,1.4):0,x:0,z:0,heading:0});}}
 scene.add(traffic);life.groups.traffic=traffic;life.vehicles=vehicles;
 // 行人
 const walkPaths=[];for(const f of features){if(!['sidewalk','walk'].includes(f.kind))continue;for(const path of f.paths){const lp=localPath(path,2);if(lp.length>=15)walkPaths.push({...lp,width:f.width||1.8});}}
 const pedCount=Math.min(160,walkPaths.length*2),peds=[],people=new T.Group(),d=new T.Object3D();
 const torso=new T.InstancedMesh(new T.CapsuleGeometry(.2,.45,3,8).translate(0,1.15,0),new T.MeshStandardMaterial({roughness:.8}),pedCount),head=new T.InstancedMesh(new T.SphereGeometry(.13,10,8).translate(0,1.62,0),new T.MeshStandardMaterial({color:'#d9b08c',roughness:.7}),pedCount),hair=new T.InstancedMesh(new T.SphereGeometry(.14,10,6,0,Math.PI*2,0,Math.PI/2).translate(0,1.66,.01),new T.MeshStandardMaterial({color:'#1d1712'}),pedCount);
 const legGeo=new T.CapsuleGeometry(.085,.6,3,6).translate(0,-.38,0),legs=[0,1].map(()=>new T.InstancedMesh(legGeo,new T.MeshStandardMaterial({roughness:.8}),pedCount));
 const shirts=['#c94f4f','#3b6ea8','#e8e1d0','#2f2f33','#6b8f5a','#d9a441','#8f6bb0','#4aa3a3','#f0f0f0'],pants=['#2d3440','#1f2226','#5b4b3c','#3c4f6e','#6e6a62'];
 for(let i=0;i<pedCount;i++){const p=walkPaths[Math.floor(rand()*walkPaths.length)];peds.push({p,s:rand()*p.length,dir:rand()<.5?1:-1,v:1+rand()*.6,off:(rand()-.5)*Math.max(0,p.width-.8),phase:rand()*6});torso.setColorAt(i,new T.Color(shirts[i%shirts.length]));for(const l of legs)l.setColorAt(i,new T.Color(pants[i%pants.length]));}
 for(const m of [torso,head,hair,...legs]){m.castShadow=true;m.frustumCulled=false;people.add(m);}scene.add(people);life.groups.people=people;life.pedCount=pedCount;

 const tmp=new T.Object3D();
 function obstacleAhead(veh,others,player){
  const fx=-Math.sin(veh.heading),fz=-Math.cos(veh.heading),look=veh.kit.length/2+Math.max(5,veh.v*1.2);let gap=Infinity;
  const test=(x,z,r)=>{const dx=x-veh.x,dz=z-veh.z,ahead=dx*fx+dz*fz,lat=Math.abs(-dx*fz+dz*fx);if(ahead>0&&ahead<look+r&&lat<1.2+r)gap=Math.min(gap,ahead-r);};
  for(const o of others)if(o.active&&o!==veh&&Math.abs(o.x-veh.x)<30&&Math.abs(o.z-veh.z)<30)test(o.x,o.z,o.kit.radius);
  for(const c of player)test(c[0],c[1],c[2]);
  return gap;
 }
 life.update=(dt,t,blockers,{siren=null}={})=>{
  if(life.groups.traffic.visible)for(const veh of vehicles){if(!veh.active)continue;
   const gap=obstacleAhead(veh,vehicles,blockers);let target=gap<veh.kit.length/2+1.5?0:gap<veh.kit.length/2+8?veh.max*.3:veh.max;
   // 消防車鳴警笛接近（35 m 內）時，NPC 車輛減速讓道（示意）。
   if(siren&&Math.hypot(siren.x-veh.x,siren.z-veh.z)<35)target=Math.min(target,2);
   veh.v+=Math.max(-8*dt,Math.min(3*dt,target-veh.v));veh.s+=veh.v*dt;
   while(veh.s>veh.lane.length){veh.s-=veh.lane.length;const next=veh.lane.next.length?veh.lane.next[Math.floor(rand()*veh.lane.next.length)]:veh.lane.back??pickLane();veh.lane=next;veh.max=(next.speed+rand()*3)*(veh.kind==='scooter'?1.1:1);}
   const p=lanePose(veh.lane,veh.s),rx=Math.cos(p.heading),rz=-Math.sin(p.heading);
   veh.x=p.x+rx*veh.side;veh.z=p.z+rz*veh.side;veh.heading+=Math.atan2(Math.sin(p.heading-veh.heading),Math.cos(p.heading-veh.heading))*Math.min(1,dt*8);
   tmp.position.set(veh.x,ground.at(veh.x,veh.z),veh.z);tmp.rotation.set(0,veh.heading,0);tmp.updateMatrix();for(const m of Object.values(veh.meshes))m.setMatrixAt(veh.i,tmp.matrix);
  }
  for(const m of traffic.children)m.instanceMatrix.needsUpdate=true;
  if(life.groups.people.visible){peds.forEach((q,i)=>{if(i>=life.pedActive)return;q.s+=q.v*q.dir*dt;if(q.s>q.p.length||q.s<0){q.dir*=-1;q.s=Math.max(0,Math.min(q.p.length,q.s));}
   const a=q.p.along;let k=1;while(k<a.length-1&&a[k]<q.s)k++;const u=Math.max(0,Math.min(1,(q.s-a[k-1])/((a[k]-a[k-1])||1))),A=q.p.pts[k-1],B=q.p.pts[k],dx=(B[0]-A[0])*q.dir,dz=(B[1]-A[1])*q.dir,l=Math.hypot(dx,dz)||1;
   const x=A[0]+(B[0]-A[0])*u-dz/l*q.off,z=A[1]+(B[1]-A[1])*u+dx/l*q.off,y=ground.at(x,z),h=Math.atan2(-dx,-dz),swing=Math.sin(t*q.v*5+q.phase)*.5;
   tmp.position.set(x,y+Math.abs(Math.sin(t*q.v*5+q.phase))*.03,z);tmp.rotation.set(0,h,0);tmp.updateMatrix();torso.setMatrixAt(i,tmp.matrix);head.setMatrixAt(i,tmp.matrix);hair.setMatrixAt(i,tmp.matrix);
   legs.forEach((leg,j)=>{const side=j?.11:-.11;tmp.position.set(x+Math.cos(h)*side,y+.82,z-Math.sin(h)*side);tmp.rotation.set(j?-swing:swing,h,0,'YXZ');tmp.updateMatrix();leg.setMatrixAt(i,tmp.matrix);});});
   for(const m of people.children)m.instanceMatrix.needsUpdate=true;}
 };
 life.circles=()=>life.groups.traffic.visible?vehicles.filter(v=>v.active).map(v=>[v.x,v.z,v.kit.radius]):[];
 // 畫質密度：只繪製與模擬前 ratio 比例的車輛與行人。
 life.pedActive=pedCount;
 life.setDensity=ratio=>{for(const v of vehicles){const keep=Math.ceil(v.n*ratio);v.active=v.i<keep;for(const m of Object.values(v.meshes))m.count=keep;}life.pedActive=Math.ceil(pedCount*ratio);for(const m of people.children)m.count=life.pedActive;};
 life.setLights=level=>{lightMat.emissiveIntensity=.2+level*3;life.shopMats[0].emissiveIntensity=level*.16;life.shopMats[1].emissiveIntensity=level*.9;};
 return life;
}

// 時段光影預設：下午（同 GIS 頁 15:00）、黃昏、夜間。天空為漸層球體。
export const TIME_PRESETS={
 afternoon:{label:'下午',az:245,el:35,sun:'#fff1d6',sunI:2.4,hemiSky:'#dfeefa',hemiGround:'#6b6458',hemiI:1.1,top:'#5f95c9',horizon:'#cfdbe3',fogNear:250,fogFar:1100,lights:0,windows:0},
 dusk:{label:'黃昏',az:258,el:9,sun:'#ffb37a',sunI:2.1,hemiSky:'#c0a8dc',hemiGround:'#6a5860',hemiI:1.05,top:'#3b3a78',horizon:'#f0a58a',fogNear:180,fogFar:900,lights:.75,windows:.55},
 night:{label:'夜間',az:200,el:30,sun:'#9fb4e0',sunI:.35,hemiSky:'#7d92bb',hemiGround:'#2a2b36',hemiI:.85,top:'#060b18',horizon:'#1a2440',fogNear:120,fogFar:700,lights:1,windows:1},
};
export function createSky(){
 const mat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,uniforms:{top:{value:new T.Color()},horizon:{value:new T.Color()}},
  vertexShader:'varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform vec3 top;uniform vec3 horizon;varying vec3 vDir;void main(){float h=clamp(vDir.y,0.,1.);gl_FragColor=vec4(mix(horizon,top,pow(h,.55)),1.);\n#include <colorspace_fragment>\n}'});
 // 半徑小於最低畫質的可視距離（1750 m）；不寫深度，永遠畫在建物後方。
 const sky=new T.Mesh(new T.SphereGeometry(900,24,12),mat);sky.renderOrder=-1;sky.frustumCulled=false;return sky;
}
// 窗戶夜間亮燈：以世界座標雜湊決定每扇窗亮或暗（約 45% 亮），只作用於玻璃材質。
export function litWindows(material,{byColor=false}={}){
 material.emissive=new T.Color('#ffcf8a');material.emissiveIntensity=0;
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vLitPos;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvLitPos=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vLitPos;').replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nvec3 cellId=floor(vec3(vLitPos.x/3.6,vLitPos.y/4.,vLitPos.z/3.6));totalEmissiveRadiance*=step(.55,fract(sin(dot(cellId,vec3(12.9898,78.233,37.719)))*43758.5453));'+(byColor?'\n#ifdef USE_COLOR\ntotalEmissiveRadiance*=step(.05,vColor.b-vColor.r)*step(vColor.b,.2);\n#endif':''));
 };
 material.needsUpdate=true;return material;
}
