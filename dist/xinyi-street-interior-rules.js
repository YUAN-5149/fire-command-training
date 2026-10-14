// 信義街景・建物內部作業規則（訓練示意）：起火樓層平面、門窗與破壞進入、煙層與溫度、通風排煙、閃燃與回燃徵兆、水線長度、隊員路徑。
// 平面格局為依起火立面寬度產生的「示意平面」，不是該建物的實際平面圖；溫度、含氧量、煙量與時間皆為遊戲化示意，
// 不是火場物理或煙控計算，閃燃／回燃只依示意門檻呈現「徵兆」，不能作為現場判斷或戰術依據。純函式，可在 Node 測試。

export const INTERIOR={ceiling:2.8,floorHeight:3.4,stairPerFloor:6,stairHose:5,eyeStand:1.65,eyeCrouch:1.0,doorWidth:.9,windowWidth:1.4};
export const ENV={ambient:20,rollover:500,flashover:600,backdraft:{o2:.13,fuel:.5,temp:220},warnDelay:3};
export const EXPOSURE={start:120,scale:60,recover:6,warn:50,retreat:100};
export const FORCE={player:5,crew:7};
export const EQUIPMENT={
 halligan:{label:'破壞器材（鐵橇＋斧）',note:'破壞上鎖的門'},
 tic:{label:'熱顯像儀',note:'按 I 切換，可穿透濃煙看溫度'},
 fan:{label:'排煙機（正壓送風）',note:'放在樓梯間門口，需有排氣開口'},
 light:{label:'照明燈',note:'放置後照亮周圍'},
 hose20:{label:'延長水帶 20 m',note:'自消防車拉入的水線加長 20 m'},
 pack:{label:'水帶背包（連結送水管用）',note:'在各樓樓梯間的送水口出水口接 40 m 水線（示意）'},
};
export const CARRY_LIMIT=4;

// 以 seed 產生的亂數（mulberry32），同一任務重現同一平面。
export function seeded(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}

// 起火樓層示意平面：前排房間（臨起火立面，z 0–5）、走廊（z 5–7）、後排房間與樓梯間（z 7–D）。x 沿立面方向。
// 起火房間為包含立面中點的前排房間（與街景看到的起火窗口一致）。closed：起火房間窗戶未破（通風受限）。
export function makeFloorPlan(rand,{facadeWidth=18,depth=12,floor=3,closed=false,victims=1}={}){
 const W=Math.round(Math.min(24,Math.max(14,facadeWidth))*2)/2,D=depth,front=W>=18?3:2,spaces=[],doors=[],windows=[],furniture=[];
 const add=(id,name,kind,x0,x1,z0,z1)=>{const s={id,name,kind,x0,x1,z0,z1};spaces.push(s);return s;};
 const corridor=add('corridor','走廊','corridor',0,W,5,7),stair=add('stair','樓梯間','stair',0,3.5,7,D);
 const rooms=[];for(let i=0;i<front;i++)rooms.push(add('F'+(i+1),`前側房間 ${i+1}`,'room',W*i/front,W*(i+1)/front,0,5));
 const backW=(W-3.5)/2;for(let i=0;i<2;i++)rooms.push(add('B'+(i+1),`後側房間 ${i+1}`,'room',3.5+backW*i,3.5+backW*(i+1),7,D));
 const fire=rooms.find(r=>r.z0===0&&r.x0<=W/2&&r.x1>W/2),fx=Math.min(fire.x1-1.4,Math.max(fire.x0+1.4,W/2));
 const lockP=.25;
 doors.push({id:'D0',a:'stair',b:'corridor',x:1.75,z:7,state:'closed',locked:rand()<.5,forced:false});
 for(const r of rooms){const z=r.z0===0?5:7,x=r.x0+1+rand()*Math.max(0,r.x1-r.x0-2);doors.push({id:'D'+r.id,a:r.id,b:'corridor',x:+x.toFixed(2),z,state:'closed',locked:r!==fire&&rand()<lockP,forced:false});const d=doors.at(-1);if(!d.locked&&r!==fire&&rand()<.4)d.state='open';}
 for(const r of rooms){const z=r.z0===0?0:D,cx=(r.x0+r.x1)/2,x=r===fire?fx:cx;windows.push({id:'W'+r.id,space:r.id,x:+x.toFixed(2),z,state:r===fire&&!closed?'broken':'closed',fire:r===fire});}
 // 家具（示意障礙物）：沿房間內牆擺放，不擋門與窗。
 for(const r of rooms){const n=1+Math.floor(rand()*2);for(let k=0;k<n;k++){const w=1+rand()*.8,d=.6+rand()*.5,alongX=rand()<.5,door=doors.find(d=>d.a===r.id);
  const bw=alongX?w:d,bd=alongX?d:w;
  for(let tries=0;tries<8;tries++){const x=r.x0+.3+bw/2+rand()*Math.max(0,r.x1-r.x0-.6-bw),z=r.z0===0?r.z0+.4+bd/2+rand()*2:r.z1-.4-bd/2-rand()*2;
   const box={space:r.id,x:+x.toFixed(2),z:+z.toFixed(2),w:bw,d:bd,h:.5+rand()*.4};
   if(Math.abs(box.x-door.x)<box.w/2+1.1&&Math.abs(box.z-door.z)<box.d/2+1.4)continue;if(windows.some(wi=>wi.space===r.id&&Math.abs(box.x-wi.x)<box.w/2+1&&Math.abs(box.z-wi.z)<box.d/2+1))continue;
   if(furniture.some(f=>f.space===r.id&&Math.abs(f.x-box.x)<(f.w+box.w)/2+.7&&Math.abs(f.z-box.z)<(f.d+box.d)/2+.7))continue;furniture.push(box);break;}}}
 // 受困者：在非起火房間（示意），可能在家具旁倒臥。
 const pool=rooms.filter(r=>r!==fire),out=[];for(let i=0;i<victims&&pool.length;i++){const r=pool.splice(Math.floor(rand()*pool.length),1)[0];
  let pos=null;for(let tries=0;tries<20&&!pos;tries++){const x=r.x0+.9+rand()*(r.x1-r.x0-1.8),z=r.z0+.9+rand()*(r.z1-r.z0-1.8);if(!furniture.some(f=>f.space===r.id&&Math.abs(f.x-x)<f.w/2+.7&&Math.abs(f.z-z)<f.d/2+.9))pos={x,z};}
  pos??={x:(r.x0+r.x1)/2,z:(r.z0+r.z1)/2};out.push({id:'I'+(i+1),space:r.id,x:+pos.x.toFixed(2),z:+pos.z.toFixed(2),found:false,state:'inside',heading:rand()*Math.PI*2});}
 return {W,D,floor,closed,spaces,doors,windows,furniture,victims:out,fire:{space:fire.id,x:+fx.toFixed(2),z:1.6},entry:{x:1.1,z:7.75,heading:-Math.PI/2},exit:{x:.35,z:7.7},standpipe:{x:3.25,z:7.75}};
}
export const spaceOf=(plan,x,z)=>plan.spaces.find(s=>x>=s.x0-1e-6&&x<=s.x1+1e-6&&z>=s.z0-1e-6&&z<=s.z1+1e-6)??null;
export const spaceById=(plan,id)=>plan.spaces.find(s=>s.id===id);

// 牆面線段（含門洞，關閉的門另外列為線段），供碰撞與繪圖。
export function wallSegments(plan,{withDoors=true}={}){
 const {W,D}=plan,segs=[],gaps=z=>plan.doors.filter(d=>Math.abs(d.z-z)<1e-6).map(d=>[d.x-INTERIOR.doorWidth/2,d.x+INTERIOR.doorWidth/2]).sort((a,b)=>a[0]-b[0]);
 const hline=(z,x0,x1)=>{let x=x0;for(const [a,b] of gaps(z)){if(b<=x0||a>=x1)continue;if(a>x)segs.push([x,z,a,z]);x=Math.max(x,b);}if(x<x1)segs.push([x,z,x1,z]);};
 segs.push([0,0,W,0],[0,D,W,D],[0,0,0,D],[W,0,W,D]);
 hline(5,0,W);hline(7,0,W);
 // 相鄰房間之間的隔間牆（同一排、左邊界 > 0）。
 for(const s of plan.spaces)if((s.kind==='room')&&s.x0>0)segs.push([s.x0,s.z0,s.x0,s.z1]);
 if(withDoors)for(const d of plan.doors)if(d.state==='closed'||d.state==='ajar')segs.push([d.x-INTERIOR.doorWidth/2,d.z,d.x+INTERIOR.doorWidth/2,d.z]);
 return segs;
}
// 圓形人員與線段／家具碰撞：回傳修正後位置。
export function resolveCircle(plan,x,z,r,segs=wallSegments(plan)){
 let px=x,pz=z;
 for(let it=0;it<3;it++){for(const [ax,az,bx,bz] of segs){const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((px-ax)*dx+(pz-az)*dz)/l2)),cx=ax+dx*t,cz=az+dz*t,ex=px-cx,ez=pz-cz,d=Math.hypot(ex,ez);
   if(d<r){if(d<1e-6){px+=r;continue;}px=cx+ex/d*r;pz=cz+ez/d*r;}}
  for(const f of plan.furniture){const cx=Math.max(f.x-f.w/2,Math.min(px,f.x+f.w/2)),cz=Math.max(f.z-f.d/2,Math.min(pz,f.z+f.d/2)),ex=px-cx,ez=pz-cz,d=Math.hypot(ex,ez);if(d<r&&d>1e-6){px=cx+ex/d*r;pz=cz+ez/d*r;}}}
 return {x:px,z:pz};
}

// ---------- 環境（每個空間：上層溫度 T °C、煙量 smoke 0–1、含氧量 o2、未燃氣體 fuel 0–1） ----------
const CONDUCT={open:1,ajar:.25,closed:.02,broken:1};
export function makeEnv(plan){const env={};for(const s of plan.spaces)env[s.id]={T:ENV.ambient,smoke:0,o2:.21,fuel:0};env[plan.fire.space].smoke=.35;env[plan.fire.space].T=plan.closed?260:180;if(plan.closed){env[plan.fire.space].o2=.15;env[plan.fire.space].fuel=.25;}return {spaces:env,flashed:false,rollover:false,events:[]};}
// 一個空間對外開口（窗、樓梯間通往地面的出口）。
export function outsideVent(plan,id){let v=0;for(const w of plan.windows)if(w.space===id)v+=CONDUCT[w.state]??0;if(id==='stair')v+=.3;return v;}
// 經由開啟的門（含微開）連通的空間。
export function connected(plan,from,{min=.2}={}){const seen=new Set([from]),q=[from];while(q.length){const id=q.shift();for(const d of plan.doors){if((CONDUCT[d.state]??0)<min)continue;const o=d.a===id?d.b:d.b===id?d.a:null;if(o&&!seen.has(o)){seen.add(o);q.push(o);}}}return seen;}
// 正壓送風：排煙機在樓梯間門口運轉、樓梯間門開啟，且連通空間中有對外排氣開口（窗）才有效。
export function ppvState(plan,fanOn){if(!fanOn)return {on:false};const door=plan.doors.find(d=>d.id==='D0');if(door.state!=='open')return {on:true,effective:false,reason:'樓梯間門未開啟'};
 const reach=connected(plan,'stair'),exhaust=plan.windows.filter(w=>reach.has(w.space)&&(w.state==='open'||w.state==='broken'));
 return exhaust.length?{on:true,effective:true,reach,exhaust:exhaust.map(w=>w.id),intoFire:reach.has(plan.fire.space)}:{on:true,effective:false,reason:'沒有排氣開口（先開啟窗戶）',reach};}
export const o2Factor=o2=>Math.max(0,Math.min(1,(o2-.10)/.06));
// 起火房間的火勢上限（通風受限時火勢被壓低，但未燃氣體累積）。
export function fireCap(env,plan){return Math.max(.2,o2Factor(env.spaces[plan.fire.space].o2));}

export function stepEnv(plan,env,dt,{intensity=0,fanOn=false,cooling=null}={}){
 const S=env.spaces,f=S[plan.fire.space],events=[],ppv=ppvState(plan,fanOn);
 const ventF=outsideVent(plan,plan.fire.space),Ieff=Math.max(0,intensity)*o2Factor(f.o2);
 // 起火房間：耗氧、產煙、通風受限時累積未燃氣體、溫度趨近目標值。
 f.o2+=(-.006*Ieff*(1-Math.min(1,ventF*.8))+(.21-f.o2)*Math.min(1,ventF)*.25)*dt;
 if(intensity>0&&o2Factor(f.o2)<1)f.fuel+=.025*intensity*(1-o2Factor(f.o2))*dt;else f.fuel-=.08*dt;
 f.smoke+=.035*Math.max(intensity,.15*(intensity>0))*dt;
 const closedDoor=plan.doors.find(d=>d.a===plan.fire.space||d.b===plan.fire.space)?.state==='closed';
 const target=ENV.ambient+(env.flashed&&intensity>0?780:Ieff*(560+(closedDoor?80:0)+Math.max(0,1-ventF)*60))+f.fuel*260;
 f.T+=(target-f.T)*Math.min(1,.045*dt);
 // 門的熱與煙交換、含氧混合。
 for(const d of plan.doors){const c=CONDUCT[d.state]??0;if(!c)continue;const a=S[d.a],b=S[d.b],k=c*dt;
  const ds=(a.smoke-b.smoke)*.10*k,dT=(a.T-b.T)*.05*k,dO=(a.o2-b.o2)*.12*k;a.smoke-=ds;b.smoke+=ds;a.T-=dT;b.T+=dT;a.o2-=dO;b.o2+=dO;}
 // 對外開口排煙、散熱、補氧；非起火空間溫度緩慢回到常溫。
 for(const s of plan.spaces){const e=S[s.id],v=outsideVent(plan,s.id);e.smoke-=e.smoke*Math.min(1,v*.06*dt);if(s.id!==plan.fire.space){e.T-=(e.T-ENV.ambient)*Math.min(1,(.006+v*.02)*dt);e.o2+=(.21-e.o2)*Math.min(1,(.01+v*.2)*dt);}}
 // 正壓送風：連通空間排煙、降溫、補氧（含起火房間時也會助燃）。
 if(ppv.effective)for(const id of ppv.reach){const e=S[id];e.smoke-=e.smoke*Math.min(1,.22*dt);e.o2+=(.21-e.o2)*Math.min(1,.3*dt);if(id!==plan.fire.space)e.T-=(e.T-ENV.ambient)*Math.min(1,.05*dt);}
 // 氣體冷卻（水霧打入上層熱煙）：降溫、減少未燃氣體，產生水蒸氣使煙量略增。
 if(cooling){const e=S[cooling.space];if(e){e.T=Math.max(ENV.ambient,e.T-70*cooling.rate*dt);e.fuel=Math.max(0,e.fuel-.18*cooling.rate*dt);e.smoke=Math.min(1,e.smoke+.01*cooling.rate*dt);}}
 for(const s of plan.spaces){const e=S[s.id];e.smoke=Math.max(0,Math.min(1,e.smoke));e.o2=Math.max(.05,Math.min(.21,e.o2));e.fuel=Math.max(0,Math.min(1,e.fuel));e.T=Math.max(ENV.ambient,Math.min(1000,e.T));}
 if(!env.rollover&&f.T>=ENV.rollover&&intensity>0){env.rollover=true;events.push('rollover');}
 if(env.rollover&&f.T<ENV.rollover-60)env.rollover=false;
 if(!env.flashed&&f.T>=ENV.flashover&&intensity>0){env.flashed=true;events.push('flashover');}
 if(env.flashed&&intensity<=0)env.flashed=false;
 return {events,ppv,cap:fireCap(env,plan),Ieff};
}
// 回燃徵兆：空間含氧低、未燃氣體多且溫度高時，突然開口可能回燃（示意門檻）。
export function backdraftRisk(e){return e.o2<=ENV.backdraft.o2&&e.fuel>=ENV.backdraft.fuel&&e.T>=ENV.backdraft.temp;}
// 回燃後：未燃氣體燃盡，溫度瞬間升高。
export function applyBackdraft(e){e.fuel=0;e.o2=.18;e.T=Math.max(e.T,700);e.smoke=Math.max(.3,e.smoke*.6);}
// 開口時的回燃判定：微開（ajar）先出現徵兆，ENV.warnDelay 秒內關回或冷卻到門檻以下可避免。直接全開立即回燃。
export function openingOutcome(e,to){if(!backdraftRisk(e))return 'safe';return to==='open'||to==='broken'?'backdraft':'warning';}

export const layerHeight=e=>Math.max(.3,INTERIOR.ceiling*(1-Math.min(.9,e.smoke)));
export const feltTemp=(e,eye)=>eye>=layerHeight(e)?e.T:ENV.ambient+(e.T-ENV.ambient)*.3;
export const visibility=(e,eye,thermal=false)=>thermal?15:eye>=layerHeight(e)?Math.max(.6,8*(1-e.smoke)):Math.max(3,25*(1-e.smoke*.5));
// 熱暴露（示意 0–100）：上層溫度越高累積越快，降低姿勢或冷卻可減緩；達 100 需撤離。
export function stepExposure(x,felt,dt){if(felt>EXPOSURE.start)return Math.min(EXPOSURE.retreat,x+(felt-EXPOSURE.start)/EXPOSURE.scale*dt);return Math.max(0,x-EXPOSURE.recover*dt);}

// 水線長度：總長 −（消防車到入口）−（樓梯每層 5 m，示意）− 室內距樓梯間門的路徑。
export function hoseRemaining({total=45,extension=0,outside=0,floor=1,inside=0}={}){return total+extension-outside-Math.max(0,floor-1)*INTERIOR.stairHose-inside;}

// 隊員路徑：空間圖（經由未上鎖或已破壞的門）BFS，回傳經過的門。上鎖未破壞的門回傳 blocked。
export function pathDoors(plan,from,to){if(from===to)return {doors:[]};const prev=new Map([[from,null]]),q=[from];let blocked=null;
 while(q.length){const id=q.shift();for(const d of plan.doors){const o=d.a===id?d.b:d.b===id?d.a:null;if(!o||prev.has(o))continue;if(d.locked&&!d.forced){if(o===to||!blocked)blocked=blocked??d;continue;}prev.set(o,{id,door:d});q.push(o);}}
 if(!prev.has(to))return {doors:null,blocked};const doors=[];let c=to;while(prev.get(c)){doors.unshift(prev.get(c).door);c=prev.get(c).id;}return {doors};}
// 搜索一個房間所需時間（示意：面積 × 0.6 秒，最少 6 秒）。
export const searchTime=s=>Math.max(6,(s.x1-s.x0)*(s.z1-s.z0)*.6);

// 熱顯像色彩：低溫至中溫為灰階（白熱），200 °C 以上依溫度轉黃、橙、紅（示意）。回傳 [r,g,b] 0–1。
export function thermalColor(t,lo=20,hi=200){if(t>=200){const k=Math.min(1,(t-200)/400);return k<.5?[1,1,.6-.6*k*2]:[1,1-(k-.5)*2*.8,0];}const v=Math.max(0,Math.min(1,(t-lo)/Math.max(1,hi-lo)));return [.08+v*.85,.08+v*.85,.08+v*.85];}

// ---------- 樓梯（示意：每層兩段折返梯，樓梯間 x 0–3.5、z 7–D） ----------
// 第一段（上行）x 1.85–3.45、z 8.4→11；平台 z 11–12；第二段 x 0.05–1.65、z 11→8.4，到上一層樓梯間。
// 樓梯間 z 7–8.4 為各層樓梯口；中間 x = 1.75 為隔牆。
export const STAIR={xMid:1.75,zLow:8.4,zHigh:11,run:2.6,landing:12,steps:8};
const half=()=>INTERIOR.floorHeight/2;
// 在某一段上的高度（相對該層地面）。
export function stairY(seg,z){const t=Math.max(0,Math.min(1,(z-STAIR.zLow)/STAIR.run));if(seg==='f1')return t*half();if(seg==='landing')return half();if(seg==='f2')return half()+(1-t)*half();return 0;}
// 依位置轉換所在段：回傳 {seg, dLv}（dLv：+1 到上一層、−1 到下一層的第二段），或 blocked。
export function stairTransition(seg,x,z,{up=false,down=false}={}){
 const inStair=x<3.5&&z>7;if(!inStair&&seg==='floor')return {seg,dLv:0};
 if(seg==='floor'){if(z<=STAIR.zLow||z>STAIR.zLow+.6)return {seg,dLv:0};if(x>=STAIR.xMid)return up?{seg:'f1',dLv:0}:{seg,dLv:0};return down?{seg:'f2',dLv:-1}:{seg,dLv:0};}
 if(seg==='f1'){if(z<STAIR.zLow)return {seg:'floor',dLv:0};if(z>STAIR.zHigh)return {seg:'landing',dLv:0};return {seg,dLv:0};}
 if(seg==='landing'){if(z>=STAIR.zHigh)return {seg,dLv:0};return x>=STAIR.xMid?{seg:'f1',dLv:0}:{seg:'f2',dLv:0};}
 if(seg==='f2'){if(z>STAIR.zHigh)return {seg:'landing',dLv:0};if(z<STAIR.zLow)return {seg:'floor',dLv:1};return {seg,dLv:0};}
 return {seg,dLv:0};}
// 樓梯間碰撞線段：中間隔牆；在樓梯段上時，樓梯口以外的牆仍沿用平面牆。
export function stairSegments(seg,{up=false,down=false}={}){const out=[[STAIR.xMid,STAIR.zLow,STAIR.xMid,STAIR.zHigh]];
 // 沒有上行或下行梯段的那一側是樓板：隔牆延伸到底，避免從平台側走到樓梯井上方。
 if(seg==='floor'&&(!up||!down))out.push([STAIR.xMid,STAIR.zHigh,STAIR.xMid,STAIR.landing]);
 return out;}
// 建物樓層：1 樓到起火樓層的上一層（不超過量體高度估算的樓層數）。
export function buildingFloors(fireFloor,height,floorHeight=INTERIOR.floorHeight){const max=Math.max(fireFloor,Math.floor(height/floorHeight));const top=Math.min(fireFloor+1,max);const out=[];for(let f=1;f<=top;f++)out.push(f);return out;}
// 樓梯間的煙與熱往上層流動（煙囪效應，示意）：下層樓梯間 → 上層樓梯間。
export function stackExchange(lower,upper,dt){const ds=Math.max(0,lower.smoke-upper.smoke)*.08*dt,dT=Math.max(0,lower.T-upper.T)*.04*dt;lower.smoke-=ds;upper.smoke+=ds;lower.T-=dT;upper.T+=dT;}
