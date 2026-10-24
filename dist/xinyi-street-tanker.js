// 信義街景・水庫車「信義61」（訓練示意）：12 噸（12,000 L）三軸水庫車。
// 派遣火警後自信義分隊車庫前出口出勤（三個車庫已由中隊長水箱車、分隊車與雲梯車使用，平時不停放在場景內），
// 沿駕駛路網到火場附近順向停車；與中隊長水箱車相距 SUPPLY 範圍內時鋪設水帶補水。
// 出勤時間、車速、停車點與補水量皆為示意，不是實際派遣規定或車輛性能。
import * as T from 'three';
import {stagingPoses,squadDeparturePath,along,polyLength} from './xinyi-street-squads.js?v=garage-20261023';

export const TANKER={name:'信義61',label:'信義61 水庫車',capacity:12000,turnout:35,speed:10,refill:30,range:80,tyreRadius:.545,stagingMin:15,stagingMax:60,spacing:12,
 // 車身三個碰撞圓（車長約 9.5 m）
 circles:[-3.2,0,3.2],radius:1.5};

// 補水（示意）：水庫車停妥、與中隊長水箱車距離在 range 內、雙方都還有餘量時，每秒補 refill 公升。
// 回傳本幀移轉水量（公升）。
export function tankerTransfer({tankerWater,truckWater,truckCapacity,distance,dt,parked=true}){
 if(!parked||!(distance<=TANKER.range)||tankerWater<=0)return 0;
 return Math.max(0,Math.min(TANKER.refill*dt,tankerWater,truckCapacity-truckWater));
}

// 車輪轉角：GLB 為 Y 軸向上，Blender 的輪軸（區域 Y）在 glTF 為區域 -Z；車頭朝 -X 前進時，輪子繞區域 +Z 正轉。
export const wheelAngle=distance=>distance/TANKER.tyreRadius;

export function createTanker({scene,template,ground,colliders,graph,label,beaconMatch=/beacon|red.*lens|flasher/i}){
 const root=new T.Group(),model=template.clone(true);root.name='水庫車・信義61';model.rotation.y=-Math.PI/2;root.add(model);
 // 模型原點在車長中點、輪胎底在 0（Blender 原檔的座標），不需再平移。
 const beacons=[],wheels=[];let slew=null,elev=null;
 // GLTFLoader 會把節點名稱的空白換成底線（Wheel_spin_F_L），兩種寫法都接受。
 model.traverse(o=>{const n=o.name.replace(/_/g,' ');if(/^Wheel spin/.test(n))wheels.push(o);if(n==='Monitor slew')slew=o;if(n==='Monitor elevation')elev=o;
  if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
  if(beaconMatch.test(o.material?.name||'')){o.material=o.material.clone();o.material.color?.set('#c61f16');o.material.emissive?.set('#ff180a');beacons.push(o.material);}});
 const tag=label?.(TANKER.label,'#ff7b72');if(tag){tag.position.y=4.4;root.add(tag);}
 root.visible=false;scene.add(root);
 const hose=new T.Mesh(new T.BufferGeometry(),new T.MeshStandardMaterial({color:'#d8c27a',roughness:.7}));hose.visible=false;scene.add(hose);
 const v={root,model,wheels,slew,elev,beacons,hose,x:0,z:0,heading:0,v:0,s:0,len:0,path:null,state:'home',water:TANKER.capacity,siren:false,spin:0,delay:0,pose:null,exit:null,arrived:null,supplying:false,log:[]};
 const free=(x,z,r)=>!colliders.resolve(x,z,r).hit;
 function place(x,z,h){v.x=x;v.z=z;v.heading=h;const fx=-Math.sin(h),fz=-Math.cos(h),yf=ground.at(x+fx*3.2,z+fz*3.2),yr=ground.at(x-fx*3.2,z-fz*3.2);root.position.set(x,(yf+yr)/2,z);root.rotation.set(Math.atan2(yf-yr,6.4),h,0,'YXZ');}
 let findRoute=()=>null;
 // 派遣：home 為信義分隊車庫前出口（spawn.support.exit 一帶），existing 為其他車輛的停車點。
 function dispatch(site,{home,existing=[],now=0}){
  const pose=stagingPoses(site,graph,free,1,{min:TANKER.stagingMin,max:TANKER.stagingMax,spacing:TANKER.spacing,existing})[0]??stagingPoses(site,graph,free,1,{existing})[0]??null;
  v.pose=pose;v.water=TANKER.capacity;v.state=pose?'wait':'home';v.delay=TANKER.turnout;v.arrived=null;v.supplying=false;v.log=[{t:now,text:'派遣出勤（水源支援）'}];
  v.exit=home?.exit??null;place(home?.x??site.x+300,home?.z??site.z,home?.heading??0);v.spin=0;setPose(0,0);
  root.visible=false;v.siren=!!pose;hose.visible=false;
  return pose;}
 function route(){const start=v.exit??v,r=findRoute(start.x,start.z,v.pose.x,v.pose.z);v.stationExit=v.exit;v.path=squadDeparturePath(v,r?.points);v.stationExit=null;v.s=0;v.len=polyLength(v.path);v.state='driving';v.routeT=0;root.visible=true;}
 // 水砲：slew 繞垂直軸（+ 往駕駛側），elevation + 為抬高（GLB 區域 -Z 軸，故取負號）。
 function setPose(slewRad,elevRad){if(slew)slew.rotation.y=slewRad;if(elev)elev.rotation.z=-elevRad;}
 // 每幀。ctx：{t, now, blockers(v), truck:{x,z,water,capacity}, onArrive(), note(text)}；回傳本幀補給中隊長水箱車的水量。
 function update(dt,ctx){
  for(const m of beacons){const on=v.siren&&Math.sin(ctx.t*14)>0;m.emissiveIntensity=v.siren?(on?6:.2):1;}
  if(v.state==='wait'){if((v.delay-=dt)<=0)route();return 0;}
  if(v.state==='driving'){
   const fx=-Math.sin(v.heading),fz=-Math.cos(v.heading),rx=Math.cos(v.heading),rz=-Math.sin(v.heading);let blocked=false;
   for(const [bx,bz,br,pulled] of ctx.blockers?.(v)??[]){if(pulled)continue;const dx=bx-v.x,dz=bz-v.z,ahead=dx*fx+dz*fz,lat=Math.abs(dx*rx+dz*rz);if(ahead>0&&ahead<11+br&&lat<1.6+br){blocked=true;break;}}
   // 卡住保護同分隊車（示意）：停等超過 6 秒或 5 秒內前進不到 3 m，暫時不理會前方障礙 4 秒。
   v.wait=blocked?(v.wait??0)+dt:0;v.prog??={s:v.s,t:0};v.prog.t+=dt;if(v.prog.t>5){if(v.s-v.prog.s<3)v.ghost=4;v.prog={s:v.s,t:0};}
   if(v.ghost>0){v.ghost-=dt;blocked=false;}if(v.wait>6)blocked=false;
   const target=blocked?0:(v.len-v.s<25?4:TANKER.speed);v.v+=Math.max(-7*dt,Math.min(2.5*dt,target-v.v));const step=v.v*dt;v.s+=step;v.spin+=wheelAngle(step);
   const q=along(v.path,v.s),dh=Math.atan2(Math.sin(q.heading-v.heading),Math.cos(q.heading-v.heading));place(q.x,q.z,v.heading+dh*Math.min(1,dt*5));
   v.routeT=(v.routeT??0)+dt;const late=v.routeT>v.len/TANKER.speed*2.5+30;if(late)v.log.push({t:ctx.now,text:'行駛受阻，改以示意方式到位'});
   if(q.done||late){place(v.pose.x,v.pose.z,v.pose.heading);v.state='parked';v.v=0;v.arrived=ctx.now;v.log.push({t:ctx.now,text:'抵達現場、待命供水'});ctx.onArrive?.();}
   for(const w of wheels)w.rotation.z=v.spin;
   return 0;}
  if(v.state!=='parked'||!ctx.truck)return 0;
  const d=Math.hypot(ctx.truck.x-v.x,ctx.truck.z-v.z),moved=tankerTransfer({tankerWater:v.water,truckWater:ctx.truck.water,truckCapacity:ctx.truck.capacity,distance:d,dt});
  const supplying=d<=TANKER.range&&v.water>0;
  if(supplying!==v.supplying){v.supplying=supplying;v.log.push({t:ctx.now,text:supplying?'鋪設水帶，補水給中隊長水箱車':(v.water<=0?'水箱已空':'中隊長水箱車超出水帶範圍')});ctx.note?.(supplying?`${TANKER.label}已鋪設水帶，補水給中隊長水箱車`:(v.water<=0?`${TANKER.label}水箱已空`:`中隊長水箱車離${TANKER.label}超過 ${TANKER.range} m，停止補水`));}
  v.water-=moved;
  if(supplying){const rear=[v.x+Math.sin(v.heading)*4.6,v.z+Math.cos(v.heading)*4.6],y0=ground.at(rear[0],rear[1])+.6,y1=ground.at(ctx.truck.x,ctx.truck.z)+.6,mid=[(rear[0]+ctx.truck.x)/2,(rear[1]+ctx.truck.z)/2];
   const pts=[new T.Vector3(rear[0],y0,rear[1]),new T.Vector3(mid[0],ground.at(mid[0],mid[1])+.08,mid[1]),new T.Vector3(ctx.truck.x,y1,ctx.truck.z)];
   if(!hose.userData.end||Math.hypot(hose.userData.end[0]-ctx.truck.x,hose.userData.end[1]-ctx.truck.z)>.5){hose.geometry.dispose();hose.geometry=new T.TubeGeometry(new T.CatmullRomCurve3(pts),24,.05,6,false);hose.userData.end=[ctx.truck.x,ctx.truck.z];}
   hose.visible=true;}else hose.visible=false;
  return moved;}
 const circles=()=>root.visible&&v.state!=='home'?TANKER.circles.map(o=>[v.x-Math.sin(v.heading)*o,v.z-Math.cos(v.heading)*o,TANKER.radius]):[];
 function hide(){root.visible=false;hose.visible=false;v.state='home';v.siren=false;v.supplying=false;v.pose=null;}
 return {vehicle:v,dispatch,update,circles,hide,setPose,place,setRouter(fn){findRoute=fn;},get state(){return v.state;},get water(){return v.water;}};
}
