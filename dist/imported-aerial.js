import * as T from 'three';
import {createCageSwivel,createNativeMonitor} from './native-cage.js';
import {createAerialMotion} from './aerial-motion.js';
import {aerialStaging} from './staging.js';
import {createGrounding,walkBoarding} from './aerial-grounding.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
export async function loadAerialModel(){return (await new GLTFLoader().loadAsync(new URL('./assets/aerial-ladder.glb',import.meta.url).href)).scene;}
export function applyAerialModel(a,source){
// Preserve every authored mesh, material, local transform and hierarchy. No per-part fitting.
const get=n=>source.getObjectByName(n),slew=get('Turntable_slew'),elevation=get('Ladder_elevation'),level=get('Cage_level'),floor=get('Cage_floor'),extensions=[2,3,4].map(n=>get('Ladder_extend_'+n));
if(!slew||!elevation||!level||!floor||extensions.some(o=>!o))throw new Error('Missing original aerial rig');
for(const o of a.root.children){if(o.isMesh)o.visible=false;}a.truck.root.visible=false;a.turntable.visible=false;a.booms.forEach(o=>o.visible=false);a.basket.children.forEach(o=>o.visible=false);
source.position.set(aerialStaging.x,-.065,aerialStaging.z);a.root.add(source);a.importedVisual=source;source.updateMatrixWorld(true);
const floorBox=new T.Box3().setFromBufferAttribute(floor.geometry.attributes.position),anchor=floorBox.getCenter(new T.Vector3());anchor.y=floorBox.max.y;
const targetWorld=()=>floor.localToWorld(anchor.clone());const rest=targetWorld();
const swivel=createCageSwivel(level,floor,anchor),nativeMonitor=createNativeMonitor(source,swivel);
a.monitor.bindNative(nativeMonitor);
const nativeGate=get('Cage_gate');let hinge=null;if(nativeGate){const b=new T.Box3().setFromObject(nativeGate);hinge=new T.Group();hinge.position.copy(swivel.worldToLocal(new T.Vector3(b.min.x,b.min.y,b.min.z)));swivel.add(hinge);hinge.updateWorldMatrix(true,false);hinge.attach(nativeGate);}
const motion=createAerialMotion(source,{slew,elevation,level,floor,extensions,anchor});
a.motion=motion;nativeMonitor.validate=()=>motion.clearance().safe;
let cageYaw=0,cageYawTarget=0;
a.canAdjustCage=()=>!a.nativePose?.blocked&&(a.elapsed===38||(a.elapsed>=70&&(!a.mission||a.mission.arrived)));
a.setCageYaw=degrees=>{
 if(!Number.isFinite(degrees)||!a.canAdjustCage())return false;
 const requested=T.MathUtils.degToRad(T.MathUtils.clamp(degrees,-15,15));
 for(let i=1;i<=15;i++){swivel.rotation.y=T.MathUtils.lerp(cageYaw,requested,i/15);if(!motion.clearance().safe){swivel.rotation.y=cageYaw;source.updateMatrixWorld(true);return false;}}
 swivel.rotation.y=cageYaw;source.updateMatrixWorld(true);cageYawTarget=requested;return true;
};
a.cageControl={swivel,get degrees(){return T.MathUtils.radToDeg(cageYaw)},get targetDegrees(){return T.MathUtils.radToDeg(cageYawTarget)}};
// Keep the full native cage outside the balcony edge, not just its floor centre.
a.target.z=6.2;
// Land outside the truck in the clear road area: do not depress the ladder over its roof.
a.groundTarget.set(15,.2,15.5);
// Keep the requested facade position exact. Never substitute a far-side target
// to mask an unreachable pose in this imported rig.
a.setMissionPlanner(destination=>motion.plan(destination));
const initialPlan=motion.plan(a.target);
let currentMission=null,missionPlan=null,landingPlan=null,blocked=false;
a.setMotionGuard?.(action=>action==='accept'?Boolean(a.nativePose?.ready&&!blocked):!blocked);
a.truck.lights.length=0;source.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;if(/beacon|warning|LED strip/i.test(o.material?.name||'')){o.material=o.material.clone();o.material.color.set('#c61f16');o.material.emissive.set('#ff180a');o.userData.flashPhase=new T.Box3().setFromObject(o).getCenter(new T.Vector3()).z>source.position.z?0:Math.PI;a.truck.lights.push(o)}});
const grounding=createGrounding(source);a.grounding=grounding;
const collider=new T.Mesh(new T.BoxGeometry(10.1,2.7,2.5),new T.MeshBasicMaterial());collider.position.set(aerialStaging.x,1.3,aerialStaging.z);collider.visible=false;a.root.add(collider);
const feet=(p,pos)=>{p.body.position.copy(pos);p.body.updateWorldMatrix(true,true);p.body.position.y+=pos.y-Math.min(...p.boots.map(b=>new T.Box3().setFromObject(b).min.y));};
const smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x)};
a.updateImported=(dt=1/60)=>{const t=a.elapsed,spread=smooth((t-5)/4),down=smooth((t-9)/3);grounding.update(spread,down);
if(hinge)hinge.rotation.y=a.gate.rotation.y;
if(a.canAdjustCage()){
 const next=cageYaw+T.MathUtils.clamp(cageYawTarget-cageYaw,-Math.max(0,Math.min(dt,.1))*.25,Math.max(0,Math.min(dt,.1))*.25);
 swivel.rotation.y=next;
 if(motion.clearance().safe)cageYaw=next;else{swivel.rotation.y=cageYaw;cageYawTarget=cageYaw;}
}else cageYawTarget=cageYaw;
let wanted=null,candidate=motion.pose;
if(t>19){
 if(a.mission){
  if(currentMission!==a.mission){currentMission=a.mission;missionPlan=a.mission.motionPlan;}
  candidate=motion.at(missionPlan,a.mission.time);wanted=a.mission.destination.clone();
 }else if(t>=52&&t<65){
  if(!landingPlan)landingPlan=motion.plan(a.groundTarget);
  candidate=motion.at(landingPlan,(t-52)*17/13);
 }else if(t<38){candidate=motion.at(initialPlan,t-19,true);}
 else{wanted=a.basket.position.clone();candidate=motion.solve(wanted);}
}
const result=motion.move(candidate),actual=result.position;
if(!result.safe&&!blocked){blocked=true;a.reportMotion?.(result.reason||'目前路徑無法避開建物，雲梯已停止',15);}
const arrived=!blocked&&(!wanted||actual.distanceTo(wanted)<.04);
if(a.mission)a.mission.arrived=a.mission.time>=17&&arrived;
a.basket.position.copy(actual);if(t>=44&&t<65)a.civilian.position.copy(actual).add(new T.Vector3(.28,0,0));
const station=slew.localToWorld(new T.Vector3(.3,.335,.8));
const basketRoute=[...grounding.steps,grounding.local(1.5,2.675,-.8),grounding.local(-1,2.675,-.8),new T.Vector3(rest.x,rest.y,rest.z-.6),rest.clone().add(new T.Vector3(-.28,0,0))];
const operatorRoute=[...grounding.steps,station];
for(let i=0;i<2;i++){const p=a.crew[i];if(t<12){const entry=grounding.steps[0],start=entry.clone().add(new T.Vector3(-2-i,0,-1));walkBoarding(p,[start,entry.clone().add(new T.Vector3(0,0,-i*.65))],smooth(t/5),feet);}else if(t<19)walkBoarding(p,i===0?basketRoute:operatorRoute,T.MathUtils.clamp((t-12-i*.7)/(7-i*.7),0,1),feet);else {p.legs.forEach(l=>l.rotation.x=0);feet(p,i===0?actual.clone().add(new T.Vector3(-.28,0,0).applyQuaternion(swivel.getWorldQuaternion(new T.Quaternion()))):station);p.body.rotation.y=slew.rotation.y+(i===0?cageYaw:0);}}

a.monitor.base.visible=false;a.monitor.update(new T.Vector3(a.mission?.destination.x??a.target.x,(a.mission?.destination.y??actual.y)+1.1,4.12),Boolean(a.mission?.arrived&&a.mission.task==='出水防護'),a.waterTime);source.updateMatrixWorld(true);a.nativePose={error:wanted?actual.distanceTo(wanted):0,position:actual.clone(),ready:t>=38&&arrived,blocked,angles:motion.pose,clearance:{minZ:result.minZ,maxZ:result.maxZ,minY:result.minY}};};a.updateImported();return source;
}
