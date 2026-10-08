import assert from 'node:assert/strict';import * as T from 'three';
import {load} from './load-aerial.mjs';
import {createAerialRescue} from '../dist/aerial-rescue.js';
import {applyAerialModel} from '../dist/imported-aerial.js';
function person(root){const body=new T.Group();root.add(body);const boots=[-1,1].map(x=>{const b=new T.Mesh(new T.BoxGeometry(.15,.2,.3));b.position.set(x*.1,.1,0);body.add(b);return b});return {body,boots,legs:[new T.Group(),new T.Group()],arms:[new T.Group(),new T.Group()],beam:new T.Group()};}
const messages=[];const a=createAerialRescue(new T.Scene(),person,(text,stage)=>messages.push({text,stage}));applyAerialModel(a,await load());a.start();let frames=0,minZ=Infinity;
function tick(running=true){a.update(.05,running);a.updateImported();assert(!a.nativePose.blocked,JSON.stringify({t:a.elapsed,pose:a.nativePose,messages:messages.slice(-3)}));assert(a.nativePose.error<.04||a.mission&&a.mission.time<17,'end point error');minZ=Math.min(minZ,a.motion.clearance().minZ);assert(a.motion.clearance().safe,'post-gate collision');
if(frames%50===0)for(const suffix of ['','001']){
 const rod=a.importedVisual.getObjectByName('Ram_rod_root'+suffix),barrel=a.importedVisual.getObjectByName('Ram_barrel_root'+suffix);
 const direction=barrel.getWorldPosition(new T.Vector3()).sub(rod.getWorldPosition(new T.Vector3())).normalize();
 assert(new T.Vector3(1,0,0).transformDirection(rod.matrixWorld).dot(direction)>.9999,'rod stays aligned to cylinder');
 assert(new T.Vector3(1,0,0).transformDirection(barrel.matrixWorld).dot(direction)<-.9999,'barrel tracks upper mount');
}
frames++;}
while(a.elapsed<38)tick();assert(a.nativePose.ready);assert(a.accept());while(a.elapsed<70)tick();
for(const [floor,task] of [[4,'查看'],[2,'出水防護'],[3,'查看'],[2,'返回待命']]){assert(a.assignMission(floor,task));while(a.mission.time<17)tick();assert(a.mission.arrived);if(task!=='返回待命')assert(a.mission.destination.z===6.6&&a.mission.destination.x===-4,'same facade window');}
for(const floor of [5,6]){const previous=a.mission,pose=a.motion.pose;assert(!a.assignMission(floor,'查看'),'unreachable facade target is rejected');assert.equal(a.mission,previous);assert.deepEqual(a.motion.pose,pose);}
assert(a.assignMission(4,'查看'));for(let i=0;i<160;i++)tick();const p=a.nativePose.position.clone(),angles=a.motion.pose,time=a.mission.time;for(let i=0;i<20;i++)tick(false);assert(a.nativePose.position.distanceTo(p)<1e-9);assert.equal(a.mission.time,time);assert.deepEqual(a.motion.pose,angles);
assert(a.assignMission(3,'查看'));while(a.mission.time<17)tick();assert(a.mission.arrived);
console.log({frames,minZ,elapsed:a.elapsed,stages:messages.map(x=>x.stage),last:a.nativePose.position.toArray()});
