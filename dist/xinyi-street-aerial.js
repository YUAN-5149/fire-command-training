// 信義街景・雲梯車作業（訓練示意）：依官方 LOD1 量體做作業距離核對與升梯掃掠避碰。
// 沿用首頁已確認的雲梯車型（aerial-ladder.glb）、支腿機構（aerial-grounding）、籃架旋轉與砲塔（native-cage）
// 及升梯運動（aerial-motion）；只把避碰邊界由首頁街景的兩道立面換成信義的真實量體。
// 幾何皆為模型示意，非原廠作業曲線、支腿反力或地盤承載核定；LOD1 量體不含陽臺、雨遮、招牌與騎樓等突出物。
import * as T from 'three';
import {project} from './xinyi-street-world.js?v=s21';
import {createAerialMotion} from './aerial-motion.js?v=s21';
import {createGrounding,walkBoarding} from './aerial-grounding.js';
import {createCageSwivel,createNativeMonitor} from './native-cage.js';

export const AERIAL={
 margin:.3,          // 梯架／籃架與量體的最小淨距（示意）
 wallGap:.5,         // 支腿墊板外緣到外牆的最小淨距（示意）
 padSize:.6,         // 支腿墊板邊長
 maxLevelDiff:.25,   // 四支腿處地面高差上限（示意地形；超過視為無法調平）
 floorHeight:3.4,    // 與消防任務相同的樓高估算
 sill:.97,           // 籃底距該樓樓板高（與首頁一致）
 standoffs:[1.2,1.5,1.9,2.4], // 籃架中心距外牆，由近而遠嘗試（同一窗口，不換到其他立面）
 radius:60,          // 收集避碰量體的半徑
};

// ---------- 座標：作業框架 ----------
// 框架原點＝車輛中心（地面），-X＝車頭方向，-Z＝朝建物（車身右側面向建物，順向停放），與首頁雲梯車相同。
export function aerialFrame(site,x,z){
 const dist=(x-site.x)*site.nx+(z-site.z)*site.nz,along=(x-site.x)*-site.nz+(z-site.z)*site.nx;
 return {x,z,heading:Math.atan2(site.nx,site.nz),dist,along};
}
export const toFrameXZ=(f,x,z)=>{const c=Math.cos(f.heading),s=Math.sin(f.heading),dx=x-f.x,dz=z-f.z;return [c*dx-s*dz,s*dx+c*dz];};
export const fromFrameXZ=(f,lx,lz)=>{const c=Math.cos(f.heading),s=Math.sin(f.heading);return [f.x+c*lx+s*lz,f.z-s*lx+c*lz];};

// ---------- 量體 ----------
// 以屋頂三角形為頂、牆腳為底的實心柱體表示量體（LOD1）。只建一次，之後依框架位置挑選鄰近者。
export function buildObstacleIndex(buildings){
 const list=[];
 for(const b of buildings){let base=Infinity;for(const w of b.walls)base=Math.min(base,w.a[2],w.b[2]);
  const r=b.roofs??[];for(let i=0;i+2<r.length;i+=3){const p=[r[i],r[i+1],r[i+2]].map(v=>project(v[0],v[1]));
   list.push({id:b.id,tri:p.flat(),y0:base-1,y1:Math.max(r[i][2],r[i+1][2],r[i+2][2]),cx:(p[0][0]+p[1][0]+p[2][0])/3,cz:(p[0][1]+p[1][1]+p[2][1])/3});}}
 return list;
}
// 長方形車輛（水箱車等）也以兩個三角形柱體表示。
export function boxObstacle(id,x,z,heading,length,width,height,y){
 const f=[-Math.sin(heading),-Math.cos(heading)],r=[Math.cos(heading),-Math.sin(heading)],c=[[1,1],[1,-1],[-1,-1],[-1,1]].map(([a,b])=>[x+f[0]*a*length/2+r[0]*b*width/2,z+f[1]*a*length/2+r[1]*b*width/2]);
 return [[c[0],c[1],c[2]],[c[0],c[2],c[3]]].map(t=>({id,tri:t.flat(),y0:y-1,y1:y+height,cx:x,cz:z}));
}
// 轉入框架座標並附上外接框。
export function localObstacles(index,frame,{y=0,radius=AERIAL.radius,extra=[]}={}){
 const out=[];
 for(const o of [...index,...extra]){if(Math.hypot(o.cx-frame.x,o.cz-frame.z)>radius+40)continue;
  const t=[];for(let i=0;i<6;i+=2)t.push(...toFrameXZ(frame,o.tri[i],o.tri[i+1]));
  const minX=Math.min(t[0],t[2],t[4]),maxX=Math.max(t[0],t[2],t[4]),minZ=Math.min(t[1],t[3],t[5]),maxZ=Math.max(t[1],t[3],t[5]);
  if(Math.hypot(Math.max(minX,Math.min(0,maxX)),Math.max(minZ,Math.min(0,maxZ)))>radius)continue;
  out.push({id:o.id,t,minX,maxX,minZ,maxZ,y0:o.y0-y,y1:o.y1-y});}
 return out;
}
// 軸對齊長方形與三角形是否相交（分離軸）。
export function rectTri(x0,z0,x1,z1,t){
 if(Math.max(t[0],t[2],t[4])<x0||Math.min(t[0],t[2],t[4])>x1||Math.max(t[1],t[3],t[5])<z0||Math.min(t[1],t[3],t[5])>z1)return false;
 const rect=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
 for(let i=0;i<3;i++){const ax=t[i*2],az=t[i*2+1],bx=t[(i+1)%3*2],bz=t[(i+1)%3*2+1],nx=az-bz,nz=bx-ax;
  const tri=[0,1,2].map(k=>t[k*2]*nx+t[k*2+1]*nz),r=rect.map(([x,z])=>x*nx+z*nz);
  if(Math.max(...r)<Math.min(...tri)||Math.min(...r)>Math.max(...tri))return false;}
 return true;
}
// 升梯避碰邊界：每個轉台以上零件的外接框（框架座標），外擴 margin 後不得進入任何量體柱體或低於地面。
export function createEnvelope(obstacles,{margin=AERIAL.margin,groundAt=()=>0}={}){
 return boxes=>{
  let minClear=Infinity;
  for(const b of boxes){const x0=b.min.x-margin,x1=b.max.x+margin,z0=b.min.z-margin,z1=b.max.z+margin;
   if(b.min.y<groundAt((b.min.x+b.max.x)/2,(b.min.z+b.max.z)/2)-.066)return {safe:false,hit:'ground'};
   for(const o of obstacles){if(o.maxX<x0||o.minX>x1||o.maxZ<z0||o.minZ>z1||b.max.y<o.y0||b.min.y>o.y1)continue;
    if(rectTri(x0,z0,x1,z1,o.t))return {safe:false,hit:o.id};}
  }
  return {safe:true,hit:null,minClear};
 };
}

// ---------- 作業距離核對（不含升梯掃掠，可即時預覽） ----------
// layout：框架座標的車身外框與四個支腿墊板中心；roads：OSM 車道 [ax,az,bx,bz,半寬]。
export function checkFootprint({frame,site,layout,obstacles,groundAt,roads=[],engine=null}){
 const issues=[],warnings=[],pad=AERIAL.padSize/2;
 if(frame.dist<=0)issues.push('不在起火面這一側');
 const outer=Math.max(...layout.feet.map(f=>Math.abs(f[1])))+pad,gap=frame.dist-outer;
 if(frame.dist>0&&gap<AERIAL.wallGap)issues.push(`支腿外緣距外牆僅 ${gap.toFixed(1)} m（需 ≥ ${AERIAL.wallGap} m，留支腿與作業空間）`);
 const rects=[{name:'車身',...layout.body},...layout.feet.map((f,i)=>({name:'支腿 '+(i+1),minX:f[0]-pad,maxX:f[0]+pad,minZ:f[1]-pad,maxZ:f[1]+pad}))];
 const hits=new Set();
 for(const r of rects)for(const o of obstacles){if(o.y0>2||o.y1<.3)continue;if(rectTri(r.minX,r.minZ,r.maxX,r.maxZ,o.t)){hits.add(o.id==='engine'?r.name+'與水箱車重疊':r.name+'壓到建物');break;}}
 issues.push(...hits);
 const heights=layout.feet.map(([lx,lz])=>groundAt(...fromFrameXZ(frame,lx,lz))),diff=Math.max(...heights)-Math.min(...heights);
 if(diff>AERIAL.maxLevelDiff)issues.push(`支腿處地面高差 ${diff.toFixed(2)} m，超出示意調平範圍 ${AERIAL.maxLevelDiff} m`);
 else if(diff>.08)warnings.push(`支腿處地面高差 ${diff.toFixed(2)} m（示意地形），以墊板補足，需現地確認`);
 if(roads.length){let best=Infinity;for(const [ax,az,bx,bz,h] of roads){const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((frame.x-ax)*dx+(frame.z-az)*dz)/l2));best=Math.min(best,Math.hypot(frame.x-ax-dx*t,frame.z-az-dz*t)-h);}
  if(best>0)warnings.push('車位不在 OSM 車道範圍內（可能為人行道或空地），需現地確認可停放與承重');}
 if(Math.abs(frame.along)>8)warnings.push(`車輛中心與起火窗口沿街錯位 ${Math.abs(frame.along).toFixed(0)} m`);
 return {ok:!issues.length,issues,warnings,dist:frame.dist,gap,levelDiff:diff,heights};
}

// 籃架目標：起火樓層窗口外側（同一立面，只調整與外牆距離）。回傳框架座標。
export function basketTarget(site,frame,standoff,y,win=site){
 const [lx,lz]=toFrameXZ(frame,win.x+site.nx*standoff,win.z+site.nz*standoff);
 return new T.Vector3(lx,site.base+(site.floor-1)*AERIAL.floorHeight+AERIAL.sill-y,lz);
}

// ---------- 車輛與動作 ----------
const smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
// 時間軸（秒）：與首頁相同——人員走到車側 0–5、支腿伸出 5–9、落地 9–12、登車 12–19、升梯 19–38，之後籃架出水。
export const TIMELINE={spread:[5,9],down:[9,12],board:[12,19],raise:[19,38],retract:17,crewDown:7,legsUp:3,legsIn:4,
 gate:1,boardVictim:5,gateClose:1.5,lowerSlow:2,unload:4,transfer:6,secure:3,carry:6,crewBack:4};
// 已驗證路徑（雲梯姿態 [迴轉, 仰角, 伸梯] 的折線）依各軸速度分段計時；載人下降以 lowerSlow 倍時間緩慢進行（示意速度，非原廠規格）。
export function legPath(waypoints,slow=1){const segs=[];let total=0;for(let i=1;i<waypoints.length;i++){const a=waypoints[i-1],b=waypoints[i],d=Math.max(Math.abs(b[0]-a[0])/.25,Math.abs(b[1]-a[1])/.15,Math.abs(b[2]-a[2])/.6,.4)*slow;segs.push({a,b,t0:total,d});total+=d;}return {segs,total,waypoints};}
export function legAt(path,t){for(const s of path.segs)if(t<s.t0+s.d){const q=smooth((t-s.t0)/s.d);return s.a.map((v,j)=>v+(s.b[j]-v)*q);}return [...path.waypoints.at(-1)];}
// 籃架降落點（框架座標，車尾、街側、車頭外側的空地），不在車頂上方下降（與首頁相同原則）。
// 本模型梯架降到地面需距轉台水平約 10 m 以上（較近時仰角下限或車體干涉），故候選點在車尾後方或街側較遠處。
export const LANDING=[[15,2],[15,5],[16,0],[14,8],[8,12],[0,12],[-14,10],[-14,12]];
// 待救者／傷患（與首頁住戶／患者相同造型：男性藍上衣、女性紫上衣加裙裝與長髮）。
// condition：well 可自行行動、serious 重傷（癱坐）、unconscious 昏迷（倒臥）。重傷與昏迷需以擔架搬運。
export const CONDITION_LABEL={well:'可自行行動',serious:'重傷',unconscious:'昏迷'};
export const needsStretcher=condition=>condition==='serious'||condition==='unconscious';
export function createPatient(parent,{sex='male',condition='well'}={}){
 const mat=c=>new T.MeshStandardMaterial({color:c,roughness:.8}),skin=mat('#b98c70'),pants=mat('#303947'),hair=mat('#252626'),shirt=mat(sex==='male'?'#497bad':'#a46a99');
 const root=new T.Group(),body=new T.Group();root.add(body);
 const box=(p,w,h,d,x,y,z,m)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;p.add(o);return o;};
 box(body,.38,.58,.25,0,1.04,0,shirt);
 const legs=[-.12,.12].map(x=>{const g=new T.Group();g.position.set(x,.74,0);body.add(g);box(g,.15,.72,.18,0,-.36,0,sex==='female'?skin:pants);box(g,.18,.1,.29,0,-.69,-.05,pants);return g;});
 const head=new T.Mesh(new T.SphereGeometry(.17,12,8),skin);head.position.y=1.52;head.castShadow=true;body.add(head);box(body,.31,.12,.28,0,1.65,.025,hair);
 if(sex==='female'){const skirt=new T.Mesh(new T.CylinderGeometry(.23,.39,.55,20),shirt);skirt.position.y=.72;skirt.name='女性裙裝';body.add(skirt);box(body,.34,.42,.18,0,1.4,.13,hair).name='女性髮型';}
 const arms=[-1,1].map(side=>{const g=new T.Group();g.position.set(side*.27,1.3,0);body.add(g);box(g,.13,.58,.15,0,-.28,0,shirt);return g;});
 // 頸圈（示意）：白色硬式頸圈，前方橙色調整片；預設不顯示。
 const collar=new T.Group();collar.name='頸圈';body.add(collar);collar.position.y=1.36;collar.visible=false;
 {const ring=new T.Mesh(new T.CylinderGeometry(.13,.14,.12,16,1,true),new T.MeshStandardMaterial({color:'#f2f2ee',roughness:.7,side:T.DoubleSide}));collar.add(ring);const tab=new T.Mesh(new T.BoxGeometry(.09,.1,.03),new T.MeshStandardMaterial({color:'#e8701a'}));tab.position.set(0,0,-.14);collar.add(tab);}
 // 檢傷卡（示意）：繫在胸前，依分類變色；預設不顯示。
 const tag=new T.Mesh(new T.BoxGeometry(.12,.16,.02),new T.MeshStandardMaterial({color:'#ffffff',emissive:'#000000'}));tag.position.set(.1,1.12,-.135);tag.visible=false;tag.name='檢傷卡';body.add(tag);
 // 氧氣面罩（示意）
 const mask=new T.Mesh(new T.BoxGeometry(.12,.1,.06),new T.MeshStandardMaterial({color:'#9fe0b0',transparent:true,opacity:.75}));mask.position.set(0,1.5,-.17);mask.visible=false;mask.name='氧氣面罩';body.add(mask);
 parent.add(root);
 const f={root,body,legs,arms,sex,condition,collar,tag,mask,setCollar:on=>{collar.visible=on;},setTag:color=>{tag.visible=!!color;if(color){tag.material.color.set(color);tag.material.emissive.set(color).multiplyScalar(.35);}},setMask:on=>{mask.visible=on;}};f.setPose=pose=>setPatientPose(f,pose);f.setPose(condition==='unconscious'?'lying':condition==='serious'?'slumped':'standing');return f;
}
// 倒臥：仰躺、身體沿 root 的 +z（腳在 −z、頭在 +z），中心在 root 原點；癱坐：與首頁重傷姿勢相同。
export function setPatientPose(f,pose){
 f.pose=pose;f.body.rotation.set(0,0,0);f.body.position.set(0,0,0);f.body.scale.set(1,1,1);f.arms.forEach(a=>a.rotation.set(0,0,0));f.legs.forEach(l=>l.rotation.set(0,0,0));
 if(pose==='lying'){f.body.rotation.x=Math.PI/2;f.body.position.set(0,.14,-.85);}
 if(pose==='slumped'){f.body.scale.y=.62;f.body.rotation.x=.35;f.arms[0].rotation.z=-.6;}
}
export function createCivilian(parent){return createPatient(parent,{sex:'male',condition:'well'});}
// 籃內載重（與首頁載重試算相同算法：各項合計，與輸入的容許籃載重比較）。數值為使用者輸入或示意預設，非實車核定。
export function basketLoad({firefighters=1,firefighter,gear,equipment=0,victim=0,stretcher=0,capacity}){
 const parts=[['消防員',firefighters*firefighter],['消防衣與 SCBA',firefighters*gear],['籃內器材',equipment],['待救者（估計）',victim],['擔架',stretcher]].filter(([,v])=>v>0);
 const total=parts.reduce((a,[,v])=>a+v,0);return {parts,total,capacity,over:Number.isFinite(capacity)&&total>capacity};
}

export function createXinyiAerial({scene,source,createPerson,ground,obstacleIndex}){
 const frame=new T.Group();frame.name='Xinyi_aerial_frame';scene.add(frame);frame.visible=false;
 // 車型輪胎底面在模型原點高度；首頁路面為 -0.065，這裡直接貼框架地面。
 source.position.set(0,0,0);frame.add(source);frame.updateMatrixWorld(true);
 const get=n=>source.getObjectByName(n),slew=get('Turntable_slew'),elevation=get('Ladder_elevation'),level=get('Cage_level'),floor=get('Cage_floor'),extensions=[2,3,4].map(n=>get('Ladder_extend_'+n));
 if(!slew||!elevation||!level||!floor||extensions.some(o=>!o))throw new Error('雲梯車型缺少升梯節點');
 const floorBox=new T.Box3().setFromBufferAttribute(floor.geometry.attributes.position),anchor=floorBox.getCenter(new T.Vector3());anchor.y=floorBox.max.y;
 const swivel=createCageSwivel(level,floor,anchor),monitor=createNativeMonitor(source,swivel);
 // 籃門：與首頁相同，以門框角為鉸鏈開關（只在籃架靜止時開啟）。
 const nativeGate=get('Cage_gate');let hinge=null;if(nativeGate){const b=new T.Box3().setFromObject(nativeGate);hinge=new T.Group();hinge.position.copy(swivel.worldToLocal(new T.Vector3(b.min.x,b.min.y,b.min.z)));swivel.add(hinge);hinge.updateWorldMatrix(true,false);hinge.attach(nativeGate);}
 const setGate=open=>{if(hinge)hinge.rotation.y=-(Math.PI/2)*T.MathUtils.clamp(open,0,1);};
 // 籃架擔架架（示意）：橫掛於籃架前緣、地板下方，長 2.1 m、寬 0.62 m。只有裝上時（顯示）才計入避碰。
 const litter=new T.Group();litter.name='Basket_stretcher_mount';swivel.add(litter);
 {const orange=new T.MeshStandardMaterial({color:'#e8701a',roughness:.6}),steel=new T.MeshStandardMaterial({color:'#9aa4a9',metalness:.7,roughness:.35});
  const box=(w,h,d,x,y,z,m)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;litter.add(o);return o;};
  box(.62,.1,2.1,-.95,-.2,0,orange);for(const x of [-.66,-1.24])box(.04,.08,2.1,x,-.12,0,steel);for(const z of [-.6,.6])box(.1,.05,.06,-.63,-.13,z,steel);
  for(const z of [-.5,0,.5])box(.64,.02,.06,-.95,-.07,z,steel);
  // 固定帶（示意）：胸、腰、腿三條黃色綁帶跨過傷患，扣具黑色；固定後才顯示。
  const strapMat=new T.MeshStandardMaterial({color:'#f2c230',roughness:.6}),buckle=new T.MeshStandardMaterial({color:'#1d1f20'});
  for(const z of [.55,.05,-.5]){const st=box(.66,.025,.07,-.95,.17,z,strapMat);st.name='Stretcher_strap';const b=box(.08,.03,.09,-.95,.185,z,buckle);b.name='Stretcher_strap';}}
 const groundLitter=litter.clone(true);groundLitter.visible=false;scene.add(groundLitter);
 const isStrap=o=>o.name==='Stretcher_strap';
 // 擔架架裝上時才顯示並計入避碰；固定帶只在傷患固定後顯示。
 const setLitter=(on,straps=false)=>litter.traverse(o=>{if(o.isMesh)o.visible=on&&(!isStrap(o)||straps);});setLitter(false);
 const setGroundStraps=on=>groundLitter.traverse(o=>{if(o.isMesh&&isStrap(o))o.visible=on;else if(o.isMesh)o.visible=true;});
 const LITTER_TOP=new T.Vector3(-.95,-.15,0);
 const beacons=[];source.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;if(/beacon|warning|LED strip/i.test(o.material?.name||'')){o.material=o.material.clone();o.material.color.set('#c61f16');o.material.emissive.set('#ff180a');beacons.push(o.material);}});
 const grounding=createGrounding(source);
 let envelope=createEnvelope([]);
 const motion=createAerialMotion(source,{slew,elevation,level,floor,extensions,anchor,envelope:boxes=>envelope(boxes)});
 monitor.validate=()=>motion.clearance().safe;
 const restPose=motion.pose;
 // 框架為原點時量得的配置（框架座標）：車身外框、支腿墊板中心與底面、登車踏階。
 const steps=grounding.steps.map(p=>p.clone());
 const layout=(()=>{source.updateMatrixWorld(true);const body=new T.Box3().setFromObject(source);
  grounding.update(1,1);source.updateMatrixWorld(true);
  const feet=grounding.jacks.map(j=>{const foot=j.moving.find(m=>/Jack_foot/.test(m.o.name))?.o??j.piston;const b=new T.Box3().setFromObject(foot);return {x:(b.min.x+b.max.x)/2,z:(b.min.z+b.max.z)/2,bottom:b.min.y};});
  grounding.update(0,0);source.updateMatrixWorld(true);
  return {body:{minX:body.min.x,maxX:body.max.x,minZ:body.min.z,maxZ:body.max.z},feet:feet.map(f=>[f.x,f.z]),footBottom:Math.min(...feet.map(f=>f.bottom)),length:body.max.x-body.min.x,width:body.max.z-body.min.z};})();
 // 支腿墊板：補足示意地形與支腿底面的高差，避免支腿懸空。
 const padMat=new T.MeshStandardMaterial({color:'#e2b33c',roughness:.8}),pads=layout.feet.map(()=>{const m=new T.Mesh(new T.BoxGeometry(AERIAL.padSize,1,AERIAL.padSize),padMat);m.castShadow=m.receiveShadow=true;m.visible=false;scene.add(m);return m;});
 const crewRoot=new T.Group();scene.add(crewRoot);const crew=[0,1].map(()=>createPerson(crewRoot,'隊員'));crewRoot.visible=false;
 const feetOf=(p,pos)=>{p.body.position.copy(pos);p.body.updateWorldMatrix(true,true);p.body.position.y+=pos.y-Math.min(...p.boots.map(b=>new T.Box3().setFromObject(b).min.y));};
 const W=v=>frame.localToWorld(v.clone());
 const st={phase:'idle',t:0,frame:null,site:null,plan:null,legs:[],target:null,blocked:null,arrived:false,spraying:false,standoff:null,task:'fire',victim:null,actual:null};
 const envFor=(f,y,obstacles)=>createEnvelope(obstacles,{groundAt:(lx,lz)=>ground.at(...fromFrameXZ(f,lx,lz))-y});

 function setFrame(f,y){frame.position.set(f.x,y,f.z);frame.rotation.set(0,f.heading,0);frame.updateMatrixWorld(true);}
 function roadsFrom(features){const out=[];for(const ft of features){if(ft.kind!=='road'||!(ft.width>0))continue;for(const path of ft.paths)for(let i=1;i<path.length;i++){const [ax,az]=project(...path[i-1]),[bx,bz]=project(...path[i]);out.push([ax,az,bx,bz,ft.width/2]);}}return out;}
 let roads=null;
 function frameY(f){return Math.max(...layout.feet.map(([lx,lz])=>ground.at(...fromFrameXZ(f,lx,lz))));}
 // 其他車輛（水箱車、GIS 配置的車組）以長方形柱體納入避碰。
 const vehicleBoxes=list=>list.flatMap((v,i)=>boxObstacle(v.id??('vehicle'+i),v.x,v.z,v.heading,v.length??7.6,v.width??3.1,v.height??3.6,ground.at(v.x,v.z)));
 // 即時預覽用的作業距離核對。
 function preview(site,x,z,{engine=null,vehicles=[],features=null}={}){
  if(features&&!roads)roads=roadsFrom(features);
  const f=aerialFrame(site,x,z),y=frameY(f),extra=[...(engine?boxObstacle('engine',engine.x,engine.z,engine.heading,7.6,3.1,3.6,ground.at(engine.x,engine.z)):[]),...vehicleBoxes(vehicles)];
  const obstacles=localObstacles(obstacleIndex,f,{y,extra});
  return {frame:f,y,obstacles,...checkFootprint({frame:f,site,layout,obstacles,groundAt:ground.at,roads:roads??[],engine})};
 }
 // 同一立面窗口（win 為沿牆位置，預設起火點）依序嘗試籃架距外牆距離。
 function planWindow(site,f,y,win){let reach=false;for(const standoff of AERIAL.standoffs){const target=basketTarget(site,f,standoff,y,win);if(motion.solve(target))reach=true;const plan=motion.plan(target);if(plan)return {plan,target,standoff,reach:true};}return {plan:null,reach};}
 // 完整核對：作業距離＋升梯路徑。成功時保留結果供 deploy。win：救援窗口（受困者位置），省略時為起火窗口。
 function check(site,x,z,opts={}){
  if(st.phase!=='idle'&&st.phase!=='parked')return {ok:false,issues:['雲梯作業中，請先收梯'],warnings:[]};
  const r=preview(site,x,z,opts);if(!r.ok)return r;
  const restore=()=>{if(st.frame&&st.phase==='parked'){setFrame(st.frame,st.y);envelope=envFor(st.frame,st.y,st.result.obstacles);}else envelope=createEnvelope([]);};
  if(opts.load?.over)return {...r,ok:false,issues:[`籃內載重 ${Math.round(opts.load.total)} kg 超過容許籃載重 ${opts.load.capacity} kg（請減少籃內人員或器材，或確認原廠該工況資料）`]};
  setFrame(r.frame,r.y);envelope=envFor(r.frame,r.y,r.obstacles);setLitter(!!opts.stretcher);
  const win=opts.window??site,w=planWindow(site,r.frame,r.y,win);
  // 救人：確認從救援窗口載人下降時有可安全降落的地面位置（暫時沿已核對路徑移到窗口後再規劃，之後退回）。
  let landing=true;
  if(w.plan&&opts.window){const prev={frame:st.frame,y:st.y},path=legPath(w.plan.waypoints),saveFrame=st.frame;st.frame=r.frame;st.y=r.y;
   for(let t=0;t<=path.total+.05;t+=.05)motion.move(legAt(path,t));landing=!!planLanding(!!opts.stretcher);
   const back=legPath([...w.plan.waypoints].reverse());for(let t=0;t<=back.total+.05;t+=.05)motion.move(legAt(back,t));motion.move(restPose);st.frame=saveFrame;st.y=prev.y;}
  setLitter(false);restore();
  if(w.plan&&!landing)return {...r,ok:false,issues:['可到達受困者窗口，但載人下降時找不到可安全降落的地面位置（車尾、街側、車頭外側皆會碰到建物或車輛）']};
  if(w.plan)return {...r,ok:true,stretcher:!!opts.stretcher,load:opts.load??null,plan:w.plan,target:w.target,standoff:w.standoff,floor:site.floor,window:win,targetHeight:w.target.y,radius:Math.hypot(w.target.x-motion.origin.x,w.target.z-motion.origin.z)};
  const what=opts.window?'受困者窗口':'窗口',fitted=opts.stretcher?'（已裝擔架架，籃架前緣多突出約 0.6 m）':'';
  return {...r,ok:false,issues:[w.reach?`升梯掃掠會碰到建物或籃架無法貼近 ${site.floor} 樓${what}（已試籃架距外牆 ${AERIAL.standoffs.join('／')} m）${fitted}`:`此位置超出雲梯模型可達範圍，無法到達 ${site.floor} 樓${what}（試著調整與外牆距離或沿街位置）`]};
 }
 // task：'rescue'（先救受困者）或 'fire'（籃架出水）。victim：{figure, window(世界座標，腳底)}。
 function deploy(result,site,{task='fire',victim=null}={}){
  if(!result?.ok||!result.plan)return false;
  setFrame(result.frame,result.y);envelope=envFor(result.frame,result.y,result.obstacles);
  Object.assign(st,{phase:'deploying',t:0,frame:result.frame,y:result.y,site,plan:result.plan,legs:[result.plan.waypoints],target:result.target,standoff:result.standoff,blocked:null,arrived:false,spraying:false,result,task:task==='rescue'&&victim?'rescue':'fire',victim:task==='rescue'?victim:null,lower:null,raise:null,landing:null,carry:null,strapped:false,stretcher:task==='rescue'&&!!result.stretcher});
  frame.visible=crewRoot.visible=true;setGate(0);setLitter(st.stretcher);groundLitter.visible=false;if(st.victim)st.victim.windowQ=st.victim.figure.root.quaternion.clone();
  layout.feet.forEach(([lx,lz],i)=>{const [x,z]=fromFrameXZ(result.frame,lx,lz),g=ground.at(x,z),top=result.y+layout.footBottom,h=Math.max(.05,top-g);pads[i].scale.y=h;pads[i].position.set(x,g+h/2,z);});
  return true;
 }
 // 載人下降：降落點（地面上方 0.2 m）依序嘗試，路徑經同一避碰檢查。
 // 裝擔架架時籃底需離地 0.45 m，擔架才不觸地。
 function planLanding(stretcher=st.stretcher){const lift=stretcher?.45:.2;for(const [lx,lz] of LANDING){const g=ground.at(...fromFrameXZ(st.frame,lx,lz))-st.y,target=new T.Vector3(lx,g+lift,lz),plan=motion.plan(target);if(plan)return {plan,target};}return null;}
 // 救援完成、籃架在地面後：升梯到起火窗口出水。
 function raiseToFire(load=null){
  if(st.phase!=='ground')return {ok:false,reason:'籃架需先回到地面'};
  if(load?.over)return {ok:false,reason:`籃內載重 ${Math.round(load.total)} kg 超過容許籃載重 ${load.capacity} kg`};
  const w=planWindow(st.site,st.frame,st.y,st.site);
  if(!w.plan)return {ok:false,reason:w.reach?'升梯掃掠會碰到建物，無法貼近起火窗口':'此車位無法到達起火窗口'};
  st.legs.push(w.plan.waypoints);st.raise=legPath(w.plan.waypoints);st.target=w.target;st.standoff=w.standoff;st.phase='raising';st.t=0;st.blocked=null;return {ok:true,standoff:w.standoff};
 }
 const victimAboard=()=>st.victim&&['boarding','basket','unloading'].includes(st.victim.state);
 function canRetract(){return st.phase==='ready'||st.phase==='ground'||(!!st.blocked&&!victimAboard()&&['deploying','raising'].includes(st.phase)&&(st.phase!=='deploying'||st.t>TIMELINE.raise[0]));}
 // 收梯：把已走過的各段路徑倒序走回（每段都已核對過），再收支腿。
 function backPath(){
  // 優先：由目前姿態直接規劃回收梯位置（經同一避碰檢查）；不可行時沿走過的路徑倒序退回。
  const direct=motion.plan(motion.rest);if(direct)return legPath([...direct.waypoints,restPose]);
  const pts=[motion.pose];for(const leg of [...st.legs].reverse())for(const w of [...leg].reverse())pts.push(w);return legPath(pts.filter((p,i)=>!i||p.some((v,j)=>Math.abs(v-pts[i-1][j])>1e-6)));}
 function retract(){if(!canRetract())return false;st.back=backPath();st.phase='retracting';st.t=0;st.spraying=false;st.arrived=false;st.blocked=null;setGate(0);return true;}
 function dismiss(){if(st.phase!=='parked'&&st.phase!=='idle')return false;st.phase='idle';setLitter(false);groundLitter.visible=false;frame.visible=crewRoot.visible=false;pads.forEach(p=>p.visible=false);envelope=createEnvelope([]);return true;}
 // 立即收回並撤離（改派任務時使用）：依原路徑倒退，每步仍做避碰檢查。
 function stow(){if(st.phase==='idle')return;if(st.legs.length&&!['parked','idle'].includes(st.phase)){const back=backPath();for(let t=0;t<=back.total+.05;t+=.05)motion.move(legAt(back,t));}
  setGate(0);grounding.update(0,0);source.updateMatrixWorld(true);st.phase='parked';dismiss();}
 // 預覽外框（世界座標）：車身與四個支腿墊板。
 function outline(f){const b=layout.body,p=AERIAL.padSize/2,rect=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]].map(([x,z])=>fromFrameXZ(f,x,z));return [rect(b.minX,b.minZ,b.maxX,b.maxZ),...layout.feet.map(([x,z])=>rect(x-p,z-p,x+p,z+p))];}
 const station=()=>slew.localToWorld(new T.Vector3(.3,.335,.8));
 function crewRoutes(){const s=steps.map(W),basket=[...s,grounding.local(1.5,2.675,-.8),grounding.local(-1,2.675,-.8),W(new T.Vector3(motion.rest.x,motion.rest.y,motion.rest.z-.6)),W(motion.rest.clone().add(new T.Vector3(-.28,0,0)))];return {s,basket,operator:[...s,station()]};}
 function crewStart(i){return [W(steps[0].clone().add(new T.Vector3(-2-i,0,-1))),W(steps[0].clone().add(new T.Vector3(0,0,-i*.65)))];}
 const cageQ=()=>swivel.getWorldQuaternion(new T.Quaternion());
 function poseCrewAtWork(actual){const q=cageQ();[0,1].forEach(i=>{const p=crew[i];p.legs.forEach(l=>l.rotation.x=0);p.arms?.forEach(l=>l.rotation.x=0);feetOf(p,i===0?W(actual).add(new T.Vector3(-.28,0,0).applyQuaternion(q)):station());p.body.rotation.y=slew.rotation.y+st.frame.heading;});}
 // 待救者：腳底位置沿折線移動（跨窗台、進籃、下籃），走動時擺腿。
 const victimSpot=actual=>W(actual).add(new T.Vector3(.28,0,0).applyQuaternion(cageQ()));
 const litterPos=()=>swivel.localToWorld(LITTER_TOP.clone());
 function placeOnLitter(pos,q){const f=st.victim.figure;f.root.position.copy(pos);f.root.quaternion.copy(q);}
 function walkPerson(p,points,q){const n=points.length-1,s=T.MathUtils.clamp(q,0,1)*n,i=Math.min(n-1,Math.floor(s)),pos=points[i].clone().lerp(points[i+1],smooth(s-i)),d=points[i+1].clone().sub(points[i]);
  if(d.x*d.x+d.z*d.z>1e-4)p.body.rotation.y=Math.atan2(-d.x,-d.z);const moving=q>0&&q<1;p.legs.forEach((l,k)=>l.rotation.x=moving?Math.sin(q*30+k*Math.PI)*.3:0);feetOf(p,pos);}
 function moveVictim(points,q,walking){const v=st.victim,f=v.figure;const n=points.length-1,s=T.MathUtils.clamp(q,0,1)*n,i=Math.min(n-1,Math.floor(s));f.root.position.copy(points[i]).lerp(points[i+1],smooth(s-i));
  const d=points[i+1].clone().sub(points[i]);if(d.x*d.x+d.z*d.z>1e-4)f.root.rotation.y=Math.atan2(-d.x,-d.z);const stride=walking?Math.sin(q*40)*.3:0;f.legs[0].rotation.x=stride;f.legs[1].rotation.x=-stride;f.arms.forEach(a=>a.rotation.x=0);}
 function stepMotion(candidate){const result=motion.move(candidate);if(!result.safe&&!st.blocked){st.blocked=result.reason||'升梯路徑接近建物，已停止動作';return {result,event:{blocked:true,reason:st.blocked}};}return {result,event:null};}
 // 每幀更新：回傳事件 {blocked, reason} / {arrived} / {aboard} / {landed} / {rescued} / {parked}。
 function update(dt,{fire=null,fireActive=false}={}){
  if(st.phase==='idle')return null;
  st.t+=dt;const t=st.t;let event=null,actual=st.actual??motion.clearance().position;
  for(const m of beacons)m.emissiveIntensity=Math.sin((st.beacon=(st.beacon??0)+dt)*14)>0?5:.15;
  const ph=st.phase;
  if(ph==='deploying'){
   grounding.update(smooth((t-TIMELINE.spread[0])/(TIMELINE.spread[1]-TIMELINE.spread[0])),smooth((t-TIMELINE.down[0])/(TIMELINE.down[1]-TIMELINE.down[0])));
   pads.forEach(p=>p.visible=t>=TIMELINE.down[1]-.5);
   let candidate=motion.pose;if(t>TIMELINE.raise[0])candidate=motion.at(st.plan,Math.min(t-TIMELINE.raise[0],TIMELINE.raise[1]-TIMELINE.raise[0]),true);
   if(st.blocked)actual=motion.clearance().position;else{const r=stepMotion(candidate);actual=r.result.position;event=r.event;}
   const routes=crewRoutes();
   for(let i=0;i<2;i++){const p=crew[i];if(t<TIMELINE.board[0]){const [a,b]=crewStart(i);walkBoarding(p,[a,b],smooth(t/5),feetOf);}
    else if(t<TIMELINE.raise[0])walkBoarding(p,i===0?routes.basket:routes.operator,T.MathUtils.clamp((t-TIMELINE.board[0]-i*.7)/(7-i*.7),0,1),feetOf);
    else poseCrewAtWork(actual);}
   if(t>=TIMELINE.raise[1]&&!st.blocked&&actual.distanceTo(st.target)<.05){st.arrived=true;st.t=0;if(st.task==='rescue'){st.phase='rescue';st.victim.state='boarding';event={arrived:true,rescue:true};}else{st.phase='ready';event={arrived:true};}}
  }else if(ph==='rescue'&&st.stretcher){
   // 擔架：開籃門 → 籃內隊員協助將傷患由窗口移到籃架前緣擔架（仰躺）→ 固定 → 關門 → 規劃載人下降路徑。
   const G=TIMELINE.gate,X=TIMELINE.transfer,S=TIMELINE.secure,C=TIMELINE.gateClose,v=st.victim,top=litterPos(),q=cageQ();
   setGate(t<G+X+S?smooth(t/G):1-smooth((t-G-X-S)/C));
   if(t<G){}else if(t<G+X){const k=smooth((t-G)/X);if(v.figure.pose!=='lying')v.figure.setPose('lying');const lift=v.window.clone().add(new T.Vector3(st.site.nx*.5,.5,st.site.nz*.5));
    const pos=k<.5?v.window.clone().lerp(lift,k*2):lift.clone().lerp(top,k*2-1);placeOnLitter(pos,v.windowQ.clone().slerp(q,k));}
   else{v.state='basket';placeOnLitter(top,q);
    // 固定：先上頸圈（有頭頸部撞擊機轉時），再扣上三條固定帶。
    if(v.collar&&!v.figure.collar.visible){v.figure.setCollar(true);event??={collar:true};}
    if(t>=G+X+S*.4&&!st.strapped){st.strapped=true;setLitter(true,true);event??={strapped:true};}}
   poseCrewAtWork(actual);if(t>=G&&t<G+X+S)crew[0].arms.forEach(a=>a.rotation.x=-1.1);
   if(t>=G+X+S+C){const l=planLanding();if(!l){if(!st.blocked){st.blocked='找不到可安全降落的地面位置（車尾、街側、車頭外側皆會碰到建物或車輛）';event={blocked:true,reason:st.blocked};}}
    else{st.legs.push(l.plan.waypoints);st.lower=legPath(l.plan.waypoints,TIMELINE.lowerSlow);st.landing=l.target;st.phase='lowering';st.t=0;event={aboard:true};}}
  }else if(ph==='rescue'){
   // 開籃門 → 待救者跨窗台進籃 → 關門 → 規劃載人下降路徑。
   const G=TIMELINE.gate,B=TIMELINE.boardVictim,C=TIMELINE.gateClose,v=st.victim,sill=v.window.clone().add(new T.Vector3(st.site.nx*.45,AERIAL.sill,st.site.nz*.45)),inside=victimSpot(actual);
   setGate(t<G+B?smooth(t/G):1-smooth((t-G-B)/C));
   if(t<G)moveVictim([v.window,v.window],0,false);else if(t<G+B)moveVictim([v.window,sill,inside],(t-G)/B,true);else{v.state='basket';moveVictim([inside,inside],1,false);}
   poseCrewAtWork(actual);
   if(t>=G+B+C){const l=planLanding();if(!l){if(!st.blocked){st.blocked='找不到可安全降落的地面位置（車尾、街側、車頭外側皆會碰到建物或車輛）';event={blocked:true,reason:st.blocked};}}
    else{st.legs.push(l.plan.waypoints);st.lower=legPath(l.plan.waypoints,TIMELINE.lowerSlow);st.landing=l.target;st.phase='lowering';st.t=0;event={aboard:true};}}
  }else if(ph==='lowering'||ph==='raising'){
   const path=ph==='lowering'?st.lower:st.raise;
   if(st.blocked)actual=motion.clearance().position;else{const r=stepMotion(legAt(path,t));actual=r.result.position;event=r.event;}
   poseCrewAtWork(actual);if(ph==='lowering'){if(st.stretcher)placeOnLitter(litterPos(),cageQ());else{const sp=victimSpot(actual);moveVictim([sp,sp],1,false);}}
   if(!st.blocked&&t>=path.total){if(ph==='lowering'){st.phase='unloading';st.t=0;st.victim.state='unloading';event={landed:true};}else{st.phase='ready';st.t=0;st.arrived=true;event={arrived:true};}}
  }else if(ph==='unloading'&&st.stretcher){
   // 擔架：開門 → 擔架自籃架卸下放到地面 → 籃內隊員下籃與擔架一同移到交接位置（遠離車身 3.5 m）→ 隊員回籃 → 關門。
   const G=TIMELINE.gate,K=TIMELINE.carry,R=TIMELINE.crewBack,v=st.victim,[lx,lz]=[st.landing.x,st.landing.z],l=Math.hypot(lx,lz)||1,q=cageQ();
   if(!st.carry){const mount=litterPos(),gq=new T.Quaternion();litter.getWorldQuaternion(gq);const yaw=new T.Euler().setFromQuaternion(q,'YXZ').y,lq=new T.Quaternion().setFromEuler(new T.Euler(0,yaw,0));
    const off=(d,h)=>{const w=W(new T.Vector3(lx+lx/l*d,0,lz+lz/l*d));w.y=ground.at(w.x,w.z)+h;return w;};
    const side=new T.Vector3(.75,0,0).applyQuaternion(lq),basketCrew=W(actual).add(new T.Vector3(-.28,0,0).applyQuaternion(q));
    st.carry={mount,lq,litterPath:[mount,off(1.2,.35),off(3.5,.35)],crewPath:[basketCrew,off(1.0,0).add(side),off(3.3,0).add(side)]};}
   const c=st.carry;setGate(t<G+K+R?smooth(t/G):1-smooth((t-G-K-R)/G));
   if(t>=G&&litter.children[0].visible){setLitter(false);setGroundStraps(!!st.strapped);groundLitter.visible=true;}
   const k=T.MathUtils.clamp((t-G)/K,0,1),n=c.litterPath.length-1,s2=k*n,i=Math.min(n-1,Math.floor(s2)),lp=c.litterPath[i].clone().lerp(c.litterPath[i+1],smooth(s2-i));
   if(t>=G){groundLitter.position.copy(lp).sub(LITTER_TOP.clone().applyQuaternion(c.lq));groundLitter.quaternion.copy(c.lq);placeOnLitter(lp,c.lq);}
   if(t<G)poseCrewAtWork(actual);else if(t<G+K)walkPerson(crew[0],c.crewPath,k);else if(t<G+K+R)walkPerson(crew[0],[...c.crewPath].reverse(),(t-G-K)/R);else poseCrewAtWork(actual);
   {const p=crew[1];p.legs.forEach(x=>x.rotation.x=0);feetOf(p,station());p.body.rotation.y=slew.rotation.y+st.frame.heading;}
   if(t>=G+K+R+G){v.state='rescued';v.handover=c.litterPath.at(-1).clone();st.carry=null;st.stretcher=false;st.phase='ground';st.t=0;event={rescued:true};}
  }else if(ph==='unloading'){
   // 開門 → 待救者下籃走到交接位置（遠離車身 3 m）→ 關門。
   const G=TIMELINE.gate,U=TIMELINE.unload,v=st.victim,inside=victimSpot(actual),[lx,lz]=[st.landing.x,st.landing.z],l=Math.hypot(lx,lz)||1;
   const out=W(new T.Vector3(lx+lx/l*1.2,0,lz+lz/l*1.2)),hand=W(new T.Vector3(lx+lx/l*3.5,0,lz+lz/l*3.5));out.y=ground.at(out.x,out.z);hand.y=ground.at(hand.x,hand.z);
   setGate(t<G+U?smooth(t/G):1-smooth((t-G-U)/G));
   if(t<G)moveVictim([inside,inside],0,false);else if(t<G+U)moveVictim([inside,out,hand],(t-G)/U,true);else moveVictim([hand,hand],1,false);
   poseCrewAtWork(actual);
   if(t>=G+U+G){v.state='rescued';v.handover=hand;st.phase='ground';st.t=0;event={rescued:true};}
  }else if(ph==='ready'||ph==='ground'){
   if(!st.blocked){const r=stepMotion(motion.pose);actual=r.result.position;event=r.event;}
   poseCrewAtWork(actual);
  }else if(ph==='retracting'){
   const R=st.back.total,C=TIMELINE.crewDown,U=TIMELINE.legsUp,I=TIMELINE.legsIn;
   const r=stepMotion(t<R?legAt(st.back,t):[...st.back.waypoints.at(-1)]);actual=r.result.position;event=r.event;
   const routes=crewRoutes();
   if(t<R)poseCrewAtWork(actual);
   else if(t<R+C)for(let i=0;i<2;i++)walkBoarding(crew[i],[...(i===0?routes.basket:routes.operator)].reverse(),T.MathUtils.clamp((t-R)/C,0,1),feetOf);
   grounding.update(1-smooth((t-R-C-U)/I),1-smooth((t-R-C)/U));
   pads.forEach(p=>p.visible=t<R+C+U*.8);
   if(t>=R+C+U+I){st.phase='parked';event={parked:true};}
  }
  // 籃架砲塔對準起火點出水（大水霧示意）；瞄準須通過同一避碰檢查。救人時不出水。
  st.spraying=false;
  if(st.phase==='ready'&&!st.blocked&&fire&&fireActive)st.spraying=monitor.aimAt(new T.Vector3(fire.x,fire.y,fire.z));
  st.actual=actual;source.updateMatrixWorld(true);
  return event;
 }
 // 噴嘴口與方向（世界座標），供水霧粒子使用。
 function nozzle(){return {origin:monitor.muzzle.getWorldPosition(new T.Vector3()),dir:monitor.direction().normalize()};}
 // 步行／行車碰撞：車身三個圓；支腿展開後加上四個墊板。
 function circles(){if(st.phase==='idle')return [];const f=st.frame,out=[-3.2,0,3.2].map(o=>[...fromFrameXZ(f,o,0),1.4]);if(st.phase!=='deploying'||st.t>TIMELINE.spread[0])layout.feet.forEach(([lx,lz])=>out.push([...fromFrameXZ(f,lx,lz),.45]));return out;}
 return {litter,groundLitter,setLitter,frame,source,motion,monitor,grounding,layout,state:st,crew,preview,check,deploy,retract,canRetract,raiseToFire,dismiss,stow,outline,update,nozzle,circles,envelope:()=>envelope};
}
