import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {createWalkSurface,placeCharacterFeet} from '../dist/xinyi-walk-surface.js';
import {drapeSite} from '../dist/eoc-detail.js';
import {addLanesToScene} from '../dist/xinyi-lanes.js';
import {attachCommanderCharacter} from '../dist/commander-character.js';
const parse=async name=>{const b=fs.readFileSync(new URL('../dist/assets/'+name,import.meta.url));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const base={at:(x,z)=>9.2+x*.004+z*.002},surface=createWalkSurface(base),scene=new T.Scene();
assert.equal(surface.at(1000,1000),base.at(1000,1000));
const root=(await parse('taipei-eoc-core.glb')).scene;root.position.set(100,9.66,200);root.rotation.y=-.02;scene.add(root);drapeSite(root,base);root.updateMatrixWorld(true);
const originalBytes=fs.readFileSync(new URL('../dist/assets/taipei-eoc-core.glb',import.meta.url));assert.ok(surface.addDraped(root)>0);const rev=surface.revision;assert.equal(surface.addDraped(root),0);assert.equal(surface.revision,rev,'deduplicated surface registration');
// Raycast actual, transformed, draped paving to independently verify the indexed height.
const meshes=[];root.getObjectByName('EOC_site_paving').traverse(m=>{if(m.isMesh)meshes.push(m);});const ray=new T.Raycaster(),v=new T.Vector3(),points=[];
for(const m of meshes){const p=m.geometry.attributes.position;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld);if(v.y-base.at(v.x,v.z)>.17)points.push({x:v.x,z:v.z});}}
let target=null;for(const p of points){ray.set(new T.Vector3(p.x,base.at(p.x,p.z)+10,p.z),new T.Vector3(0,-1,0));const hit=ray.intersectObjects(meshes,false)[0];if(hit&&hit.point.y-base.at(p.x,p.z)>.17){target={x:p.x,z:p.z,y:hit.point.y};break;}}
assert.ok(target,'real EOC raised paving exists');assert.ok(Math.abs(surface.at(target.x,target.z)-target.y)<1e-5,'same floor as visible model, not base terrain');
// Explicitly tagged surface only: a high roof must not become a walkable floor.
const roof=new T.Mesh(new T.BoxGeometry(10,.2,10),new T.MeshBasicMaterial());roof.position.set(10000,200,10000);root.add(roof);surface.addDraped(root);assert.equal(surface.at(10000,10000),base.at(10000,10000));
const p=target,player=new T.Group(),body=new T.Group();scene.add(player);player.add(body);body.position.y=.09;
const boots=[-1,1].map(x=>{const b=new T.Mesh(new T.BoxGeometry(.2,.18,.32));b.position.set(x*.14,0,0);body.add(b);return b;});const arms=[new T.Group(),new T.Group()],legs=[new T.Group(),new T.Group()],nozzle=new T.Mesh(new T.CylinderGeometry(.05,.07,.3)),beam=new T.Group();body.add(...arms,...legs,beam);arms[1].add(nozzle);nozzle.visible=false;
const person={body,boots,arms,legs,nozzle,beam};const template=await parse('commander-firefighter-v21.glb');await attachCommanderCharacter(person,{load:()=>Promise.resolve(template)}).ready;assert.equal(person.modelState,'ready');
function checkSoles(){for(const boot of person.boots){const box=new T.Box3().copy(boot.boundingBox).applyMatrix4(boot.matrixWorld);for(const x of [box.min.x,box.max.x])for(const z of [box.min.z,box.max.z])assert.ok(box.min.y>=surface.at(x,z)+.0079,'boot clears rendered pavement in current pose');}}
for(const angle of [0,-.6,.3,.6]){player.position.set(p.x,base.at(p.x,p.z),p.z);legs[0].rotation.x=angle;legs[1].rotation.x=-angle;person.updateCharacter(1/60);placeCharacterFeet(player,person,surface);checkSoles();const y=player.position.y;placeCharacterFeet(player,person,surface);assert.ok(Math.abs(player.position.y-y)<1e-6,'no cumulative height drift');}
const curb=new T.Mesh(new T.BoxGeometry(4,.3,4),new T.MeshBasicMaterial());curb.position.set(20000,base.at(20000,20000)+.15,20000);scene.add(curb);const old=surface.revision;surface.addMeshes([curb]);assert.ok(surface.revision>old);assert.ok(Math.abs(surface.at(20000,20000)-base.at(20000,20000)-.3)<.001);
assert.ok(originalBytes.equals(fs.readFileSync(new URL('../dist/assets/taipei-eoc-core.glb',import.meta.url))),'source GLB unchanged');
const lanesData=JSON.parse(fs.readFileSync(new URL('../dist/assets/lanes-xinyi.json',import.meta.url))),laneScene=new T.Scene(),laneRoot=addLanesToScene({T,scene:laneScene,data:lanesData,ground:base}),laneSurface=createWalkSurface(base);assert.ok(laneSurface.addMeshes(laneRoot.children.filter(m=>!m.userData.inferredPaint))>0);for(let i=0;i<500;i++)assert.ok(Number.isFinite(laneSurface.at(i-250,i%100)));
console.log('Walk surface: real draped EOC paving indexed, actual commander idle/running soles clear, no height drift, roofs excluded and async revision passed. Raised sample '+(target.y-base.at(p.x,p.z)).toFixed(3)+' m.');
