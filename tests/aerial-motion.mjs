import assert from 'node:assert/strict';
import * as T from 'three';
import {load} from './load-aerial.mjs';
import {createAerialMotion} from '../dist/aerial-motion.js';
const source=await load();source.position.set(0,-.065,10);source.updateMatrixWorld(true);const get=n=>source.getObjectByName(n),floor=get('Cage_floor');floor.geometry.computeBoundingBox();const anchor=floor.geometry.boundingBox.getCenter(new T.Vector3());anchor.y=floor.geometry.boundingBox.max.y;
const motion=createAerialMotion(source,{slew:get('Turntable_slew'),elevation:get('Ladder_elevation'),level:get('Cage_level'),floor,extensions:[2,3,4].map(n=>get('Ladder_extend_'+n)),anchor});
assert.equal(motion.move([-Math.PI,0,0]).safe,false,'swept wall collision rejected');assert.deepEqual(motion.pose,[0,0,0],'unsafe move preserves last pose');
const heel=motion.move([0,-Math.PI/3,0]);assert(!heel.safe&&heel.chassisHit,'over-raised ladder heel must not enter deck');assert.deepEqual(motion.pose,[0,0,0]);
const target=new T.Vector3(-4,4.17,6.2);let plan=motion.plan(target);assert(plan);
let minZ=Infinity,frames=0,maxYawStep=0,last=motion.pose;
function frame(p){const r=motion.move(p);assert(r.safe,JSON.stringify(r));minZ=Math.min(minZ,r.minZ);maxYawStep=Math.max(maxYawStep,Math.abs(motion.pose[0]-last[0]));last=motion.pose;frames++;return r;}
for(let t=0;t<=19.001;t+=.05)frame(motion.at(plan,t,true));assert(frame(motion.at(plan,19,true)).position.distanceTo(target)<.001);
for(let t=0;t<=1.001;t+=.005)frame(motion.solve(target.clone().lerp(new T.Vector3(-4,4.17,6.3),t)));
const before=motion.pose;
const invalid=motion.move(motion.solve(new T.Vector3(-4,.2,6.3)));
assert(!invalid.safe&&invalid.chassisHit,'old roof-penetrating descent must be rejected');assert.deepEqual(motion.pose,before);
plan=motion.plan(new T.Vector3(15,.2,15.5));assert(plan);for(let t=0;t<=17.001;t+=.05)frame(motion.at(plan,t));
for(const floor of [2,3,4,2,4]){const dest=new T.Vector3(-4,(floor-1)*3.2+.97,6.6);plan=motion.plan(dest);assert(plan,'mission '+floor);dest.copy(plan.destination);for(let t=0;t<=17.001;t+=.05)frame(motion.at(plan,t));assert(frame(motion.at(plan,17)).position.distanceTo(dest)<.001);}
plan=motion.plan(new T.Vector3(15,.2,15.5));assert(plan);for(let t=0;t<=17.001;t+=.05)frame(motion.at(plan,t));
for(const floor of [5,6])assert.equal(motion.plan(new T.Vector3(-4,(floor-1)*3.2+.97,6.6)),null,'unreachable close facade target');
assert.equal(motion.plan(new T.Vector3(0,4,0)),null,'inside building rejected');assert.equal(motion.solve(new T.Vector3(-100,100,0)),null,'unreachable rejected');
console.log({frames,minZ,maxYawStep,final:motion.clearance().position.toArray()});
