import {createActionScene} from '../dist/action-scene.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {attachLeadershipCharacter,LEADERSHIP_MODELS} from '../dist/leadership-character.js';
function person(){
 const root=new T.Group(),body=new T.Group();root.position.set(10,.175,20);root.add(body);body.position.y=.09;
 const boots=[-1,1].map(x=>{const b=new T.Mesh(new T.BoxGeometry(.2,.18,.32));b.position.set(x*.14,0,0);body.add(b);return b;});
 const arms=[new T.Group(),new T.Group()],legs=[new T.Group(),new T.Group()];body.add(...arms,...legs);
 const nozzle=new T.Mesh(new T.CylinderGeometry(.055,.075,.32)),beam=new T.Group();nozzle.visible=false;arms[1].add(nozzle);body.add(beam);
 return {body,boots,arms,legs,nozzle,beam,rank:'中隊長'};
}

for(const [rank,config] of Object.entries(LEADERSHIP_MODELS)){
 const bytes=await readFile(config.url),template=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const a=person(),b=person();a.rank=b.rank=rank;
 await Promise.all([a,b].map(p=>attachLeadershipCharacter(p,{load:()=>Promise.resolve(template)}).ready));
 assert.equal(a.modelState,'ready',rank);assert.equal(a.visual.userData.rank,rank);assert.notEqual(a.visual.getObjectByName('HandR'),b.visual.getObjectByName('HandR'));
 assert.deepEqual(new Set(a.animations),new Set(['Idle','Welcome','Wave','Point']));
 const bounds=new T.Box3().setFromObject(a.visual,true);assert.ok(Math.abs(bounds.max.y-bounds.min.y-1.8)<.001);assert.ok(Math.abs(bounds.min.y-.175)<.001);
 const bands=[];a.visual.traverse(o=>{if(o.name.includes('紅色識別袖環')&&o.visible)bands.push(o);});assert.equal(bands.length,rank==='小隊長'?1:rank==='分隊長'?2:0,rank+' correct rank bands');
 const before=b.visual.getObjectByName('UpperArmR').quaternion.clone();a.arms[1].rotation.x=.5;a.legs[0].rotation.x=.4;a.updateCharacter(0);assert.ok(a.visual.getObjectByName('UpperArmR').quaternion.angleTo(before)>.1);assert.ok(b.visual.getObjectByName('UpperArmR').quaternion.angleTo(before)<1e-7);
 const q=a.visual.getObjectByName('UpperArmR').quaternion.clone();for(let i=0;i<5;i++)a.updateCharacter(0);assert.ok(a.visual.getObjectByName('UpperArmR').quaternion.angleTo(q)<1e-7);
 a.nozzle.visible=true;a.updateCharacter(.05);assert.ok(a.nozzle.getWorldPosition(new T.Vector3()).distanceTo(a.visual.getObjectByName('HandR').getWorldPosition(new T.Vector3()))<.1);
 a.nozzle.visible=false;a.arms.forEach(v=>v.rotation.x=0);a.legs.forEach(v=>v.rotation.x=0);assert.equal(a.playAnimation('Wave'),true);a.updateCharacter(.05);
 if(rank==='大隊長'){let crimson=false,gold=false;a.visual.traverse(o=>{if(o.isMesh){const m=o.material;if(m.name==='消防衣｜大隊長深紅色矽膠')crimson=m.color.r>m.color.g*5;if(m.name==='盔徽｜黃金色')gold=m.metalness>.6;}});assert.ok(crimson&&gold,'chief crimson uniform and gold emblem');}
}
for(const rank of ['中隊長','隊員','unknown']){const p=person();p.rank=rank;let called=false;assert.equal(attachLeadershipCharacter(p,{load:()=>{called=true;throw Error();}}),p);assert.equal(called,false);}
console.log('Leadership models: all original GLBs, independent rigs, scale, soles, gestures, walking, nozzle, rank bands and crimson/gold chief verified.');

const factoryScene=new T.Scene(),factory=createActionScene(factoryScene,{examples:false});assert.equal(factoryScene.children.length,0,'street factory does not spawn an invisible duplicate staff');assert.equal(factory.roleExamples.length,0);const parent=new T.Group(),proxy=factory.createPerson(parent,'test');assert.equal(proxy.body.parent,parent);assert.equal(proxy.arms.length,2);assert.equal(proxy.legs.length,2);
