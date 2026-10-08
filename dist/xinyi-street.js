// 信義街景漫遊：與 GIS 頁（taipei-map.html?place=xinyi 預設狀態）共用同一套建物、街道與設施建構函式，
// 只把經緯度轉成本地公尺並改以 Three.js 呈現。外觀為示意；未使用 taipei-gta 的地圖、程式或素材。
import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {createActionScene} from './action-scene.js';
import {rigWheels} from './wheel-rig.js';
import {buildDistrictBatch} from './geo-district.js';
import {focusedBuilding,buildXinyiDetail,createDetailMaterials,inFocus} from './geo-xinyi-detail.js?v=70';
import {buildStreetDetail,createStreetMaterials} from './geo-street-detail.js';
import {buildZebraCrossings} from './geo-street-fixtures.js';
import {project,buildHeightField,toLocal,linearColors,buildColliders,buildStreetBase,nearestStreet,spawnPoint} from './xinyi-street-world.js';

const $=id=>document.getElementById(id),step=t=>{$('loadStep').textContent=t;};
const canvas=$('view');let renderer;
try{renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch(e){$('loading').hidden=true;$('error').hidden=false;throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,1,0.2,2500);
scene.fog=new T.Fog('#c9d6df',250,1100);
// 日照與 GIS 頁精修範圍相同：2026-10-05 下午 3 時（臺灣），太陽約方位 245°、仰角 35°（展示光線）。
const SUN_AZ=245*Math.PI/180,SUN_EL=35*Math.PI/180,sunDir=new T.Vector3(Math.sin(SUN_AZ)*Math.cos(SUN_EL),Math.sin(SUN_EL),-Math.cos(SUN_AZ)*Math.cos(SUN_EL));
const hemi=new T.HemisphereLight('#dfeefa','#6b6458',1.1),sun=new T.DirectionalLight('#fff1d6',2.4);
sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-70,right:70,top:70,bottom:-70,near:1,far:600});sun.shadow.bias=-0.0004;
scene.add(hemi,sun,sun.target);

function canvasTexture(size,draw){const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
// GIS 頁 Material 參數（color/metallic/roughness/colorTexture/doubleSided）轉為 Three.js 材質。
class GisMaterial{constructor(o){const tex=o.colorTexture?.data??o.colorTexture;let map=null;if(tex){map=new T.CanvasTexture(tex);map.wrapS=map.wrapT=T.RepeatWrapping;map.colorSpace=T.SRGBColorSpace;map.anisotropy=renderer.capabilities.getMaxAnisotropy();}
 return new T.MeshStandardMaterial({color:o.color??'white',map,metalness:o.metallic??0,roughness:o.roughness??.8,side:o.doubleSided?T.DoubleSide:T.FrontSide,vertexColors:true,flatShading:true});}}
function mesh(position,{color,uv,index,groups,materials,material}){
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(position,3));
 if(uv)g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 g.setAttribute('color',color?new T.BufferAttribute(linearColors(color),3):new T.BufferAttribute(new Float32Array(position.length).fill(1),3));
 if(groups){const all=[],mats=[];for(const [kind,faces] of Object.entries(groups)){if(!faces.length)continue;g.addGroup(all.length,faces.length,mats.length);for(let i=0;i<faces.length;i++)all.push(faces[i]);mats.push(materials[kind]);}g.setIndex(all);material=mats;}
 else g.setIndex(index);
 g.computeVertexNormals();g.computeBoundingSphere();const m=new T.Mesh(g,material);m.castShadow=m.receiveShadow=true;return m;
}

step('讀取官方建物量體與路網');
const [district,streets,fixtures,verified]=await Promise.all(['district-xinyi.json','streets-xinyi.json','street-fixtures-xinyi.json','verified-fixtures-xinyi.json'].map(f=>fetch('assets/'+f).then(r=>{if(!r.ok)throw Error(f+' '+r.status);return r.json();})));
step('建立地形、建物與道路');
const ground=buildHeightField(district.buildings,district.bbox),colliders=buildColliders(district.buildings,ground);
// 建物：精修範圍（中心約 250 m）用 buildXinyiDetail，其餘用 buildDistrictBatch，與 GIS 頁預設相同。
{const refined=district.buildings.filter(focusedBuilding),basic=district.buildings.filter(b=>!focusedBuilding(b));
 // 遠處建物只接收陰影、不投射，減少陰影計算量。
 const batch=buildDistrictBatch(basic);const far=mesh(toLocal(batch.position,ground),{color:batch.color,index:batch.faces,material:new T.MeshStandardMaterial({vertexColors:true,roughness:.85,side:T.DoubleSide,flatShading:true})});far.castShadow=false;scene.add(far);
 const detail=buildXinyiDetail(refined,{arcade:false,attStudy:false});scene.add(mesh(toLocal(detail.position,ground),{color:detail.color,uv:detail.uv,groups:detail.groups,materials:createDetailMaterials(GisMaterial)}));
}
// 街道：基本路面（整區）＋ 精修範圍鋪面材質＋ OSM 已標記 zebra 斑馬線，與 GIS 頁相同。
for(const g of buildStreetBase(streets.features,ground,inFocus)){const m=mesh(new Float32Array(g.position),{index:g.index,material:new T.MeshStandardMaterial({color:g.color,roughness:.95,polygonOffset:true,polygonOffsetFactor:g.raised?-2:-1,polygonOffsetUnits:g.raised?-2:-1})});m.castShadow=false;scene.add(m);}
{const d=buildStreetDetail(streets.features),mats=createStreetMaterials(GisMaterial);for(const m of Object.values(mats)){m.polygonOffset=true;m.polygonOffsetFactor=m.polygonOffsetUnits=-3;}
 const m=mesh(toLocal(d.position,ground,true),{uv:d.uv,groups:d.groups,materials:mats});m.castShadow=false;scene.add(m);
 const position=[],index=[];for(const z of buildZebraCrossings(streets.features))for(const ring of z.rings){const s=position.length/3;for(const p of ring.slice(0,4))position.push(p[0],p[1],.06);index.push(s,s+1,s+2,s,s+2,s+3);}
 const zebra=mesh(toLocal(new Float64Array(position),ground,true),{index,material:new T.MeshStandardMaterial({color:'#eeeae0',roughness:.8,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4})});zebra.castShadow=false;scene.add(zebra);
}
{// 地面：示意高程格網（GIS 頁使用 world-elevation 地形，此處無法離線取得，改由官方牆腳高程內插）。
 const {x0,z0,cell,nx,nz,h}=ground,position=new Float32Array(nx*nz*3),index=[];
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)position.set([x0+i*cell,h[j*nx+i]-0.02,z0+j*cell],(j*nx+i)*3);
 for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){const k=j*nx+i;index.push(k,k+nx,k+1,k+1,k+nx,k+nx+1);}
 const m=mesh(position,{index,material:new T.MeshStandardMaterial({color:'#8f8b80',roughness:1})});m.castShadow=false;scene.add(m);
 const outer=new T.Mesh(new T.PlaneGeometry(6000,6000),new T.MeshStandardMaterial({color:'#6f7466',roughness:1}));outer.rotation.x=-Math.PI/2;outer.position.y=Math.min(...h)-0.6;scene.add(outer);
}
// 街道設施：與 GIS 頁相同尺寸與配色——市府路燈（桿徑 0.16 m、資料桿高、燈具 0.5×0.3×0.2 m）、
// OSM 路樹（樹幹 0.28×2.4 m、樹冠 3.2×3.8 m 自 2.2 m 起）、市府號誌設施桿位（0.12×3 m，桿形待核對）。
const lampGlow=[],lampHeads=[];
{
 const dummy=new T.Object3D(),place=(inst,i,x,y,z,sx,sy,sz)=>{dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);};
 const cyl=new T.CylinderGeometry(.5,.5,1,10).translate(0,.5,0),box=new T.BoxGeometry(1,1,1).translate(0,.5,0),ball=new T.SphereGeometry(.5,14,10).translate(0,.5,0);
 const lamps=fixtures.lamps,pole=new T.InstancedMesh(cyl,new T.MeshStandardMaterial({color:'#6e7477',roughness:.6}),lamps.length),headMat=new T.MeshStandardMaterial({color:'#d9dedc',emissive:'#ffd9a0',emissiveIntensity:0}),head=new T.InstancedMesh(box,headMat,lamps.length);
 lamps.forEach((l,i)=>{const [x,z]=project(l.lon,l.lat),y=ground.at(x,z);place(pole,i,x,y,z,.16,l.height,.16);place(head,i,x,y+l.height,z,.5,.2,.3);lampGlow.push(x,y+l.height-.1,z);});
 lampHeads.push(headMat);
 const trees=fixtures.trees,trunk=new T.InstancedMesh(cyl,new T.MeshStandardMaterial({color:'#665544'}),trees.length),crown=new T.InstancedMesh(ball,new T.MeshStandardMaterial({color:'#4a6950',roughness:.9}),trees.length);
 trees.forEach((t,i)=>{const [x,z]=project(t.lon,t.lat),y=ground.at(x,z);place(trunk,i,x,y,z,.28,2.4,.28);place(crown,i,x,y+2.2,z,3.2,3.8,3.2);});
 const poles=verified.poles,sig=new T.InstancedMesh(cyl,new T.MeshStandardMaterial({color:'#9ba5a7',roughness:.5}),poles.length);
 poles.forEach((p,i)=>{const [x,z]=project(p.lon,p.lat);place(sig,i,x,ground.at(x,z),z,.12,3,.12);});
 for(const m of [pole,head,trunk,crown,sig]){m.castShadow=true;scene.add(m);}
}
const glow=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(lampGlow,3)),new T.PointsMaterial({color:'#ffd9a0',size:3.2,transparent:true,opacity:.75,depthWrite:false,map:canvasTexture(64,(g,s)=>{const r=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);r.addColorStop(0,'#fff');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,s,s);})}));
glow.visible=false;scene.add(glow);

// 主控角色：既有中隊長造型（黃色消防衣）。
step('載入角色與消防車');
const spawn=spawnPoint(streets.features),player=new T.Group(),person=createActionScene(new T.Scene()).createPerson(player,'中隊長');
person.body.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(player);
// 消防車：既有 GIS 車型，紅色警示燈保持紅色。
const truck={root:new T.Group(),model:null,x:0,z:0,heading:0,v:0,steer:0,beacons:[],siren:false};
{const gltf=await new GLTFLoader().loadAsync('assets/geo-fire-engine.glb');truck.model=gltf.scene;truck.model.rotation.y=-Math.PI/2;truck.root.add(truck.model);
  truck.model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;const m=o.material;if(/beacon|warning|LED strip|red.*lens|emergency.*lens|red.*flasher/i.test(m?.name||'')){o.material=m.clone();truck.beacons.push(o.material);}}});
 // 方案 A：載入時把車輪零件重組到輪軸中心（不修改車型檔），靜止外觀與原車型相同。
 truck.rig=rigWheels(truck.model);
 scene.add(truck.root);
 const head=new T.SpotLight('#fff4dc',0,60,.45,.5,1.2);head.position.set(0,1.3,-3.6);head.target.position.set(0,0,-20);truck.root.add(head,head.target);truck.headlight=head;
}
const state={mode:'walk',yaw:spawn.heading,pitch:.32,dist:7,x:spawn.x,z:spawn.z,facing:spawn.heading,night:false,keys:new Set(),stick:[0,0],run:false,walkT:0};
function placeTruck(){const f=[-Math.sin(spawn.heading),-Math.cos(spawn.heading)],r=[Math.cos(spawn.heading),-Math.sin(spawn.heading)];truck.x=spawn.x+f[0]*14+r[0]*1.5;truck.z=spawn.z+f[1]*14+r[1]*1.5;truck.heading=spawn.heading;truck.v=0;}
function resetAll(){state.mode='walk';state.x=spawn.x;state.z=spawn.z;state.facing=spawn.heading;state.yaw=spawn.heading;placeTruck();player.visible=true;syncUi();}
placeTruck();

// 輸入
addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;const k=e.key.toLowerCase();state.keys.add(k);if(k==='e')toggleVehicle();if(k==='q')toggleSiren();if(k==='n')toggleNight();if(k==='r')resetAll();if(k==='h')$('info').hidden=!$('info').hidden;if([' ','arrowup','arrowdown'].includes(k))e.preventDefault();});
addEventListener('keyup',e=>state.keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>state.keys.clear());
let drag=null;
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&e.clientX<innerWidth*.45)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;state.yaw-=(e.clientX-drag.x)*.006;state.pitch=Math.min(1.25,Math.max(.05,state.pitch+(e.clientY-drag.y)*.004));drag.x=e.clientX;drag.y=e.clientY;state.camHold=1.5;});
canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{state.dist=Math.min(40,Math.max(3,state.dist*(1+Math.sign(e.deltaY)*.1)));e.preventDefault();},{passive:false});
{const stick=$('stick'),knob=stick.querySelector('i');let id=null;
 const move=e=>{const r=stick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,l=Math.min(1,Math.hypot(dx,dy)/(r.width/2))/(Math.hypot(dx,dy)||1);state.stick=[dx*l,-dy*l];knob.style.transform=`translate(${dx*l*r.width/2}px,${dy*l*r.width/2}px)`;};
 stick.addEventListener('pointerdown',e=>{id=e.pointerId;stick.setPointerCapture(id);move(e);});stick.addEventListener('pointermove',e=>{if(e.pointerId===id)move(e);});
 const end=()=>{id=null;state.stick=[0,0];knob.style.transform='';};stick.addEventListener('pointerup',end);stick.addEventListener('pointercancel',end);
 $('tRun').addEventListener('pointerdown',()=>{state.run=!state.run;$('tRun').classList.toggle('on',state.run);});$('tEnter').addEventListener('click',()=>toggleVehicle());
}
$('enter').onclick=()=>toggleVehicle();$('siren').onclick=()=>toggleSiren();$('night').onclick=()=>toggleNight();$('reset').onclick=()=>resetAll();
$('help').onclick=()=>$('info').hidden=!$('info').hidden;$('closeInfo').onclick=()=>$('info').hidden=true;

function nearTruck(){return Math.hypot(state.x-truck.x,state.z-truck.z)<6;}
function toggleVehicle(){
 if(state.mode==='walk'){if(!nearTruck())return;state.mode='drive';player.visible=false;state.dist=Math.max(state.dist,13);}
 else{if(Math.abs(truck.v)>1.5)return;state.mode='walk';const r=[Math.cos(truck.heading),-Math.sin(truck.heading)];const p=colliders.resolve(truck.x-r[0]*2.6,truck.z-r[1]*2.6,.4);state.x=p.x;state.z=p.z;state.facing=truck.heading;player.visible=true;state.dist=7;}
 syncUi();
}
function toggleSiren(){if(state.mode!=='drive')return;truck.siren=!truck.siren;syncUi();}
function toggleNight(){
 state.night=!state.night;const n=state.night;
 scene.background=new T.Color(n?'#0b1424':'#a9c7e0');scene.fog.color.set(n?'#0b1424':'#c9d6df');scene.fog.near=n?120:250;scene.fog.far=n?700:1100;
 hemi.intensity=n?.55:1.1;hemi.color.set(n?'#6d82a8':'#dfeefa');sun.intensity=n?.25:2.4;sun.color.set(n?'#9fb4e0':'#fff1d6');
 for(const m of lampHeads)m.emissiveIntensity=n?2:0;glow.visible=n;truck.headlight.intensity=n?60:0;syncUi();
}
function syncUi(){
 $('enter').textContent=state.mode==='drive'?'下車':'上車';$('siren').hidden=state.mode!=='drive';$('siren').classList.toggle('on',truck.siren);$('night').classList.toggle('on',state.night);
 $('speed').hidden=state.mode!=='drive';
}
scene.background=new T.Color('#a9c7e0');

// 小地圖：預先繪製路網與牆線，執行時依視角旋轉。
const mini=$('minimap'),mctx=mini.getContext('2d'),MAP=2048,mapScale=MAP/1100,mapImg=document.createElement('canvas');
{mapImg.width=mapImg.height=MAP;const g=mapImg.getContext('2d');g.fillStyle='#26323a';g.fillRect(0,0,MAP,MAP);const P=(x,z)=>[MAP/2+x*mapScale,MAP/2+z*mapScale];
 g.lineCap='round';g.lineJoin='round';
 for(const f of streets.features){g.strokeStyle=f.kind==='road'?'#8e9aa2':f.kind==='crossing'?'#d9dcdc':'#55636b';g.lineWidth=Math.max(f.kind==='road'?(f.width||6):1.5,1)*mapScale;
  for(const path of f.paths){g.beginPath();path.forEach((p,i)=>{const [x,y]=P(...project(p[0],p[1]));i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();}}
 g.strokeStyle='#c9a77b';g.lineWidth=2;g.beginPath();for(const [ax,az,bx,bz] of colliders.segs){g.moveTo(...P(ax,az));g.lineTo(...P(bx,bz));}g.stroke();
}
function drawMinimap(){
 const s=mini.width,zoom=state.mode==='drive'?.55:.9;mctx.save();mctx.clearRect(0,0,s,s);mctx.beginPath();mctx.arc(s/2,s/2,s/2,0,Math.PI*2);mctx.clip();
 mctx.fillStyle='#1c252b';mctx.fillRect(0,0,s,s);mctx.translate(s/2,s/2);mctx.rotate(state.yaw);mctx.scale(zoom,zoom);
 const cx=MAP/2+state.camX*mapScale,cz=MAP/2+state.camZ*mapScale;mctx.drawImage(mapImg,-cx,-cz);
 const tx=(truck.x-state.camX)*mapScale,tz=(truck.z-state.camZ)*mapScale;
 if(state.mode==='walk'){mctx.fillStyle='#e8303a';mctx.fillRect(tx-6,tz-6,12,12);}
 mctx.restore();mctx.save();mctx.translate(s/2,s/2);const facing=(state.mode==='drive'?truck.heading:state.facing)-state.yaw;mctx.rotate(-facing);
 mctx.fillStyle=state.mode==='drive'?'#ff4a4a':'#ffd36b';mctx.strokeStyle='#111';mctx.lineWidth=2;mctx.beginPath();mctx.moveTo(0,-10);mctx.lineTo(7,8);mctx.lineTo(0,4);mctx.lineTo(-7,8);mctx.closePath();mctx.fill();mctx.stroke();mctx.restore();
 mctx.fillStyle='#fff';mctx.font='bold 13px sans-serif';mctx.textAlign='center';const north=state.yaw;mctx.fillText('N',s/2+Math.sin(north)*(s/2-12),s/2-Math.cos(north)*(s/2-12)+5);
}

// 更新
const clock=new T.Timer();let streetTimer=0;
function input(){const k=state.keys;let f=(k.has('w')||k.has('arrowup')?1:0)-(k.has('s')||k.has('arrowdown')?1:0),r=(k.has('d')||k.has('arrowright')?1:0)-(k.has('a')||k.has('arrowleft')?1:0);f+=state.stick[1];r+=state.stick[0];return [Math.max(-1,Math.min(1,f)),Math.max(-1,Math.min(1,r))];}
function updateWalk(dt){
 const [f,r]=input(),len=Math.hypot(f,r);
 if(len>.05){const speed=(state.keys.has('shift')||state.run?6:2.6)*Math.min(1,len),fx=-Math.sin(state.yaw),fz=-Math.cos(state.yaw),rx=Math.cos(state.yaw),rz=-Math.sin(state.yaw),dx=(fx*f+rx*r)/len,dz=(fz*f+rz*r)/len;
  let p=colliders.resolve(state.x+dx*speed*dt,state.z+dz*speed*dt,.38);
  // 消防車車身也視為障礙（三個圓近似）。
  for(const c of truckCircles()){const ex=p.x-c[0],ez=p.z-c[1],d=Math.hypot(ex,ez);if(d<c[2]+.38&&d>1e-6){p={x:c[0]+ex/d*(c[2]+.38),z:c[1]+ez/d*(c[2]+.38)};}}
  state.x=p.x;state.z=p.z;const target=Math.atan2(-dx,-dz);state.facing+=Math.atan2(Math.sin(target-state.facing),Math.cos(target-state.facing))*Math.min(1,dt*12);state.walkT+=dt*speed*2.2;
 }
 const stride=len>.05?Math.sin(state.walkT)*.6:0;person.legs[0].rotation.x=stride;person.legs[1].rotation.x=-stride;person.arms[0].rotation.x=-stride*.8;person.arms[1].rotation.x=stride*.8;
 player.position.set(state.x,ground.at(state.x,state.z)+(len>.05?Math.abs(Math.sin(state.walkT))*.04:0),state.z);player.rotation.y=state.facing;
 $('prompt').hidden=!nearTruck();$('prompt').textContent=matchMedia('(pointer:coarse)').matches?'點「上／下車」駕駛消防車':'按 E 駕駛消防車';
}
function truckCircles(){const f=[-Math.sin(truck.heading),-Math.cos(truck.heading)];return [-2.4,0,2.4].map(o=>[truck.x+f[0]*o,truck.z+f[1]*o,1.45]);}
function updateDrive(dt){
 const [f,r]=input(),brake=state.keys.has(' ');
 // 遊戲式操控：極速約 120 km/h，非實車性能。
 if(brake)truck.v*=Math.max(0,1-dt*3.5);else if(f>0)truck.v+=(truck.v<0?14:8.5-truck.v*.12)*f*dt;else if(f<0)truck.v+=(truck.v>0?14:4)*f*dt;else truck.v*=Math.max(0,1-dt*.45);
 truck.v=Math.max(-8,Math.min(33.4,truck.v));if(Math.abs(truck.v)<.05&&!f)truck.v=0;
 truck.steer+=((-r)*.55/(1+Math.abs(truck.v)*.06)-truck.steer)*Math.min(1,dt*5);
 const old={x:truck.x,z:truck.z,h:truck.heading};truck.heading+=truck.v/4.3*Math.tan(truck.steer)*dt;
 truck.x+=-Math.sin(truck.heading)*truck.v*dt;truck.z+=-Math.cos(truck.heading)*truck.v*dt;
 let hit=false;for(const c of truckCircles()){const p=colliders.resolve(c[0],c[1],c[2]);if(p.hit){hit=true;truck.x+=p.x-c[0];truck.z+=p.z-c[1];}}
 if(hit){if(Math.abs(truck.v)>3)truck.v*=-.25;else truck.v*=.5;for(const c of truckCircles())if(colliders.resolve(c[0],c[1],c[2]).hit){truck.x=old.x;truck.z=old.z;truck.heading=old.h;break;}}
 truck.rig?.update(truck.v*dt,truck.steer);
 state.x=truck.x;state.z=truck.z;$('kmh').textContent=Math.round(Math.abs(truck.v)*3.6);$('prompt').hidden=true;
}
function frame(){
 clock.update();const dt=Math.min(clock.getDelta(),.05),t=clock.getElapsed();
 state.mode==='walk'?updateWalk(dt):updateDrive(dt);
 // 消防車貼地，依前後輪地面高差俯仰。
 const fx=-Math.sin(truck.heading),fz=-Math.cos(truck.heading),yf=ground.at(truck.x+fx*2.3,truck.z+fz*2.3),yr=ground.at(truck.x-fx*2.1,truck.z-fz*2.1);
 truck.root.position.set(truck.x,(yf+yr)/2,truck.z);truck.root.rotation.set(Math.atan2(yf-yr,4.4),truck.heading,0,'YXZ');
 for(const m of truck.beacons){const on=truck.siren&&Math.sin(t*14+(m.id%2)*Math.PI)>0;m.emissiveIntensity=truck.siren?(on?6:.2):1;}
 // 相機
 state.camHold=Math.max(0,(state.camHold||0)-dt);
 if(state.mode==='drive'&&!state.camHold&&Math.abs(truck.v)>.5){const want=truck.heading;state.yaw+=Math.atan2(Math.sin(want-state.yaw),Math.cos(want-state.yaw))*Math.min(1,dt*2.5);}
 const tx=state.x,tz=state.z,ty=ground.at(tx,tz)+(state.mode==='drive'?2.8:1.5);state.camX=tx;state.camZ=tz;
 const d=state.dist+(state.mode==='drive'?Math.abs(truck.v)*.22:0),cx=tx+Math.sin(state.yaw)*Math.cos(state.pitch)*d,cz=tz+Math.cos(state.yaw)*Math.cos(state.pitch)*d;
 camera.position.set(cx,Math.max(ty+Math.sin(state.pitch)*d,ground.at(cx,cz)+.6),cz);camera.lookAt(tx,ty,tz);
 sun.position.set(tx+sunDir.x*250,ground.at(tx,tz)+sunDir.y*250,tz+sunDir.z*250);sun.target.position.set(tx,ground.at(tx,tz),tz);
 streetTimer-=dt;if(streetTimer<0){streetTimer=.4;$('street').textContent=nearestStreet(streets.features,state.x,state.z)??'信義區（無道路名稱）';}
 drawMinimap();renderer.render(scene,camera);requestAnimationFrame(frame);
}
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();const s=innerWidth<=640?140:220;mini.width=mini.height=s*Math.min(devicePixelRatio,2);}
addEventListener('resize',resize);resize();syncUi();
$('loading').hidden=true;
// 測試用：以固定時間步推進模擬（不渲染）。
window.__xinyiStreet={state,truck,colliders,ground,tick(dt,n=1){for(let i=0;i<n;i++)state.mode==='walk'?updateWalk(dt):updateDrive(dt);}};
requestAnimationFrame(frame);
