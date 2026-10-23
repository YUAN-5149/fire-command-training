import {createWalkMotion,smoothHeading} from './character-motion.js?v=cadence-20261023';
// Station crew are autonomous passengers; the yellow commander remains the only player.
import * as T from 'three';
export const STATION_CREW=Object.freeze(['小隊長','隊員','隊員','隊員']);
export function createStationCrew({scene,createPerson,ground,colliders,spawn}){
 const people=STATION_CREW.map((rank,i)=>{const root=new T.Group();root.name='信義分隊 NPC '+rank+' '+(i+1);scene.add(root);return {rank,root,person:createPerson(root,rank),i,x:0,z:0,heading:spawn.heading,phase:'standby',route:[],stride:0,stuck:0,cursor:0,gait:createWalkMotion(),following:false};});
 let frameDt=0,driving=false,trail=[],lastLeader={x:spawn.x,z:spawn.z};
 const local=(truck,side,forward)=>({x:truck.x+Math.cos(truck.heading)*side-Math.sin(truck.heading)*forward,z:truck.z-Math.sin(truck.heading)*side-Math.cos(truck.heading)*forward});
 const atHome=t=>Math.hypot(t.x-spawn.truck.x,t.z-spawn.truck.z)<2;
 function draw(p,distance=0){if(p.phase==='aerial'){p.root.visible=false;return;}p.root.visible=p.phase!=='riding';p.root.position.set(p.x,ground.at(p.x,p.z),p.z);p.root.rotation.y=smoothHeading(p.root.rotation.y,p.heading,frameDt);const v=p.gait.update(frameDt,distance).swing*.7;p.person.legs[0].rotation.x=v;p.person.legs[1].rotation.x=-v;p.person.arms[0].rotation.x=-v*.6;p.person.arms[1].rotation.x=v*.6;}
 function reset(){driving=false;trail=[];lastLeader={x:spawn.x,z:spawn.z};for(const p of people){Object.assign(p,{...spawn.crew[p.i],heading:spawn.heading,phase:'standby',route:[],stride:0,stuck:0,cursor:0,following:false});p.gait.reset();p.root.rotation.y=p.heading;draw(p);}}
 function board(truck){driving=true;trail=[];for(const p of people){if(p.phase==='riding'||p.phase==='aerial')continue;p.phase='boarding';p.stuck=0;const dx=p.x-truck.x,dz=p.z-truck.z,lateral=dx*Math.cos(truck.heading)-dz*Math.sin(truck.heading),forward=-dx*Math.sin(truck.heading)-dz*Math.cos(truck.heading),side=atHome(truck)?(p.i%2?-1.82:1.82):(lateral<0?-1.82:1.82);
   // Approach from the open apron, then down the narrow side aisle. Never walk through the cab or piers.
   p.route=atHome(truck)||Math.abs(lateral)<1.8?[local(truck,side,forward<0?-6.5:6.5),local(truck,side,2.2)]:[local(truck,side,Math.max(-6.5,Math.min(6.5,forward))),local(truck,side,2.2)];}}
 function disembark(truck,leader){driving=false;trail=[{x:leader.x,z:leader.z}];lastLeader={x:leader.x,z:leader.z};
  for(const p of people){if(p.phase==='aerial')continue;if(p.phase==='riding'){const side=p.i%2?-1.82:1.82;Object.assign(p,local(truck,side,1.1+Math.floor(p.i/2)*.85));const lr=(leader.x-truck.x)*Math.cos(truck.heading)-(leader.z-truck.z)*Math.sin(truck.heading);p.route=atHome(truck)?[local(truck,side,6.5)]:[local(truck,side,6.5),local(truck,lr<0?-2.6:2.6,6.5)];}else p.route=[];p.phase='follow';p.cursor=0;p.stuck=0;draw(p);}}
 function step(p,target,dt,blockers=[]){const dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);if(d<.22)return true;const amount=Math.min(d,2*dt),q=colliders.resolve(p.x+dx/d*amount,p.z+dz/d*amount,.24);
  const occupied=blockers.some(c=>Math.hypot(q.x-c[0],q.z-c[1])<c[2]+.24);
  const moved=occupied?0:Math.hypot(q.x-p.x,q.z-p.z);if(!occupied){p.x=q.x;p.z=q.z;}p.stuck=moved<amount*.25?p.stuck+dt:0;p.heading=Math.atan2(-dx,-dz);p.stride+=moved*3.5;draw(p,moved);return false;}
 function update(dt,{mode,truck,leader,blockers=[]}){dt=Math.max(0,Math.min(dt,.1));frameDt=dt;
  if(mode==='drive'&&!driving)board(truck);else if(mode!=='drive'&&driving)disembark(truck,leader);
  if(mode==='interior'){for(const p of people)draw(p);return;}// Outdoors crew wait; existing indoor teams retain their own tasks.
  if(driving){const next=people.find(p=>p.phase==='boarding');if(next){const target=next.route[0];if(step(next,target,dt,[...blockers,...people.filter(p=>p!==next&&p.root.visible).map(p=>[p.x,p.z,.27])])){next.route.shift();if(!next.route.length){next.phase='riding';draw(next);}}}return;}
  if(Math.hypot(leader.x-lastLeader.x,leader.z-lastLeader.z)>.75){trail.push({x:leader.x,z:leader.z});lastLeader={x:leader.x,z:leader.z};if(trail.length>1000){trail.shift();for(const p of people)p.cursor=Math.max(0,p.cursor-1);}}
  for(const p of people){if(p.phase!=='follow'){draw(p);continue;}if(p.route.length){if(step(p,p.route[0],dt,blockers))p.route.shift();continue;}
   // Follow the commander's recorded walking route. Collisions always apply; no stuck-time teleport.
   const gap=2+p.i*.85,distance=Math.hypot(p.x-leader.x,p.z-leader.z),goal=trail[Math.min(p.cursor,trail.length-1)]??leader;
   if(distance>gap+.7)p.following=true;else if(distance<gap)p.following=false;
   if(p.following){if(step(p,goal,dt,[...blockers,...people.filter(q=>q.i<p.i&&q.root.visible).map(q=>[q.x,q.z,.28])]))p.cursor=Math.min(p.cursor+1,trail.length-1);}else draw(p);
  }
 }
 const readyToDrive=()=>people.every(p=>p.phase==='riding');
 function status(){const n=people.filter(p=>p.phase==='riding').length;if(people.some(p=>p.phase==='aerial'))return 'NPC：2 名隊員操作雲梯・其餘待命（收梯後歸隊）';if(driving)return readyToDrive()?'NPC 4/4 已上車・隨車出勤':people.some(p=>p.stuck>3)?'NPC 上車路線受阻・請按 E 下車後重新集合':'NPC 集合上車 '+n+'/4・車輛暫停';return '自動 NPC：隊員 3 名＋小隊長 1 名・'+(people.some(p=>p.phase==='follow')?'下車跟隨／待命':'分隊待命');}
 function assignAerial(){for(const p of people.slice(1,3)){p.phase='aerial';p.root.visible=false;}}
 function returnAerial(){for(const p of people.slice(1,3)){if(p.phase!=='aerial')continue;const pos=p.person.body.getWorldPosition(new T.Vector3());p.root.add(p.person.body);p.person.body.position.set(0,0,0);p.person.body.rotation.set(0,0,0);p.x=pos.x;p.z=pos.z;p.phase='follow';p.route=[];p.cursor=Math.max(0,trail.length-1);draw(p);}}
 reset();return {people,reset,update,readyToDrive,status,assignAerial,returnAerial,circles:()=>people.filter(p=>p.root.visible).map(p=>[p.x,p.z,.28])};
}
