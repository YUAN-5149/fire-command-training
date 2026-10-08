// 信義街景漫遊：以官方量體與 OSM 路網建立可步行、可駕駛消防車的街景。
// 外觀為示意風格；未使用 taipei-gta 的地圖、程式或素材。
import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {createActionScene} from './action-scene.js';
import {project,buildHeightField,buildWallArrays,buildColliders,buildRoadArrays,nearestStreet,spawnPoint} from './xinyi-street-world.js';

const $=id=>document.getElementById(id),step=t=>{$('loadStep').textContent=t;};
const canvas=$('view');let renderer;
try{renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch(e){$('loading').hidden=true;$('error').hidden=false;throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,1,0.2,2500);
scene.fog=new T.Fog('#c9d6df',250,1100);
const hemi=new T.HemisphereLight('#dfeefa','#6b6458',1.1),sun=new T.DirectionalLight('#fff1d6',2.4);
sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-70,right:70,top:70,bottom:-70,near:1,far:600});sun.shadow.bias=-0.0004;
scene.add(hemi,sun,sun.target);

function canvasTexture(size,draw,repeat=[1,1]){const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(...repeat);t.anisotropy=renderer.capabilities.getMaxAnisotropy();t.colorSpace=T.SRGBColorSpace;return t;}
let seed=7;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
// 外牆：8×8 窗格一張貼圖；夜間發光圖以隨機亮窗示意。
function facade(tower){
 const N=8,lit=[...Array(N*N)].map(()=>rand()<.38),warm=['#ffd890','#ffe9b8','#cfe6ff'];
 const map=canvasTexture(256,(g,s)=>{const c=s/N;g.fillStyle='#f4f1ea';g.fillRect(0,0,s,s);for(let j=0;j<N;j++)for(let i=0;i<N;i++){
  if(tower){g.fillStyle=(i+j)%3?'#5c7488':'#6c8597';g.fillRect(i*c+1,j*c+2,c-2,c-6);g.fillStyle='#d7dde0';g.fillRect(i*c,j*c+c-5,c,4);}
  else{g.fillStyle='#38495a';g.fillRect(i*c+6,j*c+8,c-12,c-15);g.fillStyle='#c9c4b8';g.fillRect(i*c+4,j*c+c-8,c-8,3);}
 }},[1/N,1/N]);
 const emissive=canvasTexture(256,(g,s)=>{const c=s/N;g.fillStyle='#000';g.fillRect(0,0,s,s);for(let j=0;j<N;j++)for(let i=0;i<N;i++)if(lit[j*N+i]){g.fillStyle=warm[(i*3+j)%3];tower?g.fillRect(i*c+1,j*c+2,c-2,c-6):g.fillRect(i*c+6,j*c+8,c-12,c-15);}},[1/N,1/N]);
 return new T.MeshStandardMaterial({map,emissiveMap:emissive,emissive:'#ffffff',emissiveIntensity:0,vertexColors:true,roughness:tower?.35:.85,metalness:tower?.25:0});
}
const surfaces={
 road:canvasTexture(128,(g,s)=>{g.fillStyle='#4a4e52';g.fillRect(0,0,s,s);for(let i=0;i<900;i++){const v=60+rand()*40;g.fillStyle=`rgb(${v},${v+2},${v+5})`;g.fillRect(rand()*s,rand()*s,2,2);}},[1,1]),
 walk:canvasTexture(128,(g,s)=>{g.fillStyle='#b9b2a6';g.fillRect(0,0,s,s);g.strokeStyle='#9d968a';g.lineWidth=3;for(let i=0;i<=4;i++){g.beginPath();g.moveTo(i*s/4,0);g.lineTo(i*s/4,s);g.moveTo(0,i*s/4);g.lineTo(s,i*s/4);g.stroke();}},[.5,1]),
 cycle:canvasTexture(64,(g,s)=>{g.fillStyle='#8c5a4a';g.fillRect(0,0,s,s);},[1,1]),
 zebra:canvasTexture(64,(g,s)=>{g.fillStyle='#4a4e52';g.fillRect(0,0,s,s);g.fillStyle='#e8e8e2';g.fillRect(s*.12,0,s*.76,s/2);},[.25,2.5]),
 crossing:canvasTexture(64,(g,s)=>{g.fillStyle='#55595d';g.fillRect(0,0,s,s);},[1,1]),
};
surfaces.sidewalk=surfaces.walk;
const surfaceMaterial=key=>new T.MeshStandardMaterial({map:surfaces[key],roughness:.95,polygonOffset:true,polygonOffsetFactor:-1-['road','crossing','zebra','cycle','sidewalk','walk'].indexOf(key),polygonOffsetUnits:-2});

function geometry({position,uv,color,index}){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(position,3));if(uv)g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));if(color)g.setAttribute('color',new T.Float32BufferAttribute(color,3));if(index)g.setIndex(index);g.computeVertexNormals();g.computeBoundingSphere();return g;}

step('讀取官方建物量體與路網');
const [district,streets,fixtures]=await Promise.all(['district-xinyi.json','streets-xinyi.json','street-fixtures-xinyi.json'].map(f=>fetch('assets/'+f).then(r=>{if(!r.ok)throw Error(f+' '+r.status);return r.json();})));
step('建立地形、建物與道路');
const ground=buildHeightField(district.buildings,district.bbox),walls=buildWallArrays(district.buildings),colliders=buildColliders(district.buildings,ground),roads=buildRoadArrays(streets.features,ground);
// 店面：每 4 m 一間，深色玻璃、上方招牌色帶（示意，無品牌）；夜間招牌發光。
const signs=['#d23b3b','#2f8f6b','#e0a526','#3a6fc4','#c4508c','#e6763a','#4aa3a8','#7a5bc2'];
const shopTex=lit=>canvasTexture(512,(g,s)=>{const c=s/8;for(let i=0;i<8;i++){const sign=signs[(i*5)%8];g.fillStyle=lit?'#000':'#6d6a64';g.fillRect(i*c,0,c,s);
 g.fillStyle=lit?sign:sign;g.fillRect(i*c+2,s*.08,c-4,s*.17);g.fillStyle=lit?(i%3?'#ffe6b0':'#000'):'#253540';g.fillRect(i*c+5,s*.33,c-10,s*.67);
 if(!lit){g.fillStyle='#8aa0ad';g.fillRect(i*c+5,s*.33,c-10,3);g.fillStyle='#1b252c';g.fillRect(i*c+c/2-1,s*.33,2,s*.67);}}},[1/8,1]);
shopTex.day=shopTex(false);shopTex.night=shopTex(true);shopTex.day.wrapT=shopTex.night.wrapT=T.ClampToEdgeWrapping;
const shopMat=new T.MeshStandardMaterial({map:shopTex.day,emissiveMap:shopTex.night,emissive:'#ffffff',emissiveIntensity:0,roughness:.5,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
const lowMat=facade(false),towerMat=facade(true),roofMat=new T.MeshStandardMaterial({vertexColors:true,roughness:.9,side:T.DoubleSide});
for(const [arrays,mat] of [[walls.low,lowMat],[walls.tower,towerMat],[walls.shop,shopMat],[walls.roof,roofMat]]){const m=new T.Mesh(geometry(arrays),mat);m.castShadow=m.receiveShadow=true;scene.add(m);}
for(const [key,arrays] of Object.entries(roads)){if(!arrays.index.length)continue;const m=new T.Mesh(geometry(arrays),surfaceMaterial(key));m.receiveShadow=true;scene.add(m);}
{// 地面：示意高程格網，鋪面色。
 const {x0,z0,cell,nx,nz,h}=ground,position=[],index=[];
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)position.push(x0+i*cell,h[j*nx+i]-0.05,z0+j*cell);
 for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){const k=j*nx+i;index.push(k,k+nx,k+1,k+1,k+nx,k+nx+1);}
 const m=new T.Mesh(geometry({position,index}),new T.MeshStandardMaterial({color:'#8f8b80',roughness:1}));m.receiveShadow=true;scene.add(m);
 const outer=new T.Mesh(new T.PlaneGeometry(6000,6000),new T.MeshStandardMaterial({color:'#6f7466',roughness:1}));outer.rotation.x=-Math.PI/2;outer.position.y=Math.min(...h)-0.6;scene.add(outer);
}
// 街道設施：路燈（臺北市開放資料，含桿高）、行道樹與號誌位置（OSM）。外形為示意。
const lampGlow=[];
{
 const dummy=new T.Object3D(),poleMat=new T.MeshStandardMaterial({color:'#5d666c',metalness:.5,roughness:.5}),headMat=new T.MeshStandardMaterial({color:'#2d3235',emissive:'#ffd9a0',emissiveIntensity:0});
 const lamps=fixtures.lamps,pole=new T.InstancedMesh(new T.CylinderGeometry(.09,.13,1,8),poleMat,lamps.length),head=new T.InstancedMesh(new T.BoxGeometry(.35,.18,.9),headMat,lamps.length);
 lamps.forEach((l,i)=>{const [x,z]=project(l.lon,l.lat),y=ground.at(x,z),hgt=l.height||8;dummy.position.set(x,y+hgt/2,z);dummy.scale.set(1,hgt,1);dummy.rotation.set(0,0,0);dummy.updateMatrix();pole.setMatrixAt(i,dummy.matrix);dummy.position.set(x,y+hgt,z);dummy.scale.set(1,1,1);dummy.rotation.y=i;dummy.updateMatrix();head.setMatrixAt(i,dummy.matrix);lampGlow.push(x,y+hgt-.15,z);});
 pole.castShadow=true;scene.add(pole,head);surfaces.lampHead=headMat;
 const trees=fixtures.trees,trunk=new T.InstancedMesh(new T.CylinderGeometry(.16,.22,3,7),new T.MeshStandardMaterial({color:'#5b4532'}),trees.length),crown=new T.InstancedMesh(new T.IcosahedronGeometry(2.2,1),new T.MeshStandardMaterial({color:'#4f7a3f',roughness:.9,flatShading:true}),trees.length);
 trees.forEach((t,i)=>{const [x,z]=project(t.lon,t.lat),y=ground.at(x,z);dummy.rotation.set(0,i,0);dummy.scale.set(1,1,1);dummy.position.set(x,y+1.5,z);dummy.updateMatrix();trunk.setMatrixAt(i,dummy.matrix);dummy.position.set(x,y+4.2,z);dummy.scale.set(1,.85+(i%3)*.1,1);dummy.updateMatrix();crown.setMatrixAt(i,dummy.matrix);});
 trunk.castShadow=crown.castShadow=true;scene.add(trunk,crown);
 const sig=fixtures.signals,spole=new T.InstancedMesh(new T.CylinderGeometry(.1,.1,4.5,8),poleMat,sig.length),box=new T.InstancedMesh(new T.BoxGeometry(.4,1.1,.35),new T.MeshStandardMaterial({color:'#262b2e'}),sig.length);
 sig.forEach((s,i)=>{const [x,z]=project(s.lon,s.lat),y=ground.at(x,z);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.position.set(x,y+2.25,z);dummy.updateMatrix();spole.setMatrixAt(i,dummy.matrix);dummy.position.set(x,y+4.3,z);dummy.updateMatrix();box.setMatrixAt(i,dummy.matrix);});
 scene.add(spole,box);
}
const glow=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(lampGlow,3)),new T.PointsMaterial({color:'#ffd9a0',size:3.2,transparent:true,opacity:.75,depthWrite:false,map:canvasTexture(64,(g,s)=>{const r=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);r.addColorStop(0,'#fff');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,s,s);})}));
glow.visible=false;scene.add(glow);

// 主控角色：既有中隊長造型（黃色消防衣）。
step('載入角色與消防車');
const spawn=spawnPoint(streets.features),player=new T.Group(),person=createActionScene(new T.Scene()).createPerson(player,'中隊長');
person.body.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(player);
// 消防車：既有 GIS 車型，紅色警示燈保持紅色。
const truck={root:new T.Group(),model:null,x:0,z:0,heading:0,v:0,steer:0,wheels:[],beacons:[],siren:false};
{const gltf=await new GLTFLoader().loadAsync('assets/geo-fire-engine.glb');truck.model=gltf.scene;truck.model.rotation.y=-Math.PI/2;truck.root.add(truck.model);
 truck.model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;const m=o.material;if(/beacon|warning|LED strip|red.*lens|emergency.*lens|red.*flasher/i.test(m?.name||'')){o.material=m.clone();truck.beacons.push(o.material);}}if(/^Wheel_/.test(o.name))truck.wheels.push(o);});
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
 hemi.intensity=n?.35:1.1;hemi.color.set(n?'#6d82a8':'#dfeefa');sun.intensity=n?.25:2.4;sun.color.set(n?'#9fb4e0':'#fff1d6');
 lowMat.emissiveIntensity=towerMat.emissiveIntensity=n?1:0;shopMat.emissiveIntensity=n?1.2:0;surfaces.lampHead.emissiveIntensity=n?2:0;glow.visible=n;truck.headlight.intensity=n?60:0;syncUi();
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
 if(brake)truck.v*=Math.max(0,1-dt*3);else if(f>0)truck.v+=(truck.v<0?9:4.2)*f*dt;else if(f<0)truck.v+=(truck.v>0?9:3)*f*dt;else truck.v*=Math.max(0,1-dt*.6);
 truck.v=Math.max(-5,Math.min(19,truck.v));if(Math.abs(truck.v)<.05&&!f)truck.v=0;
 truck.steer+=((-r)*.55/(1+Math.abs(truck.v)*.06)-truck.steer)*Math.min(1,dt*5);
 const old={x:truck.x,z:truck.z,h:truck.heading};truck.heading+=truck.v/4.3*Math.tan(truck.steer)*dt;
 truck.x+=-Math.sin(truck.heading)*truck.v*dt;truck.z+=-Math.cos(truck.heading)*truck.v*dt;
 let hit=false;for(const c of truckCircles()){const p=colliders.resolve(c[0],c[1],c[2]);if(p.hit){hit=true;truck.x+=p.x-c[0];truck.z+=p.z-c[1];}}
 if(hit){if(Math.abs(truck.v)>3)truck.v*=-.25;else truck.v*=.5;for(const c of truckCircles())if(colliders.resolve(c[0],c[1],c[2]).hit){truck.x=old.x;truck.z=old.z;truck.heading=old.h;break;}}
 for(const w of truck.wheels)w.rotateY(truck.v*dt/.63);
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
 const d=state.dist,cx=tx+Math.sin(state.yaw)*Math.cos(state.pitch)*d,cz=tz+Math.cos(state.yaw)*Math.cos(state.pitch)*d;
 camera.position.set(cx,Math.max(ty+Math.sin(state.pitch)*d,ground.at(cx,cz)+.6),cz);camera.lookAt(tx,ty,tz);
 sun.position.set(tx+120,ground.at(tx,tz)+220,tz+60);sun.target.position.set(tx,ground.at(tx,tz),tz);
 streetTimer-=dt;if(streetTimer<0){streetTimer=.4;$('street').textContent=nearestStreet(streets.features,state.x,state.z)??'信義區（無道路名稱）';}
 drawMinimap();renderer.render(scene,camera);requestAnimationFrame(frame);
}
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();const s=innerWidth<=640?140:220;mini.width=mini.height=s*Math.min(devicePixelRatio,2);}
addEventListener('resize',resize);resize();syncUi();
$('loading').hidden=true;
// 測試用：以固定時間步推進模擬（不渲染）。
window.__xinyiStreet={state,truck,colliders,ground,tick(dt,n=1){for(let i=0;i<n;i++)state.mode==='walk'?updateWalk(dt):updateDrive(dt);}};
requestAnimationFrame(frame);
