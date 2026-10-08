import assert from 'node:assert/strict';
import * as T from 'three';
import {load} from './load-aerial.mjs';
import {createAerialRescue} from '../dist/aerial-rescue.js';
import {applyAerialModel} from '../dist/imported-aerial.js';
function person(root){const body=new T.Group();root.add(body);const boots=[-1,1].map(x=>{const b=new T.Mesh(new T.BoxGeometry(.15,.2,.3));b.position.set(x*.1,.1,0);body.add(b);return b;});return {body,boots,legs:[new T.Group(),new T.Group()],arms:[new T.Group(),new T.Group()],beam:new T.Group()};}
const a=createAerialRescue(new T.Scene(),person,()=>{});applyAerialModel(a,await load());
function tick(running=true){a.update(.05,running);a.updateImported(.05);assert(!a.nativePose.blocked);assert(a.motion.clearance().safe);}
assert(!a.setCageYaw(15),'no swivel before deployment');a.start();while(a.elapsed<38)tick();
const pivot=a.motion.origin.clone(),floorPosition=a.nativePose.position.clone();
for(const angle of [-15,15,0]){assert(a.setCageYaw(angle));for(let i=0;i<60;i++)tick();assert(Math.abs(a.cageControl.degrees-angle)<.01);assert(a.nativePose.position.distanceTo(floorPosition)<1e-8,'swivel keeps basket floor centre fixed');assert(a.motion.origin.distanceTo(pivot)<1e-8);}
assert(a.accept());while(a.elapsed<70)tick();assert(a.assignMission(3,'出水防護'));while(a.mission.time<17)tick();tick();
assert(a.monitor.spray.visible&&a.monitor.jet.visible,'wide fog must render at arrival');assert(!a.monitor.base.visible,'hidden fallback monitor remains hidden');
function inspect(){
 const d=a.monitor.diagnostics,mouth=a.monitor.muzzle.getWorldPosition(new T.Vector3());assert(d.native);assert(d.origin.distanceTo(mouth)<1e-8,'water starts at visible nozzle');
 const first=new T.Vector3().fromBufferAttribute(a.monitor.spray.geometry.attributes.position,0);a.root.localToWorld(first);assert(first.distanceTo(mouth)<1e-5,'first droplet at muzzle');
 const cone=a.monitor.jet.children[0],vertices=cone.geometry.attributes.position;assert(Math.abs(Math.hypot(vertices.getX(0),vertices.getY(0))-.026)<1e-5,'fog root uses actual nozzle radius');
 assert(d.halfAngle>=Math.PI/6-.001);return mouth;
}
const before=inspect(),positions=a.monitor.spray.geometry.attributes.position.array.slice();tick();assert(positions.some((v,i)=>Math.abs(v-a.monitor.spray.geometry.attributes.position.array[i])>1e-4),'mist keeps moving after arrival');
assert(a.setCageYaw(15));for(let i=0;i<60;i++)tick();const after=inspect();assert(before.distanceTo(after)>.05,'visible nozzle follows platform swivel');assert(Math.abs(a.cageControl.degrees-15)<.01);
const paused=a.monitor.spray.geometry.attributes.position.array.slice();tick(false);assert(paused.every((v,i)=>Math.abs(v-a.monitor.spray.geometry.attributes.position.array[i])<1e-5),'paused mist stays still');
for(const floor of [2,4]){
 assert(a.assignMission(floor,'出水防護'));while(a.mission.time<17)tick();tick();assert(a.monitor.spray.visible,'fog at floor '+floor);inspect();
 for(const angle of [-15,15,0]){assert(a.setCageYaw(angle),'platform clearance at floor '+floor);for(let i=0;i<60;i++)tick();assert(a.monitor.spray.visible);inspect();}
}
assert(a.assignMission(2,'返回待命'));tick();assert(!a.monitor.spray.visible&&!a.monitor.jet.visible,'no emission during movement');
console.log('Passed: native muzzle emission, wide fog, continuous spray, +/-15 degree swivel, stable floor, pause and stop');
