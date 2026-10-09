// 信義街景・雲梯車作業（訓練示意）：依官方 LOD1 量體做作業距離核對與升梯掃掠避碰。
// 沿用首頁已確認的雲梯車型（aerial-ladder.glb）、支腿機構（aerial-grounding）、籃架旋轉與砲塔（native-cage）
// 及升梯運動（aerial-motion）；只把避碰邊界由首頁街景的兩道立面換成信義的真實量體。
// 幾何皆為模型示意，非原廠作業曲線、支腿反力或地盤承載核定；LOD1 量體不含陽臺、雨遮、招牌與騎樓等突出物。
import * as T from 'three';
import {project} from './xinyi-street-world.js?v=s12';
import {createAerialMotion} from './aerial-motion.js?v=s12';
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
export function basketTarget(site,frame,standoff,y){
 const [lx,lz]=toFrameXZ(frame,site.x+site.nx*standoff,site.z+site.nz*standoff);
 return new T.Vector3(lx,site.base+(site.floor-1)*AERIAL.floorHeight+AERIAL.sill-y,lz);
}

// ---------- 車輛與動作 ----------
const smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
// 時間軸（秒）：與首頁相同——人員走到車側 0–5、支腿伸出 5–9、落地 9–12、登車 12–19、升梯 19–38，之後籃架出水。
export const TIMELINE={spread:[5,9],down:[9,12],board:[12,19],raise:[19,38],retract:17,crewDown:7,legsUp:3,legsIn:4};

export function createXinyiAerial({scene,source,createPerson,ground,obstacleIndex}){
 const frame=new T.Group();frame.name='Xinyi_aerial_frame';scene.add(frame);frame.visible=false;
 // 車型輪胎底面在模型原點高度；首頁路面為 -0.065，這裡直接貼框架地面。
 source.position.set(0,0,0);frame.add(source);frame.updateMatrixWorld(true);
 const get=n=>source.getObjectByName(n),slew=get('Turntable_slew'),elevation=get('Ladder_elevation'),level=get('Cage_level'),floor=get('Cage_floor'),extensions=[2,3,4].map(n=>get('Ladder_extend_'+n));
 if(!slew||!elevation||!level||!floor||extensions.some(o=>!o))throw new Error('雲梯車型缺少升梯節點');
 const floorBox=new T.Box3().setFromBufferAttribute(floor.geometry.attributes.position),anchor=floorBox.getCenter(new T.Vector3());anchor.y=floorBox.max.y;
 const swivel=createCageSwivel(level,floor,anchor),monitor=createNativeMonitor(source,swivel);
 const beacons=[];source.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;if(/beacon|warning|LED strip/i.test(o.material?.name||'')){o.material=o.material.clone();o.material.color.set('#c61f16');o.material.emissive.set('#ff180a');beacons.push(o.material);}});
 const grounding=createGrounding(source);
 let envelope=createEnvelope([]);
 const motion=createAerialMotion(source,{slew,elevation,level,floor,extensions,anchor,envelope:boxes=>envelope(boxes)});
 monitor.validate=()=>motion.clearance().safe;
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
 const st={phase:'idle',t:0,frame:null,site:null,plan:null,target:null,blocked:null,arrived:false,spraying:false,standoff:null};

 function setFrame(f,y){frame.position.set(f.x,y,f.z);frame.rotation.set(0,f.heading,0);frame.updateMatrixWorld(true);}
 function roadsFrom(features){const out=[];for(const ft of features){if(ft.kind!=='road'||!(ft.width>0))continue;for(const path of ft.paths)for(let i=1;i<path.length;i++){const [ax,az]=project(...path[i-1]),[bx,bz]=project(...path[i]);out.push([ax,az,bx,bz,ft.width/2]);}}return out;}
 let roads=null;
 function frameY(f){return Math.max(...layout.feet.map(([lx,lz])=>ground.at(...fromFrameXZ(f,lx,lz))));}
 // 即時預覽用的作業距離核對。
 function preview(site,x,z,{engine=null,features=null}={}){
  if(features&&!roads)roads=roadsFrom(features);
  const f=aerialFrame(site,x,z),y=frameY(f),extra=engine?boxObstacle('engine',engine.x,engine.z,engine.heading,7.6,3.1,3.6,ground.at(engine.x,engine.z)):[];
  const obstacles=localObstacles(obstacleIndex,f,{y,extra});
  return {frame:f,y,obstacles,...checkFootprint({frame:f,site,layout,obstacles,groundAt:ground.at,roads:roads??[],engine})};
 }
 // 完整核對：作業距離＋升梯路徑（同一窗口，依序嘗試籃架距外牆距離）。成功時保留結果供 deploy。
 function check(site,x,z,opts={}){
  if(st.phase!=='idle'&&st.phase!=='parked')return {ok:false,issues:['雲梯作業中，請先收梯'],warnings:[]};
  const r=preview(site,x,z,opts);if(!r.ok)return r;
  const restore=()=>{if(st.frame&&st.phase==='parked'){setFrame(st.frame,st.y);envelope=createEnvelope(st.result.obstacles,{groundAt:(lx,lz)=>ground.at(...fromFrameXZ(st.frame,lx,lz))-st.y});}else envelope=createEnvelope([]);};
  setFrame(r.frame,r.y);envelope=createEnvelope(r.obstacles,{groundAt:(lx,lz)=>ground.at(...fromFrameXZ(r.frame,lx,lz))-r.y});
  let reach=false;
  for(const standoff of AERIAL.standoffs){const target=basketTarget(site,r.frame,standoff,r.y);if(motion.solve(target))reach=true;const plan=motion.plan(target);
   if(plan){restore();return {...r,ok:true,plan,target,standoff,floor:site.floor,targetHeight:target.y,radius:Math.hypot(target.x-motion.origin.x,target.z-motion.origin.z)};}}
  restore();
  return {...r,ok:false,issues:[reach?`升梯掃掠會碰到建物或籃架無法貼近 ${site.floor} 樓窗口（已試籃架距外牆 ${AERIAL.standoffs.join('／')} m）`:`此位置超出雲梯模型可達範圍，無法到達 ${site.floor} 樓窗口（試著調整與外牆距離）`]};
 }
 function deploy(result,site){
  if(!result?.ok||!result.plan)return false;
  setFrame(result.frame,result.y);envelope=createEnvelope(result.obstacles,{groundAt:(lx,lz)=>ground.at(...fromFrameXZ(result.frame,lx,lz))-result.y});
  Object.assign(st,{phase:'deploying',t:0,frame:result.frame,y:result.y,site,plan:result.plan,target:result.target,standoff:result.standoff,blocked:null,arrived:false,spraying:false,result});
  frame.visible=crewRoot.visible=true;
  layout.feet.forEach(([lx,lz],i)=>{const [x,z]=fromFrameXZ(result.frame,lx,lz),g=ground.at(x,z),top=result.y+layout.footBottom,h=Math.max(.05,top-g);pads[i].scale.y=h;pads[i].position.set(x,g+h/2,z);});
  return true;
 }
 function retract(){if(st.phase!=='ready'&&!(st.phase==='deploying'&&st.blocked&&st.t>TIMELINE.raise[0]))return false;
  const start=motion.pose;st.back={waypoints:[start,...st.plan.waypoints.slice(0,-1).reverse()]};st.phase='retracting';st.t=0;st.spraying=false;st.arrived=false;st.blocked=null;return true;}
 function dismiss(){if(st.phase!=='parked'&&st.phase!=='idle')return false;st.phase='idle';frame.visible=crewRoot.visible=false;pads.forEach(p=>p.visible=false);envelope=createEnvelope([]);return true;}
 // 立即收回並撤離（改派任務時使用）：依原路徑倒退，每步仍做避碰檢查。
 function stow(){if(st.phase==='idle')return;if(st.plan&&!['parked','idle'].includes(st.phase)){const back={waypoints:[motion.pose,...st.plan.waypoints.slice(0,-1).reverse()]};for(let t=0;t<=17;t+=.05)motion.move(motion.at(back,t));}
  grounding.update(0,0);source.updateMatrixWorld(true);st.phase='parked';dismiss();}
 // 預覽外框（世界座標）：車身與四個支腿墊板。
 function outline(f){const b=layout.body,p=AERIAL.padSize/2,rect=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]].map(([x,z])=>fromFrameXZ(f,x,z));return [rect(b.minX,b.minZ,b.maxX,b.maxZ),...layout.feet.map(([x,z])=>rect(x-p,z-p,x+p,z+p))];}
 const station=()=>slew.localToWorld(new T.Vector3(.3,.335,.8));
 function crewRoutes(){const s=steps.map(W),basket=[...s,grounding.local(1.5,2.675,-.8),grounding.local(-1,2.675,-.8),W(new T.Vector3(motion.rest.x,motion.rest.y,motion.rest.z-.6)),W(motion.rest.clone().add(new T.Vector3(-.28,0,0)))];return {s,basket,operator:[...s,station()]};}
 function crewStart(i){return [W(steps[0].clone().add(new T.Vector3(-2-i,0,-1))),W(steps[0].clone().add(new T.Vector3(0,0,-i*.65)))];}
 function poseCrewAtWork(actual){const q=swivel.getWorldQuaternion(new T.Quaternion());[0,1].forEach(i=>{const p=crew[i];p.legs.forEach(l=>l.rotation.x=0);feetOf(p,i===0?W(actual).add(new T.Vector3(-.28,0,0).applyQuaternion(q)):station());p.body.rotation.y=slew.rotation.y+st.frame.heading;});}
 // 每幀更新：回傳 {blocked, reason} 供頁面提示。
 function update(dt,{fire=null,fireActive=false}={}){
  if(st.phase==='idle')return null;
  st.t+=dt;const t=st.t;let event=null;
  for(const m of beacons)m.emissiveIntensity=Math.sin(t*14)>0?5:.15;
  if(st.phase==='deploying'||st.phase==='ready'){
   grounding.update(smooth((t-TIMELINE.spread[0])/(TIMELINE.spread[1]-TIMELINE.spread[0])),smooth((t-TIMELINE.down[0])/(TIMELINE.down[1]-TIMELINE.down[0])));
   pads.forEach(p=>p.visible=t>=TIMELINE.down[1]-.5);
   let candidate=motion.pose;if(t>TIMELINE.raise[0])candidate=motion.at(st.plan,Math.min(t-TIMELINE.raise[0],TIMELINE.raise[1]-TIMELINE.raise[0]),true);
   const result=st.blocked?{safe:false,position:motion.clearance().position}:motion.move(candidate),actual=result.position;
   if(!result.safe&&!st.blocked){st.blocked=result.reason||'升梯路徑接近建物，已停止動作';event={blocked:true,reason:st.blocked};}
   const routes=crewRoutes();
   for(let i=0;i<2;i++){const p=crew[i];if(t<TIMELINE.board[0]){const [a,b]=crewStart(i);walkBoarding(p,[a,b],smooth(t/5),feetOf);}
    else if(t<TIMELINE.raise[0])walkBoarding(p,i===0?routes.basket:routes.operator,T.MathUtils.clamp((t-TIMELINE.board[0]-i*.7)/(7-i*.7),0,1),feetOf);
    else poseCrewAtWork(actual);}
   if(st.phase==='deploying'&&t>=TIMELINE.raise[1]&&!st.blocked&&actual.distanceTo(st.target)<.05){st.phase='ready';st.arrived=true;event={arrived:true};}
   // 籃架砲塔對準起火點出水（大水霧示意）；瞄準須通過同一避碰檢查。
   st.spraying=false;
   if(st.phase==='ready'&&fire&&fireActive){st.spraying=monitor.aimAt(new T.Vector3(fire.x,fire.y,fire.z));}
  }else if(st.phase==='retracting'){
   const R=TIMELINE.retract,C=TIMELINE.crewDown,U=TIMELINE.legsUp,I=TIMELINE.legsIn;
   const candidate=t<R?motion.at(st.back,t):[...st.back.waypoints.at(-1)],result=motion.move(candidate);
   if(!result.safe&&!st.blocked){st.blocked=result.reason;event={blocked:true,reason:st.blocked};}
   const routes=crewRoutes();
   if(t<R)poseCrewAtWork(result.position);
   else if(t<R+C)for(let i=0;i<2;i++)walkBoarding(crew[i],[...(i===0?routes.basket:routes.operator)].reverse(),T.MathUtils.clamp((t-R)/C,0,1),feetOf);
   grounding.update(1-smooth((t-R-C-U)/I),1-smooth((t-R-C)/U));
   pads.forEach(p=>p.visible=t<R+C+U*.8);
   if(t>=R+C+U+I){st.phase='parked';event={parked:true};}
  }
  source.updateMatrixWorld(true);
  return event;
 }
 // 噴嘴口與方向（世界座標），供水霧粒子使用。
 function nozzle(){return {origin:monitor.muzzle.getWorldPosition(new T.Vector3()),dir:monitor.direction().normalize()};}
 // 步行／行車碰撞：車身三個圓；支腿展開後加上四個墊板。
 function circles(){if(st.phase==='idle')return [];const f=st.frame,out=[-3.2,0,3.2].map(o=>[...fromFrameXZ(f,o,0),1.4]);if(st.phase!=='idle'&&(st.t>TIMELINE.spread[0]||st.phase!=='deploying'))layout.feet.forEach(([lx,lz])=>out.push([...fromFrameXZ(f,lx,lz),.45]));return out;}
 return {frame,source,motion,monitor,grounding,layout,state:st,crew,preview,check,deploy,retract,dismiss,stow,outline,update,nozzle,circles,envelope:()=>envelope};
}
