// 信義街景漫遊：與 GIS 頁（taipei-map.html?place=xinyi 預設狀態）共用同一套建物、街道與設施建構函式，
// 只把經緯度轉成本地公尺並改以 Three.js 呈現。外觀為示意；未使用 taipei-gta 的地圖、程式或素材。
import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {createActionScene} from './action-scene.js';
import {rigWheels} from './wheel-rig.js?v=s13';
import {createStreetLife,TIME_PRESETS,createSky,litWindows} from './xinyi-street-life.js?v=s13';
import {buildRouteGraph,findRoute,roadLabels} from './xinyi-street-nav.js?v=s13';
import {createBigMap} from './xinyi-street-map.js?v=s13';
import {createAudio} from './xinyi-street-audio.js?v=s13';
import {RULES,pickFireSite,siteFromBuilding,evaluateParking,sprayHits,createFireFX} from './xinyi-street-mission.js?v=s13';
import {readPad,pickPad,rumble,BUTTONS} from './xinyi-street-gamepad.js?v=s13';
import {createXinyiAerial,buildObstacleIndex,fromFrameXZ,createCivilian} from './xinyi-street-aerial.js?v=s13';
import {createGisLayer,writeBack} from './xinyi-street-gis.js?v=s13';
import {storeKey} from './deployment-store.js?v=s13';
import {unproject} from './xinyi-street-world.js?v=s13';
import {buildDistrictBatch} from './geo-district.js';
import {focusedBuilding,buildXinyiDetail,createDetailMaterials,inFocus} from './geo-xinyi-detail.js?v=70';
import {buildStreetDetail,createStreetMaterials} from './geo-street-detail.js';
import {buildZebraCrossings} from './geo-street-fixtures.js';
import {project,buildHeightField,toLocal,linearColors,buildColliders,buildStreetBase,nearestStreet,spawnPoint} from './xinyi-street-world.js?v=s13';

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
const [district,streets,fixtures,verified,firstBatch]=await Promise.all(['district-xinyi.json','streets-xinyi.json','street-fixtures-xinyi.json','verified-fixtures-xinyi.json','xinyi-first-batch.json'].map(f=>fetch('assets/'+f).then(r=>{if(!r.ok)throw Error(f+' '+r.status);return r.json();})));
step('建立地形、建物與道路');
const ground=buildHeightField(district.buildings,district.bbox),colliders=buildColliders(district.buildings,ground);
let detailMats,farMat;
// 建物：精修範圍（中心約 250 m）用 buildXinyiDetail，其餘用 buildDistrictBatch，與 GIS 頁預設相同。
{const refined=district.buildings.filter(focusedBuilding),basic=district.buildings.filter(b=>!focusedBuilding(b));
 // 遠處建物只接收陰影、不投射，減少陰影計算量。
 const batch=buildDistrictBatch(basic);farMat=litWindows(new T.MeshStandardMaterial({vertexColors:true,roughness:.85,side:T.DoubleSide,flatShading:true}),{byColor:true});const far=mesh(toLocal(batch.position,ground),{color:batch.color,index:batch.faces,material:farMat});far.castShadow=false;scene.add(far);
 const detail=buildXinyiDetail(refined,{arcade:false,attStudy:false});detailMats=createDetailMaterials(GisMaterial);litWindows(detailMats.glass);scene.add(mesh(toLocal(detail.position,ground),{color:detail.color,uv:detail.uv,groups:detail.groups,materials:detailMats}));
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
const spawn=spawnPoint(streets.features),player=new T.Group(),actionKit=createActionScene(new T.Scene()),person=actionKit.createPerson(player,'中隊長');
person.body.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(player);
// 消防車：既有 GIS 車型，紅色警示燈保持紅色。
const truck={root:new T.Group(),model:null,x:0,z:0,heading:0,v:0,steer:0,beacons:[],siren:false};
{const gltf=await new GLTFLoader().loadAsync('assets/geo-fire-engine.glb');truck.template=gltf.scene.clone(true);truck.model=gltf.scene;truck.model.rotation.y=-Math.PI/2;truck.root.add(truck.model);
  truck.model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;const m=o.material;if(/beacon|warning|LED strip|red.*lens|emergency.*lens|red.*flasher/i.test(m?.name||'')){o.material=m.clone();truck.beacons.push(o.material);}}});
 // 方案 A：載入時把車輪零件重組到輪軸中心（不修改車型檔），靜止外觀與原車型相同。
 truck.rig=rigWheels(truck.model);
 scene.add(truck.root);
 const head=new T.SpotLight('#fff4dc',0,60,.45,.5,1.2);head.position.set(0,1.3,-3.6);head.target.position.set(0,0,-20);truck.root.add(head,head.target);truck.headlight=head;
}
// 街道生活層（示意）：排除已有照片／樣板研究的量體（微風南山、ATT 相鄰外牆、第一批信義建物候選）。
step('建立車流、行人與店面');
const exclude=new Set([357399,265936,266115,266138]);(function collect(o){if(Array.isArray(o))o.forEach(collect);else if(o&&typeof o==='object')for(const [k,v] of Object.entries(o)){if(k==='officialVolumeCandidates'&&Array.isArray(v))v.forEach(id=>exclude.add(+id));else collect(v);}})(firstBatch);
const life=createStreetLife(scene,{features:streets.features,buildings:district.buildings,ground,colliders,fixtures,exclude,spawn});
const sky=createSky();scene.add(sky);
const audio=createAudio();
// 導航：步行用全部路徑、駕駛只用車道並遵守單行道。重點建物取第一批信義建物清單（OSM 名稱；量體對應仍為候選）。
const routeGraphs={walk:buildRouteGraph(streets.features),drive:buildRouteGraph(streets.features,{vehicle:true})};
const pois=(firstBatch.sites??[]).filter(s=>s.name&&s.polygon?.length).map(s=>{const pts=s.polygon.map(p=>project(p[0],p[1]));return {name:s.name,x:pts.reduce((a,p)=>a+p[0],0)/pts.length,z:pts.reduce((a,p)=>a+p[1],0)/pts.length};});
const state={mode:'walk',yaw:spawn.heading,pitch:.32,dist:7,x:spawn.x,z:spawn.z,facing:spawn.heading,time:'afternoon',paused:false,keys:new Set(),stick:[0,0],run:false,walkT:0,pad:readPad(null),padPrev:[]};
function placeTruck(){const g=gisEngine();if(g){truck.x=g.x;truck.z=g.z;truck.heading=g.heading;truck.v=0;return;}const f=[-Math.sin(spawn.heading),-Math.cos(spawn.heading)],r=[Math.cos(spawn.heading),-Math.sin(spawn.heading)];truck.x=spawn.x+f[0]*14+r[0]*1.5;truck.z=spawn.z+f[1]*14+r[1]*1.5;truck.heading=spawn.heading;truck.v=0;}
function resetAll(){state.mode='walk';state.x=spawn.x;state.z=spawn.z;state.facing=spawn.heading;state.yaw=spawn.heading;placeTruck();standBesideTruck();player.visible=true;syncUi();}
// GIS 部署頁的配置（同一瀏覽器）：車組、人員、搶救建物與第一正面入口。第一車組＝可駕駛的水箱車。
const geoModels=await fetch('assets/geo-models.json').then(r=>r.ok?r.json():null).catch(()=>null);
const gis=geoModels?createGisLayer(scene,{ground,createPerson:actionKit.createPerson,models:geoModels,preloaded:{engine:truck.template}}):null;
let gisDep=gis?.load()??null;
function gisEngine(){const it=gisDep?.items?.engine1;if(!it?.point)return null;return gis.data?.vehicles.find(v=>v.unitId==='engine1')??null;}
function standBesideTruck(){if(!gisEngine())return;const r=[Math.cos(truck.heading),-Math.sin(truck.heading)],p=colliders.resolve(truck.x-r[0]*3,truck.z-r[1]*3,.4);state.x=p.x;state.z=p.z;state.facing=state.yaw=truck.heading;}
let aerialActive=()=>false;// 街景雲梯車已配置時隱藏 GIS 配置的同一部雲梯車
async function applyGis(){if(!gis)return;await gis.apply(gisDep,{skip:['engine1','commander']});if(aerialActive())gis.hide('aerial');}
function gisSummary(){const d=gis?.data;if(!d||(!d.vehicles.length&&!d.target))return '';const n=d.vehicles.filter(v=>v.unitId!=='commander').length;return `已載入 GIS 部署：車組 ${n}、人員 ${d.crew.length}`+(d.target?'、搶救建物':'')+(d.entrance?'、第一正面入口':'');}
await applyGis();
placeTruck();standBesideTruck();
// 頂端通知列（與「按 E 上車」提示分開，避免被覆蓋）。
let noticeTimer=0;function showNotice(text,ms=5000){$('notice').textContent=text;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{$('notice').hidden=true;},ms);}
if(gisSummary())showNotice(gisSummary()+(gisEngine()?'；第一車組位置即可駕駛的水箱車':''),7000);
// 另一個分頁（GIS 頁）更新部署時即時同步（不移動正在駕駛的水箱車）。
addEventListener('storage',async e=>{if(e.key!==storeKey('xinyi'))return;gisDep=gis?.load()??null;await applyGis();showNotice('已同步 GIS 部署頁的更新'+(gisSummary()?'：'+gisSummary().replace('已載入 GIS 部署：',''):''));});

// 輸入
addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;const k=e.key.toLowerCase();audio.unlock();if(bigmap.open){if(k==='m'||k==='escape')closeMap();return;}if(k==='m'&&!state.paused){openMap();return;}if(k==='escape'||k==='p'){setPaused(!state.paused);e.preventDefault();return;}if(k==='h'){setPaused(true,'controls');return;}if(state.paused)return;state.keys.add(k);if(k==='e')toggleVehicle();if(k==='t')startMission();if(k==='f')toggleHose();if(k==='l')aerialAction();if(k==='q')toggleSiren();if(k==='n')cycleTime();if(k==='r')resetAll();if([' ','arrowup','arrowdown'].includes(k))e.preventDefault();});
addEventListener('keyup',e=>state.keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>state.keys.clear());
let drag=null;
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&e.clientX<innerWidth*.45)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const k=settings.sens;state.yaw-=(e.clientX-drag.x)*.006*k;state.pitch=Math.min(1.25,Math.max(.05,state.pitch+(e.clientY-drag.y)*.004*k*(settings.invertY?-1:1)));drag.x=e.clientX;drag.y=e.clientY;state.camHold=1.5;});
canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{state.dist=Math.min(40,Math.max(3,state.dist*(1+Math.sign(e.deltaY)*.1)));e.preventDefault();},{passive:false});
{const stick=$('stick'),knob=stick.querySelector('i');let id=null;
 const move=e=>{const r=stick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,l=Math.min(1,Math.hypot(dx,dy)/(r.width/2))/(Math.hypot(dx,dy)||1);state.stick=[dx*l,-dy*l];knob.style.transform=`translate(${dx*l*r.width/2}px,${dy*l*r.width/2}px)`;};
 stick.addEventListener('pointerdown',e=>{id=e.pointerId;stick.setPointerCapture(id);move(e);});stick.addEventListener('pointermove',e=>{if(e.pointerId===id)move(e);});
 const end=()=>{id=null;state.stick=[0,0];knob.style.transform='';};stick.addEventListener('pointerup',end);stick.addEventListener('pointercancel',end);
 $('tRun').addEventListener('pointerdown',()=>{state.run=!state.run;$('tRun').classList.toggle('on',state.run);});$('tEnter').addEventListener('click',()=>toggleVehicle());
}
$('enter').onclick=()=>toggleVehicle();$('siren').onclick=()=>toggleSiren();$('night').onclick=()=>cycleTime();$('reset').onclick=()=>resetAll();

function nearTruck(){return Math.hypot(state.x-truck.x,state.z-truck.z)<6;}
function toggleVehicle(){
 if(state.mode==='walk'){if(!nearTruck())return;if(mission?.hose){flashHint('請先按 F 收回水線再上車');return;}state.mode='drive';player.visible=false;state.dist=Math.max(state.dist,13);}
 else{if(Math.abs(truck.v)>1.5)return;state.mode='walk';const r=[Math.cos(truck.heading),-Math.sin(truck.heading)];const p=colliders.resolve(truck.x-r[0]*2.6,truck.z-r[1]*2.6,.4);state.x=p.x;state.z=p.z;state.facing=truck.heading;player.visible=true;state.dist=7;}
 syncUi();
}
function toggleSiren(){if(state.mode!=='drive')return;truck.siren=!truck.siren;syncUi();}
function cycleTime(){const order=Object.keys(TIME_PRESETS);applyTime(order[(order.indexOf(state.time)+1)%order.length]);quality.apply();syncTime();}
function applyTime(name){
 state.time=name;const p=TIME_PRESETS[name],az=p.az*Math.PI/180,el=p.el*Math.PI/180;
 sunDir.set(Math.sin(az)*Math.cos(el),Math.sin(el),-Math.cos(az)*Math.cos(el));
 sky.material.uniforms.top.value.set(p.top);sky.material.uniforms.horizon.value.set(p.horizon);scene.fog.color.set(p.horizon);scene.fog.near=p.fogNear;scene.fog.far=p.fogFar;
 hemi.intensity=p.hemiI;hemi.color.set(p.hemiSky);hemi.groundColor.set(p.hemiGround);sun.intensity=p.sunI;sun.color.set(p.sun);
 for(const m of lampHeads)m.emissiveIntensity=p.lights*2;glow.visible=p.lights>0;truck.headlight.intensity=p.lights*60;
 detailMats.glass.emissiveIntensity=p.windows*.9;farMat.emissiveIntensity=p.windows*1.2;life.setLights(p.lights);syncUi();
}
function syncUi(){
 $('enter').textContent=state.mode==='drive'?'下車':'上車';$('siren').hidden=state.mode!=='drive';$('siren').classList.toggle('on',truck.siren);$('night').textContent='時段：'+TIME_PRESETS[state.time].label;
 $('speed').hidden=state.mode!=='drive';
}

// 小地圖：預先繪製路網與牆線，執行時依視角旋轉。
const mini=$('minimap'),mctx=mini.getContext('2d'),MAP=2048,mapScale=MAP/1100,mapImg=document.createElement('canvas');
{mapImg.width=mapImg.height=MAP;const g=mapImg.getContext('2d');g.fillStyle='#26323a';g.fillRect(0,0,MAP,MAP);const P=(x,z)=>[MAP/2+x*mapScale,MAP/2+z*mapScale];
 g.lineCap='round';g.lineJoin='round';
 for(const f of streets.features){g.strokeStyle=f.kind==='road'?'#8e9aa2':f.kind==='crossing'?'#d9dcdc':'#55636b';g.lineWidth=Math.max(f.kind==='road'?(f.width||6):1.5,1)*mapScale;
  for(const path of f.paths){g.beginPath();path.forEach((p,i)=>{const [x,y]=P(...project(p[0],p[1]));i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();}}
 g.strokeStyle='#c9a77b';g.lineWidth=2;g.beginPath();for(const [ax,az,bx,bz] of colliders.segs){g.moveTo(...P(ax,az));g.lineTo(...P(bx,bz));}g.stroke();
}
const bigmap=createBigMap({overlay:$('bigmap'),canvas:$('mapCanvas'),mapImg,MAP,mapScale,labels:roadLabels(streets.features),pois,
 getView:()=>({x:state.x,z:state.z,facing:state.mode==='drive'?truck.heading:state.facing,driving:state.mode==='drive',truck,waypoint:state.waypoint,route:state.route,fire:mission?.site&&mission.phase!=='done'?mission.site:null}),
 onPick:(x,z)=>setWaypoint(x,z,'地圖標記')});
function openMap(){state.keys.clear();state.stick=[0,0];audio.suspend();$('mapStreet').textContent=$('street').textContent;bigmap.show();}
function closeMap(){bigmap.hide();if(!state.paused)audio.resume();}
function setWaypoint(x,z,label){state.waypoint={x,z,label};state.routeTimer=0;updateNavigation(0);}
function clearWaypoint(){state.waypoint=null;state.route=null;$('waypoint').hidden=true;}
function updateNavigation(dt){
 if(!state.waypoint)return;const remain=Math.hypot(state.waypoint.x-state.x,state.waypoint.z-state.z);
 if(remain<12){clearWaypoint();$('prompt').hidden=false;$('prompt').textContent='已抵達目標';setTimeout(()=>{if($('prompt').textContent==='已抵達目標')$('prompt').hidden=true;},2500);return;}
 state.routeTimer=(state.routeTimer??0)-dt;
 if(state.routeTimer<=0){state.routeTimer=1;const r=findRoute(routeGraphs[state.mode==='drive'?'drive':'walk'],state.x,state.z,state.waypoint.x,state.waypoint.z);state.route=r?.points??null;state.routeLength=r?.length??remain;}
 const d=state.routeLength??remain;$('waypoint').hidden=false;$('wpText').textContent=`${state.waypoint.label} · ${d>=1000?(d/1000).toFixed(1)+' km':Math.round(d)+' m'}`+(state.route?'':'（無可行路線，直線距離）');
}
// ---------- 消防任務模式（訓練示意） ----------
const fireFx=createFireFX(scene);let mission=null;
const STEPS=['上消防車並開警示燈前往','抵達火場','於起火面外側 8–30 m 停妥後下車','在消防車旁按 F 佈設水線','按住 Space 對準火點出水','火勢控制'];
const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
function flashHint(text){$('missionHint').textContent=text;}
// 受困者（示意）：起火樓層、同一立面，起火窗口旁約 3 m 的窗口（牆面太短時在同一窗口）。只能由雲梯籃架救出。
function makeVictim(site){
 const tx=-site.nz,tz=site.nx,half=Math.hypot(site.wall[2]-site.wall[0],site.wall[3]-site.wall[1])/2,off=half>4.5?3*(Math.random()<.5?-1:1):0;
 const x=site.x+tx*off,z=site.z+tz*off,slab=site.base+(site.floor-1)*3.4,figure=createCivilian(scene),window=new T.Vector3(x+site.nx*.25,slab,z+site.nz*.25);
 figure.root.position.copy(window);figure.root.rotation.y=Math.atan2(-site.nx,-site.nz);return {figure,window,x,z,state:'waiting',floor:site.floor};
}
function renderVictim(){const v=mission?.victim;$('victimLine').hidden=!v;if(!v)return;$('victimLine').textContent='受困者 1 人：'+({waiting:`${v.floor} 樓窗口待救（需雲梯籃架）`,boarding:'進入籃架中',basket:'在籃內',unloading:'離籃中',rescued:'已救出交接'}[v.state]);$('victimLine').classList.toggle('done',v.state==='rescued');}
function gisVehicles(){return (gis?.data?.vehicles??[]).filter(v=>v.unitId!=='engine1'&&v.unitId!=='commander'&&v.unitId!=='aerial').map(v=>({id:v.unitId,x:v.x,z:v.z,heading:v.heading,length:geoModels[v.model].length,width:geoModels[v.model].span,height:geoModels[v.model].height}));}
function startMission(){
 if(mission&&mission.phase<6&&!confirm('目前任務尚未完成，要改派新的火警嗎？'))return;
 const target=gisDep?.target,fromGis=target?siteFromBuilding(district.buildings,streets.features,ground,{id:target.id,point:target.point,entrance:gisDep.entrance}):null;
 const site=fromGis??pickFireSite(district.buildings,streets.features,ground,Math.random,{exclude,colliders});if(!site)return;
 if(target&&!fromGis)flashHint('GIS 指定的搶救建物不在本頁量體範圍內，改為隨機派遣');
 aerial?.stow();setAerialMode(null);if(mission?.victim)scene.remove(mission.victim.figure.root);
 mission={site,phase:0,elapsed:0,times:{},intensity:.55,hose:false,spraying:false,parking:null,victim:makeVictim(site)};fireFx.setSite(site);renderVictim();
 $('missionTitle').textContent='建物火警';$('missionWhere').textContent=`${site.street||'信義區'} 一帶・${site.floor} 樓冒煙（示意）`+(site.fromGis?'・GIS 指定搶救建物'+(gisDep?.entrance?'，起火面取第一正面':''):'');$('mission').hidden=false;$('missionReport').hidden=true;
 setWaypoint(site.x+site.nx*16,site.z+site.nz*16,'火警現場');renderMission();flashHint(state.mode==='drive'?'按 Q 開警示燈，依地圖黃線前往':'先走到消防車按 E 上車');
}
function endMission(){aerial?.stow();if(mission?.victim)scene.remove(mission.victim.figure.root);gis?.hide('aerial',false);setAerialMode(null);mission=null;fireFx.setSite(null);$('mission').hidden=true;clearWaypoint();person.nozzle.visible=false;$('tSpray').hidden=$('tHose').hidden=true;}
// 各步驟以實際紀錄時間判定完成；以雲梯出水等方式越過的步驟標示為略過，不顯示為已完成。
const STEP_TIMES=['depart','arrive','parked','hose','water','done'];
function renderMission(){if(!mission)return;$('missionSteps').innerHTML=STEPS.map((s,i)=>{const done=mission.times[STEP_TIMES[i]]!==undefined,skip=!done&&i<mission.phase;return `<li class="${done?'done':skip?'skip':i===mission.phase?'now':''}">${s}${skip?'（略過）':''}</li>`;}).join('');$('fireLevel').style.width=Math.round(Math.max(0,mission.intensity)*100)+'%';}
function toggleHose(){
 if(!mission||state.mode!=='walk')return;
 if(mission.hose){if(Math.hypot(state.x-truck.x,state.z-truck.z)>8){flashHint('回到消防車旁才能收回水線');return;}mission.hose=false;person.nozzle.visible=false;flashHint('已收回水線');return;}
 if(mission.phase<3){flashHint('請先依步驟停妥消防車');return;}
 if(!nearTruck()){flashHint('走到消防車旁按 F 佈設水線');return;}
 mission.hose=true;person.nozzle.visible=true;if(mission.phase===3){mission.phase=4;mission.times.hose=mission.elapsed;}flashHint('面向火點，按住 Space 出水（水線長 '+RULES.hoseLength+' m）');renderMission();
}
function updateMission(dt,t){
 if(!mission){fireFx.update(dt,0);return;}
 const m=mission,site=m.site;
 if(m.victim?.state==='waiting'){const a=m.victim.figure.arms;a[0].rotation.z=-2.6-Math.sin(t*6)*.35;a[1].rotation.z=2.6+Math.sin(t*6+1)*.35;}else if(m.victim){m.victim.figure.arms.forEach(a=>a.rotation.z=0);}
 if(m.victim&&m.victim.state!==m.victimShown){m.victimShown=m.victim.state;renderVictim();}
 if(m.phase<6){m.elapsed+=dt;$('missionClock').textContent=fmt(m.elapsed);if(!m.spraying)m.intensity=Math.min(1,m.intensity+RULES.growth*dt);}
 const truckDist=Math.hypot(truck.x-site.x,truck.z-site.z);
 if(m.phase===0&&state.mode==='drive'){m.phase=1;m.times.depart=m.elapsed;}
 if(m.phase===1&&truckDist<RULES.arriveRadius){m.phase=2;m.times.arrive=m.elapsed;flashHint('已抵達：於起火面外側 8–30 m 停車，停妥後按 E 下車');}
 if(m.phase===2){m.parking=evaluateParking(truck,site,colliders,{speed:truck.v});
  if(state.mode==='walk'){if(m.parking.ok){m.phase=3;m.times.parked=m.elapsed;m.parkDist=m.parking.dist;clearWaypoint();flashHint('停車位置符合；在消防車旁按 F 佈設水線');}else flashHint('停車需調整：'+m.parking.issues.join('、'));}
  else if(Math.abs(truck.v)<.4)flashHint(m.parking.ok?'位置符合，按 E 下車':'停車需調整：'+m.parking.issues.join('、'));}
 // 水線長度限制：人員不可超過水線長度。
 if(m.hose){const dx=state.x-truck.x,dz=state.z-truck.z,d=Math.hypot(dx,dz);if(d>RULES.hoseLength){state.x=truck.x+dx/d*RULES.hoseLength;state.z=truck.z+dz/d*RULES.hoseLength;}}
 m.spraying=m.hose&&state.mode==='walk'&&(state.keys.has(' ')||state.touchSpray||state.pad.held.spray)&&!state.paused;
 let spray=null;
 if(m.spraying){state.facing=state.yaw;person.arms[1].rotation.x=-1.35;person.arms[0].rotation.x=-1.1;
  const r=sprayHits({x:state.x,z:state.z},state.yaw,site,truck),range=Math.min(Math.max(r.dist,6),RULES.reach),dir=new T.Vector3(-Math.sin(state.yaw),0,-Math.cos(state.yaw));
  const origin=new T.Vector3(state.x+dir.x*.6,ground.at(state.x,state.z)+1.2,state.z+dir.z*.6);dir.y=(site.y-origin.y)/range;dir.normalize();
  spray={origin,dir:new T.Vector3(-Math.sin(state.yaw),(site.y-origin.y)/range,-Math.cos(state.yaw)),range};
  if(r.hit&&m.phase<6){if(m.times.water===undefined)m.times.water=m.elapsed;m.intensity=Math.max(0,m.intensity-RULES.knockdown*dt);flashHint('命中火點，持續射水');}
  else if(m.phase>=6)flashHint('火勢已控制，可按 F 收回水線');
  else flashHint(r.hose>RULES.hoseLength?'水線不夠長':r.dist>RULES.reach?`距火點 ${Math.round(r.dist)} m，請靠近至 ${RULES.reach} m 內`:'調整鏡頭方向對準火點');}
 // 雲梯籃架出水（大水霧）：同樣計入射水。
 let fogSpray=null;
 if(aerial?.state.spraying&&m.phase<6){const n=aerial.nozzle(),fp=firePoint(site);fogSpray={origin:n.origin,dir:n.dir,range:n.origin.distanceTo(fp)};
  if(fogSpray.range<RULES.reach+6){if(m.times.water===undefined)m.times.water=m.elapsed;m.intensity=Math.max(0,m.intensity-RULES.knockdown*dt);if(m.phase<5){m.phase=5;}}}
 if(m.phase===4&&m.times.water!==undefined){m.phase=5;}
 if(m.phase===5&&m.intensity<=0){m.phase=6;m.intensity=0;m.times.done=m.elapsed;fireFx.setSite(null);showReport();}
 $('tHose').hidden=!(m.phase>=3&&state.mode==='walk');$('tSpray').hidden=!(m.hose&&state.mode==='walk');
 const handPos=new T.Vector3(state.x,ground.at(state.x,state.z)+1,state.z),truckPos=new T.Vector3(truck.x,ground.at(truck.x,truck.z)+1,truck.z);
 fireFx.update(dt,m.phase<6?m.intensity:0,{spray,hoseFrom:m.hose?truckPos:null,hoseTo:m.hose?handPos:null,fogSpray});
 if(Math.floor(t*4)!==Math.floor((t-dt)*4))renderMission();
}
function showReport(){
 const m=mission,T0=m.times,row=(a,b)=>`<tr><td>${a}</td><td>${b}</td></tr>`,span=(a,b)=>a!==undefined&&b!==undefined?fmt(b-a):'—';
 $('reportBody').innerHTML='<table>'+row('派遣地點',`${m.site.street||'信義區'}・${m.site.floor} 樓（示意）`)+row('派遣 → 上車出發',span(0,T0.depart))+row('出發 → 抵達',span(T0.depart,T0.arrive))+row('抵達 → 停妥下車',span(T0.arrive,T0.parked))+row('停妥 → 佈設水線',span(T0.parked,T0.hose))+row('佈線 → 開始射水',span(T0.hose,T0.water))+row('射水 → 火勢控制',span(T0.water,T0.done))+(T0.aerialStart!==undefined?row('雲梯：配置 → 籃架到位',span(T0.aerialStart,T0.aerialReady)):'')+row('受困者（雲梯籃架）',T0.rescued!==undefined?'派遣後 '+fmt(T0.rescued)+' 救出':'未救出')+row('總時間',fmt(T0.done))+row('停車距起火面',m.parkDist?m.parkDist.toFixed(1)+' m':'—')+'</table>';
 $('missionReport').hidden=false;$('missionTitle').textContent='火勢已控制';flashHint('任務完成，可按 F 收回水線');renderMission();
}
// ---------- 雲梯車作業（訓練示意） ----------
// 第一次使用才下載車型（約 7 MB）。中隊長站在預定車輛中心位置，車身自動與起火面平行、右側面向建物（順向）。
// 預覽只核對作業距離；按確認後再以真實量體核對升梯路徑。車輛直接到位，未模擬行駛。
let aerial=null,aerialLoading=null,aerialMode=null,aerialPreview=null,aerialTimer=0;
aerialActive=()=>!!aerial&&aerial.state.phase!=='idle';
const firePoint=site=>new T.Vector3(site.x-site.nx*.5,site.y,site.z-site.nz*.5);
const previewGroup=new T.Group();previewGroup.visible=false;scene.add(previewGroup);
const previewMat=[new T.MeshBasicMaterial({color:'#36d17a',transparent:true,opacity:.45,depthWrite:false,side:T.DoubleSide}),new T.MeshBasicMaterial({color:'#ff4d4d',transparent:true,opacity:.45,depthWrite:false,side:T.DoubleSide})];
const previewQuads=[...Array(5)].map(()=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(12),3));g.setIndex([0,1,2,0,2,3]);const m=new T.Mesh(g,previewMat[0]);m.renderOrder=3;m.frustumCulled=false;previewGroup.add(m);return m;});
const windowMark=new T.Mesh(new T.TorusGeometry(.8,.08,8,32),new T.MeshBasicMaterial({color:'#38bdf8',depthTest:false}));windowMark.renderOrder=4;previewGroup.add(windowMark);
function loadAerial(){
 if(aerial)return Promise.resolve(aerial);
 aerialLoading??=new GLTFLoader().loadAsync('assets/aerial-ladder.glb').then(gltf=>aerial=createXinyiAerial({scene,source:gltf.scene,createPerson:actionKit.createPerson,ground,obstacleIndex:buildObstacleIndex(district.buildings)})).catch(e=>{aerialLoading=null;throw e;});
 return aerialLoading;
}
function setAerialMode(mode){aerialMode=mode;previewGroup.visible=mode==='preview';aerialPreview=null;aerialTimer=0;syncAerialUi();}
function aerialSite(){return mission&&mission.phase<6?mission.site:null;}
async function aerialAction(){
 const site=aerialSite();
 if(!site){flashHint(mission?'火勢已控制，不需再配置雲梯':'雲梯作業需先派遣火警（T）');return;}
 if(state.mode!=='walk'){flashHint('請下車，站在預定的雲梯車中心位置再按 L');return;}
 if(aerial?.state.phase==='ground'){const r=aerial.raiseToFire();flashHint(r.ok?`升梯前往起火窗口（籃架距外牆 ${r.standoff} m）出水`:'無法升梯出水：'+r.reason+'；可按「收梯」');syncAerialUi();return;}
 if(aerial?.canRetract()){if(aerial.retract())flashHint('收梯中：收回梯架，人員下車，再收支腿');syncAerialUi();return;}
 if(aerial&&!['idle','parked'].includes(aerial.state.phase))return;
 if(aerialMode!=='preview'){
  if(!aerial){$('aerialStatus').textContent='載入雲梯車型…';try{await loadAerial();}catch(e){flashHint('雲梯車型無法載入：'+e.message);syncAerialUi();return;}}
  setAerialMode('preview');flashHint('走到預定的雲梯車中心位置（車身會與起火面平行），綠色表示作業距離符合，再按 L 確認');return;
 }
 // 有受困者待救時先救人（籃架到受困者窗口），否則到起火窗口出水。
 const victim=mission.victim?.state==='waiting'?mission.victim:null;
 const r=aerial.check(site,state.x,state.z,{engine:truck,vehicles:gisVehicles(),features:streets.features,window:victim?{x:victim.x,z:victim.z}:undefined});
 if(!r.ok){flashHint('無法在此配置：'+r.issues.join('、'));return;}
 aerial.deploy(r,site,{task:victim?'rescue':'fire',victim});setAerialMode(null);gis?.hide('aerial');
 mission.times.aerialStart=mission.elapsed;
 // 中隊長移到車尾外側，避免與車身重疊。
 const [ox,oz]=fromFrameXZ(r.frame,8,3.2),p=colliders.resolve(ox,oz,.4);state.x=p.x;state.z=p.z;
 flashHint(`雲梯車到位（距外牆 ${r.dist.toFixed(1)} m、籃架距窗口外 ${r.standoff} m）：支腿展開→人員登車→升梯`+(victim?'→救出受困者':'→出水')+(r.warnings.length?'。注意：'+r.warnings.join('、'):''));
 syncAerialUi();
}
function syncAerialUi(){
 const ph=aerial?.state.phase??'idle',btn=$('aerialBtn'),cancel=$('aerialCancel');
 $('aerialStatus').textContent=aerialMode==='preview'?'選擇車位中':(aerial?.state.blocked?'動作已停止':{idle:'未配置',deploying:'支腿展開・登車・升梯中',rescue:'籃架到位・協助受困者進籃',lowering:'載人緩慢下降',unloading:'引導受困者離籃',ground:'籃架在地面・受困者已救出',raising:'升梯前往起火窗口',ready:'籃架到位・出水',retracting:'收梯中',parked:'已收梯'}[ph]);
 const retractable=!!aerial?.canRetract();
 btn.textContent=aerialMode==='preview'?'確認車位（L）':ph==='ground'?'升梯出水（L）':retractable?'收梯（L）':ph==='parked'?'重新配置（L）':ph==='idle'?'配置雲梯（L）':'作業中';
 btn.disabled=aerialMode!=='preview'&&!['idle','parked','ground'].includes(ph)&&!retractable;
 cancel.hidden=!(aerialMode==='preview'||ph==='parked'||ph==='ground');cancel.textContent=aerialMode==='preview'?'取消':ph==='ground'?'收梯':'撤離';
}
function updateAerial(dt){
 if(aerialMode==='preview'&&aerial){const site=aerialSite();if(!site){setAerialMode(null);return;}
  aerialTimer-=dt;if(aerialTimer<=0){aerialTimer=.2;const r=aerialPreview=aerial.preview(site,state.x,state.z,{engine:truck,features:streets.features});
   aerial.outline(r.frame).forEach((poly,i)=>{const a=previewQuads[i].geometry.attributes.position;poly.forEach(([x,z],k)=>a.setXYZ(k,x,ground.at(x,z)+.12,z));a.needsUpdate=true;previewQuads[i].material=previewMat[r.ok?0:1];});
   {const v=mission.victim?.state==='waiting'?mission.victim:null;windowMark.position.set((v?v.x:site.x)+site.nx*1,site.base+(site.floor-1)*3.4+1.2,(v?v.z:site.z)+site.nz*1);}windowMark.rotation.set(0,Math.atan2(site.nx,site.nz),0);
   flashHint((r.ok?'✓ 作業距離符合（按 L 核對升梯路徑）':'✗ '+r.issues.join('、'))+`・車身中心距外牆 ${r.dist.toFixed(1)} m`+(r.warnings.length?'・'+r.warnings.join('、'):''));}}
 if(!aerial)return;
 const site=mission?.site,e=aerial.update(dt,{fire:site?firePoint(site):null,fireActive:!!mission&&mission.phase<6});
 if(e?.blocked)flashHint('雲梯已停止：'+e.reason+'（按 L 收梯）');
 if(e?.arrived){if(mission&&mission.times.aerialReady===undefined)mission.times.aerialReady=mission.elapsed;flashHint(e.rescue?'籃架到位受困者窗口：開籃門，協助受困者跨窗台進籃':'籃架到位，砲塔對準起火點出水（大水霧）');}
 if(e?.aboard)flashHint('受困者已進籃、籃門關妥：載人緩慢下降到車外地面');
 if(e?.landed)flashHint('籃架落地：開籃門，引導受困者離籃');
 if(e?.rescued){if(mission){mission.times.rescued=mission.elapsed;renderVictim();}flashHint('受困者已救出並交接（示意）；按 L 升梯到起火窗口出水，或按「收梯」');}
 if(e?.parked)flashHint('已收梯並收回支腿；可按 L 重新配置或「撤離」');
 if(e)syncAerialUi();
}
$('aerialBtn').onclick=()=>aerialAction();
$('aerialCancel').onclick=()=>{if(aerialMode==='preview'){setAerialMode(null);flashHint('已取消雲梯配置');}else if(aerial?.state.phase==='ground'){if(aerial.retract())flashHint('收梯中：收回梯架，人員下車，再收支腿');syncAerialUi();}else if(aerial?.dismiss()){gis?.hide('aerial',false);flashHint('雲梯車已撤離');syncAerialUi();}};
$('missionBtn').onclick=()=>startMission();$('missionAbort').onclick=()=>{if(confirm('取消目前任務？'))endMission();};
$('reportAgain').onclick=()=>{endMission();startMission();};$('reportClose').onclick=()=>{$('missionReport').hidden=true;};
$('tHose').onclick=()=>toggleHose();
$('tSpray').addEventListener('pointerdown',()=>{state.touchSpray=true;});for(const ev of ['pointerup','pointercancel','pointerleave'])$('tSpray').addEventListener(ev,()=>{state.touchSpray=false;});
$('mapBtn').onclick=()=>openMap();$('mapClose').onclick=()=>closeMap();$('mapIn').onclick=()=>bigmap.zoom(1.3);$('mapOut').onclick=()=>bigmap.zoom(1/1.3);$('mapMe').onclick=()=>bigmap.center();
$('mapClear').onclick=()=>clearWaypoint();$('mapTruckWp').onclick=()=>setWaypoint(truck.x,truck.z,'消防車');
$('menuMap').onclick=()=>{setPaused(false);openMap();};
function drawMinimap(){
 const s=mini.width,zoom=state.mode==='drive'?.55:.9;mctx.save();mctx.clearRect(0,0,s,s);mctx.beginPath();mctx.arc(s/2,s/2,s/2,0,Math.PI*2);mctx.clip();
 mctx.fillStyle='#1c252b';mctx.fillRect(0,0,s,s);mctx.translate(s/2,s/2);mctx.rotate(state.yaw);mctx.scale(zoom,zoom);
 const cx=MAP/2+state.camX*mapScale,cz=MAP/2+state.camZ*mapScale;mctx.drawImage(mapImg,-cx,-cz);
 const tx=(truck.x-state.camX)*mapScale,tz=(truck.z-state.camZ)*mapScale;
 if(state.mode==='walk'){mctx.fillStyle='#e8303a';mctx.fillRect(tx-6,tz-6,12,12);}
 for(const v of gis?.data?.vehicles??[]){if(v.unitId==='engine1'||v.unitId==='commander')continue;mctx.fillStyle=v.unitId==='aerial'?'#ffb34e':v.unitId==='ambulance'?'#f5f5f5':'#ff7a7a';const px=(v.x-state.camX)*mapScale,pz=(v.z-state.camZ)*mapScale;mctx.fillRect(px-5,pz-5,10,10);}
 if(state.route?.length>1){mctx.strokeStyle='rgba(255,211,107,.95)';mctx.lineWidth=7;mctx.lineJoin=mctx.lineCap='round';mctx.beginPath();state.route.forEach(([x,z],i)=>{const px=(x-state.camX)*mapScale,pz=(z-state.camZ)*mapScale;i?mctx.lineTo(px,pz):mctx.moveTo(px,pz);});mctx.stroke();}
 if(mission?.site&&mission.phase!=='done'){const px=(mission.site.x-state.camX)*mapScale,pz=(mission.site.z-state.camZ)*mapScale;mctx.fillStyle='#ff3b2f';mctx.strokeStyle='#fff';mctx.lineWidth=3;mctx.beginPath();mctx.arc(px,pz,13,0,Math.PI*2);mctx.fill();mctx.stroke();}
 if(state.waypoint){const px=(state.waypoint.x-state.camX)*mapScale,pz=(state.waypoint.z-state.camZ)*mapScale;mctx.fillStyle='#ffd36b';mctx.strokeStyle='#111';mctx.lineWidth=3;mctx.beginPath();mctx.arc(px,pz,11,0,Math.PI*2);mctx.fill();mctx.stroke();}
 mctx.restore();mctx.save();mctx.translate(s/2,s/2);const facing=(state.mode==='drive'?truck.heading:state.facing)-state.yaw;mctx.rotate(-facing);
 mctx.fillStyle=state.mode==='drive'?'#ff4a4a':'#ffd36b';mctx.strokeStyle='#111';mctx.lineWidth=2;mctx.beginPath();mctx.moveTo(0,-10);mctx.lineTo(7,8);mctx.lineTo(0,4);mctx.lineTo(-7,8);mctx.closePath();mctx.fill();mctx.stroke();mctx.restore();
 mctx.fillStyle='#fff';mctx.font='bold 13px sans-serif';mctx.textAlign='center';const north=state.yaw;mctx.fillText('N',s/2+Math.sin(north)*(s/2-12),s/2-Math.cos(north)*(s/2-12)+5);
}

// 更新
const clock=new T.Timer();let streetTimer=0;
function input(){const k=state.keys;let f=(k.has('w')||k.has('arrowup')?1:0)-(k.has('s')||k.has('arrowdown')?1:0),r=(k.has('d')||k.has('arrowright')?1:0)-(k.has('a')||k.has('arrowleft')?1:0);f+=state.stick[1]+state.pad.move[1];r+=state.stick[0]+state.pad.move[0];if(state.mode==='drive')f+=state.pad.throttle-state.pad.reverse;return [Math.max(-1,Math.min(1,f)),Math.max(-1,Math.min(1,r))];}
function updateWalk(dt){
 const [f,r]=input(),len=Math.hypot(f,r);
 if(len>.05){const speed=(state.keys.has('shift')||state.run||state.pad.held.run?6:2.6)*Math.min(1,len),fx=-Math.sin(state.yaw),fz=-Math.cos(state.yaw),rx=Math.cos(state.yaw),rz=-Math.sin(state.yaw),dx=(fx*f+rx*r)/len,dz=(fz*f+rz*r)/len;
  let p=colliders.resolve(state.x+dx*speed*dt,state.z+dz*speed*dt,.38);
  // 消防車車身也視為障礙（三個圓近似）。
  for(const c of truckCircles()){const ex=p.x-c[0],ez=p.z-c[1],d=Math.hypot(ex,ez);if(d<c[2]+.38&&d>1e-6){p={x:c[0]+ex/d*(c[2]+.38),z:c[1]+ez/d*(c[2]+.38)};}}
  for(const c of gis?.circles()??[]){const ex=p.x-c[0],ez=p.z-c[1],d=Math.hypot(ex,ez);if(d<c[2]+.38&&d>1e-6)p={x:c[0]+ex/d*(c[2]+.38),z:c[1]+ez/d*(c[2]+.38)};}
  for(const c of aerial?.circles()??[]){const ex=p.x-c[0],ez=p.z-c[1],d=Math.hypot(ex,ez);if(d<c[2]+.38&&d>1e-6)p={x:c[0]+ex/d*(c[2]+.38),z:c[1]+ez/d*(c[2]+.38)};}
  for(const c of life.circles()){const ex=p.x-c[0],ez=p.z-c[1],d=Math.hypot(ex,ez);if(d<c[2]+.38&&d>1e-6)p={x:c[0]+ex/d*(c[2]+.38),z:c[1]+ez/d*(c[2]+.38)};}
  state.x=p.x;state.z=p.z;const target=Math.atan2(-dx,-dz);state.facing+=Math.atan2(Math.sin(target-state.facing),Math.cos(target-state.facing))*Math.min(1,dt*12);state.walkT+=dt*speed*2.2;
 }
 const stride=len>.05?Math.sin(state.walkT)*.6:0;person.legs[0].rotation.x=stride;person.legs[1].rotation.x=-stride;person.arms[0].rotation.x=-stride*.8;person.arms[1].rotation.x=stride*.8;
 player.position.set(state.x,ground.at(state.x,state.z)+(len>.05?Math.abs(Math.sin(state.walkT))*.04:0),state.z);player.rotation.y=state.facing;
 $('prompt').hidden=!nearTruck();$('prompt').textContent=matchMedia('(pointer:coarse)').matches?'點「上／下車」駕駛消防車':'按 E 駕駛消防車';
}
function truckCircles(){const f=[-Math.sin(truck.heading),-Math.cos(truck.heading)];return [-2.4,0,2.4].map(o=>[truck.x+f[0]*o,truck.z+f[1]*o,1.45]);}
function updateDrive(dt){
 const [f,r]=input(),brake=state.keys.has(' ')||state.pad.held.brake;
 // 遊戲式操控：極速約 120 km/h，非實車性能。
 if(brake)truck.v*=Math.max(0,1-dt*3.5);else if(f>0)truck.v+=(truck.v<0?14:8.5-truck.v*.12)*f*dt;else if(f<0)truck.v+=(truck.v>0?14:4)*f*dt;else truck.v*=Math.max(0,1-dt*.45);
 truck.v=Math.max(-8,Math.min(33.4,truck.v));if(Math.abs(truck.v)<.05&&!f)truck.v=0;
 truck.steer+=((-r)*.55/(1+Math.abs(truck.v)*.06)-truck.steer)*Math.min(1,dt*5);
 const old={x:truck.x,z:truck.z,h:truck.heading};truck.heading+=truck.v/4.3*Math.tan(truck.steer)*dt;
 truck.x+=-Math.sin(truck.heading)*truck.v*dt;truck.z+=-Math.cos(truck.heading)*truck.v*dt;
 let hit=false;for(const c of truckCircles()){const p=colliders.resolve(c[0],c[1],c[2]);if(p.hit){hit=true;truck.x+=p.x-c[0];truck.z+=p.z-c[1];}}
 if(hit){if(Math.abs(truck.v)>3){rumble(state.padRef,Math.min(1,Math.abs(truck.v)/20+.3),180);truck.v*=-.25;}else truck.v*=.5;for(const c of truckCircles())if(colliders.resolve(c[0],c[1],c[2]).hit){truck.x=old.x;truck.z=old.z;truck.heading=old.h;break;}}
 // NPC 車輛：與消防車重疊時退回原位並減速（NPC 會在前方自動停車）。
 for(const c of truckCircles())if(life.circles().some(o=>Math.hypot(o[0]-c[0],o[1]-c[1])<o[2]+c[2]*.8)){truck.x=old.x;truck.z=old.z;truck.heading=old.h;truck.v*=Math.abs(truck.v)>3?-.2:0;break;}
 // 已配置的雲梯車（含支腿）視為障礙。
  for(const c of truckCircles())if([...(aerial?.circles()??[]),...(gis?.circles()??[])].some(o=>Math.hypot(o[0]-c[0],o[1]-c[1])<o[2]+c[2]*.85)){truck.x=old.x;truck.z=old.z;truck.heading=old.h;truck.v=0;break;}
 truck.rig?.update(truck.v*dt,truck.steer);
 state.x=truck.x;state.z=truck.z;$('kmh').textContent=Math.round(Math.abs(truck.v)*3.6);$('prompt').hidden=true;
}
// 遊戲手把：每幀讀取，動作與鍵盤相同。Start＝暫停選單、Back／View＝地圖、B 關閉選單或地圖。
// 回傳 true 表示本幀已切換暫停／地圖（跳過模擬）。
let padNotice=false;
function pollPad(){
 const pad=pickPad(navigator.getGamepads?.());state.padRef=pad;
 if(!pad){state.pad=readPad(null);state.padPrev=[];return false;}
 const p=readPad(pad,state.padPrev),justB=(p.buttons[BUTTONS.b]??0)>.5&&!((state.padPrev[BUTTONS.b]??0)>.5);state.padPrev=p.buttons;
 if(!padNotice){padNotice=true;audio.unlock();$('prompt').hidden=false;$('prompt').textContent='已偵測到手把：選單「操作說明」有按鍵配置';setTimeout(()=>{if($('prompt').textContent.startsWith('已偵測到手把'))$('prompt').hidden=true;},3500);}
 if(bigmap.open){state.pad=readPad(null);if(justB||p.pressed.includes('map')){closeMap();return true;}return false;}
 if(state.paused){state.pad=readPad(null);if(justB||p.pressed.includes('pause')){setPaused(false);return true;}return false;}
 if(p.pressed.includes('pause')){setPaused(true);return true;}
 if(p.pressed.includes('map')){openMap();return true;}
 state.pad=p;
 for(const a of p.pressed){if(a==='vehicle')toggleVehicle();else if(a==='hose')toggleHose();else if(a==='siren')toggleSiren();else if(a==='mission')startMission();else if(a==='time')cycleTime();else if(a==='aerial')aerialAction();
  else if(a==='zoomIn')state.dist=Math.max(3,state.dist/1.15);else if(a==='zoomOut')state.dist=Math.min(40,state.dist*1.15);else if(a==='resetCam'){state.yaw=state.mode==='drive'?truck.heading:state.facing;state.pitch=.32;}}
 return false;
}
function lookPad(dt){const [x,y]=state.pad.look;if(!x&&!y)return;const k=settings.sens;state.yaw-=x*2.6*k*dt;state.pitch=Math.min(1.25,Math.max(.05,state.pitch+y*1.8*k*dt*(settings.invertY?-1:1)));state.camHold=1.5;}
addEventListener('gamepadconnected',()=>{padNotice=false;});
let lastFrame=0;
function frame(now){
 requestAnimationFrame(frame);
 // 30 FPS 省電：未到間隔就跳過這一幀；暫停時停止模擬與繪製。
 if(settings.fps===30&&now-lastFrame<1000/30-2)return;lastFrame=now;
 if(pollPad()||state.paused||bigmap.open){clock.update();return;}
 clock.update();const dt=Math.min(clock.getDelta(),.05),t=clock.getElapsed();quality.sample(dt);
 lookPad(dt);
 state.mode==='walk'?updateWalk(dt):updateDrive(dt);
 life.update(dt,t,[...(state.mode==='drive'?truckCircles():[[state.x,state.z,.5],...truckCircles()]),...(aerial?.circles()??[]),...(gis?.circles()??[])],{siren:truck.siren?{x:truck.x,z:truck.z}:null});
 updateAerial(dt);
 updateMission(dt,t);
 // 消防車貼地，依前後輪地面高差俯仰。
 const fx=-Math.sin(truck.heading),fz=-Math.cos(truck.heading),yf=ground.at(truck.x+fx*2.3,truck.z+fz*2.3),yr=ground.at(truck.x-fx*2.1,truck.z-fz*2.1);
 truck.root.position.set(truck.x,(yf+yr)/2,truck.z);truck.root.rotation.set(Math.atan2(yf-yr,4.4),truck.heading,0,'YXZ');
 for(const m of truck.beacons){const on=truck.siren&&Math.sin(t*14+(m.id%2)*Math.PI)>0;m.emissiveIntensity=truck.siren?(on?6:.2):1;}
 // 相機
 state.camHold=Math.max(0,(state.camHold||0)-dt);
 if(state.mode==='drive'&&!state.camHold&&Math.abs(truck.v)>.5){const want=truck.heading;state.yaw+=Math.atan2(Math.sin(want-state.yaw),Math.cos(want-state.yaw))*Math.min(1,dt*2.5);}
 const tx=state.x,tz=state.z,ty=ground.at(tx,tz)+(state.mode==='drive'?2.8:1.5);state.camX=tx;state.camZ=tz;
 let d=state.dist+(state.mode==='drive'?Math.abs(truck.v)*.22:0);
 // 相機碰撞：沿視線往外取樣，碰到落地牆面就把相機拉到牆前，避免鏡頭穿進建物。
 for(let s=1.5;s<=d;s+=.6){const x=tx+Math.sin(state.yaw)*Math.cos(state.pitch)*s,z=tz+Math.cos(state.yaw)*Math.cos(state.pitch)*s;if(colliders.resolve(x,z,.3).hit){d=Math.max(1.4,s-.6);break;}}
 const cx=tx+Math.sin(state.yaw)*Math.cos(state.pitch)*d,cz=tz+Math.cos(state.yaw)*Math.cos(state.pitch)*d;
 camera.position.set(cx,Math.max(ty+Math.sin(state.pitch)*d,ground.at(cx,cz)+.6),cz);camera.lookAt(tx,ty,tz);sky.position.copy(camera.position);
 sun.position.set(tx+sunDir.x*250,ground.at(tx,tz)+sunDir.y*250,tz+sunDir.z*250);sun.target.position.set(tx,ground.at(tx,tz),tz);
 updateNavigation(dt);
 {const dTruck=Math.hypot(state.x-truck.x,state.z-truck.z),driving=state.mode==='drive';audio.update({t,siren:truck.siren?(driving?1:1/(1+dTruck/25)):0,speed:truck.v,driving,ambient:state.time==='night'?.6:1});}
 streetTimer-=dt;if(streetTimer<0){streetTimer=.4;$('street').textContent=nearestStreet(streets.features,state.x,state.z)??'信義區（無道路名稱）';}
 drawMinimap();renderer.render(scene,camera);
}
function resize(){renderer.setPixelRatio(quality.pixelRatio());renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();const s=innerWidth<=640?140:220;mini.width=mini.height=s*Math.min(devicePixelRatio,2);}
// ---------- 設定與暫停選單 ----------
// 設定只存在本機瀏覽器（localStorage）；無法存取時仍以預設值運作。
const SETTINGS_KEY='xinyiStreetSettings',DEFAULTS={quality:'auto',fps:60,showFps:false,sens:1,invertY:false,life:{traffic:true,people:true,shops:true,markings:true,trees:true},audio:{muted:false,master:.8,siren:.7,engine:.6,ambient:.5}};
const settings=(()=>{try{const v=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');return {...DEFAULTS,...v,life:{...DEFAULTS.life,...v.life},audio:{...DEFAULTS.audio,...v.audio}};}catch{return structuredClone(DEFAULTS);}})();
const saveSettings=()=>{try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{}};
// 畫質：解析度倍率、陰影、NPC 密度、可視距離。自動模式依裝置起始，實測平均幀率過低時逐級降低。
const QUALITY={low:{label:'低',pr:.75,shadow:0,density:.35,far:.7},medium:{label:'中',pr:1.25,shadow:1024,density:.7,far:.85},high:{label:'高',pr:2,shadow:2048,density:1,far:1}};
const quality={level:'medium',auto:matchMedia('(pointer:coarse)').matches||Math.min(screen.width,screen.height)<700?'low':'medium',frames:0,time:0,
 resolved(){return settings.quality==='auto'?this.auto:settings.quality;},
 pixelRatio(){return Math.min(devicePixelRatio,QUALITY[this.resolved()].pr);},
 apply(){const q=QUALITY[this.level=this.resolved()];renderer.setPixelRatio(this.pixelRatio());renderer.setSize(innerWidth,innerHeight,false);
  sun.castShadow=q.shadow>0;if(q.shadow&&sun.shadow.mapSize.x!==q.shadow){sun.shadow.mapSize.set(q.shadow,q.shadow);sun.shadow.map?.dispose();sun.shadow.map=null;}
  life.setDensity(q.density);camera.far=2500*q.far;camera.updateProjectionMatrix();scene.fog.far=TIME_PRESETS[state.time].fogFar*q.far;
  $('qualityDetail').textContent=`目前：${q.label}（解析度 ${Math.round(this.pixelRatio()*100)}%、陰影${q.shadow?q.shadow+' px':'關閉'}、車流行人 ${Math.round(q.density*100)}%）`+(settings.quality==='auto'?'，自動模式':'');},
 sample(dt){this.frames++;this.time+=dt;if(this.time<4)return;const fps=this.frames/this.time;this.frames=0;this.time=0;$('fps').textContent=Math.round(fps)+' FPS · '+QUALITY[this.level].label;
  const target=settings.fps===30?24:40;if(settings.quality==='auto'&&fps<target&&this.auto!=='low'){this.auto=this.auto==='high'?'medium':'low';this.apply();}}};
function setPaused(on,page){if(on)syncGisLink();state.paused=on;on?audio.suspend():audio.resume();$('menu').hidden=!on;state.keys.clear();state.stick=[0,0];if(on)showPage(page??'settings');}
function showPage(page){for(const b of document.querySelectorAll('.menu-nav [data-page]'))b.classList.toggle('active',b.dataset.page===page);for(const sec of document.querySelectorAll('.menu-body [data-page]'))sec.hidden=sec.dataset.page!==page;}
for(const b of document.querySelectorAll('.menu-nav [data-page]'))b.onclick=()=>showPage(b.dataset.page);
// 暫停選單：以目前位置開啟 GIS 頁；把水箱車（第一車組）與雲梯車位置存回 GIS 部署。
function syncGisLink(){const [lon,lat]=unproject(state.x,state.z),h=Math.round(((-state.yaw*180/Math.PI)%360+360)%360);$('gisLink').href=`taipei-map.html?place=xinyi&lon=${lon.toFixed(6)}&lat=${lat.toFixed(6)}&heading=${h}`;}
$('gisSave').onclick=()=>{if(!geoModels){$('gisSaveNote').textContent='車型清單未載入，無法存回。';return;}
 const ap=aerial&&aerial.state.phase!=='idle'&&aerial.state.frame?{x:aerial.state.frame.x,z:aerial.state.frame.z,heading:aerial.state.frame.heading+Math.PI/2}:null;
 const saved=writeBack(gis?.load(),{engine:{x:truck.x,z:truck.z,heading:truck.heading},aerial:ap},geoModels);
 if(!saved){$('gisSaveNote').textContent='無法存入這台裝置的瀏覽器（可能停用了網站資料）。';return;}
 gisDep=saved;applyGis();$('gisSaveNote').textContent='已存回：第一車組'+(ap?'與雲梯車':'')+'位置。開啟 GIS 頁的部署試用即可看到（同一瀏覽器）。';};
$('resume').onclick=()=>setPaused(false);$('help').onclick=()=>setPaused(!state.paused);
$('menu').addEventListener('pointerdown',e=>{if(e.target===$('menu'))setPaused(false);});
function bindSeg(id,get,set){const seg=$(id),sync=()=>{for(const b of seg.children)b.classList.toggle('on',b.dataset.v===String(get()));};for(const b of seg.children)b.onclick=()=>{set(b.dataset.v);sync();saveSettings();};sync();return sync;}
bindSeg('quality',()=>settings.quality,v=>{settings.quality=v;quality.apply();});
bindSeg('fpsCap',()=>settings.fps,v=>{settings.fps=+v;});
const syncTime=bindSeg('timeSeg',()=>state.time,v=>{applyTime(v);quality.apply();});
$('showFps').checked=settings.showFps;$('fps').hidden=!settings.showFps;$('showFps').onchange=()=>{settings.showFps=$('showFps').checked;$('fps').hidden=!settings.showFps;saveSettings();};
$('sens').value=settings.sens;$('sensValue').textContent=(+settings.sens).toFixed(1)+'×';$('sens').oninput=()=>{settings.sens=+$('sens').value;$('sensValue').textContent=settings.sens.toFixed(1)+'×';saveSettings();};
$('invertY').checked=settings.invertY;$('invertY').onchange=()=>{settings.invertY=$('invertY').checked;saveSettings();};
for(const [id,group] of [['lifeTraffic','traffic'],['lifePeople','people'],['lifeShops','shops'],['lifeMarkings','markings'],['lifeTrees','trees']]){const box=$(id);box.checked=settings.life[group];life.groups[group].visible=box.checked;box.onchange=()=>{life.groups[group].visible=box.checked;settings.life[group]=box.checked;saveSettings();};}
addEventListener('resize',resize);applyTime('afternoon');quality.apply();resize();
addEventListener('blur',()=>{if(bigmap.open)closeMap();if(!state.paused)setPaused(true);});
// 音效設定
$('muted').checked=settings.audio.muted;audio.setMuted(settings.audio.muted);$('muted').onchange=()=>{settings.audio.muted=$('muted').checked;audio.setMuted(settings.audio.muted);saveSettings();};
for(const name of ['master','siren','engine','ambient']){const el=$('vol-'+name),out=$('vol-'+name+'Value'),show=()=>out.textContent=Math.round(settings.audio[name]*100)+'%';el.value=settings.audio[name];show();audio.setVolume(name,settings.audio[name]);el.oninput=()=>{settings.audio[name]=+el.value;audio.setVolume(name,+el.value);show();saveSettings();};}
addEventListener('pointerdown',()=>audio.unlock());
$('loading').hidden=true;
// 測試用：以固定時間步推進模擬（不渲染）。
window.__xinyiStreet={gis,get gisDep(){return gisDep;},syncGisLink,get aerial(){return aerial;},aerialAction,setAerialMode,get aerialPreview(){return aerialPreview;},fireFx,scene,camera,get mission(){return mission;},startMission,toggleHose,state,truck,colliders,ground,life,applyTime,quality,settings,setPaused,bigmap,openMap,closeMap,setWaypoint,audio,routeGraphs,pollPad,tick(dt,n=1){for(let i=0;i<n;i++){state.mode==='walk'?updateWalk(dt):updateDrive(dt);updateAerial(dt);updateMission(dt,i*dt);}}};
requestAnimationFrame(frame);
