import {createCageMonitor} from './cage-monitor.js';
import * as T from 'three';
import {createRosenbauer,createLattice} from './rosenbauer.js';
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
export function createAerialRescue(scene,createPerson,onStage){
 const root=new T.Group();scene.add(root);
 const red=new T.MeshStandardMaterial({color:'#b92120',metalness:.4,roughness:.3}),metal=new T.MeshStandardMaterial({color:'#adb7bc',metalness:.65,roughness:.35}),dark=new T.MeshStandardMaterial({color:'#202b32'}),yellow=new T.MeshStandardMaterial({color:'#ecd356'});
 const v=(x,y,z)=>new T.Vector3(x,y,z);
 function box(parent,w,h,d,p,m){const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.copy(p);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o}
 function bar(parent,a,b,width,m){const o=box(parent,width,1,width,v(0,0,0),m);setBar(o,a,b);return o}
 function setBar(o,a,b){o.position.copy(a).lerp(b,.5);o.scale.y=a.distanceTo(b);o.quaternion.setFromUnitVectors(v(0,1,0),b.clone().sub(a).normalize())}
 const truck=createRosenbauer(root);
 box(root,2.2,.8,2.1,v(1.5,2.32,11.3),red);
 const pivot=v(1.5,2.9,11.3),turntable=new T.Group();turntable.position.copy(pivot);root.add(turntable);
 const platform=new T.Mesh(new T.CylinderGeometry(1.5,1.5,.12,24),dark);platform.position.y=-.18;turntable.add(platform);
 const bearing=new T.Mesh(new T.CylinderGeometry(.7,.7,.25,24),metal);turntable.add(bearing);
 const console=box(turntable,.45,.65,.4,v(.75,.18,.48),dark);box(turntable,.43,.08,.36,v(.75,.55,.48),metal);
 for(const x of [.65,.85])bar(turntable,v(x,.58,.48),v(x,.77,.43),.035,dark);
 const booms=[createLattice(root,4),createLattice(root,1)];
 const hydraulic=[bar(root,v(0,0,0),v(0,1,0),.13,dark),bar(root,v(0,0,0),v(0,1,0),.075,metal)];
 const joint=new T.Mesh(new T.SphereGeometry(.23,12,8),dark);root.add(joint);
 const basket=new T.Group();root.add(basket);box(basket,1.3,.12,1.25,v(0,-.06,0),metal);
 for(const x of [-.65,.65])for(const z of [-.625,.625])bar(basket,v(x,0,z),v(x,1.05,z),.045,metal);
 for(const y of [.5,1.05]){bar(basket,v(-.65,y,.625),v(.65,y,.625),.045,metal);for(const x of [-.65,.65])bar(basket,v(x,y,-.625),v(x,y,.625),.045,metal)}
 const gate=new T.Group();gate.position.set(-.65,0,-.625);basket.add(gate);for(const y of [.5,1.05])bar(gate,v(0,y,0),v(1.3,y,0),.045,metal);
 box(basket,1.22,.25,.06,v(0,.24,.63),red);
 box(basket,.12,.7,1.15,v(-.63,.4,0),metal);box(basket,.12,.7,1.15,v(.63,.4,0),metal);box(basket,.32,.12,.3,v(-.43,.93,.24),dark);for(let k=0;k<3;k++)bar(gate,v(.43,.15+k*.23,0),v(.87,.15+k*.23,0),.035,metal);
 const screen=new T.MeshStandardMaterial({color:'#243e47',emissive:'#487f8f',emissiveIntensity:.3});box(turntable,.31,.06,.23,v(.75,.6,.48),screen);for(const x of [-.53,.53]){box(basket,.18,.14,.08,v(x,.86,-.65),metal);box(basket,.12,.08,.035,v(x,.86,-.702),screen)}
 const supports=[];
 for(const x of [-2.5,2.5])for(const side of [-1,1]){
  const beam=box(root,.22,.22,1,v(x,.65,11.3+side*1.1),metal),leg=box(root,.18,1,.18,v(0,0,0),metal),pad=box(root,.55,.1,.55,v(0,0,0),dark);
  const stripe=box(root,.24,.24,.3,v(0,0,0),yellow);supports.push({x,side,beam,leg,pad,stripe});
 }
 // Visible access steps at the rear, outside the body footprint.
 for(let i=0;i<5;i++)box(root,.4,.18,.8,v(2.15-i*.28,.1+i*.47,11.3),metal);
 const crew=[createPerson(root,'隊員'),createPerson(root,'隊員')];
 function feet(p,position){p.body.position.copy(position);p.body.updateWorldMatrix(true,true);const bottom=Math.min(...p.boots.map(b=>new T.Box3().setFromObject(b).min.y));p.body.position.y+=position.y-bottom;}
 const waiting=[v(4.7,-.065,8.3),v(5.6,-.065,8.3)];
 crew.forEach((p,i)=>feet(p,waiting[i]));
 const civilian=new T.Group();civilian.position.set(-4,4.17,4.6);root.add(civilian);
 const blue=new T.MeshStandardMaterial({color:'#739ec5'}),skin=new T.MeshStandardMaterial({color:'#d6a276'});
 box(civilian,.38,.6,.25,v(0,1.05,0),blue);const civilianLegs=[];for(const x of [-.12,.12]){const leg=new T.Group();leg.position.set(x,.75,0);civilian.add(leg);box(leg,.14,.75,.18,v(0,-.375,0),dark);civilianLegs.push(leg)}
 const head=new T.Mesh(new T.SphereGeometry(.17,12,8),skin);head.position.set(0,1.54,0);civilian.add(head);
 bar(civilian,v(-.2,1.3,0),v(-.4,1.75,.05),.11,blue);bar(civilian,v(.2,1.3,0),v(.4,1.65,.05),.11,blue);
 const end=v(-.95,2.9,11.3),target=v(-4,4.17,5.85);let elapsed=0,active=false,lastStage=-1,accepted=false;
 const groundTarget=v(-4,.2,6.3);
 let mission=null,waterTime=0,motionGuard=()=>true,missionPlanner=null;
 const monitor=createCageMonitor(basket,root),spray=monitor.spray;
 function assignMission(floor,task){
  if(!motionGuard('mission')||elapsed<70||![2,3,4,5,6].includes(floor)||!['查看','出水防護','返回待命'].includes(task))return false;
  let destination=task==='返回待命'?groundTarget.clone():v(-4,(floor-1)*3.2+.97,6.6);
  const motionPlan=missionPlanner?.(destination);
  if(missionPlanner&&!motionPlan){onStage(`${floor} 樓近靠未執行：目前模型的梯架會與車體或建物干涉；保留原位置，請改選樓層。`,15);return false;}
  if(motionPlan)destination=motionPlan.destination.clone();
  mission={floor,task,time:0,start:end.clone(),destination,arrived:false,motionPlan};monitor.hide();
  onStage(task==='返回待命'?'雲梯籃架返回地面待命':`雲梯轉往 ${floor} 樓${floor===6?'／屋頂高度':''}：${task}`,13);return true;
 }
 const stages=['兩名隊員前往雲梯車','展開支腿橫梁','支腳下降並貼地','隊員登上籃架與旋轉操作台','梯架抬升、轉台對準後伸梯','籃架接近二樓待救者','籃架已到位，等待接應','開啟籃門、協助待救者進籃','關閉籃門、確認人員站妥','籃架離開陽台','載人平穩下降','開門並引導待救者離籃','待救者已到地面接應位置'];
 function path(points,q){const k=Math.min(points.length-2,Math.floor(q*(points.length-1)));return points[k].clone().lerp(points[k+1],q*(points.length-1)-k)}
 function update(dt,running){if(active&&running&&motionGuard('advance'))elapsed=Math.min(accepted?70:38,elapsed+dt*(elapsed>=52&&elapsed<65?.25:1));
  const t=elapsed,stage=t<5?0:t<9?1:t<12?2:t<19?3:t<30?4:t<38?5:!accepted?6:t<44?7:t<47?8:t<52?9:t<65?10:t<70?11:12;
  if(active&&stage!==lastStage){lastStage=stage;onStage(stages[stage],stage)}
  const spread=smooth((t-5)/4),down=smooth((t-9)/3);
  supports.forEach(s=>{const z=11.3+s.side*(1.25+1.15*spread);s.beam.position.z=11.3+s.side*(.625+.575*spread);s.beam.scale.z=1.25+1.15*spread;const bottom=.5-.465*down;s.leg.position.set(s.x,(.65+bottom)/2,z);s.leg.scale.y=.65-bottom;s.pad.position.set(s.x,bottom-.05,z);s.stripe.position.set(s.x,.65,z)});
  const q=smooth((t-19)/19);end.copy(v(-.95,2.9,11.3)).lerp(target,q);
  if(t>47)end.copy(target).lerp(v(-4,4.17,6.3),smooth((t-47)/5));if(t>52)end.copy(v(-4,4.17,6.3)).lerp(groundTarget,smooth((t-52)/13));
  gate.rotation.y=-(Math.PI/2)*(t>=38&&accepted&&t<47?Math.min(smooth((t-38)/1),1-smooth((t-44)/3)):t>=65?smooth((t-65)/1):0);
  if(t<=38)civilian.position.set(-4,4.17,4.6);else if(t<44)civilian.position.copy(v(-4,4.17,4.6)).lerp(target.clone().add(v(.28,0,0)),smooth((t-39)/5));else if(t<65)civilian.position.copy(end).add(v(.28,0,0));else civilian.position.copy(end).add(v(.28,0,0)).lerp(groundTarget.clone().add(v(.28,-.025,-1.5)),smooth((t-66)/4));
  const walking=(t>39&&t<44)||(t>66&&t<70);const stride=walking?Math.sin(t*7)*.22:0;civilianLegs.forEach((leg,i)=>leg.rotation.x=i===0?stride:-stride);civilian.position.y+=.75*(1-Math.cos(stride))+.09*Math.abs(Math.sin(stride));
  if(mission){
   if(running&&motionGuard('advance')){mission.time=Math.min(17,mission.time+dt);waterTime+=dt}
   gate.rotation.y=0;
   const start=mission.start,dest=mission.destination;
   if(mission.time<2)end.copy(start);
   else end.copy(path([start,v(start.x,start.y,Math.max(8.675,start.z,dest.z)),v(dest.x,dest.y,Math.max(8.675,start.z,dest.z)),dest],smooth((mission.time-2)/15)));
   if(mission.time>=17&&!mission.arrived){mission.arrived=true;onStage(mission.task==='返回待命'?'雲梯籃架已回地面待命':`${mission.floor} 樓${mission.task}／執行中`,14)}
  }
  const delta=end.clone().sub(pivot);if(delta.length()<2.45){delta.setLength(2.45);end.copy(pivot).add(delta)}const d=delta.length(),dir=delta.clone().normalize();
  const mainLength=Math.max(6.8,d-4.35+1.2);const a=(mainLength**2-4.35**2+d*d)/(2*d),h=Math.sqrt(Math.max(0,mainLength**2-a*a));
  const up=v(0,1,0).addScaledVector(dir,-dir.y).normalize();const elbow=pivot.clone().addScaledVector(dir,a).addScaledVector(up,h);
  setBar(booms[0],pivot,elbow);setBar(booms[1],elbow,end);joint.position.copy(elbow);const pistonBase=pivot.clone().add(v(0,-.3,.38)),pistonEnd=pivot.clone().lerp(elbow,.45).add(v(0,0,.38)),pistonMid=pistonBase.clone().lerp(pistonEnd,.55);setBar(hydraulic[0],pistonBase,pistonMid);setBar(hydraulic[1],pistonMid,pistonEnd);basket.position.copy(end);turntable.rotation.y=Math.atan2(-delta.z,delta.x);
  monitor.update(v(1.4,(mission?.destination.y??end.y)+1.1,4.12),Boolean(mission?.arrived&&mission.task==='出水防護'),waterTime);
  crew.forEach((p,i)=>{p.legs.forEach((leg,j)=>leg.rotation.x=active&&t<19?Math.sin(t*7+j*Math.PI)*.28:0);p.arms.forEach(arm=>arm.rotation.x=t>=19?.65:0);if(i===0){p.beam.visible=Boolean(mission?.arrived&&mission.task==='查看');p.body.rotation.y=p.beam.visible?Math.sin(waterTime*.7)*.2:0;}
   if(t<12){feet(p,waiting[i].clone().lerp(v(2.3,-.065,10.8+i*.8),smooth(t/5)));}
   else if(t<19){const destination=i===0?v(-.95,2.9,11.3):v(.75,2.78,10.35);feet(p,path([v(2.3,-.065,10.8+i*.8),v(2.15,.19,11.3),v(1.59,1.13,11.3),v(1.03,2.07,11.3),v(.65,2.78,11.3),destination],clamp((t-12)/7)));}
   else if(i===0)feet(p,end.clone().add(v(-.28*smooth((t-38)/2),0,0)));else{const station=v(.75,-.12,.95).applyAxisAngle(v(0,1,0),turntable.rotation.y).add(pivot);feet(p,station);p.body.rotation.y=turntable.rotation.y;}
  });
 }
 update(0,false);
 return {root,turntable,gate,assignMission,groundTarget,setMissionPlanner(fn){missionPlanner=fn;},reportMotion:onStage,setMotionGuard(fn){motionGuard=fn;},get waterTime(){return waterTime},get mission(){return mission},monitor,spray,truck,crew,basket,supports,booms,target,civilian,pivot,accept(){if(elapsed<38||accepted||!motionGuard('accept'))return false;accepted=true;return true},get elapsed(){return elapsed},get active(){return active},start(){if(active)return false;active=true;return true},update};
}
