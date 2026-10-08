// 信義街景・雲梯車：沿用首頁已驗證的支腿機構（createGrounding）與升梯運動學／動作順序（createAerialMotion：
// 先升起再迴轉、對準後才伸梯、掃掠路徑逐步檢查），只把首頁街景的固定界限換成「信義真實立面避碰」。
// 立面避碰為幾何示意（官方量體牆面＋淨距），非原廠作業範圍、承載或地盤認證。
import * as T from 'three';
import {project} from './xinyi-street-world.js?v=s12';
import {createGrounding} from './aerial-grounding.js';
import {createAerialMotion} from './aerial-motion.js';

export const AERIAL={ladderClear:.6,cageClear:.5,cageRadius:1.0,parkMin:6,parkMax:16,footClear:.6};

// 全部官方牆面（含高樓層量體）建 3D 索引：線段＋高度範圍。
export function buildFacadeIndex(buildings,cell=10){
 const walls=[],grid=new Map();
 for(const b of buildings)for(const w of b.walls){
  const [ax,az]=project(w.a[0],w.a[1]),[bx,bz]=project(w.b[0],w.b[1]);if(Math.hypot(bx-ax,bz-az)<.05)continue;
  const id=walls.length;walls.push([ax,az,bx,bz,Math.min(w.a[2],w.b[2]),Math.max(w.a[2],w.b[2])+w.h,b.id]);
  for(let i=Math.floor(Math.min(ax,bx)/cell);i<=Math.floor(Math.max(ax,bx)/cell);i++)for(let j=Math.floor(Math.min(az,bz)/cell);j<=Math.floor(Math.max(az,bz)/cell);j++){const k=i+','+j;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(id);}
 }
 // 點到最近牆面的水平距離（只計高度範圍內的牆）；超過 limit 回傳 Infinity。
 function clearance(x,y,z,limit=3){
  let best=Infinity;
  for(let i=Math.floor((x-limit)/cell);i<=Math.floor((x+limit)/cell);i++)for(let j=Math.floor((z-limit)/cell);j<=Math.floor((z+limit)/cell);j++)for(const id of grid.get(i+','+j)??[]){
   const [ax,az,bx,bz,y0,y1]=walls[id];if(y<y0-limit||y>y1+limit)continue;
   const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2)),h=Math.hypot(x-ax-dx*t,z-az-dz*t),v=y<y0?y0-y:y>y1?y-y1:0,d=Math.hypot(h,v);
   if(d<best)best=d;
  }
  return best;
 }
 return {walls,clearance};
}

// 沿線取樣檢查：起點到終點每 step 一點，任一點離牆小於 r 即不安全。
export function segmentClear(index,a,b,r,step=.4){const n=Math.max(1,Math.ceil(a.distanceTo(b)/step));for(let i=0;i<=n;i++){const p=a.clone().lerp(b,i/n);if(index.clearance(p.x,p.y,p.z,r+.5)<r)return false;}return true;}

export function createXinyiAerial(source,{facade,groundAt,colliders,blockers=()=>[]}){
 const get=n=>source.getObjectByName(n),rig={slew:get('Turntable_slew'),elevation:get('Ladder_elevation'),level:get('Cage_level'),floor:get('Cage_floor'),extensions:[2,3,4].map(n=>get('Ladder_extend_'+n))};
 if(!rig.slew||!rig.elevation||!rig.level||!rig.floor||rig.extensions.some(o=>!o))throw new Error('雲梯車車型缺少原始升梯節點');
 const floorBox=new T.Box3().setFromBufferAttribute(rig.floor.geometry.attributes.position),anchor=floorBox.getCenter(new T.Vector3());anchor.y=floorBox.max.y;rig.anchor=anchor;
 const grounding=createGrounding(source),nozzle=get('Nozzle_tip');
 const restPose=[rig.slew,rig.elevation,rig.level,...rig.extensions].map(o=>[o,o.position.clone(),o.quaternion.clone()]);
 const st={phase:'stowed',spread:0,down:0,motion:null,plan:null,time:0,returnPlan:null,reason:''};
 const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 // 依信義立面的作業空間：梯架中心線與籃架都需與牆面保持淨距，籃架不可低於地面。
 function envelope({position,origin}){
  const g=groundAt(position.x,position.z);if(position.y<g+.15)return false;
  const cage=position.clone().add(new T.Vector3(0,1,0));
  if(facade.clearance(cage.x,cage.y,cage.z,AERIAL.cageRadius+AERIAL.cageClear+.5)<AERIAL.cageRadius+AERIAL.cageClear)return false;
  return segmentClear(facade,origin,position,AERIAL.ladderClear);
 }
 // 四支腳座全展開後的位置（車型座標 x=-1.9／4.45，橫向約 ±2.3 m）。
 function feet(){source.updateMatrixWorld(true);return [-1.9,4.45].flatMap(x=>[1,-1].map(s=>source.localToWorld(new T.Vector3(x,0,s*2.3))));}
 function footIssues(){
  // 腳座離牆太近，或車身中心到腳座之間穿過任何牆面（腳座落在建物內）皆不可展開。
  const c=source.localToWorld(new T.Vector3(1.3,0,0)),y=groundAt(c.x,c.z)+.5,out=[];
  const crosses=f=>facade.walls.some(([ax,az,bx,bz,y0,y1])=>{if(y<y0||y>y1)return false;const d=(f.x-c.x)*(bz-az)-(f.z-c.z)*(bx-ax);if(Math.abs(d)<1e-9)return false;const u=((ax-c.x)*(bz-az)-(az-c.z)*(bx-ax))/d,v=((ax-c.x)*(f.z-c.z)-(az-c.z)*(f.x-c.x))/d;return u>0&&u<1&&v>=0&&v<=1;});
  for(const f of feet()){if(colliders.resolve(f.x,f.z,AERIAL.footClear).hit||crosses(f)){out.push('支腿展開位置壓到建物或過度貼近');break;}}
  for(const f of feet())if(blockers().some(([x,z,r])=>Math.hypot(x-f.x,z-f.z)<r+AERIAL.footClear)){out.push('支腿範圍內有車輛');break;}
  return out;
 }
 const api={
  grounding,rig,state:st,nozzle,
  get busy(){return st.phase!=='stowed';},
  deploy(){if(st.phase!=='stowed')return {ok:false,reason:'雲梯不在收妥狀態'};const issues=footIssues();if(issues.length)return {ok:false,reason:issues.join('、')};st.phase='spreading';st.time=0;return {ok:true};},
  retract(){if(st.phase!=='down')return {ok:false,reason:st.phase==='raised'||st.phase==='raising'?'請先收回梯架':'支腿尚未完全落地'};st.phase='lifting';st.time=0;st.motion=null;return {ok:true};},
  // 升梯至目標（籃架底板位置）。不可達或路徑碰牆則拒絕，不以其他位置替代。
  raiseTo(target){
   if(st.phase!=='down')return {ok:false,reason:'需先完成支腿展開與落地'};
   st.motion=createAerialMotion(source,rig,{envelope});
   if(!st.motion.solve(target))return {ok:false,reason:'超出作業範圍（仰角或伸長量不足），請調整停車位置'};
   const plan=st.motion.plan(target);if(!plan)return {ok:false,reason:'升梯路徑或目標位置會碰到建物，請調整停車位置'};
   st.plan=plan;st.time=0;st.phase='raising';return {ok:true,plan};
  },
  // 只檢查不動作：目前車位能否完成支腿與升梯到 target（自動派遣選位、任務選址用）。
  check(target){const issues=footIssues();if(issues.length)return {ok:false,reason:issues.join('、')};const m=createAerialMotion(source,rig,{envelope});if(!m.solve(target))return {ok:false,reason:'超出作業範圍'};if(!m.plan(target))return {ok:false,reason:'升梯路徑會碰到建物'};return {ok:true};},
  footIssues,
  // 回出生點用：立即回到收妥狀態（梯架節點回原位、支腿收回）。
  reset(){for(const [o,p,q] of restPose){o.position.copy(p);o.quaternion.copy(q);}Object.assign(st,{phase:'stowed',spread:0,down:0,motion:null,plan:null,returnPlan:null,time:0,reason:''});grounding.update(0,0);},
  lower(){if(st.phase!=='raised')return {ok:false,reason:'梯架未在作業位置'};st.returnPlan={waypoints:[...st.plan.waypoints].reverse()};st.time=0;st.phase='lowering';return {ok:true};},
  basket(){source.updateMatrixWorld(true);return rig.floor.localToWorld(anchor.clone());},
  muzzle(){source.updateMatrixWorld(true);if(!nozzle)return api.basket().add(new T.Vector3(0,1.2,0));nozzle.geometry.computeBoundingBox();const b=nozzle.geometry.boundingBox,m=b.getCenter(new T.Vector3());m.y=b.max.y;return nozzle.localToWorld(m);},
  update(dt){
   st.time+=dt;
   if(st.phase==='spreading'){st.spread=smooth(st.time/4);if(st.time>=4){st.phase='lowering-jacks';st.time=0;}}
   else if(st.phase==='lowering-jacks'){st.down=smooth(st.time/3);if(st.time>=3)st.phase='down';}
   else if(st.phase==='lifting'){st.down=1-smooth(st.time/3);if(st.time>=3){st.phase='retracting';st.time=0;}}
   else if(st.phase==='retracting'){st.spread=1-smooth(st.time/4);if(st.time>=4)st.phase='stowed';}
   else if(st.phase==='raising'||st.phase==='lowering'){
    const plan=st.phase==='raising'?st.plan:st.returnPlan,pose=st.motion.at(plan,st.time),r=st.motion.move(pose);
    if(!r.safe){st.reason=r.reason;st.phase=st.phase==='raising'?'raised':'down';}// 掃掠途中發現干涉即停止
    else if(st.time>=17){st.phase=st.phase==='raising'?'raised':'down';}
   }
   grounding.update(st.spread,st.down);
  },
 };
 return api;
}
