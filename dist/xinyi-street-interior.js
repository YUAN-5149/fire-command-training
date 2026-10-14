// 信義街景・建物內部（訓練示意）：起火樓層的示意平面、第一人稱進入、門窗開關與破壞進入、煙層與能見度、
// 熱顯像儀、隊員指令（跟隨、搜索、開窗排煙、撤離）、排煙機與照明燈、閃燃／回燃徵兆。
// 室內格局不是該建物實際平面；溫度、煙、含氧量與時間皆為遊戲化示意（規則見 xinyi-street-interior-rules.js）。
import * as T from 'three';
import {createPatient} from './xinyi-street-aerial.js?v=s19';
import {INTERIOR,ENV,EXPOSURE,FORCE,seeded,makeFloorPlan,spaceOf,spaceById,wallSegments,resolveCircle,makeEnv,stepEnv,backdraftRisk,applyBackdraft,openingOutcome,
 layerHeight,feltTemp,visibility,stepExposure,hoseRemaining,pathDoors,searchTime,thermalColor,ppvState} from './xinyi-street-interior-rules.js?v=s19';

const H=INTERIOR.ceiling;
function tex(size,draw){const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;return t;}
function sprite(inner,outer){return tex(64,(g,s)=>{const r=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);r.addColorStop(0,inner);r.addColorStop(1,outer);g.fillStyle=r;g.fillRect(0,0,s,s);});}
const floorTex=tex(128,(g,s)=>{g.fillStyle='#7a6a58';g.fillRect(0,0,s,s);g.strokeStyle='#6a5b4a';g.lineWidth=3;for(let i=0;i<=4;i++){g.beginPath();g.moveTo(0,i*s/4);g.lineTo(s,i*s/4);g.stroke();}});
const wallTex=tex(128,(g,s)=>{g.fillStyle='#cfc8ba';g.fillRect(0,0,s,s);for(let i=0;i<400;i++){g.fillStyle=`rgba(0,0,0,${Math.random()*.05})`;g.fillRect(Math.random()*s,Math.random()*s,2,2);}});

export function createInterior({createPerson}){
 const scene=new T.Scene();scene.background=new T.Color('#141416');scene.fog=new T.FogExp2('#2c2c2e',.05);
 const amb=new T.HemisphereLight('#c9d3e0','#2a2420',.35);scene.add(amb);
 const torch=new T.SpotLight('#fff3d6',5,14,.5,.6,2);scene.add(torch,torch.target);
 const fireLight=new T.PointLight('#ff7a2a',0,14,1.4);scene.add(fireLight);
 const root=new T.Group();scene.add(root);
 const P=n=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(n*3),3));return g;};
 const pts=(n,map,size,blending,opacity)=>{const p=new T.Points(P(n),new T.PointsMaterial({map,size,transparent:true,opacity,depthWrite:false,blending,sizeAttenuation:true}));p.frustumCulled=false;scene.add(p);return p;};
 const flames=pts(160,sprite('rgba(255,236,160,1)','rgba(255,90,10,0)'),.9,T.AdditiveBlending,.95);
 const roll=pts(200,sprite('rgba(255,170,60,.9)','rgba(255,60,0,0)'),1.1,T.AdditiveBlending,.85);
 const burst=pts(240,sprite('rgba(255,220,140,1)','rgba(255,70,0,0)'),1.4,T.AdditiveBlending,.95);
 const water=pts(220,sprite('rgba(220,240,255,.95)','rgba(180,220,255,0)'),.18,T.NormalBlending,.85);roll.visible=burst.visible=water.visible=false;
 const fl=[...Array(160)].map(()=>({t:Math.random(),u:Math.random()-.5,v:Math.random()-.5})),rl=[...Array(200)].map(()=>({t:Math.random(),u:Math.random(),v:Math.random()})),bl=[...Array(240)].map(()=>({d:new T.Vector3(Math.random()-.5,Math.random()*.6,Math.random()-.5).normalize(),s:1+Math.random()*3})),wl=[...Array(220)].map((_,i)=>({t:i/220,u:Math.random()-.5,v:Math.random()-.5}));
 const hoseMesh=new T.Mesh(new T.BufferGeometry(),new T.MeshStandardMaterial({color:'#d8c27a',roughness:.7}));scene.add(hoseMesh);
 const nozzle=new T.Mesh(new T.CylinderGeometry(.022,.032,.32,10),new T.MeshLambertMaterial({color:'#2b2b2b'}));scene.add(nozzle);

 let plan=null,env=null,segs=[],meshes=[],doorMeshes=new Map(),windowMeshes=new Map(),smokeBoxes=new Map(),victimFigs=new Map(),crew=[],placed={fan:null,light:[]};
 const me={x:0,z:0,crouch:false,exposure:0,maxExposure:0,thermal:false,trail:[],hoseIn:false,hoseBudget:0,forcing:null,pending:null,burstT:0,shake:0,items:{}};
 const log=[];let api=null,lastPpv={on:false},stepInfo={cap:1,Ieff:0};
 const mat=c=>new T.MeshStandardMaterial({color:c,roughness:.85});
 function addMesh(m,heat){m.userData.heat=heat;m.userData.mat=m.material;meshes.push(m);root.add(m);return m;}
 function box(w,h,d,x,y,z,material,heat){const m=new T.Mesh(new T.BoxGeometry(w,h,d),material);m.position.set(x,y,z);return addMesh(m,heat);}
 const spaceT=id=>env?.spaces[id]?.T??ENV.ambient;

 function clearAll(){for(const m of meshes){m.geometry.dispose();}root.clear();meshes=[];doorMeshes.clear();windowMeshes.clear();smokeBoxes.clear();victimFigs.clear();crew=[];placed={fan:null,light:[]};}
 function build(){
  clearAll();const {W,D}=plan;
  for(const s of plan.spaces){const w=s.x1-s.x0,d=s.z1-s.z0,cx=(s.x0+s.x1)/2,cz=(s.z0+s.z1)/2;
   const fm=new T.MeshStandardMaterial({map:floorTex.clone(),roughness:.9});fm.map.repeat.set(w/1.5,d/1.5);fm.map.needsUpdate=true;
   const f=new T.Mesh(new T.PlaneGeometry(w,d),fm);f.rotation.x=-Math.PI/2;f.position.set(cx,0,cz);addMesh(f,()=>ENV.ambient+(spaceT(s.id)-ENV.ambient)*.2);
   const c=new T.Mesh(new T.PlaneGeometry(w,d),mat('#8f8a82'));c.rotation.x=Math.PI/2;c.position.set(cx,H,cz);addMesh(c,()=>ENV.ambient+(spaceT(s.id)-ENV.ambient)*.85);
   const sm=new T.Mesh(new T.BoxGeometry(w-.02,1,d-.02),new T.MeshBasicMaterial({color:'#262628',transparent:true,opacity:.5,depthWrite:false,side:T.DoubleSide}));sm.position.set(cx,H-.5,cz);root.add(sm);smokeBoxes.set(s.id,sm);}
  const wm=new T.MeshStandardMaterial({map:wallTex,roughness:.9});
  const near=(x,z)=>plan.spaces.filter(s=>x>=s.x0-.2&&x<=s.x1+.2&&z>=s.z0-.2&&z<=s.z1+.2).map(s=>s.id);
  const wallHeat=ids=>()=>ENV.ambient+(Math.max(...ids.map(spaceT))-ENV.ambient)*.45;
  for(const [ax,az,bx,bz] of wallSegments(plan,{withDoors:false})){const len=Math.hypot(bx-ax,bz-az),horiz=Math.abs(bz-az)<1e-6;if(len<.05)continue;const mx=(ax+bx)/2,mz=(az+bz)/2,ids=near(mx,mz);
   // 外牆窗洞：窗台 0.9 m 以下與 2.1 m 以上為牆，窗洞內放玻璃。
   const wins=horiz?plan.windows.filter(w=>Math.abs(w.z-az)<1e-6&&w.x>Math.min(ax,bx)&&w.x<Math.max(ax,bx)):[];
   if(!wins.length){box(horiz?len:.15,H,horiz?.15:len,mx,H/2,mz,wm,wallHeat(ids));continue;}
   let x=Math.min(ax,bx);const end=Math.max(ax,bx);for(const w of wins.sort((a,b)=>a.x-b.x)){const a=w.x-INTERIOR.windowWidth/2,b=w.x+INTERIOR.windowWidth/2;if(a>x)box(a-x,H,.15,(x+a)/2,H/2,az,wm,wallHeat(ids));box(INTERIOR.windowWidth,.9,.15,w.x,.45,az,wm,wallHeat(ids));box(INTERIOR.windowWidth,H-2.1,.15,w.x,(H+2.1)/2,az,wm,wallHeat(ids));
    const glass=new T.Mesh(new T.PlaneGeometry(INTERIOR.windowWidth,1.2),new T.MeshStandardMaterial({color:'#9fb7c9',transparent:true,opacity:.45,roughness:.1,side:T.DoubleSide}));glass.position.set(w.x,1.5,az);addMesh(glass,wallHeat([w.space]));
    const sky=new T.Mesh(new T.PlaneGeometry(INTERIOR.windowWidth,1.2),new T.MeshBasicMaterial({color:'#b9c7d6'}));sky.position.set(w.x,1.5,az+(az===0?-.3:.3));root.add(sky);windowMeshes.set(w.id,{glass,sky});x=b;}
   if(x<end)box(end-x,H,.15,(x+end)/2,H/2,az,wm,wallHeat(ids));}
  // 門：門洞上方牆楣，門扇以鉸鏈轉動。
  for(const d of plan.doors){box(INTERIOR.doorWidth,H-2.05,.15,d.x,(H+2.05)/2,d.z,wm,wallHeat([d.a,d.b]));
   const hinge=new T.Group();hinge.position.set(d.x-INTERIOR.doorWidth/2,0,d.z);root.add(hinge);const leaf=new T.Mesh(new T.BoxGeometry(INTERIOR.doorWidth-.04,2.03,.05),mat(d.id==='D0'?'#6b7a82':'#8a5a3a'));leaf.position.set(INTERIOR.doorWidth/2,1.015,0);hinge.add(leaf);
   leaf.userData.heat=()=>ENV.ambient+(Math.max(spaceT(d.a),spaceT(d.b))-ENV.ambient)*.6;leaf.userData.mat=leaf.material;meshes.push(leaf);
   const knob=new T.Mesh(new T.SphereGeometry(.035,8,6),new T.MeshStandardMaterial({color:'#c9b46a',metalness:.6}));knob.position.set(INTERIOR.doorWidth-.12,1,.05);leaf.add(knob);doorMeshes.set(d.id,{hinge,leaf});}
  for(const f of plan.furniture)box(f.w,f.h,f.d,f.x,f.h/2,f.z,mat('#5d5148'),()=>ENV.ambient+(spaceT(f.space)-ENV.ambient)*.25);
  // 樓梯間：往下的樓梯示意。
  for(let i=0;i<6;i++)box(1.2,.18*(i+1),.32,.75,.09*(i+1),plan.D-.25-i*.32,mat('#9ea3a0'),()=>ENV.ambient);
  for(const v of plan.victims){const fig=createPatient(root,{sex:v.sex,condition:'unconscious'});fig.root.position.set(v.x,0,v.z);fig.root.rotation.y=v.heading;fig.body.traverse(o=>{if(o.isMesh){o.userData.heat=()=>36;o.userData.mat=o.material;meshes.push(o);}});victimFigs.set(v.id,fig);}
  crew=[0,1].map(i=>{const g=new T.Group();root.add(g);const p=createPerson(g,'隊員');p.beam.visible=true;p.body.traverse(o=>{if(o.isMesh&&o!==p.beam){o.userData.heat=()=>38;o.userData.mat=o.material;meshes.push(o);}});return {i,g,p,x:plan.entry.x+(i?.6:-.6),z:plan.entry.z+.4,heading:0,state:'follow',path:[],task:null,walk:0,space:'stair',out:false};});
  syncDoors();
 }
 function syncDoors(){for(const d of plan.doors){const m=doorMeshes.get(d.id);if(!m)continue;m.hinge.rotation.y=d.state==='open'?1.45:d.state==='ajar'?.3:0;m.leaf.rotation.z=d.forced?.06:0;}
  for(const w of plan.windows){const m=windowMeshes.get(w.id);if(!m)continue;m.glass.visible=w.state==='closed';}segs=wallSegments(plan);}

 function setup(site,{seed=Date.now(),closed=false,victims=1,vitalsFor=()=>({})}={}){
  const rand=seeded(seed),width=site.wall?Math.hypot(site.wall[2]-site.wall[0],site.wall[3]-site.wall[1]):18;
  plan=makeFloorPlan(rand,{facadeWidth:width,floor:site.floor,closed,victims});env=makeEnv(plan);
  for(const v of plan.victims){v.sex=rand()<.5?'male':'female';v.weight=Math.round(v.sex==='male'?60+rand()*30:48+rand()*27);Object.assign(v,vitalsFor(v));}
  log.length=0;me.maxExposure=0;build();return plan;
 }
 function clear(){clearAll();plan=null;env=null;api.active=false;}
 function note(kind,text,extra={}){log.push({kind,text,...extra});api.onEvent?.(kind,text,extra);}
 function step(dt,{intensity=0,cooling=null}={}){if(!plan)return {events:[],cap:1};const r=stepEnv(plan,env,dt,{intensity,fanOn:!!placed.fan?.on,cooling});stepInfo=r;lastPpv=r.ppv;
  for(const e of r.events)note(e,e==='flashover'?'起火房間閃燃（示意門檻：上層 600 °C）':'起火房間天花板出現火舌（滾燃徵兆，示意門檻：上層 500 °C）');
  // 回燃徵兆倒數：門微開後若未關回或冷卻，回燃。
  if(me.pending){const p=me.pending,e=env.spaces[p.space];p.t+=dt;// 門縫進氣本身就是危險來源：只有冷卻（溫度或未燃氣體降到門檻下）或關門才解除。
  if(e.fuel<ENV.backdraft.fuel-.15||e.T<ENV.backdraft.temp-40){note('backdraftAvoided','已冷卻至回燃門檻以下（示意）');me.pending=null;}else if(p.t>=ENV.warnDelay){backdraft(p.space,p.at);me.pending=null;}}
  return r;}
 function backdraft(spaceId,at){applyBackdraft(env.spaces[spaceId]);me.burstT=1;burst.userData.at=at.clone();me.shake=.8;const d=Math.hypot(me.x-at.x,me.z-at.z);if(api.active&&d<4){me.exposure=Math.min(EXPOSURE.retreat,me.exposure+60*(1-d/4));}note('backdraft','回燃（示意）：開口處噴出火球',{space:spaceId,near:api.active&&d<4});}

 // ---------- 進入與撤出 ----------
 function enter({hose=false,budget=0,items={}}={}){me.x=plan.entry.x;me.z=plan.entry.z;me.crouch=false;me.exposure=0;me.trail=[{x:plan.entry.x,z:plan.entry.z}];me.hoseIn=hose;me.hoseBudget=budget;me.items=items;me.forcing=null;
  for(const c of crew){c.out=false;c.x=plan.entry.x+(c.i?.6:-.6);c.z=plan.entry.z+.4;c.state='follow';c.task=null;c.path=[];c.g.visible=true;}
  api.active=true;note('enter','進入建物');}
 function exit(){api.active=false;for(const c of crew){if(c.task?.victim)c.task.victim.state='inside';c.state='follow';c.task=null;c.g.visible=false;c.out=true;}me.pending=null;me.forcing=null;note('exit','撤出建物');}

 // ---------- 碰撞與移動 ----------
 const eye=()=>me.crouch?INTERIOR.eyeCrouch:INTERIOR.eyeStand;
 function trailLen(){let l=0;for(let i=1;i<me.trail.length;i++)l+=Math.hypot(me.trail[i].x-me.trail[i-1].x,me.trail[i].z-me.trail[i-1].z);return l+Math.hypot(me.x-me.trail.at(-1).x,me.z-me.trail.at(-1).z);}
 function hoseLeft(){return me.hoseBudget-trailLen();}
 function move(dt,[f,r],yaw,run){const len=Math.hypot(f,r);if(len<.05)return;const sp=(me.crouch?1.0:run?2.8:1.7)*Math.min(1,len),fx=-Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw),dx=(fx*f+rx*r)/len,dz=(fz*f+rz*r)/len;
  const old={x:me.x,z:me.z},p=resolveCircle(plan,me.x+dx*sp*dt,me.z+dz*sp*dt,.32,segs);me.x=p.x;me.z=p.z;me.walk=(me.walk??0)+dt*sp*2.2;
  if(me.hoseIn){// 水線：沿走過的路線鋪設；走回頭時收回。長度不足時不能再前進。
   for(let i=0;i<me.trail.length-1;i++)if(Math.hypot(me.trail[i].x-me.x,me.trail[i].z-me.z)<.7){me.trail.length=i+1;break;}
   if(hoseLeft()<0){me.x=old.x;me.z=old.z;api.hint?.('水線長度不足，無法再前進（可攜帶延長水帶）');}
   else if(Math.hypot(me.x-me.trail.at(-1).x,me.z-me.trail.at(-1).z)>1)me.trail.push({x:me.x,z:me.z});}}

 // ---------- 互動（E：開關門窗、撤出；X：微開門；F：使用器材） ----------
 function nearest(list,f,max){let best=null,bd=max;for(const o of list){const d=f(o);if(d<bd){bd=d;best=o;}}return best;}
 const doorDist=d=>Math.hypot(me.x-d.x,me.z-d.z),winDist=w=>Math.hypot(me.x-w.x,me.z-w.z);
 function otherSide(d){const s=spaceOf(plan,me.x,me.z)?.id;return s===d.a?d.b:d.a;}
 function openDoor(d,to){const target=otherSide(d),e=env.spaces[target],out=to==='open'&&d.state==='closed'||to==='ajar'?openingOutcome(e,to):'safe';d.state=to;syncDoors();
  if(out==='warning'){me.pending={space:target,t:0,at:new T.Vector3(d.x,1.6,d.z),door:d.id};api.hint?.('⚠ 門縫煙被吸入後又噴出、門扇很燙（回燃徵兆）：立即關門（E）或以水霧冷卻');note('backdraftSign','門微開出現回燃徵兆（示意）',{door:d.id});}
  else if(out==='backdraft')backdraft(target,new T.Vector3(d.x,1.6,d.z));
  else if(to!=='closed'&&target===plan.fire.space&&!log.some(l=>l.kind==='fireRoomOpen'))note('fireRoomOpen','開啟起火房間門');}
 function interact(){if(!api.active)return;
  const sp=spaceOf(plan,me.x,me.z);if(sp?.id==='stair'&&Math.hypot(me.x-plan.entry.x,me.z-plan.entry.z)<1.6){api.onExit?.();return;}
  const v=nearest(plan.victims.filter(v=>v.state==='inside'),v=>Math.hypot(me.x-v.x,me.z-v.z),1.4);if(v){v.found=true;assignCarry(v);return;}
  const d=nearest(plan.doors,doorDist,1.4),w=nearest(plan.windows,winDist,1.5);
  if(d&&(!w||doorDist(d)<=winDist(w))){if(d.locked&&!d.forced){api.hint?.(me.items.halligan?'門上鎖：按住 F 以破壞器材破門':'門上鎖：需要破壞器材（在消防車旁按 U 選裝備），或指令隊員搜索時由隊員破門');return;}
   if(d.state==='closed'){openDoor(d,'open');api.hint?.('門已開啟（E 關門；X 微開）');}else{d.state='closed';syncDoors();if(me.pending?.door===d.id){me.pending=null;note('backdraftAvoided','關門阻斷進氣，回燃徵兆解除（示意）');api.hint?.('已關門，回燃徵兆解除；可先以水霧冷卻再開門');}else api.hint?.('門已關閉');}return;}
  if(w){if(w.state==='closed'){const e=env.spaces[w.space],out=openingOutcome(e,'open');w.state='open';syncDoors();note('vent','開窗排煙：'+spaceById(plan,w.space).name,{window:w.id});if(out==='backdraft')backdraft(w.space,new T.Vector3(w.x,1.5,w.z));else api.hint?.('已開窗（排煙口）');}
   else if(w.state==='open'){w.state='closed';syncDoors();api.hint?.('已關窗');}else api.hint?.('窗戶已破');return;}
  api.hint?.('附近沒有可操作的門窗');}
 function ajar(){if(!api.active)return;const d=nearest(plan.doors,doorDist,1.4);if(!d){api.hint?.('走到門前按 X 微開門（觀察門後狀況）');return;}if(d.locked&&!d.forced){api.hint?.('門上鎖，無法微開');return;}
  if(d.state==='closed'){openDoor(d,'ajar');if(!me.pending)api.hint?.('門已微開：觀察煙況，可對門縫以水霧冷卻；再按 X 全開、E 關門');}else if(d.state==='ajar'){openDoor(d,'open');api.hint?.('門已全開');}}
 function useItem(hold){if(!api.active)return;
  const d=nearest(plan.doors,doorDist,1.4);
  if(d&&d.locked&&!d.forced){if(!me.items.halligan){api.hint?.('沒有攜帶破壞器材');return;}if(hold){me.forcing??={door:d,t:0};}return;}
  if(!hold)return;
  const stairDoor=plan.doors.find(x=>x.id==='D0');
  if(me.items.fan&&Math.hypot(me.x-stairDoor.x,me.z-stairDoor.z)<2.2){if(!placed.fan){placed.fan={on:true,mesh:fanMesh()};note('fan','排煙機於樓梯間門口運轉');const p=ppvState(plan,true);api.hint?.(p.effective?'排煙機運轉：正壓送風，煙由排氣窗排出'+(p.intoFire?'（⚠ 送風範圍含起火房間，會助燃）':''):'排煙機運轉，但'+p.reason);}else{placed.fan.on=!placed.fan.on;placed.fan.mesh.visible=true;api.hint?.(placed.fan.on?'排煙機啟動':'排煙機停止');}return;}
  if(me.items.light){if(placed.light.length>=2){api.hint?.('照明燈已放置 2 盞');return;}const g=new T.Group(),pole=new T.Mesh(new T.CylinderGeometry(.03,.03,1.6,8),mat('#444'));pole.position.y=.8;const lamp=new T.Mesh(new T.BoxGeometry(.3,.2,.12),new T.MeshBasicMaterial({color:'#fff8d0'}));lamp.position.y=1.65;const l=new T.PointLight('#fff5d8',6,9,1.5);l.position.y=1.7;g.add(pole,lamp,l);g.position.set(me.x,0,me.z);root.add(g);placed.light.push(g);note('light','放置照明燈');api.hint?.('已放置照明燈');return;}
  api.hint?.('附近沒有可使用器材的位置（破壞器材：上鎖門前；排煙機：樓梯間門口；照明燈：任意處）');}
 function fanMesh(){const g=new T.Group(),s=plan.doors.find(x=>x.id==='D0');const ring=new T.Mesh(new T.TorusGeometry(.38,.06,8,24),mat('#c4161c'));ring.position.y=.5;const base=new T.Mesh(new T.BoxGeometry(.6,.12,.5),mat('#333'));base.position.y=.06;g.add(ring,base);g.position.set(s.x,0,s.z+1.2);root.add(g);return g;}

 // ---------- 隊員 ----------
 function waypoints(from,toSpace,goal){const s=spaceOf(plan,from.x,from.z)?.id??'corridor',r=pathDoors(plan,s,toSpace);if(!r.doors)return {blocked:r.blocked};const pts=[];let cur=s;
  for(const d of r.doors){const nxt=d.a===cur?d.b:d.a,sp=spaceById(plan,cur),dir=(sp.z0+sp.z1)/2<d.z?1:-1;pts.push({x:d.x,z:d.z-dir*.6},{x:d.x,z:d.z+dir*.6});cur=nxt;}pts.push(goal);return {pts};}
 function goTo(c,space,goal,then){const w=waypoints(c,space,goal);
  // 路徑上有上鎖的門：先走到門前破門（隊員自帶破壞器材，示意），再繼續。
  if(w.blocked){const d=w.blocked,from=spaceOf(plan,c.x,c.z)?.id??'corridor',side=[d.a,d.b].find(id=>pathDoors(plan,from,id).doors)??from,sp=spaceById(plan,side),dir=(sp.z0+sp.z1)/2<d.z?-1:1;
   c.state='force';c.task={...(c.task??{}),door:d,t:0,then:()=>goTo(c,space,goal,then)};c.path=waypoints(c,side,{x:d.x+(c.i?.35:-.35),z:d.z+dir*.6}).pts??[];return;}
  c.path=w.pts;c.after=then;c.state='move';}
 function stepCrew(c,dt,speed){const g=c.path[0];if(!g)return true;const dx=g.x-c.x,dz=g.z-c.z,l=Math.hypot(dx,dz);if(l<.12){c.path.shift();return !c.path.length;}c.heading=Math.atan2(-dx,-dz);const k=Math.min(l,speed*dt);c.x+=dx/l*k;c.z+=dz/l*k;c.walk+=dt*speed*3;return false;}
 function command(n){if(!api.active)return;const idle=crew.filter(c=>!c.out);if(!idle.length){api.hint?.('隊員已撤出');return;}
  if(n===1){for(const c of idle){if(c.task?.victim)continue;c.state='follow';c.task=null;c.path=[];}api.hint?.('隊員：跟隨中隊長');}
  if(n===2){const searched=new Set(log.filter(l=>l.kind==='searched').map(l=>l.space)),rooms=plan.spaces.filter(s=>s.kind==='room'&&!searched.has(s.id)&&!crew.some(c=>c.task?.room===s.id));
   const room=nearest(rooms,s=>Math.hypot((s.x0+s.x1)/2-me.x,(s.z0+s.z1)/2-me.z),1e9);if(!room){api.hint?.('所有房間已搜索或搜索中');return;}
   const e=env.spaces[room.id];if(e.T>=300){api.hint?.(`隊員回報：${room.name}溫度過高（示意 ${Math.round(e.T)} °C），需先控制火勢或冷卻`);return;}
   const team=idle.filter(c=>!c.task?.victim);if(!team.length){api.hint?.('隊員正在搬運受困者');return;}
   for(const c of team){c.task={kind:'search',room:room.id,t:0};goTo(c,room.id,{x:(room.x0+room.x1)/2+(c.i?.6:-.6),z:(room.z0+room.z1)/2},()=>{c.state='search';c.task.t=0;});}
   api.hint?.(`隊員：搜索${room.name}`);note('command','指令隊員搜索'+room.name);}
  if(n===3){const sp=spaceOf(plan,me.x,me.z),cands=plan.windows.filter(w=>w.state==='closed');const w=nearest(cands,w=>(w.space===sp?.id?0:20)+Math.hypot(w.x-me.x,w.z-me.z),1e9);if(!w){api.hint?.('沒有可開啟的窗戶');return;}
   const c=idle.find(c=>!c.task?.victim);if(!c){api.hint?.('隊員正在搬運受困者');return;}c.task={kind:'vent',window:w.id};goTo(c,w.space,{x:w.x,z:w.z+(w.z===0?.7:-.7)},()=>{const e=env.spaces[w.space];if(backdraftRisk(e)){api.hint?.(`隊員回報：${spaceById(plan,w.space).name}有回燃徵兆，未開窗`);note('crewRefuse','隊員因回燃徵兆未開窗');}else{w.state='open';syncDoors();note('vent','隊員開窗排煙：'+spaceById(plan,w.space).name,{window:w.id,by:'crew'});api.hint?.(`隊員已開啟${spaceById(plan,w.space).name}窗戶`);}c.state='follow';c.task=null;});
   api.hint?.(`隊員：開啟${spaceById(plan,w.space).name}窗戶排煙`);}
  if(n===4){for(const c of idle){if(c.task?.victim)continue;c.task={kind:'exit'};goTo(c,'stair',{x:plan.entry.x+(c.i?.5:-.5),z:plan.entry.z+.3},()=>{c.out=true;c.g.visible=false;c.state='out';});}api.hint?.('隊員：撤離至樓梯間');note('command','指令隊員撤離');}}
 function assignCarry(v){if(v.state!=='inside')return;const team=crew.filter(c=>!c.out&&!c.task?.victim);if(team.length<2){api.hint?.(`發現受困者 ${v.id}：需 2 名隊員搬運（隊員忙碌或已撤出）`);return;}
  v.state='assigned';api.hint?.(`發現受困者 ${v.id}：隊員前往搬運至樓梯間`);note('found','發現受困者 '+v.id,{victim:v.id});
  for(const c of team){c.task={kind:'carry',victim:v};goTo(c,v.space,{x:v.x+(c.i?.5:-.5),z:v.z},()=>{c.state='lift';c.t=0;});}}
 function updateCrew(dt){
  for(const c of crew){if(c.out)continue;const sp=spaceOf(plan,c.x,c.z);
   if(c.state==='follow'){const tgt={x:me.x+Math.sin(api.yaw)*(1.2+c.i*.8)+(c.i?.4:-.4),z:me.z+Math.cos(api.yaw)*(1.2+c.i*.8)},tsp=spaceOf(plan,tgt.x,tgt.z)?.id??spaceOf(plan,me.x,me.z)?.id;
    c.followT=(c.followT??0)-dt;if(c.followT<=0||!c.path.length){c.followT=.6;const w=waypoints(c,tsp??'corridor',tsp?tgt:{x:me.x,z:me.z});c.path=w.pts??[];}
    if(Math.hypot(c.x-me.x,c.z-me.z)>1.1)stepCrew(c,dt,me.crouch?1.0:1.8);else c.path=[];}
   else if(c.state==='move'){if(stepCrew(c,dt,1.6)){c.state='idle';c.after?.();}}
   else if(c.state==='force'){if(c.path.length){stepCrew(c,dt,1.6);}else{c.task.t+=dt;if(c.task.t>=FORCE.crew){const d=c.task.door;if(!d.forced){d.forced=true;d.state='open';syncDoors();note('forced','隊員破門：'+d.id,{door:d.id,by:'crew'});api.hint?.('隊員已破門');}c.task.then?.();}}}
   else if(c.state==='search'){c.task.t+=dt;const room=spaceById(plan,c.task.room);c.heading+=dt*1.5;
    const v=plan.victims.find(v=>v.space===room.id&&v.state==='inside');if(c.task.t>=searchTime(room)*.5&&c.i===0||c.task.t>=searchTime(room)){if(v){v.found=true;assignCarry(v);continue;}
     if(c.task.t>=searchTime(room)){if(!log.some(l=>l.kind==='searched'&&l.space===room.id)){note('searched',`${room.name}搜索完成：無受困者`,{space:room.id});api.hint?.(`隊員回報：${room.name}搜索完成，無受困者`);}c.state='follow';c.task=null;}}}
   else if(c.state==='lift'){c.t+=dt;if(c.t>1.5&&crew.filter(o=>o.task?.victim===c.task.victim).every(o=>o.state==='lift'||o.state==='carry')){c.state='carry';if(c.i===0){c.lead=true;c.task.victim.state='carried';const w=waypoints(c,'stair',{x:plan.entry.x,z:plan.entry.z});c.path=w.pts??[];}}}
   else if(c.state==='carry'){const v=c.task.victim;if(c.lead){const done=stepCrew(c,dt,.8);v.x=c.x;v.z=c.z;const fig=victimFigs.get(v.id);fig.root.position.set(c.x,.75,c.z);fig.root.rotation.y=c.heading;
     if(done){v.state='rescued';fig.root.visible=false;note('rescued',`受困者 ${v.id} 搬運至樓梯間，交由地面人員`,{victim:v.id});api.onRescue?.(v);for(const o of crew)if(o.task?.victim===v){o.state='follow';o.task=null;o.lead=false;o.path=[];}}}
    else{const lead=crew.find(o=>o.lead&&o.task?.victim===c.task.victim);if(lead){const f=-Math.sin(lead.heading),g=-Math.cos(lead.heading);c.x=lead.x-f*1.3;c.z=lead.z-g*1.3;c.heading=lead.heading;c.walk=lead.walk;}}}
   drawCrew(c);}}
 function drawCrew(c){c.g.position.set(c.x,0,c.z);c.p.body.rotation.y=c.heading;const moving=['move','follow','carry','force'].includes(c.state)&&c.path?.length,sw=moving?Math.sin(c.walk)*.4:0;c.p.legs[0].rotation.x=sw;c.p.legs[1].rotation.x=-sw;
  c.p.arms.forEach(a=>a.rotation.x=c.state==='carry'?-.6:c.state==='force'?-1.2+Math.sin(c.task?.t*8||0)*.6:-sw*.8);c.p.body.position.y=me.crouch&&c.state==='follow'?-.25:0;c.p.body.rotation.x=c.state==='search'?.35:0;}

 // ---------- 射水（Space）：直線水柱打火點；水霧冷卻上層熱煙或門後空間 ----------
 function spray(dt,mode,on,yaw,pitch){water.visible=!!on;if(!on||!api.active)return {hit:false,cooling:null};
  const look=new T.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)),o=new T.Vector3(me.x,eye()-.35,me.z).addScaledVector(look,.5);
  const reach=mode==='fog'?6:10,fire=new T.Vector3(plan.fire.x,.8,plan.fire.z),to=fire.clone().sub(o),dist=to.length(),ang=look.angleTo(to);
  const blocked=lineBlocked(me.x,me.z,plan.fire.x,plan.fire.z),hit=!blocked&&dist<=reach&&ang<=(mode==='fog'?.6:.3);
  // 冷卻：瞄準點 2.5 m 前方所在空間（可穿過開啟或微開的門）。
  const aim=o.clone().addScaledVector(look,2.5),asp=spaceOf(plan,aim.x,aim.z)??spaceOf(plan,me.x,me.z),reachable=asp&&!lineBlocked(me.x,me.z,aim.x,aim.z,true);
  const cooling=reachable?{space:asp.id,rate:(mode==='fog'?1:.35)*(pitch>.12?1.3:.7)}:null;
  const range=hit?dist:reach*.8,a=water.geometry.attributes.position;wl.forEach((w,i)=>{w.t+=dt*1.8;if(w.t>1)w.t-=1;const d=w.t*range,spread=(mode==='fog'?.5:.06)*d;a.setXYZ(i,o.x+look.x*d+w.u*spread,o.y+look.y*d+w.v*spread-(mode==='fog'?0:d*d*.01),o.z+look.z*d+w.u*spread*.5);});a.needsUpdate=true;water.material.size=mode==='fog'?.32:.16;
  return {hit,cooling,dist,blocked,reach,inCone:ang<=(mode==='fog'?.6:.3)};}
 function lineBlocked(ax,az,bx,bz,ajarOk=false){const list=ajarOk?wallSegments({...plan,doors:plan.doors.map(d=>d.state==='ajar'?{...d,state:'open'}:d)}):segs;
  for(const [cx,cz,dx,dz] of list){const d=(bx-ax)*(dz-cz)-(bz-az)*(dx-cx);if(Math.abs(d)<1e-9)continue;const u=((cx-ax)*(dz-cz)-(cz-az)*(dx-cx))/d,v=((cx-ax)*(bz-az)-(cz-az)*(bx-ax))/d;if(u>.02&&u<.98&&v>=0&&v<=1)return true;}return false;}

 // ---------- 每幀 ----------
 const ray=new T.Raycaster(),center=new T.Vector2(0,0);let thermalTimer=0;
 function update(dt,{input=[0,0],yaw=0,pitch=0,run=false,intensity=0,forceHeld=false,sprayOn=false}={}){
  if(!plan)return;api.yaw=yaw;
  if(api.active){move(dt,input,yaw,run);
   if(me.forcing){if(!forceHeld||doorDist(me.forcing.door)>1.6){me.forcing=null;api.hint?.('破門中斷');}else{me.forcing.t+=dt;api.hint?.(`破門中… ${Math.min(100,Math.round(me.forcing.t/FORCE.player*100))}%`);if(me.forcing.t>=FORCE.player){const d=me.forcing.door;d.forced=true;d.state='closed';syncDoors();note('forced','破壞進入：'+(d.id==='D0'?'樓梯間門':spaceById(plan,d.a).name+'門'),{door:d.id,by:'player'});api.hint?.('門已破開（門鎖損壞），按 E 開門；可先按 X 微開觀察');me.forcing=null;}}}
   const sp=spaceOf(plan,me.x,me.z),e=env.spaces[sp?.id??'corridor'],felt=feltTemp(e,eye());me.exposure=stepExposure(me.exposure,felt,dt);me.maxExposure=Math.max(me.maxExposure,me.exposure);
   if(sp?.id===plan.fire.space&&env.flashed)me.exposure=Math.min(EXPOSURE.retreat,me.exposure+25*dt);
   if(me.exposure>=EXPOSURE.retreat){note('retreat','熱暴露達上限，緊急撤出（示意）');api.onForcedExit?.();}
   updateCrew(dt);}
  // 視覺：火焰、滾燃、回燃火球、煙層、霧、熱顯像、燈光。
  const k=Math.max(0,intensity);api.intensity=k;const fx=plan.fire.x,fz=plan.fire.z,fe=env.spaces[plan.fire.space];
  const p=flames.geometry.attributes.position;fl.forEach((f,i)=>{f.t+=dt*(1.3+Math.random()*.6);if(f.t>1){f.t=0;f.u=Math.random()-.5;f.v=Math.random()-.5;}const w=1.6*Math.max(.25,k),h=f.t*Math.min(H,2.6*k+.3);p.setXYZ(i,fx+f.u*w*(1-f.t*.5),h,fz+f.v*w*(1-f.t*.5));});p.needsUpdate=true;flames.visible=k>0;flames.material.size=.5+k*.7;
  const fs=spaceById(plan,plan.fire.space),rollOn=k>0&&(fe.T>=ENV.rollover||env.flashed),q=roll.geometry.attributes.position;roll.visible=rollOn;
  if(rollOn)rl.forEach((r,i)=>{r.t+=dt*.6;if(r.t>1){r.t=0;r.u=Math.random();r.v=Math.random();}const y=env.flashed?Math.random()*H:H-.1-r.t*.5;q.setXYZ(i,fs.x0+r.u*(fs.x1-fs.x0),y,fs.z0+r.v*(fs.z1-fs.z0));});q.needsUpdate=true;
  fireLight.position.set(fx,1.4,fz);fireLight.intensity=k*30*(env.flashed?2:1)*(.85+Math.random()*.3);
  burst.visible=me.burstT>0;if(me.burstT>0){me.burstT-=dt;const a=burst.geometry.attributes.position,at=burst.userData.at,s=1-me.burstT;bl.forEach((b,i)=>a.setXYZ(i,at.x+b.d.x*b.s*s*2.5,at.y+b.d.y*b.s*s*1.2,at.z+b.d.z*b.s*s*2.5));a.needsUpdate=true;burst.material.opacity=Math.max(0,me.burstT);}
  me.shake=Math.max(0,me.shake-dt);
  for(const [id,box] of smokeBoxes){const e=env.spaces[id],lh=layerHeight(e),h=H-lh;box.scale.y=Math.max(.01,h);box.position.y=lh+h/2;box.material.opacity=me.thermal?.08:Math.min(.92,.15+e.smoke*.8);box.visible=e.smoke>.02;}
  const here=api.active?env.spaces[spaceOf(plan,me.x,me.z)?.id??'corridor']:fe,vis=visibility(here,eye(),me.thermal),lit=placed.light.some(g=>Math.hypot(g.position.x-me.x,g.position.z-me.z)<6);
  scene.fog.density=1.73/(vis*(lit?1.4:1));scene.fog.color.set(me.thermal?'#151515':here.T>300?'#3a2a22':'#2c2c2e');
  if(placed.fan){placed.fan.mesh.children[0].rotation.z+=placed.fan.on?dt*20:0;}
  thermalTimer-=dt;if(me.thermal&&thermalTimer<=0){thermalTimer=.2;for(const m of meshes){const c=thermalColor(m.userData.heat?.()??ENV.ambient,ENV.ambient,160);m.userData.tmat??=new T.MeshBasicMaterial();m.userData.tmat.color.setRGB(c[0],c[1],c[2]);}}
  if(me.hoseIn&&api.active){const pts=[...me.trail.map(t=>new T.Vector3(t.x,.05,t.z)),new T.Vector3(me.x,.05,me.z)];if(pts.length>=2&&(api.trailN!==pts.length||Math.random()<.2)){api.trailN=pts.length;hoseMesh.geometry.dispose();hoseMesh.geometry=new T.TubeGeometry(new T.CatmullRomCurve3(pts),Math.max(4,pts.length*3),.045,6,false);}hoseMesh.visible=pts.length>=2;}else hoseMesh.visible=false;
 }
 function setThermal(on){me.thermal=on;for(const m of meshes){if(on){m.userData.tmat??=new T.MeshBasicMaterial({color:'#333'});m.material=m.userData.tmat;}else m.material=m.userData.mat;}thermalTimer=0;flames.material.color.set(on?'#ffffff':'#ffffff');amb.intensity=on?1:.35;}
 // 準星溫度：熱顯像儀讀值（示意）。
 function reticle(camera){ray.setFromCamera(center,camera);const hit=ray.intersectObjects(meshes,false)[0];if(!hit)return null;const t=hit.object.userData.heat?.()??ENV.ambient;const dFire=Math.hypot(hit.point.x-plan.fire.x,hit.point.z-plan.fire.z);return Math.round(dFire<1.2&&api.intensity>0?Math.max(t,450+api.intensity*300):t);}
 function render(renderer,camera,yaw,pitch){const y=eye()+(me.shake>0?(Math.random()-.5)*me.shake*.15:0),look=new T.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
  camera.position.set(me.x,y,me.z);camera.lookAt(me.x+look.x,y+look.y,me.z+look.z);torch.position.copy(camera.position);torch.target.position.copy(camera.position).add(look);
  const right=new T.Vector3(Math.cos(yaw),0,-Math.sin(yaw));nozzle.visible=me.hoseIn;nozzle.position.copy(camera.position).addScaledVector(look,.5).addScaledVector(right,.16).add(new T.Vector3(0,-.22,0));nozzle.lookAt(nozzle.position.clone().add(look));nozzle.rotateX(Math.PI/2);
  renderer.render(scene,camera);}
 // 小地圖：示意平面、門窗狀態、火點、人員。
 function drawMap(ctx,size){const pad=10,s=(size-pad*2)/Math.max(plan.W,plan.D),ox=pad+(size-pad*2-plan.W*s)/2,oz=pad+(size-pad*2-plan.D*s)/2,X=x=>ox+x*s,Z=z=>oz+z*s;
  ctx.fillStyle='#0d1117';ctx.fillRect(0,0,size,size);
  for(const sp of plan.spaces){const e=env.spaces[sp.id],t=Math.min(1,(e.T-20)/500);ctx.fillStyle=`rgb(${40+t*150|0},${44+e.smoke*20|0},${50-t*20|0})`;ctx.fillRect(X(sp.x0),Z(sp.z0),(sp.x1-sp.x0)*s,(sp.z1-sp.z0)*s);}
  ctx.strokeStyle='#c9d1d9';ctx.lineWidth=2;for(const [ax,az,bx,bz] of wallSegments(plan,{withDoors:false})){ctx.beginPath();ctx.moveTo(X(ax),Z(az));ctx.lineTo(X(bx),Z(bz));ctx.stroke();}
  for(const d of plan.doors){ctx.strokeStyle=d.forced?'#f0883e':d.state==='open'?'#3fb950':d.state==='ajar'?'#e3b341':'#8b949e';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(X(d.x-.45),Z(d.z));ctx.lineTo(X(d.x+.45),Z(d.z));ctx.stroke();}
  for(const w of plan.windows){ctx.strokeStyle=w.state==='closed'?'#58a6ff':'#a5d6ff';ctx.setLineDash(w.state==='closed'?[]:[3,2]);ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(X(w.x-.7),Z(w.z));ctx.lineTo(X(w.x+.7),Z(w.z));ctx.stroke();ctx.setLineDash([]);}
  if(api.intensity>0){ctx.fillStyle='#ff5a1f';ctx.beginPath();ctx.arc(X(plan.fire.x),Z(plan.fire.z),5,0,7);ctx.fill();}
  for(const v of plan.victims)if(v.found&&v.state!=='rescued'){ctx.fillStyle='#f85149';ctx.fillRect(X(v.x)-3,Z(v.z)-3,6,6);}
  if(placed.fan){ctx.fillStyle='#c4161c';ctx.fillRect(X(placed.fan.mesh.position.x)-4,Z(placed.fan.mesh.position.z)-4,8,8);}
  for(const c of crew)if(!c.out){ctx.fillStyle='#1f6feb';ctx.beginPath();ctx.arc(X(c.x),Z(c.z),3.5,0,7);ctx.fill();}
  ctx.save();ctx.translate(X(me.x),Z(me.z));ctx.rotate(-api.yaw);ctx.fillStyle='#ffd33d';ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5,5);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore();
  ctx.fillStyle='#c9d1d9';ctx.font=`${Math.round(size/16)}px sans-serif`;ctx.fillText(`${plan.floor} 樓（示意平面）・街側`,pad,size-4);}
 function status(){const sp=spaceOf(plan,me.x,me.z),e=env.spaces[sp?.id??'corridor'];return {space:sp?.name??'—',layer:layerHeight(e),T:e.T,smoke:e.smoke,o2:e.o2,felt:feltTemp(e,eye()),exposure:me.exposure,crouch:me.crouch,thermal:me.thermal,hoseLeft:me.hoseIn?hoseLeft():null,ppv:lastPpv,pending:!!me.pending,flashed:env.flashed,rollover:env.rollover};}
 function breakWindow(id){const w=plan.windows.find(w=>w.id===id);if(!w||w.state==='broken')return 'none';const out=openingOutcome(env.spaces[w.space],'broken');w.state='broken';syncDoors();if(out==='backdraft')backdraft(w.space,new T.Vector3(w.x,1.5,w.z));note('windowBroken','起火房間窗戶破裂',{window:w.id});return out;}
 api={scene,active:false,yaw:0,intensity:0,get plan(){return plan;},get env(){return env;},get me(){return me;},get log(){return log;},get crew(){return crew;},get placed(){return placed;},get cap(){return plan?stepInfo.cap:1;},
  setup,clear,step,enter,exit,update,render,interact,ajar,useItem,command,spray,reticle,drawMap,status,breakWindow,setThermal,
  toggleThermal(){if(!me.items.tic){api.hint?.('沒有攜帶熱顯像儀（在消防車旁按 U 選裝備）');return false;}setThermal(!me.thermal);return me.thermal;},
  toggleCrouch(){me.crouch=!me.crouch;return me.crouch;},hoseLeft,
  fireWindow(){return plan?.windows.find(w=>w.fire);},
 };
 return api;
}
