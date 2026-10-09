// 信義街景漫遊：與 GIS 頁（taipei-map.html?place=xinyi 預設狀態）共用同一套建物、街道與設施建構函式，
// 只把經緯度轉成本地公尺並改以 Three.js 呈現。外觀為示意；未使用 taipei-gta 的地圖、程式或素材。
import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {createActionScene} from './action-scene.js';
import {rigWheels} from './wheel-rig.js?v=s12';
import {createStreetLife,TIME_PRESETS,createSky,litWindows} from './xinyi-street-life.js?v=s12';
import {buildRouteGraph,findRoute,roadLabels} from './xinyi-street-nav.js?v=s12';
import {createBigMap} from './xinyi-street-map.js?v=s12';
import {createAudio} from './xinyi-street-audio.js?v=s12';
import {AERIAL,buildFacadeIndex,createXinyiAerial} from './xinyi-aerial.js?v=s12';
import {RULES,pickFireSite,pickRescueSite,jointCandidates,driveRoads,stagingPoses,evaluateParking,sprayHits,createFireFX} from './xinyi-street-mission.js?v=s12';
import {PAD,createGamepad} from './xinyi-street-pad.js?v=s12';
import {buildDistrictBatch} from './geo-district.js';
import {focusedBuilding,buildXinyiDetail,createDetailMaterials,inFocus} from './geo-xinyi-detail.js?v=70';
import {buildStreetDetail,createStreetMaterials} from './geo-street-detail.js';
import {buildZebraCrossings} from './geo-street-fixtures.js';
import {project,buildHeightField,toLocal,linearColors,buildColliders,buildStreetBase,nearestStreet,spawnPoint} from './xinyi-street-world.js?v=s12';

const $=id=>document.getElementById(id),step=t=>{$('loadStep').textContent=t;};
// 手機（觸控）：版面另套 body.touch，提示文字的鍵盤按鍵改成畫面按鈕名稱。
const TOUCH=matchMedia('(pointer:coarse)').matches;document.body.classList.toggle('touch',TOUCH);
const KEY_BTN={E:'上／下車',Q:'警示燈',F:'水線',O:'支腿',L:'升梯',T:'任務'};
const tt=text=>!TOUCH||!text?text:text.replace(/按住 Space ?/g,'按住「出水」').replace(/・Space /g,'・按住「出水」').replace(/按 ([EQFOLT])(?![A-Za-z]) ?/g,(m,k)=>`點「${KEY_BTN[k]}」`).replace(/（Space）/g,'（「出水」）').replace(/(^|[^A-Za-z「 ]) ?([OL]) (?=[一-鿿])/g,(m,p,k)=>`${p}點「${KEY_BTN[k]}」`).replace(/「(支腿|升梯|出水)」\1/g,'「$1」');
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
const spawn=spawnPoint(streets.features),player=new T.Group(),person=createActionScene(new T.Scene()).createPerson(player,'中隊長');
person.body.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(player);
// 消防車隊：既有 GIS 車型（水箱車、雲梯車），紅色警示燈保持紅色；車型檔未修改。
const facade=buildFacadeIndex(district.buildings);
async function makeVehicle(file,o){
 const v={root:new T.Group(),model:null,x:0,z:0,heading:0,v:0,steer:0,beacons:[],siren:false,...o};
 const gltf=await new GLTFLoader().loadAsync(file);v.model=gltf.scene;v.model.rotation.y=-Math.PI/2;v.root.add(v.model);
 v.model.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;const mat=m.material;if(/beacon|warning|LED strip|red.*lens|emergency.*lens|red.*flasher/i.test(mat?.name||'')){m.material=mat.clone();v.beacons.push(m.material);}}});
 scene.add(v.root);
 const head=new T.SpotLight('#fff4dc',0,60,.45,.5,1.2);head.position.set(0,1.3,o.headZ);head.target.position.set(0,0,o.headZ-16);v.root.add(head,head.target);v.headlight=head;
 return v;
}
const pumper=await makeVehicle('assets/geo-fire-engine.glb',{kind:'pumper',label:'水箱車',offsets:[-2.4,0,2.4],radius:1.45,wheelbase:4.3,headZ:-3.6});
// 方案 A：載入時把車輪零件重組到輪軸中心（不修改車型檔），靜止外觀與原車型相同。
pumper.rig=rigWheels(pumper.model);
const ladder=await makeVehicle('assets/geo-aerial-ladder.glb',{kind:'aerial',label:'雲梯車',offsets:[-3.7,-1.25,1.25,3.7],radius:1.45,wheelbase:5.6,headZ:-5.1});
ladder.aerial=createXinyiAerial(ladder.model,{facade,groundAt:(x,z)=>ground.at(x,z),colliders,blockers:()=>life.circles()});
const fleet=[pumper,ladder];let truck=pumper;
// 街道生活層（示意）：排除已有照片／樣板研究的量體（微風南山、ATT 相鄰外牆、第一批信義建物候選）。
step('建立車流、行人與店面');
const exclude=new Set([357399,265936,266115,266138]);(function collect(o){if(Array.isArray(o))o.forEach(collect);else if(o&&typeof o==='object')for(const [k,v] of Object.entries(o)){if(k==='officialVolumeCandidates'&&Array.isArray(v))v.forEach(id=>exclude.add(+id));else collect(v);}})(firstBatch);
const life=createStreetLife(scene,{features:streets.features,buildings:district.buildings,ground,colliders,fixtures,exclude,spawn});
const sky=createSky();scene.add(sky);
const audio=createAudio();
// 導航：步行用全部路徑、駕駛只用車道並遵守單行道。重點建物取第一批信義建物清單（OSM 名稱；量體對應仍為候選）。
const routeGraphs={walk:buildRouteGraph(streets.features),drive:buildRouteGraph(streets.features,{vehicle:true})};
const pois=(firstBatch.sites??[]).filter(s=>s.name&&s.polygon?.length).map(s=>{const pts=s.polygon.map(p=>project(p[0],p[1]));return {name:s.name,x:pts.reduce((a,p)=>a+p[0],0)/pts.length,z:pts.reduce((a,p)=>a+p[1],0)/pts.length};});
const state={padMove:[0,0],padThrottle:0,mode:'walk',yaw:spawn.heading,pitch:.32,dist:7,x:spawn.x,z:spawn.z,facing:spawn.heading,time:'afternoon',paused:false,keys:new Set(),stick:[0,0],run:false,walkT:0};
function placeTruck(){const f=[-Math.sin(spawn.heading),-Math.cos(spawn.heading)],r=[Math.cos(spawn.heading),-Math.sin(spawn.heading)];[[pumper,14],[ladder,30]].forEach(([v,d])=>{v.x=spawn.x+f[0]*d+r[0]*1.5;v.z=spawn.z+f[1]*d+r[1]*1.5;v.heading=spawn.heading;v.v=0;v.siren=false;v.auto=null;});truck=pumper;}
function resetAll(){ladder.aerial.reset();if(mission?.hose){mission.hose=false;person.nozzle.visible=false;}state.mode='walk';state.x=spawn.x;state.z=spawn.z;state.facing=spawn.heading;state.yaw=spawn.heading;placeTruck();player.visible=true;syncUi();}
placeTruck();

// 輸入
addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;const k=e.key.toLowerCase();audio.unlock();if(bigmap.open){if(k==='m'||k==='escape')closeMap();return;}if(k==='m'&&!state.paused){openMap();return;}if((k==='escape'||k==='p')&&!pickerOpen()){setPaused(!state.paused);e.preventDefault();return;}if(k==='h'){setPaused(true,'controls');return;}if(pickerOpen()){const i='1234'.indexOf(k);if(i>=0)pickButtons[i].click();else if(k==='escape'||k==='t')closePicker();else if(k==='arrowdown'||k==='arrowup'){pickIdx=(pickIdx+(k==='arrowdown'?1:pickButtons.length-1))%pickButtons.length;syncPick();}else if(k==='enter')pickButtons[pickIdx].click();e.preventDefault();return;}if(state.paused)return;state.keys.add(k);if(k==='e')toggleVehicle();if(k==='t')openPicker();if(k==='o')aerialJacks();if(k==='l')aerialLadder();if(k==='f')toggleHose();if(k==='q')toggleSiren();if(k==='n')cycleTime();if(k==='r')resetAll();if([' ','arrowup','arrowdown'].includes(k))e.preventDefault();});
addEventListener('keyup',e=>state.keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>state.keys.clear());
let drag=null;
// 觸控：單指拖曳轉視角（搖桿是獨立元件，不會被當成拖曳）；雙指捏合縮放。
const touches=new Map();let pinch=null;
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){touches.set(e.pointerId,[e.clientX,e.clientY]);if(touches.size===2){const [a,b]=[...touches.values()];pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1]),dist:state.dist};drag=null;return;}}drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!touches.has(e.pointerId))return;touches.set(e.pointerId,[e.clientX,e.clientY]);if(pinch&&touches.size===2){const [a,b]=[...touches.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);state.dist=Math.min(40,Math.max(3,pinch.dist*pinch.d/Math.max(20,d)));}});
for(const ev of ['pointerup','pointercancel'])canvas.addEventListener(ev,e=>{touches.delete(e.pointerId);if(touches.size<2)pinch=null;});
canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const k=settings.sens;state.yaw-=(e.clientX-drag.x)*.006*k;state.pitch=Math.min(1.25,Math.max(.05,state.pitch+(e.clientY-drag.y)*.004*k*(settings.invertY?-1:1)));drag.x=e.clientX;drag.y=e.clientY;state.camHold=1.5;});
canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{state.dist=Math.min(40,Math.max(3,state.dist*(1+Math.sign(e.deltaY)*.1)));e.preventDefault();},{passive:false});
{const stick=$('stick'),knob=stick.querySelector('i');let id=null;
 const move=e=>{const r=stick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,l=Math.min(1,Math.hypot(dx,dy)/(r.width/2))/(Math.hypot(dx,dy)||1);state.stick=[dx*l,-dy*l];knob.style.transform=`translate(${dx*l*r.width/2}px,${dy*l*r.width/2}px)`;};
 stick.addEventListener('pointerdown',e=>{id=e.pointerId;stick.setPointerCapture(id);move(e);});stick.addEventListener('pointermove',e=>{if(e.pointerId===id)move(e);});
 const end=()=>{id=null;state.stick=[0,0];knob.style.transform='';};stick.addEventListener('pointerup',end);stick.addEventListener('pointercancel',end);
 $('tRun').addEventListener('pointerdown',()=>{state.run=!state.run;$('tRun').classList.toggle('on',state.run);});$('tEnter').addEventListener('click',()=>toggleVehicle());$('tSiren').addEventListener('click',()=>toggleSiren());
 $('tBrake').addEventListener('pointerdown',()=>{state.touchBrake=true;});for(const ev of ['pointerup','pointercancel','pointerleave'])$('tBrake').addEventListener(ev,()=>{state.touchBrake=false;});
 $('mission').addEventListener('click',e=>{if(TOUCH&&e.target.id!=='missionAbort')$('mission').classList.toggle('open');});
}
$('enter').onclick=()=>toggleVehicle();$('siren').onclick=()=>toggleSiren();$('night').onclick=()=>cycleTime();$('reset').onclick=()=>resetAll();

function nearestVehicle(max=6.5){let best=null,bd=max;for(const v of fleet){const d=Math.min(...vehicleCircles(v).map(([x,z,r])=>Math.hypot(state.x-x,state.z-z)-r))+1.45;if(d<bd){bd=d;best=v;}}return best;}
function nearTruck(){return !!nearestVehicle();}
function toggleVehicle(){
 if(state.mode==='walk'){const v=nearestVehicle();if(!v)return;if(mission?.hose){flashHint('請先按 F 收回水線再上車');return;}if(v.aerial?.busy){flashHint('雲梯車支腿／梯架作業中，需先收梯並收回支腿才能駕駛');return;}if(v.auto){flashHint(v.label+'自動前往中');return;}truck=v;state.mode='drive';player.visible=false;state.dist=Math.max(state.dist,portrait()?17:13);}
 else{if(Math.abs(truck.v)>1.5)return;state.mode='walk';const r=[Math.cos(truck.heading),-Math.sin(truck.heading)];const p=colliders.resolve(truck.x-r[0]*2.6,truck.z-r[1]*2.6,.4);state.x=p.x;state.z=p.z;state.facing=truck.heading;player.visible=true;state.dist=portrait()?9:7;}
 syncUi();
}
function toggleSiren(){if(state.mode!=='drive')return;truck.siren=!truck.siren;syncUi();}
function cycleTime(){const order=Object.keys(TIME_PRESETS);applyTime(order[(order.indexOf(state.time)+1)%order.length]);quality.apply();syncTime();}
function applyTime(name){
 state.time=name;const p=TIME_PRESETS[name],az=p.az*Math.PI/180,el=p.el*Math.PI/180;
 sunDir.set(Math.sin(az)*Math.cos(el),Math.sin(el),-Math.cos(az)*Math.cos(el));
 sky.material.uniforms.top.value.set(p.top);sky.material.uniforms.horizon.value.set(p.horizon);scene.fog.color.set(p.horizon);scene.fog.near=p.fogNear;scene.fog.far=p.fogFar;
 hemi.intensity=p.hemiI;hemi.color.set(p.hemiSky);hemi.groundColor.set(p.hemiGround);sun.intensity=p.sunI;sun.color.set(p.sun);
 for(const m of lampHeads)m.emissiveIntensity=p.lights*2;glow.visible=p.lights>0;for(const v of fleet)v.headlight.intensity=p.lights*60;
 detailMats.glass.emissiveIntensity=p.windows*.9;farMat.emissiveIntensity=p.windows*1.2;life.setLights(p.lights);syncUi();
}
function syncUi(){
 $('enter').textContent=state.mode==='drive'?'下車':'上車';$('siren').hidden=state.mode!=='drive';$('siren').classList.toggle('on',truck.siren);$('night').textContent='時段：'+TIME_PRESETS[state.time].label;
 $('speed').hidden=state.mode!=='drive';
 const d=state.mode==='drive';$('tRun').hidden=d;$('tBrake').hidden=$('tSiren').hidden=!d;$('tSiren').classList.toggle('on',truck.siren);$('tEnter').textContent=d?'下車':'上車';
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
 getView:()=>({x:state.x,z:state.z,facing:state.mode==='drive'?truck.heading:state.facing,driving:state.mode==='drive',truck,fleet,waypoint:state.waypoint,route:state.route,fire:mission?.fire&&mission.done.out===undefined?mission.fire:null,rescue:mission?.rescue&&mission.victim==='trapped'?mission.rescue:null}),
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
// ---------- 任務模式（訓練示意）：建物火警／受困救援（雲梯車）／協同出勤（起火面＋另一面受困） ----------
const fireFx=createFireFX(scene);let mission=null;
const roads=driveRoads(streets.features),AERIAL_RANGE=[AERIAL.parkMin,AERIAL.parkMax],LADDER_HALF=5.1;
const MISSION_TITLE={fire:'建物火警',rescue:'受困救援（雲梯車）',joint:'協同出勤：起火＋另一面受困'};
const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
function flashHint(text){$('missionHint').textContent=tt(text);}
// 受困民眾（示意人形）：在窗口揮手，救出後隨籃架移動。
const victim=(()=>{const g=new T.Group(),m=c=>new T.MeshStandardMaterial({color:c,roughness:.7}),part=(geo,c,y)=>{const o=new T.Mesh(geo,m(c));o.position.y=y;o.castShadow=true;g.add(o);return o;};
 part(new T.CapsuleGeometry(.2,.5,4,10),'#3d7bd9',1.0);part(new T.SphereGeometry(.15,12,10),'#e0b48f',1.55);part(new T.CapsuleGeometry(.16,.5,4,8),'#2d3140',.45);
 const arms=[-1,1].map(s=>{const p=new T.Group();p.position.set(s*.27,1.3,0);const a=new T.Mesh(new T.CapsuleGeometry(.06,.45,4,8),m('#3d7bd9'));a.position.y=.25;a.castShadow=true;p.add(a);g.add(p);return p;});
 const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.fillStyle='#2f7bff';x.beginPath();x.arc(32,32,30,0,7);x.fill();x.fillStyle='#fff';x.font='700 36px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('困',32,34);
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const tag=new T.Sprite(new T.SpriteMaterial({map:tex}));tag.scale.set(1.1,1.1,1);tag.position.y=2.5;g.add(tag);
 g.visible=false;scene.add(g);return {root:g,arms,tag};})();
const vehicleNear=(v,site)=>Math.hypot(v.x-site.x,v.z-site.z)<RULES.arriveRadius;
const driving=v=>state.mode==='drive'&&truck===v;
function parkCheck(v,site,kind){return evaluateParking(v,site,colliders,{speed:v.v,range:kind==='aerial'?AERIAL_RANGE:[RULES.parkMin,RULES.parkMax],half:kind==='aerial'?LADDER_HALF:3.7,roads,lights:v.siren});}
function parkedOk(v,site,kind){if(v.auto||driving(v))return false;const e=parkCheck(v,site,kind);if(e.ok)mission.parkDist[kind]=e.dist;return e.ok;}
const aerialPhase=()=>ladder.aerial.state.phase,rescueTarget=()=>{const t=mission.rescue.target;return new T.Vector3(t.x,t.y,t.z);};
function makeSteps(type){
 const m=mission,F=[],R=[];
 if(m.fire)F.push(
  {id:'arriveF',label:'水箱車抵達火場',need:['depart'],test:()=>vehicleNear(pumper,m.fire)},
  {id:'parkF',label:'水箱車於起火面外側 8–30 m 順向停妥（警示燈保持開啟）',need:['arriveF'],test:()=>parkedOk(pumper,m.fire,'pumper')},
  {id:'hose',label:'在水箱車旁按 F 佈設水線',need:['parkF'],test:()=>m.hose},
  {id:'water',label:type==='joint'?'水線（Space）或雲梯籃架水砲出水':'按住 Space 對準火點出水',need:[type==='joint'?'parkF':'hose'],test:()=>m.times.water!==undefined},
  {id:'out',label:'火勢控制',need:['water'],test:()=>m.intensity<=0,then:()=>fireFx.setSite(null)});
 if(m.rescue)R.push(
  {id:'arriveL',label:`雲梯車抵達受困面（${m.rescue.street||'未命名道路'}側）`,need:['depart'],test:()=>vehicleNear(ladder,m.rescue)},
  {id:'parkL',label:'雲梯車於受困面外側 6–16 m 順向停妥（警示燈保持開啟）',need:['arriveL'],test:()=>parkedOk(ladder,m.rescue,'aerial')},
  {id:'jacks',label:'在雲梯車旁按 O 展開支腿並落地',need:['parkL'],test:()=>['down','raising','raised','lowering'].includes(aerialPhase())},
  {id:'reach',label:'按 L 升梯，籃架到受困窗口',need:['jacks'],test:()=>aerialPhase()==='raised'&&ladder.aerial.basket().distanceTo(rescueTarget())<1},
  {id:'aboard',label:'受困者進入籃架',need:['reach'],test:()=>m.victim!=='trapped'},
  {id:'down',label:'按 L 收梯，降回地面',need:['aboard'],test:()=>m.victim==='safe'},
  {id:'stow',label:'按 O 收回支腿',need:['down'],test:()=>aerialPhase()==='stowed'});
 const depart=type==='fire'?{id:'depart',label:'上水箱車並開警示燈前往',test:()=>driving(pumper)}
  :type==='rescue'?{id:'depart',label:'上雲梯車並開警示燈前往',test:()=>driving(ladder)}
  :{id:'depart',label:'駕駛任一車出勤，另一車自動前往（示意）',test:()=>driving(pumper)||driving(ladder),then:dispatchPartner};
 return [depart,...F,...R];
}
// 協同出勤：玩家駕駛其中一車，另一車依駕駛路網自動前往預先核對過的到場位置（順向、距離與車身皆符合）。
function dispatchPartner(){const m=mission,other=truck===pumper?ladder:pumper,pose=other===ladder?m.rescue.pose:m.firePose;
 setWaypoint(...(truck===pumper?[m.fire.x+m.fire.nx*16,m.fire.z+m.fire.nz*16,'火警現場']:[m.rescue.x+m.rescue.nx*12,m.rescue.z+m.rescue.nz*12,'受困面']));
 if(pose&&!other.aerial?.busy){dispatchAuto(other,pose);flashHint(`${other.label}已自動出勤，前往${other===ladder?'受困面':'起火面'}（示意）`);}else flashHint(`${other.label}無法自動出勤，請自行調度`);}
function dispatchAuto(v,pose){const r=findRoute(routeGraphs.drive,v.x,v.z,pose.x,pose.z),f=[-Math.sin(pose.heading),-Math.cos(pose.heading)],pts=(r?.points??[[v.x,v.z],[pose.x,pose.z]]).slice(1,-1);
 pts.push([pose.x-f[0]*12,pose.z-f[1]*12],[pose.x,pose.z]);v.auto={pts,i:0,pose,stuck:0};v.siren=true;}
function updateAutoDrive(dt){
 for(const v of fleet){const a=v.auto;if(!a)continue;const [px,pz]=a.pts[a.i],dx=px-v.x,dz=pz-v.z,d=Math.hypot(dx,dz),last=a.i===a.pts.length-1;
  if(d<(last?.6:4)||(last&&a.stuck>12)){if(last){Object.assign(v,{x:a.pose.x,z:a.pose.z,heading:a.pose.heading,v:0,steer:0,auto:null});continue;}a.i++;continue;}
  const want=Math.atan2(-dx,-dz),diff=Math.atan2(Math.sin(want-v.heading),Math.cos(want-v.heading)),fx=-Math.sin(v.heading),fz=-Math.cos(v.heading);
  // 前方有 NPC、其他消防車或人員時停等（自動駕駛只沿路網中心前進，未做完整避障，示意）。
  const blocked=[...life.circles(),...fleetCircles(v),...(state.mode==='walk'?[[state.x,state.z,.5]]:[])].some(([x,z,r])=>{const ex=x-v.x,ez=z-v.z,ahead=ex*fx+ez*fz;return ahead>0&&ahead<v.offsets[v.offsets.length-1]+6&&Math.abs(ex*fz-ez*fx)<r+1.7;});
  const tv=blocked?0:Math.min(9,last?1+d*.5:9)*(Math.abs(diff)>.9?.35:1);v.v+=(tv-v.v)*Math.min(1,dt*(tv<v.v?3:1.2));a.stuck=v.v<.3?a.stuck+dt:0;
  const turn=Math.max(-1.1,Math.min(1.1,diff*2.2))*Math.min(1,v.v/2.5+.15);v.heading+=turn*dt;v.steer=Math.max(-.55,Math.min(.55,diff));
  v.x+=-Math.sin(v.heading)*v.v*dt;v.z+=-Math.cos(v.heading)*v.v*dt;v.rig?.update(v.v*dt,v.steer);}
}
// 雲梯可行性：把雲梯車暫置於候選車位，檢查支腿與升梯（含掃掠路徑）能否到 target；不改變雲梯狀態。
function aerialFeasible(pose,target){
 const r=ladder.root,save=[r.position.clone(),r.rotation.clone()];r.position.set(pose.x,ground.at(pose.x,pose.z),pose.z);r.rotation.set(0,pose.heading,0);r.updateMatrixWorld(true);
 const ok=ladder.aerial.check(new T.Vector3(target.x,target.y,target.z)).ok;r.position.copy(save[0]);r.rotation.copy(save[1]);r.updateMatrixWorld(true);return ok;}
function findRescue(opts){for(let i=0;i<8;i++){const s=pickRescueSite(district.buildings,streets.features,ground,Math.random,{exclude,colliders,...opts});if(!s)return null;
 for(const pose of stagingPoses(s,roads,colliders,{range:AERIAL_RANGE,half:LADDER_HALF,prefer:9}).slice(0,3))if(aerialFeasible(pose,s.target))return {...s,pose};}return null;}
// 任務選擇
const pickButtons=[...document.querySelectorAll('#missionPick [data-type]')];let pickIdx=0;
const pickerOpen=()=>!$('missionPick').hidden;
function syncPick(){pickButtons.forEach((b,i)=>b.classList.toggle('focus',i===pickIdx));}
function openPicker(){if(mission&&!mission.finished&&!confirm('目前任務尚未完成，要改派新任務嗎？'))return;state.keys.clear();$('missionPick').hidden=false;pickIdx=0;syncPick();}
function closePicker(){$('missionPick').hidden=true;}
pickButtons.forEach((b,i)=>{b.onclick=()=>startMission(b.dataset.type);b.onpointerenter=()=>{pickIdx=i;syncPick();};});$('pickCancel').onclick=closePicker;
async function startMission(type='fire'){
 closePicker();if(type==='random')type=['fire','rescue','joint'][Math.floor(Math.random()*3)];
 if(type!=='fire'&&ladder.aerial.busy){flashHint('雲梯車支腿／梯架未收回，請先收回再接救援任務');$('mission').hidden=false;return;}
 endMission();$('mission').hidden=false;$('missionTitle').textContent='派遣中…';$('missionWhere').textContent='核對建物立面與雲梯作業空間';$('missionSteps').innerHTML='';flashHint('');
 await new Promise(r=>setTimeout(r,30));
 let fire=null,rescue=null,firePose=null;
 if(type==='fire')fire=pickFireSite(district.buildings,streets.features,ground,Math.random,{exclude,colliders});
 else if(type==='rescue')rescue=findRescue({});
 else{const ids=jointCandidates(district.buildings,streets.features,{exclude,colliders}).sort(()=>Math.random()-.5);
  for(const id of ids){fire=pickFireSite(district.buildings,streets.features,ground,Math.random,{exclude,colliders,building:id});if(!fire)continue;firePose=stagingPoses(fire,roads,colliders,{prefer:14})[0];if(!firePose)continue;rescue=findRescue({building:id,awayFrom:fire});if(rescue)break;}
  if(!rescue){fire=null;firePose=null;}}
 if(!fire&&!rescue){$('missionTitle').textContent='派遣失敗';flashHint('找不到符合條件的派遣地點，請再試一次');return;}
 mission={type,fire,rescue,firePose,elapsed:0,times:{},intensity:fire?.55:0,hose:false,spraying:false,parkDist:{},victim:rescue?'trapped':null,transfer:0,done:{},finished:false};
 mission.steps=makeSteps(type);fireFx.setSite(fire);
 if(rescue){victim.root.visible=true;victim.tag.visible=true;victim.root.position.set(rescue.x+rescue.nx*.35,rescue.slab,rescue.z+rescue.nz*.35);victim.root.rotation.y=Math.atan2(rescue.nx,rescue.nz);}
 const where=s=>`${s.street||'未命名道路'}側`;
 $('missionTitle').textContent=MISSION_TITLE[type];
 $('missionWhere').textContent=type==='fire'?`${where(fire)}・${fire.floor} 樓冒煙（示意）`:type==='rescue'?`${where(rescue)}・${rescue.floor} 樓窗口有民眾受困（示意）`:`${where(fire)} ${fire.floor} 樓起火；受困者在另一面 ${where(rescue)} ${rescue.floor} 樓（示意）`;
 const goal=fire??rescue;setWaypoint(goal.x+goal.nx*14,goal.z+goal.nz*14,fire?'火警現場':'受困面');
 renderMission();flashHint(type==='joint'?'起火面與受困面不同側：駕駛水箱車或雲梯車出勤，另一車會自動前往':state.mode==='drive'?'按 Q 開警示燈，依地圖黃線前往':`先走到${fire?'水箱車':'雲梯車'}按 E 上車`);
}
function endMission(){mission=null;fireFx.setSite(null);$('mission').hidden=true;$('missionReport').hidden=true;clearWaypoint();person.nozzle.visible=false;victim.root.visible=false;$('tSpray').hidden=$('tHose').hidden=true;}
function renderMission(){if(!mission)return;const m=mission;
 $('missionSteps').innerHTML=m.steps.map(s=>{const done=m.done[s.id]!==undefined,ready=!(s.need??[]).some(n=>m.done[n]===undefined);return `<li class="${done?'done':ready?'now':''}">${tt(s.label)}</li>`;}).join('');
 $('fireBar').hidden=!m.fire;$('fireLevel').style.width=Math.round(Math.max(0,m.intensity)*100)+'%';}
function nearVehicle(v,max=6.5){return Math.min(...vehicleCircles(v).map(([x,z,r])=>Math.hypot(state.x-x,state.z-z)-r))+1.45<max;}
function toggleHose(){
 if(!mission?.fire||state.mode!=='walk')return;
 if(mission.hose){if(Math.hypot(state.x-pumper.x,state.z-pumper.z)>8){flashHint('回到水箱車旁才能收回水線');return;}mission.hose=false;person.nozzle.visible=false;flashHint('已收回水線');return;}
 if(mission.done.parkF===undefined){flashHint('請先依步驟停妥水箱車');return;}
 if(!nearVehicle(pumper)){flashHint('走到水箱車旁按 F 佈設水線');return;}
 mission.hose=true;person.nozzle.visible=true;flashHint('面向火點，按住 Space 出水（水線長 '+RULES.hoseLength+' m）');renderMission();
}
// ---------- 雲梯車操作：O 支腿展開／收回，L 升梯／收梯（順序與避碰由 xinyi-aerial.js 把關） ----------
const nearLadder=()=>state.mode==='walk'&&Math.hypot(state.x-ladder.x,state.z-ladder.z)<9;
function aerialJacks(){
 if(!nearLadder()){flashHint('走到雲梯車旁按 O 操作支腿');return;}
 const a=ladder.aerial,ph=a.state.phase;
 if(ph==='stowed'){if(Math.abs(ladder.v)>.1||ladder.auto){flashHint('雲梯車尚未停妥');return;}const r=a.deploy();flashHint(r.ok?'支腿展開中（約 4 秒），隨後腳座落地（約 3 秒）':'無法展開支腿：'+r.reason);}
 else if(ph==='down'){const r=a.retract();flashHint(r.ok?'支腿收回中':'無法收回：'+r.reason);}
 else flashHint(['raised','raising','lowering'].includes(ph)?'梯架未收回，需先按 L 收梯':'支腿動作中，請稍候');
}
function aerialTarget(){
 const m=mission;
 if(m?.rescue&&m.victim==='trapped')return {v:rescueTarget(),label:'受困窗口'};
 if(m?.fire&&m.done.out===undefined){const f=m.fire;return {v:new T.Vector3(f.x+f.nx*3.5,f.y-2.2,f.z+f.nz*3.5),label:'起火樓層外側（籃架水砲射水位置）'};}
 // 無任務目標：最近立面約 3 樓高（練習）。
 const g=ground.at(ladder.x,ladder.z)+7;let best=null,bd=30;
 for(const [ax,az,bx,bz,y0,y1] of facade.walls){if(g<y0||g>y1)continue;const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((ladder.x-ax)*dx+(ladder.z-az)*dz)/(dx*dx+dz*dz))),px=ax+dx*t,pz=az+dz*t,d=Math.hypot(ladder.x-px,ladder.z-pz);if(d<bd&&d>.5){bd=d;best={px,pz,nx:(ladder.x-px)/d,nz:(ladder.z-pz)/d};}}
 return best&&{v:new T.Vector3(best.px+best.nx*2.5,g,best.pz+best.nz*2.5),label:'最近立面約 3 樓高（練習）'};
}
function aerialLadder(){
 if(!nearLadder()){flashHint('走到雲梯車旁按 L 操作梯架');return;}
 const a=ladder.aerial,ph=a.state.phase;
 if(ph==='down'){const tg=aerialTarget();if(!tg){flashHint('附近 30 m 內沒有可作業的立面目標');return;}const r=a.raiseTo(tg.v);a.state.reason='';flashHint(r.ok?`升梯中：先升起、再迴轉、對準後伸梯 → ${tg.label}`:'無法升梯：'+r.reason);}
 else if(ph==='raised'){if(mission?.victim==='trapped'&&mission.done.reach!==undefined){flashHint('受困者正在進入籃架，請稍候');return;}const r=a.lower();flashHint(r.ok?'收梯中：縮梯、迴轉、降回':'無法收梯：'+r.reason);}
 else flashHint(ph==='stowed'?'需先按 O 展開支腿並落地才能升梯':'雲梯動作中，請稍候');
}
function updateMission(dt,t){
 {const r=ladder.aerial.state.reason;if(r&&r!==state.aerialReason)flashHint('梯架停止：'+r);state.aerialReason=r;}
 if(!mission){fireFx.update(dt,0);return;}
 const m=mission,fire=m.fire,fireLive=!!fire&&m.done.out===undefined;
 if(!m.finished){m.elapsed+=dt;$('missionClock').textContent=fmt(m.elapsed);}
 if(fireLive&&!m.spraying)m.intensity=Math.min(1,m.intensity+RULES.growth*dt);
 let changed=false;
 for(const s of m.steps){if(m.done[s.id]!==undefined||(s.need??[]).some(n=>m.done[n]===undefined)||!s.test())continue;m.done[s.id]=m.elapsed;changed=true;s.then?.();
  const next=m.steps.find(x=>m.done[x.id]===undefined&&!(x.need??[]).some(n=>m.done[n]===undefined));if(s.id!=='depart')flashHint('✓ '+s.label+(next?'　→ '+next.label:''));}
 // 停車建議：相關車輛在現場附近且已停下時，列出未符合項目。
 if(Math.floor(t*4)!==Math.floor((t-dt)*4))for(const [id,v,site,kind] of [['parkF',pumper,fire,'pumper'],['parkL',ladder,m.rescue,'aerial']]){
  if(!site||m.done[id]!==undefined||v.auto||!vehicleNear(v,site)||Math.abs(v.v)>.4||!(state.mode==='walk'||truck===v))continue;const e=parkCheck(v,site,kind);
  flashHint(e.ok?(driving(v)?'位置符合，按 E 下車':'位置符合'):`${v.label}停車需調整：`+e.issues.join('、'));}
 // 受困者：揮手 → 跨入籃架（約 2.5 秒）→ 隨籃架降下 → 落地後移到雲梯車旁。
 if(m.victim==='trapped'){victim.arms.forEach((a,i)=>a.rotation.z=(i?-1:1)*(2.5+Math.sin(t*7+i)*.45));
  if(m.done.reach!==undefined){m.transfer+=dt;const from=new T.Vector3(m.rescue.x+m.rescue.nx*.35,m.rescue.slab,m.rescue.z+m.rescue.nz*.35);victim.root.position.lerpVectors(from,ladder.aerial.basket(),Math.min(1,m.transfer/2.5));if(m.transfer>=2.5){m.victim='aboard';victim.tag.visible=false;flashHint('受困者已進入籃架，按 L 收梯');}}}
 else if(m.victim==='aboard'){victim.arms.forEach(a=>a.rotation.z=0);victim.root.position.copy(ladder.aerial.basket());
  if(aerialPhase()==='down'){m.victim='safe';const rx=Math.cos(ladder.heading),rz=-Math.sin(ladder.heading),p=colliders.resolve(ladder.x+rx*3.2,ladder.z+rz*3.2,.4);victim.root.position.set(p.x,ground.at(p.x,p.z),p.z);}}
 // 水線長度限制：人員不可超過水線長度。
 if(m.hose){const dx=state.x-pumper.x,dz=state.z-pumper.z,d=Math.hypot(dx,dz);if(d>RULES.hoseLength){state.x=pumper.x+dx/d*RULES.hoseLength;state.z=pumper.z+dz/d*RULES.hoseLength;}}
 const sprayKey=state.mode==='walk'&&(state.keys.has(' ')||state.touchSpray||state.padSpray)&&!state.paused;
 const aerialSpray=!!fire&&sprayKey&&!m.hose&&aerialPhase()==='raised'&&nearLadder();
 m.spraying=(m.hose&&sprayKey)||aerialSpray;
 let spray=null;
 if(m.hose&&sprayKey){state.facing=state.yaw;person.arms[1].rotation.x=-1.35;person.arms[0].rotation.x=-1.1;
  const r=sprayHits({x:state.x,z:state.z},state.yaw,fire,pumper),range=Math.min(Math.max(r.dist,6),RULES.reach);
  const origin=new T.Vector3(state.x-Math.sin(state.yaw)*.6,ground.at(state.x,state.z)+1.2,state.z-Math.cos(state.yaw)*.6);
  spray={origin,dir:new T.Vector3(-Math.sin(state.yaw),(fire.y-origin.y)/range,-Math.cos(state.yaw)),range};
  if(r.hit&&fireLive){m.times.water??=m.elapsed;m.intensity=Math.max(0,m.intensity-RULES.knockdown*dt);flashHint('命中火點，持續射水');}
  else if(!fireLive)flashHint('火勢已控制，可按 F 收回水線');
  else flashHint(r.hose>RULES.hoseLength?'水線不夠長':r.dist>RULES.reach?`距火點 ${Math.round(r.dist)} m，請靠近至 ${RULES.reach} m 內`:'調整鏡頭方向對準火點');}
 else if(aerialSpray){// 雲梯出水只從籃架水砲噴嘴射出，朝起火點。
  const origin=ladder.aerial.muzzle(),dx=fire.x+fire.nx*.6-origin.x,dz=fire.z+fire.nz*.6-origin.z,hd=Math.hypot(dx,dz)||1,dist=Math.hypot(hd,fire.y-origin.y);
  spray={origin,dir:new T.Vector3(dx/hd,(fire.y-origin.y)/hd,dz/hd),range:Math.min(hd,RULES.reach)};
  if(dist<=RULES.reach&&fireLive){m.times.water??=m.elapsed;m.intensity=Math.max(0,m.intensity-RULES.knockdown*dt);flashHint('籃架水砲命中火點，持續射水');}
  else if(fireLive)flashHint(`籃架水砲距火點 ${Math.round(dist)} m，超出 ${RULES.reach} m 射程`);}
 $('tHose').hidden=!(fire&&m.done.parkF!==undefined&&state.mode==='walk');$('tSpray').hidden=!(state.mode==='walk'&&(m.hose||(fire&&aerialPhase()==='raised'&&nearLadder())));
 const handPos=new T.Vector3(state.x,ground.at(state.x,state.z)+1,state.z),truckPos=new T.Vector3(pumper.x,ground.at(pumper.x,pumper.z)+1,pumper.z);
 fireFx.update(dt,fireLive?m.intensity:0,{spray,hoseFrom:m.hose?truckPos:null,hoseTo:m.hose?handPos:null});
 if(!m.finished&&m.steps.every(s=>m.done[s.id]!==undefined)){m.finished=true;showReport();}
 if(changed||Math.floor(t*4)!==Math.floor((t-dt)*4))renderMission();
}
function showReport(){
 const m=mission,row=(a,b)=>`<tr><td>${a}</td><td>${b}</td></tr>`,site=s=>`${s.street||'未命名道路'}側・${s.floor} 樓（示意）`;
 $('reportBody').innerHTML='<table>'+row('任務類型',MISSION_TITLE[m.type])+(m.fire?row('起火位置',site(m.fire)):'')+(m.rescue?row('受困位置',site(m.rescue)):'')
  +m.steps.map(s=>row(s.label,m.done[s.id]!==undefined?'派遣後 '+fmt(m.done[s.id]):'—')).join('')
  +(m.parkDist.pumper?row('水箱車距起火面',m.parkDist.pumper.toFixed(1)+' m'):'')+(m.parkDist.aerial?row('雲梯車距受困面',m.parkDist.aerial.toFixed(1)+' m'):'')+row('總時間',fmt(m.elapsed))+'</table>';
 $('missionReport').hidden=false;$('missionTitle').textContent='任務完成';flashHint(m.hose?'任務完成，可按 F 收回水線':'任務完成');renderMission();
}
$('missionBtn').onclick=()=>openPicker();$('missionAbort').onclick=()=>{if(confirm('取消目前任務？'))endMission();};
$('reportAgain').onclick=()=>{const t=mission?.type??'fire';endMission();startMission(t);};$('reportClose').onclick=()=>{$('missionReport').hidden=true;};
$('tHose').onclick=()=>toggleHose();$('tJack').onclick=()=>aerialJacks();$('tLadder').onclick=()=>aerialLadder();
$('tSpray').addEventListener('pointerdown',()=>{state.touchSpray=true;});for(const ev of ['pointerup','pointercancel','pointerleave'])$('tSpray').addEventListener(ev,()=>{state.touchSpray=false;});
$('mapBtn').onclick=()=>openMap();$('mapClose').onclick=()=>closeMap();$('mapIn').onclick=()=>bigmap.zoom(1.3);$('mapOut').onclick=()=>bigmap.zoom(1/1.3);$('mapMe').onclick=()=>bigmap.center();
$('mapClear').onclick=()=>clearWaypoint();$('mapTruckWp').onclick=()=>setWaypoint(truck.x,truck.z,'消防車');
$('menuMap').onclick=()=>{setPaused(false);openMap();};
function drawMinimap(){
 const s=mini.width,zoom=state.mode==='drive'?.55:.9;mctx.save();mctx.clearRect(0,0,s,s);mctx.beginPath();mctx.arc(s/2,s/2,s/2,0,Math.PI*2);mctx.clip();
 mctx.fillStyle='#1c252b';mctx.fillRect(0,0,s,s);mctx.translate(s/2,s/2);mctx.rotate(state.yaw);mctx.scale(zoom,zoom);
 const cx=MAP/2+state.camX*mapScale,cz=MAP/2+state.camZ*mapScale;mctx.drawImage(mapImg,-cx,-cz);
 for(const v of fleet){if(state.mode==='drive'&&v===truck)continue;const tx=(v.x-state.camX)*mapScale,tz=(v.z-state.camZ)*mapScale;mctx.fillStyle=v.kind==='aerial'?'#ff8a2a':'#e8303a';mctx.fillRect(tx-6,tz-6,12,12);}
 if(state.route?.length>1){mctx.strokeStyle='rgba(255,211,107,.95)';mctx.lineWidth=7;mctx.lineJoin=mctx.lineCap='round';mctx.beginPath();state.route.forEach(([x,z],i)=>{const px=(x-state.camX)*mapScale,pz=(z-state.camZ)*mapScale;i?mctx.lineTo(px,pz):mctx.moveTo(px,pz);});mctx.stroke();}
 for(const [site,color,live] of [[mission?.fire,'#ff3b2f',mission?.done.out===undefined],[mission?.rescue,'#2f7bff',mission?.victim==='trapped']]){if(!site||!live)continue;const px=(site.x-state.camX)*mapScale,pz=(site.z-state.camZ)*mapScale;mctx.fillStyle=color;mctx.strokeStyle='#fff';mctx.lineWidth=3;mctx.beginPath();mctx.arc(px,pz,13,0,Math.PI*2);mctx.fill();mctx.stroke();}
 if(state.waypoint){const px=(state.waypoint.x-state.camX)*mapScale,pz=(state.waypoint.z-state.camZ)*mapScale;mctx.fillStyle='#ffd36b';mctx.strokeStyle='#111';mctx.lineWidth=3;mctx.beginPath();mctx.arc(px,pz,11,0,Math.PI*2);mctx.fill();mctx.stroke();}
 mctx.restore();mctx.save();mctx.translate(s/2,s/2);const facing=(state.mode==='drive'?truck.heading:state.facing)-state.yaw;mctx.rotate(-facing);
 mctx.fillStyle=state.mode==='drive'?'#ff4a4a':'#ffd36b';mctx.strokeStyle='#111';mctx.lineWidth=2;mctx.beginPath();mctx.moveTo(0,-10);mctx.lineTo(7,8);mctx.lineTo(0,4);mctx.lineTo(-7,8);mctx.closePath();mctx.fill();mctx.stroke();mctx.restore();
 mctx.fillStyle='#fff';mctx.font='bold 13px sans-serif';mctx.textAlign='center';const north=state.yaw;mctx.fillText('N',s/2+Math.sin(north)*(s/2-12),s/2-Math.cos(north)*(s/2-12)+5);
}

// 更新
const clock=new T.Timer();let streetTimer=0;
function input(){const k=state.keys;let f=(k.has('w')||k.has('arrowup')?1:0)-(k.has('s')||k.has('arrowdown')?1:0),r=(k.has('d')||k.has('arrowright')?1:0)-(k.has('a')||k.has('arrowleft')?1:0);f+=state.stick[1]+state.padMove[1]+(state.mode==='drive'?state.padThrottle:0);r+=state.stick[0]+state.padMove[0];return [Math.max(-1,Math.min(1,f)),Math.max(-1,Math.min(1,r))];}
function updateWalk(dt){
 const [f,r]=input(),len=Math.hypot(f,r);
 if(len>.05){const speed=(state.keys.has('shift')||state.run||state.padRun?6:2.6)*Math.min(1,len),fx=-Math.sin(state.yaw),fz=-Math.cos(state.yaw),rx=Math.cos(state.yaw),rz=-Math.sin(state.yaw),dx=(fx*f+rx*r)/len,dz=(fz*f+rz*r)/len;
  let p=colliders.resolve(state.x+dx*speed*dt,state.z+dz*speed*dt,.38);
  // 消防車車身也視為障礙（三個圓近似）。
  for(const c of fleetCircles()){const ex=p.x-c[0],ez=p.z-c[1],d=Math.hypot(ex,ez);if(d<c[2]+.38&&d>1e-6){p={x:c[0]+ex/d*(c[2]+.38),z:c[1]+ez/d*(c[2]+.38)};}}
  for(const c of life.circles()){const ex=p.x-c[0],ez=p.z-c[1],d=Math.hypot(ex,ez);if(d<c[2]+.38&&d>1e-6)p={x:c[0]+ex/d*(c[2]+.38),z:c[1]+ez/d*(c[2]+.38)};}
  state.x=p.x;state.z=p.z;const target=Math.atan2(-dx,-dz);state.facing+=Math.atan2(Math.sin(target-state.facing),Math.cos(target-state.facing))*Math.min(1,dt*12);state.walkT+=dt*speed*2.2;
 }
 const stride=len>.05?Math.sin(state.walkT)*.6:0;person.legs[0].rotation.x=stride;person.legs[1].rotation.x=-stride;person.arms[0].rotation.x=-stride*.8;person.arms[1].rotation.x=stride*.8;
 player.position.set(state.x,ground.at(state.x,state.z)+(len>.05?Math.abs(Math.sin(state.walkT))*.04:0),state.z);player.rotation.y=state.facing;
 {const v=nearestVehicle();$('prompt').hidden=!v;if(v)$('prompt').textContent=(matchMedia('(pointer:coarse)').matches?'點「上／下車」駕駛':'按 E 駕駛')+v.label+(v.kind==='aerial'?tt('（停妥後 O 支腿、L 升梯）'):'');
  const nl=nearLadder();$('tJack').hidden=$('tLadder').hidden=!nl;if(nl&&ladder.aerial.busy){$('prompt').hidden=false;$('prompt').textContent='雲梯車：'+tt({spreading:'支腿展開中','lowering-jacks':'腳座落地中',down:'支腿已落地・L 升梯／O 收回支腿',raising:'升梯中',raised:'梯架作業中・L 收梯'+(mission?.fire?'・Space 籃架水砲出水':''),lowering:'收梯中',lifting:'腳座升起中',retracting:'支腿收回中'}[ladder.aerial.state.phase]??'');}}
}
function vehicleCircles(v){const f=[-Math.sin(v.heading),-Math.cos(v.heading)];return v.offsets.map(o=>[v.x+f[0]*o,v.z+f[1]*o,v.radius]);}
function truckCircles(){return vehicleCircles(truck);}
function fleetCircles(except=null){return fleet.filter(v=>v!==except).flatMap(vehicleCircles);}
function updateDrive(dt){
 const [f,r]=input(),brake=state.keys.has(' ')||state.padBrake||state.touchBrake;
 // 遊戲式操控：極速約 120 km/h，非實車性能。
 if(brake)truck.v*=Math.max(0,1-dt*3.5);else if(f>0)truck.v+=(truck.v<0?14:8.5-truck.v*.12)*f*dt;else if(f<0)truck.v+=(truck.v>0?14:4)*f*dt;else truck.v*=Math.max(0,1-dt*.45);
 truck.v=Math.max(-8,Math.min(33.4,truck.v));if(Math.abs(truck.v)<.05&&!f)truck.v=0;
 truck.steer+=((-r)*.55/(1+Math.abs(truck.v)*.06)-truck.steer)*Math.min(1,dt*5);
 const old={x:truck.x,z:truck.z,h:truck.heading};truck.heading+=truck.v/truck.wheelbase*Math.tan(truck.steer)*dt;
 truck.x+=-Math.sin(truck.heading)*truck.v*dt;truck.z+=-Math.cos(truck.heading)*truck.v*dt;
 let hit=false;for(const c of truckCircles()){const p=colliders.resolve(c[0],c[1],c[2]);if(p.hit){hit=true;truck.x+=p.x-c[0];truck.z+=p.z-c[1];}}
 if(hit){if(Math.abs(truck.v)>3)truck.v*=-.25;else truck.v*=.5;for(const c of truckCircles())if(colliders.resolve(c[0],c[1],c[2]).hit){truck.x=old.x;truck.z=old.z;truck.heading=old.h;break;}}
 // NPC 車輛：與消防車重疊時退回原位並減速（NPC 會在前方自動停車）。
 for(const c of truckCircles())if([...life.circles(),...fleetCircles(truck)].some(o=>Math.hypot(o[0]-c[0],o[1]-c[1])<o[2]+c[2]*.8)){truck.x=old.x;truck.z=old.z;truck.heading=old.h;truck.v*=Math.abs(truck.v)>3?-.2:0;break;}
 truck.rig?.update(truck.v*dt,truck.steer);
 $('tJack').hidden=$('tLadder').hidden=true;state.x=truck.x;state.z=truck.z;$('kmh').textContent=Math.round(Math.abs(truck.v)*3.6);$('prompt').hidden=true;
}
let lastFrame=0;
function frame(now){
 requestAnimationFrame(frame);
 // 30 FPS 省電：未到間隔就跳過這一幀；暫停時停止模擬與繪製。
 if(settings.fps===30&&now-lastFrame<1000/30-2)return;lastFrame=now;
 pollPad();
 if(state.paused||bigmap.open||pickerOpen()){clock.update();return;}
 clock.update();const dt=Math.min(clock.getDelta(),.05),t=clock.getElapsed();quality.sample(dt);
 state.mode==='walk'?updateWalk(dt):updateDrive(dt);
 {const sv=fleet.find(v=>v.siren);life.update(dt,t,state.mode==='drive'?fleetCircles():[[state.x,state.z,.5],...fleetCircles()],{siren:sv?{x:sv.x,z:sv.z}:null});}
 updateAutoDrive(dt);ladder.aerial.update(dt);
 updateMission(dt,t);
 // 車輛貼地，依前後輪地面高差俯仰；雲梯車作業中保持水平（支腿已調平，示意）。
 for(const v of fleet){const fx=-Math.sin(v.heading),fz=-Math.cos(v.heading),half=v.wheelbase/2,yf=ground.at(v.x+fx*half,v.z+fz*half),yr=ground.at(v.x-fx*half,v.z-fz*half),level=v.aerial?.busy;
  v.root.position.set(v.x,(yf+yr)/2,v.z);v.root.rotation.set(level?0:Math.atan2(yf-yr,v.wheelbase),v.heading,0,'YXZ');
  for(const m of v.beacons){const on=v.siren&&Math.sin(t*14+(m.id%2)*Math.PI)>0;m.emissiveIntensity=v.siren?(on?6:.2):1;}}
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
 {const driving=state.mode==='drive',sv=fleet.filter(v=>v.siren).map(v=>driving&&v===truck?1:1/(1+Math.hypot(state.x-v.x,state.z-v.z)/25));audio.update({t,siren:sv.length?Math.max(...sv):0,speed:truck.v,driving,ambient:state.time==='night'?.6:1});}
 streetTimer-=dt;if(streetTimer<0){streetTimer=.4;$('street').textContent=nearestStreet(streets.features,state.x,state.z)??'信義區（無道路名稱）';}
 drawMinimap();renderer.render(scene,camera);
}
// 直式手機：垂直視角放大（60°→最多 80°），左右才看得到街道兩側。
const portrait=()=>innerWidth<innerHeight;
function resize(){renderer.setPixelRatio(quality.pixelRatio());renderer.setSize(innerWidth,innerHeight,false);const a=innerWidth/innerHeight;camera.aspect=a;camera.fov=a<1?Math.min(80,Math.max(60,2*Math.atan(Math.tan(35*Math.PI/180)/a)*180/Math.PI)):60;camera.updateProjectionMatrix();const s=TOUCH?120:innerWidth<=640?140:220;mini.width=mini.height=s*Math.min(devicePixelRatio,2);}
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
function setPaused(on,page){state.paused=on;on?audio.suspend():audio.resume();$('menu').hidden=!on;state.keys.clear();state.stick=[0,0];if(on)showPage(page??'settings');}
function showPage(page){for(const b of document.querySelectorAll('.menu-nav [data-page]'))b.classList.toggle('active',b.dataset.page===page);for(const sec of document.querySelectorAll('.menu-body [data-page]'))sec.hidden=sec.dataset.page!==page;}
for(const b of document.querySelectorAll('.menu-nav [data-page]'))b.onclick=()=>showPage(b.dataset.page);
$('resume').onclick=()=>setPaused(false);$('menuReset').onclick=()=>{setPaused(false);resetAll();};$('help').onclick=()=>setPaused(!state.paused);
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
// ---------- 手把（標準配置）：左搖桿移動／轉向、右搖桿視角、RT 油門、LT 倒車；按鍵見操作說明 ----------
const pad=createGamepad();
addEventListener('gamepadconnected',e=>{$('prompt').hidden=false;$('prompt').textContent='已連接手把：'+e.gamepad.id.slice(0,40)+'（按 Start 開選單、看操作說明）';setTimeout(()=>{if($('prompt').textContent.startsWith('已連接手把'))$('prompt').hidden=true;},4000);});
let padT=performance.now();
function pollPad(){
 const now=performance.now(),dt=Math.min(.05,(now-padT)/1000);padT=now;pad.poll();
 state.padMove=[0,0];state.padThrottle=0;state.padRun=state.padBrake=state.padSpray=false;if(!pad.connected)return;
 const hit=b=>pad.pressed.has(b);if(pad.pressed.size)audio.unlock();
 if(pickerOpen()){if(hit(PAD.DOWN)||hit(PAD.UP)){pickIdx=(pickIdx+(hit(PAD.DOWN)?1:pickButtons.length-1))%pickButtons.length;syncPick();}if(hit(PAD.A))pickButtons[pickIdx].click();if(hit(PAD.B)||hit(PAD.RIGHT))closePicker();return;}
 if(bigmap.open){if(hit(PAD.B)||hit(PAD.BACK))closeMap();return;}
 if(hit(PAD.START)){setPaused(!state.paused);return;}
 if(state.paused){if(hit(PAD.B))setPaused(false);return;}
 if(!$('missionReport').hidden&&(hit(PAD.A)||hit(PAD.B))){$('missionReport').hidden=true;return;}
 if(hit(PAD.BACK)){openMap();return;}
 if(hit(PAD.A))toggleVehicle();if(hit(PAD.X))toggleHose();if(hit(PAD.Y))toggleSiren();if(hit(PAD.LB))aerialJacks();if(hit(PAD.UP))aerialLadder();if(hit(PAD.LEFT))cycleTime();if(hit(PAD.RIGHT))openPicker();
 const [lx,ly]=pad.look;if(lx||ly){state.yaw-=lx*dt*2.6*settings.sens;state.pitch=Math.min(1.25,Math.max(.05,state.pitch+ly*dt*1.6*settings.sens*(settings.invertY?-1:1)));state.camHold=1.2;}
 if(pad.held.has(PAD.LS))state.dist=Math.min(40,state.dist*(1+dt));if(pad.held.has(PAD.RS))state.dist=Math.max(3,state.dist*(1-dt));
 state.padMove=pad.move;state.padThrottle=pad.rt-pad.lt;state.padRun=state.mode==='walk'&&pad.held.has(PAD.B);state.padBrake=state.mode==='drive'&&pad.held.has(PAD.B);state.padSpray=pad.held.has(PAD.RB);
}
$('loading').hidden=true;
// 測試用：以固定時間步推進模擬（不渲染）。
window.__xinyiStreet={fleet,ladder,pumper,get active(){return truck;},get truck(){return truck;},facade,fireFx,scene,camera,get mission(){return mission;},startMission,openPicker,toggleHose,toggleVehicle,aerialJacks,aerialLadder,dispatchAuto,victim,roads,pad,pollPad,state,colliders,ground,life,applyTime,quality,settings,setPaused,bigmap,openMap,closeMap,setWaypoint,audio,routeGraphs,tick(dt,n=1){for(let i=0;i<n;i++){state.mode==='walk'?updateWalk(dt):updateDrive(dt);updateAutoDrive(dt);ladder.aerial.update(dt);updateMission(dt,(state.simT=(state.simT??0)+dt));}}};
requestAnimationFrame(frame);
