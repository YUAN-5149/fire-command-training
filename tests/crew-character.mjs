import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {attachCrewCharacter,CREW_MODEL_URL} from '../dist/crew-character.js';

const bytes=await readFile(CREW_MODEL_URL);
const template=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
function person(){
 const root=new T.Group(),body=new T.Group();root.position.set(10,.175,20);root.add(body);body.position.y=.09;
 const boots=[-1,1].map(x=>{const b=new T.Mesh(new T.BoxGeometry(.2,.18,.32));b.position.set(x*.14,0,0);body.add(b);return b;});
 const arms=[new T.Group(),new T.Group()],legs=[new T.Group(),new T.Group()];body.add(...arms,...legs);
 const nozzle=new T.Mesh(new T.CylinderGeometry(.055,.075,.32)),beam=new T.Group();nozzle.visible=false;arms[1].add(nozzle);body.add(beam);
 return {body,boots,arms,legs,nozzle,beam,rank:'隊員'};
}
const a=person(),b=person();await Promise.all([a,b].map(p=>attachCrewCharacter(p,{load:()=>Promise.resolve(template)}).ready));
assert.equal(a.modelState,'ready');assert.equal(b.modelState,'ready');
assert.deepEqual(new Set(a.animations),new Set(['Idle','Welcome','Wave','Point']));
assert.equal(a.visual.rotation.y,Math.PI);
const bounds=new T.Box3().setFromObject(a.visual,true);
assert.ok(Math.abs(bounds.max.y-bounds.min.y-1.8)<.001,'normalized 1.8 m height');
assert.ok(Math.abs(bounds.min.y-.175)<.001,'soles remain on the original ground');
assert.ok(Math.abs(a.body.position.y)<.001,'no inherited primitive boot offset');
const aa=a.visual.getObjectByName('UpperArmR'),ba=b.visual.getObjectByName('UpperArmR');
assert.notEqual(aa,ba,'clones have independent skeletons');
const original=ba.quaternion.clone();a.arms[1].rotation.x=.5;a.legs[0].rotation.x=.4;a.updateCharacter(0);
assert.ok(aa.quaternion.angleTo(original)>.1,'walk proxy drives the imported arm');
assert.ok(ba.quaternion.angleTo(original)<1e-7,'other character remains unchanged');
const once=aa.quaternion.clone();for(let i=0;i<10;i++)a.updateCharacter(0);
assert.ok(aa.quaternion.angleTo(once)<1e-7,'constant animation tracks do not accumulate procedural rotation');
a.arms[1].rotation.x=0;a.legs[0].rotation.x=0;
assert.equal(a.playAnimation('Wave'),true);a.updateCharacter(.05);
assert.equal(a.playAnimation('missing'),false);
a.nozzle.visible=true;a.updateCharacter(.05);
const hand=a.visual.getObjectByName('HandR').getWorldPosition(new T.Vector3());
a.body.updateWorldMatrix(true,true);
assert.ok(a.nozzle.getWorldPosition(new T.Vector3()).distanceTo(hand)<.1,'nozzle follows the actual hand');
assert.ok(a.boots.every(boot=>Number.isFinite(new T.Box3().setFromObject(boot).min.y)),'ground controllers retain usable boots');
a.body.visible=false;assert.equal(a.visual.parent.visible,false,'first person can hide the complete avatar');
const fallback=person(),oldBoot=fallback.boots[0],warn=console.warn;console.warn=()=>{};
try{await attachCrewCharacter(fallback,{load:()=>Promise.reject(new Error('offline'))}).ready;}finally{console.warn=warn;}
assert.equal(fallback.modelState,'fallback');assert.equal(fallback.boots[0],oldBoot);assert.equal(oldBoot.parent,fallback.body);
const rings=[];a.visual.traverse(o=>{if(o.name.includes('小隊長')&&o.name.includes('紅色識別袖環'))rings.push(o);});
assert.equal(rings.length,1,'latest v03 captain ring remains identifiable');assert.ok(rings.every(o=>!o.visible),'crew must have no captain rank ring');
const sourceRings=[];template.scene.traverse(o=>{if(o.name.includes('小隊長')&&o.name.includes('紅色識別袖環'))sourceRings.push(o);});assert.ok(sourceRings.every(o=>o.visible),'source template remains unchanged');
for(const rank of ['中隊長','小隊長','分隊長']){const p=person();p.rank=rank;let called=false;const result=attachCrewCharacter(p,{load:()=>{called=true;throw Error('must not load');}});assert.equal(result,p);assert.equal(called,false,'other ranks must remain unchanged');assert.equal(p.visual,undefined);}
console.log('Crew v03: original GLB, 1.8 m height, soles, independent rigs, walk, gestures, nozzle, fallback, crew-only rank and hidden captain ring passed.');
