// 信義街景・建物內部（訓練示意）：1 樓到起火樓層上一層的示意平面、可行走的折返樓梯、第一人稱進入、門窗開關與破壞進入、
// 煙層與能見度（樓梯間煙囪效應）、熱顯像儀、隊員指令（跟隨、搜索、開窗排煙、撤離、架設水線射水）、連結送水管送水口、
// 排煙機與照明燈、閃燃／回燃徵兆。室內格局不是該建物實際平面；溫度、煙、含氧量與時間皆為遊戲化示意（規則見 xinyi-street-interior-rules.js）。
import * as T from 'three';
import {createPatient} from './xinyi-street-aerial.js?v=s20';
import {INTERIOR,ENV,EXPOSURE,FORCE,STAIR,seeded,makeFloorPlan,spaceOf,spaceById,wallSegments,resolveCircle,makeEnv,stepEnv,backdraftRisk,applyBackdraft,openingOutcome,
 layerHeight,feltTemp,visibility,stepExposure,pathDoors,searchTime,thermalColor,ppvState,stairY,stairTransition,stairSegments,stackExchange} from './xinyi-street-interior-rules.js?v=s20';

const H=INTERIOR.ceiling,FH=INTERIOR.floorHeight,PACK=40;
function tex(size,draw){const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;return t;}
function sprite(inner,outer){return tex(64,(g,s)=>{const r=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);r.addColorStop(0,inner);r.addColorStop(1,outer);g.fillStyle=r;g.fillRect(0,0,s,s);});}
function label(text,color){const c=document.createElement('canvas'),g=c.getContext('2d');g.font='bold 28px sans-serif';const w=Math.ceil(g.measureText(text).width)+20;c.width=w;c.height=40;g.fillStyle='rgba(10,16,22,.8)';g.fillRect(0,0,w,40);g.fillStyle=color;g.font='bold 28px sans-serif';g.textBaseline='middle';g.fillText(text,10,21);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;const s=new T.Sprite(new T.SpriteMaterial({map:t,transparent:true}));s.scale.set(w/40*.32,.32,1);return s;}
const floorTex=tex(128,(g,s)=>{g.fillStyle='#7a6a58';g.fillRect(0,0,s,s);g.strokeStyle='#6a5b4a';g.lineWidth=3;for(let i=0;i<=4;i++){g.beginPath();g.moveTo(0,i*s/4);g.lineTo(s,i*s/4);g.stroke();}});
const wallTex=tex(128,(g,s)=>{g.fillStyle='#cfc8ba';g.fillRect(0,0,s,s);for(let i=0;i<400;i++){g.fillStyle=`rgba(0,0,0,${Math.random()*.05})`;g.fillRect(Math.random()*s,Math.random()*s,2,2);}});
const flameTex=sprite('rgba(255,236,160,1)','rgba(255,90,10,0)'),rollTex=sprite('rgba(255,170,60,.9)','rgba(255,60,0,0)'),waterTex=sprite('rgba(220,240,255,.95)','rgba(180,220,255,0)');

export function createInterior({createPerson}){
 const scene=new T.Scene();scene.background=new T.Color('#141416');scene.fog=new T.FogExp2('#2c2c2e',.05);
 const amb=new T.HemisphereLight('#c9d3e0','#2a2420',.35);scene.add(amb);
 const torch=new T.SpotLight('#fff3d6',2.4,14,.5,1,2);scene.add(torch,torch.target);
 const world=new T.Group();scene.add(world);
 const P=n=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(n*3),3));return g;};
 const pts=(parent,n,map,size,blending,opacity)=>{const p=new T.Points(P(n),new T.PointsMaterial({map,size,transparent:true,opacity,depthWrite:false,blending,sizeAttenuation:true}));p.frustumCulled=false;parent.add(p);return p;};
 const burst=pts(scene,240,flameTex,1.4,T.AdditiveBlending,.95),water=pts(scene,220,waterTex,.18,T.NormalBlending,.85),crewWater=pts(scene,160,waterTex,.16,T.NormalBlending,.8);burst.visible=water.visible=crewWater.visible=false;
 const bl=[...Array(240)].map(()=>({d:new T.Vector3(Math.random()-.5,Math.random()*.6,Math.random()-.5).normalize(),s:1+Math.random()*3})),wl=[...Array(220)].map((_,i)=>({t:i/220,u:Math.random()-.5,v:Math.random()-.5})),cwl=[...Array(160)].map((_,i)=>({t:i/160,u:Math.random()-.5,v:Math.random()-.5}));
 const hoseMesh=new T.Mesh(new T.BufferGeometry(),new T.MeshStandardMaterial({color:'#d8c27a',roughness:.7}));scene.add(hoseMesh);
 const nozzle=new T.Mesh(new T.CylinderGeometry(.022,.032,.32,10),new T.MeshLambertMaterial({color:'#2b2b2b'}));scene.add(nozzle);
 const mat=c=>new T.MeshStandardMaterial({color:c,roughness:.85});

 const levels=new Map();let L=null,plan=null,env=null,fireFloor=1,meshes=[],crew=[],crewSprays=[];
 const me={lv:1,seg:'floor',x:0,z:0,y:0,crouch:false,exposure:0,maxExposure:0,thermal:false,trail:[],crumbs:[],hoseIn:false,hoseBudget:0,standpipe:null,forcing:null,pending:null,burstT:0,shake:0,items:{},visited:new Set()};
 const log=[];let api=null,lastPpv={on:false},stepInfo={cap:1};
 const base=no=>(no-1)*FH;
 function useLevel(no){L=levels.get(no);plan=L.plan;env=L.env;}
 const lvT=(lv,id)=>lv.env.spaces[id]?.T??ENV.ambient;

 // ---------- 建構一層 ----------
 function buildLevel(lv){
  const root=lv.root,{plan:pl}=lv,{W,D}=pl;
  const add=(m,heat)=>{m.userData.heat=heat;m.userData.mat=m.material;meshes.push(m);root.add(m);return m;};
  const box=(w,h,d,x,y,z,material,heat)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),material);m.position.set(x,y,z);return add(m,heat);};
  const plane=(x0,x1,z0,z1,y,up,material,heat)=>{const m=new T.Mesh(new T.PlaneGeometry(x1-x0,z1-z0),material);m.rotation.x=up?-Math.PI/2:Math.PI/2;m.position.set((x0+x1)/2,y,(z0+z1)/2);return add(m,heat);};
  const T_=id=>()=>lvT(lv,id);
  for(const s of pl.spaces){const w=s.x1-s.x0,d=s.z1-s.z0,cx=(s.x0+s.x1)/2,cz=(s.z0+s.z1)/2,fm=new T.MeshStandardMaterial({map:floorTex.clone(),roughness:.9});fm.map.repeat.set(w/1.5,d/1.5);fm.map.needsUpdate=true;
   const fh=()=>ENV.ambient+(lvT(lv,s.id)-ENV.ambient)*.2,ch=()=>ENV.ambient+(lvT(lv,s.id)-ENV.ambient)*.85;
   if(s.id==='stair'){// 樓梯間樓板：下行梯段（x < 1.75、z > 8.4）處為樓梯井開口。
    plane(0,3.5,7,STAIR.zLow,0,true,fm,fh);plane(STAIR.xMid,3.5,STAIR.zLow,D,0,true,fm,fh);if(!lv.down)plane(0,STAIR.xMid,STAIR.zLow,D,0,true,fm,fh);if(!lv.up)plane(0,3.5,7,D,H,false,mat('#8f8a82'),ch);}
   else{plane(s.x0,s.x1,s.z0,s.z1,0,true,fm,fh);plane(s.x0,s.x1,s.z0,s.z1,H,false,mat('#8f8a82'),ch);}
   const sm=new T.Mesh(new T.BoxGeometry(w-.02,1,d-.02),new T.MeshBasicMaterial({color:'#262628',transparent:true,opacity:.5,depthWrite:false,side:T.DoubleSide}));sm.position.set(cx,H-.5,cz);root.add(sm);lv.smokeBoxes.set(s.id,sm);}
  const wm=new T.MeshStandardMaterial({map:wallTex,roughness:.9}),near=(x,z)=>pl.spaces.filter(s=>x>=s.x0-.2&&x<=s.x1+.2&&z>=s.z0-.2&&z<=s.z1+.2).map(s=>s.id),wallHeat=ids=>()=>ENV.ambient+(Math.max(...ids.map(id=>lvT(lv,id)))-ENV.ambient)*.45;
  for(const [ax,az,bx,bz] of wallSegments(pl,{withDoors:false})){const len=Math.hypot(bx-ax,bz-az),horiz=Math.abs(bz-az)<1e-6;if(len<.05)continue;const mx=(ax+bx)/2,mz=(az+bz)/2,ids=near(mx,mz);
   const wins=horiz?pl.windows.filter(w=>Math.abs(w.z-az)<1e-6&&w.x>Math.min(ax,bx)&&w.x<Math.max(ax,bx)):[];
   // 1 樓樓梯間西側外牆：通往出入口的門洞。
   if(lv.no===1&&!horiz&&ax===0&&Math.min(az,bz)<=pl.exit.z&&Math.max(az,bz)>=pl.exit.z){const z0=Math.min(az,bz),z1=Math.max(az,bz),a=pl.exit.z-.45,b=pl.exit.z+.45;box(.15,H,a-z0,0,H/2,(z0+a)/2,wm,wallHeat(ids));box(.15,H,z1-b,0,H/2,(b+z1)/2,wm,wallHeat(ids));box(.15,H-2.05,.9,0,(H+2.05)/2,pl.exit.z,wm,wallHeat(ids));
    const out=new T.Mesh(new T.PlaneGeometry(.9,2.05),new T.MeshBasicMaterial({color:'#dfe8f0'}));out.rotation.y=Math.PI/2;out.position.set(-.2,1.03,pl.exit.z);root.add(out);const sign=new T.Mesh(new T.BoxGeometry(.05,.18,.5),new T.MeshBasicMaterial({color:'#22c55e'}));sign.position.set(.1,2.35,pl.exit.z);root.add(sign);const t=label('出入口（E 撤出）','#4ade80');t.position.set(.3,2.6,pl.exit.z);root.add(t);continue;}
   if(!wins.length){box(horiz?len:.15,H,horiz?.15:len,mx,H/2,mz,wm,wallHeat(ids));continue;}
   let x=Math.min(ax,bx);const end=Math.max(ax,bx);for(const w of wins.sort((a,b)=>a.x-b.x)){const a=w.x-INTERIOR.windowWidth/2,b=w.x+INTERIOR.windowWidth/2;if(a>x)box(a-x,H,.15,(x+a)/2,H/2,az,wm,wallHeat(ids));box(INTERIOR.windowWidth,.9,.15,w.x,.45,az,wm,wallHeat(ids));box(INTERIOR.windowWidth,H-2.1,.15,w.x,(H+2.1)/2,az,wm,wallHeat(ids));
    const glass=new T.Mesh(new T.PlaneGeometry(INTERIOR.windowWidth,1.2),new T.MeshStandardMaterial({color:'#9fb7c9',transparent:true,opacity:.45,roughness:.1,side:T.DoubleSide}));glass.position.set(w.x,1.5,az);add(glass,wallHeat([w.space]));
    const sky=new T.Mesh(new T.PlaneGeometry(INTERIOR.windowWidth,1.2),new T.MeshBasicMaterial({color:'#b9c7d6'}));sky.position.set(w.x,1.5,az+(az===0?-.3:.3));root.add(sky);lv.windowMeshes.set(w.id,{glass,sky});x=b;}
   if(x<end)box(end-x,H,.15,(x+end)/2,H/2,az,wm,wallHeat(ids));}
  for(const d of pl.doors){box(INTERIOR.doorWidth,H-2.05,.15,d.x,(H+2.05)/2,d.z,wm,wallHeat([d.a,d.b]));
   const hinge=new T.Group();hinge.position.set(d.x-INTERIOR.doorWidth/2,0,d.z);root.add(hinge);const leaf=new T.Mesh(new T.BoxGeometry(INTERIOR.doorWidth-.04,2.03,.05),mat(d.id==='D0'?'#6b7a82':'#8a5a3a'));leaf.position.set(INTERIOR.doorWidth/2,1.015,0);hinge.add(leaf);
   leaf.userData.heat=()=>ENV.ambient+(Math.max(lvT(lv,d.a),lvT(lv,d.b))-ENV.ambient)*.6;leaf.userData.mat=leaf.material;meshes.push(leaf);
   const knob=new T.Mesh(new T.SphereGeometry(.035,8,6),new T.MeshStandardMaterial({color:'#c9b46a',metalness:.6}));knob.position.set(INTERIOR.doorWidth-.12,1,.05);leaf.add(knob);lv.doorMeshes.set(d.id,{hinge,leaf});}
  for(const f of pl.furniture)box(f.w,f.h,f.d,f.x,f.h/2,f.z,mat('#5d5148'),()=>ENV.ambient+(lvT(lv,f.space)-ENV.ambient)*.25);
  // 樓梯：中間隔牆；有上一層時建第一段、平台、第二段（每段 8 階，示意尺寸）。
  const sm=mat('#9ea3a0'),cold=()=>ENV.ambient+(lvT(lv,'stair')-ENV.ambient)*.3;
  box(.12,FH,STAIR.zHigh-STAIR.zLow,STAIR.xMid,FH/2,(STAIR.zLow+STAIR.zHigh)/2,wm,cold);
  if(!lv.up||!lv.down)box(.12,1.1,D-STAIR.zHigh,STAIR.xMid,.55,(STAIR.zHigh+D)/2,mat('#777'),cold);
  if(lv.up){const n=STAIR.steps,rise=FH/2/n,run=STAIR.run/n;
   for(let i=0;i<n;i++){box(1.6,.06,run+.02,2.65,(i+1)*rise-.03,STAIR.zLow+(i+.5)*run,sm,cold);box(1.6,.06,run+.02,.85,FH/2+(i+1)*rise-.03,STAIR.zHigh-(i+.5)*run,sm,cold);}
   box(3.4,.08,D-STAIR.zHigh,1.75,FH/2-.04,(STAIR.zHigh+D)/2,sm,cold);}
  // 連結送水管出水口（示意，紅色箱）。
  {const sp=pl.standpipe;const cab=box(.22,.7,.5,3.33,1.05,sp.z,new T.MeshStandardMaterial({color:'#c4161c',roughness:.5}),()=>ENV.ambient);cab.name='standpipe';const t=label(`送水口 ${lv.no}F`,'#ff7b72');t.scale.multiplyScalar(.7);t.position.set(3.3,1.65,sp.z);root.add(t);}
  {const t=label(`${lv.no} 樓`,'#ffd33d');t.position.set(1.75,2.5,7.12);root.add(t);}
  for(const v of pl.victims){const fig=createPatient(root,{sex:v.sex,condition:'unconscious'});fig.root.position.set(v.x,0,v.z);fig.root.rotation.y=v.heading;fig.body.traverse(o=>{if(o.isMesh){o.userData.heat=()=>36;o.userData.mat=o.material;meshes.push(o);}});lv.victimFigs.set(v.id,fig);}
  // 火焰效果（起火樓層與上一層）。
  if(lv.no===fireFloor||lv.no===fireFloor+1){const flames=pts(root,160,flameTex,.9,T.AdditiveBlending,.95),roll=pts(root,200,rollTex,1.1,T.AdditiveBlending,.85),light=new T.PointLight('#ff7a2a',0,14,1.4);root.add(light);roll.visible=false;
   lv.fx={flames,roll,light,fl:[...Array(160)].map(()=>({t:Math.random(),u:Math.random()-.5,v:Math.random()-.5})),rl:[...Array(200)].map(()=>({t:Math.random(),u:Math.random(),v:Math.random()}))};}
  syncDoors(lv);
 }
 function syncDoors(lv=L){for(const d of lv.plan.doors){const m=lv.doorMeshes.get(d.id);if(!m)continue;m.hinge.rotation.y=d.state==='open'?1.45:d.state==='ajar'?.3:0;m.leaf.rotation.z=d.forced?.06:0;}
  for(const w of lv.plan.windows){const m=lv.windowMeshes.get(w.id);if(m)m.glass.visible=w.state==='closed';}lv.segs=wallSegments(lv.plan);}
 function clearAll(){for(const m of meshes)m.geometry?.dispose();for(const lv of levels.values())world.remove(lv.root);levels.clear();meshes=[];for(const c of crew)world.remove(c.g);crew=[];L=plan=env=null;}

 // ---------- 任務設定 ----------
 function setup(site,{seed=Date.now(),closed=false,victims=1,upperVictims=0,floors=[1,site.floor],vitalsFor=()=>({})}={}){
  clearAll();fireFloor=site.floor;const rand=seeded(seed),width=site.wall?Math.hypot(site.wall[2]-site.wall[0],site.wall[3]-site.wall[1]):18;let vid=0;
  for(const no of floors){const fire=no===fireFloor,pl=makeFloorPlan(rand,{facadeWidth:width,floor:no,closed:fire&&closed,victims:fire?victims:no===fireFloor+1?upperVictims:0});
   if(!fire)for(const w of pl.windows)if(w.fire)w.state='closed';
   for(const v of pl.victims){v.id='I'+(++vid);v.floor=no;v.sex=rand()<.5?'male':'female';v.weight=Math.round(v.sex==='male'?60+rand()*30:48+rand()*27);Object.assign(v,vitalsFor(v));}
   const e=makeEnv(pl);if(!fire){const f=e.spaces[pl.fire.space];f.T=ENV.ambient;f.smoke=0;f.o2=.21;f.fuel=0;}
   const lv={no,root:new T.Group(),plan:pl,env:e,doorMeshes:new Map(),windowMeshes:new Map(),smokeBoxes:new Map(),victimFigs:new Map(),placed:{fan:null,light:[]},fx:null,intensity:0,up:floors.includes(no+1),down:floors.includes(no-1),segs:[]};
   lv.root.position.y=base(no);world.add(lv.root);levels.set(no,lv);}
  for(const lv of levels.values())buildLevel(lv);
  crew=[0,1].map(i=>{const g=new T.Group();world.add(g);const p=createPerson(g,'隊員');p.beam.visible=true;p.body.traverse(o=>{if(o.isMesh&&o!==p.beam){o.userData.heat=()=>38;o.userData.mat=o.material;meshes.push(o);}});g.visible=false;return {i,g,p,lv:1,seg:'floor',x:0,z:0,y:0,heading:0,state:'follow',path:[],task:null,walk:0,out:true};});
  useLevel(floors[0]);log.length=0;me.maxExposure=0;me.visited=new Set();return levels.get(fireFloor).plan;
 }
 function clear(){clearAll();api.active=false;}
 function note(kind,text,extra={}){log.push({kind,text,...extra});api.onEvent?.(kind,text,extra);}
 // 延燒到上一層：上一層起火房間窗戶破裂、開始產煙。
 function igniteUpper(){const lv=levels.get(fireFloor+1);if(!lv)return false;const w=lv.plan.windows.find(w=>w.fire);w.state='broken';syncDoors(lv);const f=lv.env.spaces[lv.plan.fire.space];f.smoke=Math.max(f.smoke,.35);f.T=Math.max(f.T,180);return true;}
 function step(dt,{fires={},cooling=null}={}){if(!levels.size)return {events:[],cap:1};const events=[];
  for(const lv of levels.values()){lv.intensity=fires[lv.no]??0;const r=stepEnv(lv.plan,lv.env,dt,{intensity:lv.intensity,fanOn:!!lv.placed.fan?.on,cooling:cooling&&cooling.lv===lv.no?cooling:null});
   if(lv.no===fireFloor)stepInfo=r;if(lv===L)lastPpv=r.ppv;
   for(const e of r.events){events.push(e);note(e,`${lv.no} 樓起火房間`+(e==='flashover'?'閃燃（示意門檻：上層 600 °C）':'天花板出現火舌（滾燃徵兆，示意門檻：上層 500 °C）'),{floor:lv.no});}}
  for(const lv of levels.values()){const up=levels.get(lv.no+1);if(up)stackExchange(lv.env.spaces.stair,up.env.spaces.stair,dt);}
  // 回燃徵兆倒數：門縫進氣本身就是危險來源；只有冷卻（溫度或未燃氣體降到門檻下）或關門才解除。
  if(me.pending){const p=me.pending,e=levels.get(p.lv).env.spaces[p.space];p.t+=dt;
   if(e.fuel<ENV.backdraft.fuel-.15||e.T<ENV.backdraft.temp-40){note('backdraftAvoided','已冷卻至回燃門檻以下（示意）',{floor:p.lv});me.pending=null;}else if(p.t>=ENV.warnDelay){backdraft(p.lv,p.space,p.at);me.pending=null;}}
  return {events,cap:stepInfo.cap};}
 function backdraft(no,spaceId,at){const lv=levels.get(no);applyBackdraft(lv.env.spaces[spaceId]);me.burstT=1;burst.userData.at=at.clone().setY(at.y+base(no));me.shake=.8;const d=Math.hypot(me.x-at.x,me.z-at.z),near=api.active&&me.lv===no&&d<4;if(near)me.exposure=Math.min(EXPOSURE.retreat,me.exposure+60*(1-d/4));note('backdraft',`${no} 樓回燃（示意）：開口處噴出火球`,{floor:no,space:spaceId,near});}

 // ---------- 進入與撤出 ----------
 function enter({hose=false,budget=0,items={}}={}){const first=[...levels.keys()][0];useLevel(first);me.lv=first;me.seg='floor';me.x=plan.entry.x;api.yaw=plan.entry.heading;me.z=plan.entry.z;me.y=base(first);me.crouch=false;me.exposure=0;
  me.trail=[{x:plan.exit.x,z:plan.exit.z,y:me.y}];me.crumbs=[{x:me.x,z:me.z,y:me.y,lv:me.lv,seg:'floor'}];me.hoseIn=hose;me.hoseBudget=budget;me.standpipe=null;me.items=items;me.forcing=null;me.visited.add(first);
  for(const c of crew){c.out=false;c.lv=first;c.seg='floor';c.x=plan.entry.x-.6;c.z=plan.entry.z+(c.i?.45:-.45);c.y=me.y;c.state='follow';c.task=null;c.path=[];c.crumb=false;c.g.visible=true;}
  api.active=true;note('enter','進入建物（1 樓）');}
 function exit(){api.active=false;for(const c of crew){if(c.task?.victim)c.task.victim.state='inside';c.state='follow';c.task=null;c.g.visible=false;c.out=true;}me.pending=null;me.forcing=null;me.hoseIn=false;me.standpipe=null;crewWater.visible=false;note('exit','撤出建物');}

 // ---------- 移動（含樓梯） ----------
 const eye=()=>me.crouch?INTERIOR.eyeCrouch:INTERIOR.eyeStand;
 const d3=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z,(a.y??0)-(b.y??0));
 function trailLen(){let l=0;for(let i=1;i<me.trail.length;i++)l+=d3(me.trail[i],me.trail[i-1]);return l+d3(me,me.trail.at(-1));}
 function hoseLeft(){return me.hoseBudget-trailLen();}
 const busy=()=>crew.some(c=>!c.out&&c.task&&c.state!=='follow');
 function move(dt,[f,r],yaw,run){const len=Math.hypot(f,r);if(len<.05)return;const onStair=me.seg!=='floor',sp=(me.crouch?1.0:run&&!onStair?2.8:1.6)*Math.min(1,len),fx=-Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw),dx=(fx*f+rx*r)/len,dz=(fz*f+rz*r)/len;
  const old={x:me.x,z:me.z,y:me.y,lv:me.lv,seg:me.seg};
  const segs=[...L.segs,...stairSegments(me.seg,{up:L.up,down:L.down})],p=resolveCircle(plan,me.x+dx*sp*dt,me.z+dz*sp*dt,.32,segs);
  const t=stairTransition(me.seg,p.x,p.z,{up:L.up,down:L.down});
  if(t.dLv){if(busy()){api.hint?.('隊員正在搜索／搬運／射水：全組一起行動，下達「1 跟隨」或等任務完成後再上下樓（示意）');return;}me.lv+=t.dLv;useLevel(me.lv);if(!me.visited.has(me.lv)){me.visited.add(me.lv);note('floor',`抵達 ${me.lv} 樓`,{floor:me.lv});}}
  me.seg=t.seg;me.x=p.x;me.z=p.z;me.y=base(me.lv)+stairY(me.seg,me.z);me.walk=(me.walk??0)+dt*sp*2.2;
  if(me.hoseIn){// 水線沿走過的路線鋪設；走回頭時收回；長度不足時不能再前進。
   for(let i=0;i<me.trail.length-1;i++)if(d3(me.trail[i],me)<.7){me.trail.length=i+1;break;}
   if(hoseLeft()<0){Object.assign(me,old);useLevel(me.lv);api.hint?.(me.standpipe?'水線長度不足（送水口水帶 40 m，示意）':'水線長度不足：可攜帶延長水帶，或攜帶水帶背包在較近樓層的送水口接水線');return;}
   if(d3(me,me.trail.at(-1))>.8)me.trail.push({x:me.x,z:me.z,y:me.y});}
  const lc=me.crumbs.at(-1);if(!lc||d3(me,lc)>.25){me.crumbs.push({x:me.x,z:me.z,y:me.y,lv:me.lv,seg:me.seg});if(me.crumbs.length>80)me.crumbs.shift();}}

 // ---------- 互動（E：開關門窗、撤出；X：微開門；F：使用器材） ----------
 function nearest(list,f,max){let best=null,bd=max;for(const o of list){const d=f(o);if(d<bd){bd=d;best=o;}}return best;}
 const doorDist=d=>Math.hypot(me.x-d.x,me.z-d.z),winDist=w=>Math.hypot(me.x-w.x,me.z-w.z),onFloor=()=>me.seg==='floor';
 function otherSide(d){const s=spaceOf(plan,me.x,me.z)?.id;return s===d.a?d.b:d.a;}
 function openDoor(d,to){const target=otherSide(d),e=env.spaces[target],out=to==='open'&&d.state==='closed'||to==='ajar'?openingOutcome(e,to):'safe';d.state=to;syncDoors();
  if(out==='warning'){me.pending={lv:L.no,space:target,t:0,at:new T.Vector3(d.x,1.6,d.z),door:d.id};api.hint?.('⚠ 門縫煙被吸入後又噴出、門扇很燙（回燃徵兆）：立即關門（E）或以水霧冷卻');note('backdraftSign',`${L.no} 樓門微開出現回燃徵兆（示意）`,{floor:L.no,door:d.id});}
  else if(out==='backdraft')backdraft(L.no,target,new T.Vector3(d.x,1.6,d.z));
  else if(to!=='closed'&&target===plan.fire.space&&L.intensity>0&&!log.some(l=>l.kind==='fireRoomOpen'&&l.floor===L.no))note('fireRoomOpen',`開啟 ${L.no} 樓起火房間門`,{floor:L.no});}
 function interact(){if(!api.active)return;if(!onFloor()){api.hint?.('在樓梯上：走到樓梯口再操作');return;}
  if(L.no===[...levels.keys()][0]&&Math.hypot(me.x-plan.exit.x,me.z-plan.exit.z)<1.5){api.onExit?.();return;}
  const v=nearest(plan.victims.filter(v=>v.state==='inside'),v=>Math.hypot(me.x-v.x,me.z-v.z),1.4);if(v){v.found=true;assignCarry(v);return;}
  const d=nearest(plan.doors,doorDist,1.4),w=nearest(plan.windows,winDist,1.5);
  if(d&&(!w||doorDist(d)<=winDist(w))){if(d.locked&&!d.forced){api.hint?.(me.items.halligan?'門上鎖：按住 F 以破壞器材破門':'門上鎖：需要破壞器材（在消防車旁按 U 選裝備），或指令隊員搜索時由隊員破門');return;}
   if(d.state==='closed'){openDoor(d,'open');api.hint?.('門已開啟（E 關門；X 微開）');}else{d.state='closed';syncDoors();if(me.pending?.door===d.id&&me.pending.lv===L.no){me.pending=null;note('backdraftAvoided','關門阻斷進氣，回燃徵兆解除（示意）',{floor:L.no});api.hint?.('已關門，回燃徵兆解除；可先以水霧冷卻再開門');}else api.hint?.('門已關閉');}return;}
  if(w){if(w.state==='closed'){const out=openingOutcome(env.spaces[w.space],'open');w.state='open';syncDoors();note('vent',`開窗排煙：${L.no} 樓${spaceById(plan,w.space).name}`,{floor:L.no,window:w.id});if(out==='backdraft')backdraft(L.no,w.space,new T.Vector3(w.x,1.5,w.z));else api.hint?.('已開窗（排煙口）');}
   else if(w.state==='open'){w.state='closed';syncDoors();api.hint?.('已關窗');}else api.hint?.('窗戶已破');return;}
  api.hint?.(L.no===[...levels.keys()][0]?'附近沒有可操作的門窗（1 樓樓梯間西側為出入口）':'附近沒有可操作的門窗');}
 function ajar(){if(!api.active||!onFloor())return;const d=nearest(plan.doors,doorDist,1.4);if(!d){api.hint?.('走到門前按 X 微開門（觀察門後狀況）');return;}if(d.locked&&!d.forced){api.hint?.('門上鎖，無法微開');return;}
  if(d.state==='closed'){openDoor(d,'ajar');if(!me.pending)api.hint?.('門已微開：觀察煙況，可對門縫以水霧冷卻；再按 X 全開、E 關門');}else if(d.state==='ajar'){openDoor(d,'open');api.hint?.('門已全開');}}
 function useItem(hold){if(!api.active||!onFloor())return;
  const d=nearest(plan.doors,doorDist,1.4),spd=Math.hypot(me.x-plan.standpipe.x,me.z-plan.standpipe.z);
  if(d&&d.locked&&!d.forced&&doorDist(d)<spd){if(!me.items.halligan){api.hint?.('沒有攜帶破壞器材');return;}if(hold)me.forcing??={door:d,t:0,lv:L.no};return;}
  if(!hold)return;
  // 連結送水管：在樓梯間送水口接水帶背包的水線（示意 40 m；由消防車加壓送水，用水量計入水箱）。
  const sp=plan.standpipe;if(Math.hypot(me.x-sp.x,me.z-sp.z)<1.4){if(me.hoseIn&&!me.standpipe){api.hint?.('已帶著自消防車拉入的水線');return;}if(me.standpipe===L.no){me.hoseIn=false;me.standpipe=null;me.trail=[];api.hint?.('已拆除送水口水線');return;}
   if(!me.items.pack){api.hint?.('送水口需攜帶「水帶背包」（在消防車旁按 U 選裝備）');return;}me.hoseIn=true;me.standpipe=L.no;me.hoseBudget=PACK;me.trail=[{x:sp.x,z:sp.z,y:base(L.no)+.9}];note('standpipe',`於 ${L.no} 樓送水口接水線（連結送水管，示意）`,{floor:L.no});api.hint?.(`已於 ${L.no} 樓送水口接上水線（40 m，示意）：按住 Space 出水`);return;}
  const stairDoor=plan.doors.find(x=>x.id==='D0'),placed=L.placed;
  if(me.items.fan&&Math.hypot(me.x-stairDoor.x,me.z-stairDoor.z)<2.2){if(!placed.fan){placed.fan={on:true,mesh:fanMesh()};note('fan',`排煙機於 ${L.no} 樓樓梯間門口運轉`,{floor:L.no});const p=ppvState(plan,true);api.hint?.(p.effective?'排煙機運轉：正壓送風，煙由排氣窗排出'+(p.intoFire?'（⚠ 送風範圍含起火房間，會助燃）':''):'排煙機運轉，但'+p.reason);}else{placed.fan.on=!placed.fan.on;api.hint?.(placed.fan.on?'排煙機啟動':'排煙機停止');}return;}
  if(me.items.light){const n=[...levels.values()].reduce((a,lv)=>a+lv.placed.light.length,0);if(n>=2){api.hint?.('照明燈已放置 2 盞');return;}const g=new T.Group(),pole=new T.Mesh(new T.CylinderGeometry(.03,.03,1.6,8),mat('#444'));pole.position.y=.8;const lamp=new T.Mesh(new T.BoxGeometry(.3,.2,.12),new T.MeshBasicMaterial({color:'#fff8d0'}));lamp.position.y=1.65;const l=new T.PointLight('#fff5d8',6,9,1.5);l.position.y=1.7;g.add(pole,lamp,l);g.position.set(me.x,0,me.z);L.root.add(g);placed.light.push(g);note('light',`放置照明燈（${L.no} 樓）`,{floor:L.no});api.hint?.('已放置照明燈');return;}
  api.hint?.('附近沒有可使用器材的位置（破壞器材：上鎖門前；送水口：樓梯間紅色箱；排煙機：樓梯間門口；照明燈：任意處）');}
 function fanMesh(){const g=new T.Group(),s=plan.doors.find(x=>x.id==='D0');const ring=new T.Mesh(new T.TorusGeometry(.38,.06,8,24),mat('#c4161c'));ring.position.y=.5;const b=new T.Mesh(new T.BoxGeometry(.6,.12,.5),mat('#333'));b.position.y=.06;g.add(ring,b);g.position.set(s.x,0,s.z+.9);L.root.add(g);return g;}

 // ---------- 隊員 ----------
 function waypoints(from,toSpace,goal){const s=spaceOf(plan,from.x,from.z)?.id??'corridor',r=pathDoors(plan,s,toSpace);if(!r.doors)return {blocked:r.blocked};const pts=[];let cur=s;
  for(const d of r.doors){const nxt=d.a===cur?d.b:d.a,sp=spaceById(plan,cur),dir=(sp.z0+sp.z1)/2<d.z?1:-1;pts.push({x:d.x,z:d.z-dir*.6},{x:d.x,z:d.z+dir*.6});cur=nxt;}
  // 樓梯間內避開梯段：先走到樓梯口。
  if(s==='stair'&&from.z>STAIR.zLow-.2)pts.unshift({x:from.x,z:7.8});pts.push(goal);return {pts};}
 function goTo(c,space,goal,then){const w=waypoints(c,space,goal);
  // 路徑上有上鎖的門：先走到門前破門（隊員自帶破壞器材，示意），再繼續。
  if(w.blocked){const d=w.blocked,from=spaceOf(plan,c.x,c.z)?.id??'corridor',side=[d.a,d.b].find(id=>pathDoors(plan,from,id).doors)??from,sp=spaceById(plan,side),dir=(sp.z0+sp.z1)/2<d.z?-1:1;
   c.state='force';c.task={...(c.task??{}),door:d,t:0,then:()=>goTo(c,space,goal,then)};c.path=waypoints(c,side,{x:d.x+(c.i?.35:-.35),z:d.z+dir*.6}).pts??[];return;}
  c.path=w.pts;c.after=then;c.state='move';}
 function stepCrew(c,dt,speed){const g=c.path[0];if(!g)return true;const dx=g.x-c.x,dz=g.z-c.z,l=Math.hypot(dx,dz);if(l<.12){c.path.shift();return !c.path.length;}c.heading=Math.atan2(-dx,-dz);const k=Math.min(l,speed*dt);c.x+=dx/l*k;c.z+=dz/l*k;c.walk+=dt*speed*3;return false;}
 const ready=()=>crew.filter(c=>!c.out&&c.lv===L.no&&!c.task?.victim);
 function command(n){if(!api.active)return;const idle=crew.filter(c=>!c.out);if(!idle.length){api.hint?.('隊員已撤出');return;}
  if(n!==1&&n!==4&&(!onFloor()||idle.some(c=>c.lv!==me.lv||c.seg!=='floor'))){api.hint?.('隊員還在樓梯上：到樓層後再下達指令');return;}
  if(n===1){for(const c of idle){if(c.task?.victim)continue;c.state='follow';c.task=null;c.path=[];}crewWater.visible=false;api.hint?.('隊員：跟隨中隊長');}
  if(n===2){const searched=new Set(log.filter(l=>l.kind==='searched'&&l.floor===L.no).map(l=>l.space)),rooms=plan.spaces.filter(s=>s.kind==='room'&&!searched.has(s.id)&&!crew.some(c=>c.task?.room===s.id));
   const room=nearest(rooms,s=>Math.hypot((s.x0+s.x1)/2-me.x,(s.z0+s.z1)/2-me.z),1e9);if(!room){api.hint?.(`${L.no} 樓所有房間已搜索或搜索中`);return;}
   const e=env.spaces[room.id];if(e.T>=300){api.hint?.(`隊員回報：${room.name}溫度過高（示意 ${Math.round(e.T)} °C），需先控制火勢或冷卻`);return;}
   const team=ready();if(!team.length){api.hint?.('隊員正在搬運受困者');return;}
   for(const c of team){c.task={kind:'search',room:room.id,t:0};goTo(c,room.id,{x:(room.x0+room.x1)/2+(c.i?.6:-.6),z:(room.z0+room.z1)/2},()=>{c.state='search';c.task.t=0;});}
   api.hint?.(`隊員：搜索 ${L.no} 樓${room.name}`);note('command',`指令隊員搜索 ${L.no} 樓${room.name}`,{floor:L.no});}
  if(n===3){const sp=spaceOf(plan,me.x,me.z),cands=plan.windows.filter(w=>w.state==='closed');const w=nearest(cands,w=>(w.space===sp?.id?0:20)+Math.hypot(w.x-me.x,w.z-me.z),1e9);if(!w){api.hint?.('沒有可開啟的窗戶');return;}
   const c=ready().find(c=>!c.task);if(!c){api.hint?.('隊員忙碌中');return;}c.task={kind:'vent',window:w.id};goTo(c,w.space,{x:w.x,z:w.z+(w.z===0?.7:-.7)},()=>{const e=env.spaces[w.space];if(backdraftRisk(e)){api.hint?.(`隊員回報：${spaceById(plan,w.space).name}有回燃徵兆，未開窗`);note('crewRefuse','隊員因回燃徵兆未開窗',{floor:L.no});}else{w.state='open';syncDoors();note('vent',`隊員開窗排煙：${L.no} 樓${spaceById(plan,w.space).name}`,{floor:L.no,window:w.id,by:'crew'});api.hint?.(`隊員已開啟${spaceById(plan,w.space).name}窗戶`);}c.state='follow';c.task=null;});
   api.hint?.(`隊員：開啟${spaceById(plan,w.space).name}窗戶排煙`);}
  if(n===4){for(const c of idle){if(c.task?.victim)continue;c.state='follow';c.task=null;c.path=[];c.out=true;c.g.visible=false;}crewWater.visible=false;api.hint?.('隊員：撤離（沿樓梯下樓，示意）');note('command','指令隊員撤離');}
  if(n===5){if(!me.hoseIn){api.hint?.('隊員需要水線：先自消防車拉入水線，或攜帶水帶背包在送水口接水線');return;}if(!(L.intensity>0)){api.hint?.(`${L.no} 樓沒有燃燒中的火點`);return;}
   const c=ready().find(c=>c.i===0&&!c.task)??ready().find(c=>!c.task);if(!c){api.hint?.('隊員忙碌中');return;}
   const d=plan.doors.find(d=>d.a===plan.fire.space),dir=d.z===5?1:-1;c.task={kind:'spray',door:d.id};
   goTo(c,'corridor',{x:d.x,z:d.z+dir*.8},()=>{if(d.state!=='open'){if(backdraftRisk(env.spaces[plan.fire.space])){api.hint?.('隊員回報：起火房間有回燃徵兆，先以水霧冷卻門後空間再進攻');note('crewRefuse','隊員因回燃徵兆未開門',{floor:L.no});c.state='follow';c.task=null;return;}d.state='open';syncDoors();}
    c.path=[{x:d.x,z:d.z-dir*.5}];c.state='spray';c.task.t=0;});
   api.hint?.(`隊員：架設水線，自 ${L.no} 樓起火房間門口進攻（示意）`);note('command',`指令隊員射水（${L.no} 樓）`,{floor:L.no});}}
 function assignCarry(v){if(v.state!=='inside')return;const team=crew.filter(c=>!c.out&&c.lv===L.no&&!c.task?.victim);if(team.length<2){api.hint?.(`發現受困者 ${v.id}：需 2 名隊員搬運（隊員忙碌、在別處或已撤出）`);return;}
  v.state='assigned';api.hint?.(`發現受困者 ${v.id}：隊員前往搬運至樓梯間`);note('found',`發現受困者 ${v.id}（${L.no} 樓）`,{floor:L.no,victim:v.id});crewWater.visible=false;
  for(const c of team){c.task={kind:'carry',victim:v};goTo(c,v.space,{x:v.x+(c.i?.5:-.5),z:v.z},()=>{c.state='lift';c.t=0;});}}
 // 跟隨：同一樓層地面上時依空間路徑跟隨；在樓梯上或不同樓層時沿中隊長走過的路線（麵包屑）在後方 1.3／2.6 m。
 function crumbAt(dist){let need=dist,prev={x:me.x,z:me.z,y:me.y,lv:me.lv,seg:me.seg};for(let i=me.crumbs.length-1;i>=0;i--){const c=me.crumbs[i],l=d3(prev,c);if(l>=need){const k=need/(l||1);return {x:prev.x+(c.x-prev.x)*k,z:prev.z+(c.z-prev.z)*k,y:prev.y+(c.y-prev.y)*k,lv:k<.5?prev.lv:c.lv,seg:k<.5?prev.seg:c.seg};}need-=l;prev=c;}return me.crumbs[0]??prev;}
 function updateCrew(dt){crewSprays=[];let sprayer=null;
  for(const c of crew){if(c.out)continue;
   if(c.state==='follow'){const same=c.lv===me.lv&&me.seg==='floor'&&c.seg==='floor';if(!same)c.crumb=true;
    if(c.crumb){const s=crumbAt(1.3*(c.i+1)),dx=s.x-c.x,dz=s.z-c.z;if(Math.hypot(dx,dz)>.02){c.heading=Math.atan2(-dx,-dz);c.walk+=Math.hypot(dx,dz)*3;}c.x=s.x;c.z=s.z;c.lv=s.lv;c.seg=s.seg;c.y=s.y;
     if(same&&s.seg==='floor'&&s.lv===me.lv&&me.seg==='floor'&&Math.hypot(c.x-me.x,c.z-me.z)<3)c.crumb=false;c.path=[];}
    else{const tgt={x:me.x+Math.sin(api.yaw)*(1.2+c.i*.8)+(c.i?.4:-.4),z:me.z+Math.cos(api.yaw)*(1.2+c.i*.8)},tsp=spaceOf(plan,tgt.x,tgt.z)?.id;const okT=tsp&&!(tsp==='stair'&&tgt.z>STAIR.zLow);
     c.followT=(c.followT??0)-dt;if(c.followT<=0||!c.path.length){c.followT=.6;const w=waypoints(c,okT?tsp:(spaceOf(plan,me.x,me.z)?.id??'corridor'),okT?tgt:{x:me.x,z:me.z});c.path=w.pts??[];}
     if(Math.hypot(c.x-me.x,c.z-me.z)>1.1)stepCrew(c,dt,me.crouch?1.0:1.8);else c.path=[];c.y=base(c.lv);}}
   else if(c.state==='move'){if(stepCrew(c,dt,1.6)){c.state='idle';c.after?.();}}
   else if(c.state==='force'){if(c.path.length){stepCrew(c,dt,1.6);}else{c.task.t+=dt;if(c.task.t>=FORCE.crew){const d=c.task.door;if(!d.forced){d.forced=true;d.state='open';syncDoors();note('forced',`隊員破門：${L.no} 樓 ${d.id}`,{floor:L.no,door:d.id,by:'crew'});api.hint?.('隊員已破門');}c.task.then?.();}}}
   else if(c.state==='search'){c.task.t+=dt;const room=spaceById(plan,c.task.room);c.heading+=dt*1.5;
    const v=plan.victims.find(v=>v.space===room.id&&v.state==='inside');if(c.task.t>=searchTime(room)*.5&&c.i===0||c.task.t>=searchTime(room)){if(v){v.found=true;assignCarry(v);continue;}
     if(c.task.t>=searchTime(room)){if(!log.some(l=>l.kind==='searched'&&l.space===room.id&&l.floor===L.no)){note('searched',`${L.no} 樓${room.name}搜索完成：無受困者`,{floor:L.no,space:room.id});api.hint?.(`隊員回報：${room.name}搜索完成，無受困者`);}c.state='follow';c.task=null;}}}
   else if(c.state==='lift'){c.t+=dt;if(c.t>1.5&&crew.filter(o=>o.task?.victim===c.task.victim).every(o=>o.state==='lift'||o.state==='carry')){c.state='carry';if(c.i===0){c.lead=true;c.task.victim.state='carried';const w=waypoints(c,'stair',{x:plan.entry.x,z:plan.entry.z});c.path=w.pts??[];}}}
   else if(c.state==='carry'){const v=c.task.victim;if(c.lead){const done=stepCrew(c,dt,.8);v.x=c.x;v.z=c.z;const fig=L.victimFigs.get(v.id);fig.root.position.set(c.x,.75,c.z);fig.root.rotation.y=c.heading;
     if(done){v.state='rescued';fig.root.visible=false;note('rescued',`受困者 ${v.id} 搬運至 ${L.no} 樓樓梯間，交由支援人員搬下樓（示意）`,{floor:L.no,victim:v.id});api.onRescue?.(v);for(const o of crew)if(o.task?.victim===v){o.state='follow';o.task=null;o.lead=false;o.path=[];}}}
    else{const lead=crew.find(o=>o.lead&&o.task?.victim===c.task.victim);if(lead){const f=-Math.sin(lead.heading),g=-Math.cos(lead.heading);c.x=lead.x-f*1.3;c.z=lead.z-g*1.3;c.heading=lead.heading;c.walk=lead.walk;}}}
   else if(c.state==='spray'){c.task.t+=dt;stepCrew(c,dt,.8);const f=plan.fire,dx=f.x-c.x,dz=f.z-c.z,dist=Math.hypot(dx,dz);c.heading=Math.atan2(-dx,-dz);
    if(!(L.intensity>0)){note('crewOut',`隊員回報：${L.no} 樓火點已撲滅`,{floor:L.no});api.hint?.(`隊員回報：${L.no} 樓火點已撲滅，回到跟隨`);c.state='follow';c.task=null;}
    else if(!me.hoseIn){api.hint?.('水線已拆除，隊員停止射水');c.state='follow';c.task=null;}
    else if(!lineBlocked(c.x,c.z,f.x,f.z)&&dist<=10){crewSprays.push({lv:L.no,space:plan.fire.space});sprayer={c,dist};}
    else if(!c.path.length)c.path=[{x:c.x+dx/dist*.6,z:c.z+dz/dist*.6}];}
   drawCrew(c);}
  crewWater.visible=!!sprayer;if(sprayer){const {c,dist}=sprayer,o=new T.Vector3(c.x,base(L.no)+1.25,c.z),fp=new T.Vector3(plan.fire.x,base(L.no)+.8,plan.fire.z),dir=fp.sub(o).normalize(),a=crewWater.geometry.attributes.position;
   cwl.forEach((w,i)=>{w.t+=.03;if(w.t>1)w.t-=1;const d=w.t*dist;a.setXYZ(i,o.x+dir.x*d+w.u*.08*d,o.y+dir.y*d+w.v*.06*d,o.z+dir.z*d);});a.needsUpdate=true;}}
 function drawCrew(c){c.g.visible=!c.out;c.g.position.set(c.x,c.y??base(c.lv),c.z);c.p.body.rotation.y=c.heading;const moving=['move','follow','carry','force'].includes(c.state),sw=moving?Math.sin(c.walk)*.4:0;c.p.legs[0].rotation.x=sw;c.p.legs[1].rotation.x=-sw;
  c.p.arms.forEach(a=>a.rotation.x=c.state==='carry'?-.6:c.state==='spray'?-1.3:c.state==='force'?-1.2+Math.sin(c.task?.t*8||0)*.6:-sw*.8);c.p.nozzle.visible=c.state==='spray';c.p.body.position.y=me.crouch&&c.state==='follow'?-.25:0;c.p.body.rotation.x=c.state==='search'?.35:c.state==='spray'?.15:0;}

 // ---------- 射水（Space）：直線水柱打火點；水霧冷卻上層熱煙或門後空間 ----------
 function spray(dt,mode,on,yaw,pitch){water.visible=!!on;if(!on||!api.active)return {hit:false,cooling:null};
  const look=new T.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)),o=new T.Vector3(me.x,me.y+eye()-.35,me.z).addScaledVector(look,.5);
  const reach=mode==='fog'?6:10,burning=onFloor()&&L.intensity>0,fire=new T.Vector3(plan.fire.x,base(L.no)+.8,plan.fire.z),to=fire.clone().sub(o),dist=to.length(),ang=look.angleTo(to);
  const blocked=!onFloor()||lineBlocked(me.x,me.z,plan.fire.x,plan.fire.z),hit=burning&&!blocked&&dist<=reach&&ang<=(mode==='fog'?.6:.3);
  // 冷卻：瞄準點 2.5 m 前方所在空間（可穿過開啟或微開的門）。
  const aim=o.clone().addScaledVector(look,2.5),asp=spaceOf(plan,aim.x,aim.z)??spaceOf(plan,me.x,me.z),reachable=onFloor()&&asp&&!lineBlocked(me.x,me.z,aim.x,aim.z,true);
  const cooling=reachable?{lv:L.no,space:asp.id,rate:(mode==='fog'?1:.35)*(pitch>.12?1.3:.7)}:null;
  const range=hit?dist:reach*.8,a=water.geometry.attributes.position;wl.forEach((w,i)=>{w.t+=dt*1.8;if(w.t>1)w.t-=1;const d=w.t*range,spread=(mode==='fog'?.5:.06)*d;a.setXYZ(i,o.x+look.x*d+w.u*spread,o.y+look.y*d+w.v*spread-(mode==='fog'?0:d*d*.01),o.z+look.z*d+w.u*spread*.5);});a.needsUpdate=true;water.material.size=mode==='fog'?.32:.16;
  return {hit,lv:L.no,cooling,dist,blocked,reach,burning,inCone:ang<=(mode==='fog'?.6:.3)};}
 function lineBlocked(ax,az,bx,bz,ajarOk=false){const list=ajarOk?wallSegments({...plan,doors:plan.doors.map(d=>d.state==='ajar'?{...d,state:'open'}:d)}):L.segs;
  for(const [cx,cz,dx,dz] of list){const d=(bx-ax)*(dz-cz)-(bz-az)*(dx-cx);if(Math.abs(d)<1e-9)continue;const u=((cx-ax)*(dz-cz)-(cz-az)*(dx-cx))/d,v=((cx-ax)*(bz-az)-(cz-az)*(bx-ax))/d;if(u>.02&&u<.98&&v>=0&&v<=1)return true;}return false;}

 // ---------- 每幀 ----------
 const ray=new T.Raycaster(),center=new T.Vector2(0,0);let thermalTimer=0;
 function updateFx(lv,dt){const fx=lv.fx;if(!fx)return;const k=Math.max(0,lv.intensity),pl=lv.plan,fe=lv.env.spaces[pl.fire.space],X=pl.fire.x,Z=pl.fire.z;
  const p=fx.flames.geometry.attributes.position;fx.fl.forEach((f,i)=>{f.t+=dt*(1.3+Math.random()*.6);if(f.t>1){f.t=0;f.u=Math.random()-.5;f.v=Math.random()-.5;}const w=1.6*Math.max(.25,k),h=f.t*Math.min(H,2.6*k+.3);p.setXYZ(i,X+f.u*w*(1-f.t*.5),h,Z+f.v*w*(1-f.t*.5));});p.needsUpdate=true;fx.flames.visible=k>0;fx.flames.material.size=.5+k*.7;
  const fs=spaceById(pl,pl.fire.space),rollOn=k>0&&(fe.T>=ENV.rollover||lv.env.flashed),q=fx.roll.geometry.attributes.position;fx.roll.visible=rollOn;
  if(rollOn)fx.rl.forEach((r,i)=>{r.t+=dt*.6;if(r.t>1){r.t=0;r.u=Math.random();r.v=Math.random();}const y=lv.env.flashed?Math.random()*H:H-.1-r.t*.5;q.setXYZ(i,fs.x0+r.u*(fs.x1-fs.x0),y,fs.z0+r.v*(fs.z1-fs.z0));});q.needsUpdate=true;
  fx.light.position.set(X,1.4,Z);fx.light.intensity=k*30*(lv.env.flashed?2:1)*(.85+Math.random()*.3);}
 function update(dt,{input=[0,0],yaw=0,pitch=0,run=false,forceHeld=false}={}){
  if(!L)return;api.yaw=yaw;
  if(api.active){move(dt,input,yaw,run);
   if(me.forcing){if(!forceHeld||me.forcing.lv!==me.lv||doorDist(me.forcing.door)>1.6){me.forcing=null;api.hint?.('破門中斷');}else{me.forcing.t+=dt;api.hint?.(`破門中… ${Math.min(100,Math.round(me.forcing.t/FORCE.player*100))}%`);if(me.forcing.t>=FORCE.player){const d=me.forcing.door;d.forced=true;d.state='closed';syncDoors();note('forced',`破壞進入：${L.no} 樓`+(d.id==='D0'?'樓梯間門':spaceById(plan,d.a).name+'門'),{floor:L.no,door:d.id,by:'player'});api.hint?.('門已破開（門鎖損壞），按 E 開門；可先按 X 微開觀察');me.forcing=null;}}}
   const sp=spaceOf(plan,me.x,me.z),e=env.spaces[sp?.id??'corridor'],felt=feltTemp(e,me.y-base(me.lv)+eye());me.exposure=stepExposure(me.exposure,felt,dt);me.maxExposure=Math.max(me.maxExposure,me.exposure);
   if(onFloor()&&sp?.id===plan.fire.space&&env.flashed)me.exposure=Math.min(EXPOSURE.retreat,me.exposure+25*dt);
   if(me.exposure>=EXPOSURE.retreat){note('retreat','熱暴露達上限，緊急撤出（示意）');api.onForcedExit?.();}
   updateCrew(dt);}
  for(const lv of levels.values()){updateFx(lv,dt);for(const [id,b] of lv.smokeBoxes){const e=lv.env.spaces[id],lh=layerHeight(e),h=H-lh;b.scale.y=Math.max(.01,h);b.position.y=lh+h/2;b.material.opacity=me.thermal?.08:Math.min(.92,.15+e.smoke*.8);b.visible=e.smoke>.02;}
   if(lv.placed.fan)lv.placed.fan.mesh.children[0].rotation.z+=lv.placed.fan.on?dt*20:0;}
  api.intensity=L.intensity;
  burst.visible=me.burstT>0;if(me.burstT>0){me.burstT-=dt;const a=burst.geometry.attributes.position,at=burst.userData.at,s=1-me.burstT;bl.forEach((b,i)=>a.setXYZ(i,at.x+b.d.x*b.s*s*2.5,at.y+b.d.y*b.s*s*1.2,at.z+b.d.z*b.s*s*2.5));a.needsUpdate=true;burst.material.opacity=Math.max(0,me.burstT);}
  me.shake=Math.max(0,me.shake-dt);
  const here=env.spaces[spaceOf(plan,me.x,me.z)?.id??'corridor'],relEye=Math.min(H-.05,me.y-base(me.lv)+eye()),vis=visibility(here,relEye,me.thermal),lit=L.placed.light.some(g=>Math.hypot(g.position.x-me.x,g.position.z-me.z)<6);
  scene.fog.density=1.73/(vis*(lit?1.4:1));scene.fog.color.set(me.thermal?'#151515':here.T>300?'#3a2a22':'#2c2c2e');
  thermalTimer-=dt;if(me.thermal&&thermalTimer<=0){thermalTimer=.2;for(const m of meshes){const c=thermalColor(m.userData.heat?.()??ENV.ambient,ENV.ambient,160);m.userData.tmat??=new T.MeshBasicMaterial();m.userData.tmat.color.setRGB(c[0],c[1],c[2]);}}
  if(me.hoseIn&&api.active){const pts=[...me.trail.map(t=>new T.Vector3(t.x,t.y+.05,t.z)),new T.Vector3(me.x,me.y+.05,me.z)];if(pts.length>=2&&(api.trailN!==pts.length||Math.random()<.2)){api.trailN=pts.length;hoseMesh.geometry.dispose();hoseMesh.geometry=new T.TubeGeometry(new T.CatmullRomCurve3(pts),Math.max(4,pts.length*3),.045,6,false);}hoseMesh.visible=pts.length>=2;}else hoseMesh.visible=false;
 }
 function setThermal(on){me.thermal=on;for(const m of meshes){if(on){m.userData.tmat??=new T.MeshBasicMaterial({color:'#333'});m.material=m.userData.tmat;}else m.material=m.userData.mat;}thermalTimer=0;amb.intensity=on?1:.35;}
 // 準星溫度：熱顯像儀讀值（示意）。
 function reticle(camera){ray.setFromCamera(center,camera);const hit=ray.intersectObjects(meshes,false)[0];if(!hit)return null;const t=hit.object.userData.heat?.()??ENV.ambient,dFire=Math.hypot(hit.point.x-plan.fire.x,hit.point.z-plan.fire.z,hit.point.y-base(L.no)-.8);return Math.round(dFire<1.4&&L.intensity>0?Math.max(t,450+L.intensity*300):t);}
 function render(renderer,camera,yaw,pitch){const y=me.y+eye()+(me.shake>0?(Math.random()-.5)*me.shake*.15:0),look=new T.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
  camera.position.set(me.x,y,me.z);camera.lookAt(me.x+look.x,y+look.y,me.z+look.z);torch.position.copy(camera.position);torch.target.position.copy(camera.position).add(look);
  const right=new T.Vector3(Math.cos(yaw),0,-Math.sin(yaw));nozzle.visible=me.hoseIn;nozzle.position.copy(camera.position).addScaledVector(look,.5).addScaledVector(right,.16).add(new T.Vector3(0,-.22,0));nozzle.lookAt(nozzle.position.clone().add(look));nozzle.rotateX(Math.PI/2);
  renderer.render(scene,camera);}
 // 小地圖：所在樓層示意平面、門窗狀態、火點、人員。
 function drawMap(ctx,size){const pad=10,s=(size-pad*2)/Math.max(plan.W,plan.D),ox=pad+(size-pad*2-plan.W*s)/2,oz=pad+(size-pad*2-plan.D*s)/2,X=x=>ox+x*s,Z=z=>oz+z*s;
  ctx.fillStyle='#0d1117';ctx.fillRect(0,0,size,size);
  for(const sp of plan.spaces){const e=env.spaces[sp.id],t=Math.min(1,(e.T-20)/500);ctx.fillStyle=`rgb(${40+t*150|0},${44+e.smoke*20|0},${50-t*20|0})`;ctx.fillRect(X(sp.x0),Z(sp.z0),(sp.x1-sp.x0)*s,(sp.z1-sp.z0)*s);}
  ctx.strokeStyle='#c9d1d9';ctx.lineWidth=2;for(const [ax,az,bx,bz] of wallSegments(plan,{withDoors:false})){ctx.beginPath();ctx.moveTo(X(ax),Z(az));ctx.lineTo(X(bx),Z(bz));ctx.stroke();}
  ctx.strokeStyle='#6e7681';ctx.lineWidth=1;for(let i=0;i<=8;i++){const z=STAIR.zLow+i*STAIR.run/8;if(L.up){ctx.beginPath();ctx.moveTo(X(1.85),Z(z));ctx.lineTo(X(3.45),Z(z));ctx.stroke();}if(L.down||L.up){ctx.beginPath();ctx.moveTo(X(.05),Z(z));ctx.lineTo(X(1.65),Z(z));ctx.stroke();}}
  for(const d of plan.doors){ctx.strokeStyle=d.forced?'#f0883e':d.state==='open'?'#3fb950':d.state==='ajar'?'#e3b341':'#8b949e';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(X(d.x-.45),Z(d.z));ctx.lineTo(X(d.x+.45),Z(d.z));ctx.stroke();}
  for(const w of plan.windows){ctx.strokeStyle=w.state==='closed'?'#58a6ff':'#a5d6ff';ctx.setLineDash(w.state==='closed'?[]:[3,2]);ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(X(w.x-.7),Z(w.z));ctx.lineTo(X(w.x+.7),Z(w.z));ctx.stroke();ctx.setLineDash([]);}
  ctx.fillStyle='#c4161c';ctx.fillRect(X(plan.standpipe.x)-3,Z(plan.standpipe.z)-3,6,6);
  if(L.intensity>0){ctx.fillStyle='#ff5a1f';ctx.beginPath();ctx.arc(X(plan.fire.x),Z(plan.fire.z),5,0,7);ctx.fill();}
  for(const v of plan.victims)if(v.found&&v.state!=='rescued'){ctx.fillStyle='#f85149';ctx.fillRect(X(v.x)-3,Z(v.z)-3,6,6);}
  if(L.placed.fan){ctx.fillStyle='#c4161c';ctx.fillRect(X(L.placed.fan.mesh.position.x)-4,Z(L.placed.fan.mesh.position.z)-4,8,8);}
  for(const c of crew)if(!c.out&&c.lv===L.no){ctx.fillStyle='#1f6feb';ctx.beginPath();ctx.arc(X(c.x),Z(c.z),3.5,0,7);ctx.fill();}
  ctx.save();ctx.translate(X(me.x),Z(me.z));ctx.rotate(-api.yaw);ctx.fillStyle='#ffd33d';ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5,5);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore();
  ctx.fillStyle='#c9d1d9';ctx.font=`${Math.round(size/16)}px sans-serif`;ctx.fillText(`${L.no} 樓${L.no===fireFloor?'（起火層）':''}・示意平面・下方為街側`,pad,size-4);}
 function status(){const sp=spaceOf(plan,me.x,me.z),e=env.spaces[sp?.id??'corridor'],rel=me.y-base(me.lv);return {floor:me.lv,onStair:!onFloor(),space:onFloor()?sp?.name??'—':'樓梯（'+(me.seg==='landing'?'平台':'梯段')+'）',layer:layerHeight(e),T:e.T,smoke:e.smoke,o2:e.o2,felt:feltTemp(e,rel+eye()),exposure:me.exposure,crouch:me.crouch,thermal:me.thermal,hoseLeft:me.hoseIn?hoseLeft():null,standpipe:me.standpipe,ppv:lastPpv,pending:!!me.pending,flashed:env.flashed,rollover:env.rollover};}
 function breakWindow(id){const lv=levels.get(fireFloor),w=lv?.plan.windows.find(w=>w.id===id);if(!w||w.state==='broken')return 'none';const out=openingOutcome(lv.env.spaces[w.space],'broken');w.state='broken';syncDoors(lv);if(out==='backdraft')backdraft(fireFloor,w.space,new T.Vector3(w.x,1.5,w.z));note('windowBroken','起火房間窗戶破裂',{floor:fireFloor,window:w.id});return out;}
 function takeCrewSprays(){const s=crewSprays;crewSprays=[];return s;}
 api={scene,active:false,yaw:0,intensity:0,get plan(){return plan;},get env(){return env;},get levels(){return levels;},get level(){return L;},get me(){return me;},get log(){return log;},get crew(){return crew;},get placed(){return L?.placed;},get cap(){return levels.size?stepInfo.cap:1;},get fireFloor(){return fireFloor;},
  setup,clear,step,enter,exit,update,render,interact,ajar,useItem,command,spray,reticle,drawMap,status,breakWindow,setThermal,igniteUpper,takeCrewSprays,useLevel,
  victims(){return [...levels.values()].flatMap(lv=>lv.plan.victims);},
  toggleThermal(){if(!me.items.tic){api.hint?.('沒有攜帶熱顯像儀（在消防車旁按 U 選裝備）');return false;}setThermal(!me.thermal);return me.thermal;},
  toggleCrouch(){me.crouch=!me.crouch;return me.crouch;},hoseLeft,
  fireWindow(){return levels.get(fireFloor)?.plan.windows.find(w=>w.fire);},
 };
 return api;
}
