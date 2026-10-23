import {installRigidSkinBounds} from './character-motion.js?v=smooth-20261023';
import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {clone} from './vendor/SkeletonUtils.js';

export const COMMANDER_MODEL_URL=new URL('./assets/commander-firefighter-v21.glb',import.meta.url);
let templatePromise;
function loadTemplate(){
 return templatePromise??=(new GLTFLoader().loadAsync(COMMANDER_MODEL_URL.href).catch(error=>{templatePromise=null;throw error;}));
}

// Keep the training controllers' synchronous person API while loading one shared GLB.
// SkeletonUtils gives each commander independent bones and animation state.
export function attachCommanderCharacter(person,{load=loadTemplate}={}){
 const {body,arms,legs,nozzle,beam}=person;
 const syncWorld=()=>{body.parent?.updateWorldMatrix(true,false);body.updateMatrixWorld(true);};
 person.modelState='loading';
 person.updateCharacter=()=>{};
 person.ready=load().then(gltf=>{
  const visual=new T.Group(),model=clone(gltf.scene);
  visual.name='Commander_v21';visual.rotation.y=Math.PI;visual.add(model);
  const mixer=new T.AnimationMixer(model),actions=new Map(gltf.animations.map(c=>[c.name,mixer.clipAction(c)]));
  let current=actions.get('Idle');current?.play();mixer.update(0);
  visual.updateMatrixWorld(true);
  const skeletons=new Set();model.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});
  for(const skeleton of skeletons)skeleton.update();
  const bounds=new T.Box3().setFromObject(visual,true),height=bounds.max.y-bounds.min.y;
  if(!Number.isFinite(height)||height<=0)throw new Error('Invalid commander model bounds');
  visual.scale.setScalar(1.8/height);visual.position.y=-bounds.min.y*visual.scale.x;
  const boots=['L','R'].map(s=>model.getObjectByName(`消防靴｜短圓一體-${s}`));
  const armBones=['L','R'].map(s=>model.getObjectByName(`UpperArm${s}`));
  const legBones=['L','R'].map(s=>model.getObjectByName(`Thigh${s}`));
  const hand=model.getObjectByName('HandR');
  if([...boots,...armBones,...legBones,hand].some(o=>!o))throw new Error('Incomplete commander rig');
  syncWorld();
  const oldBottom=Math.min(...person.boots.map(b=>new T.Box3().setFromObject(b).min.y));
  const oldOrigin=body.getWorldPosition(new T.Vector3()).y;
  // Retain the previous sole's ground level, including the original training spawn offset.
  body.position.y+=(oldBottom-oldOrigin)/(body.parent?.getWorldScale(new T.Vector3()).y||1);
  body.add(nozzle);
  for(const child of [...body.children])if(child!==nozzle&&child!==beam){
   body.remove(child);
   child.traverse(o=>{if(o.isMesh)o.geometry.dispose();});
  }
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
  body.add(visual);person.boots.splice(0,person.boots.length,...boots);
  person.visual=visual;person.modelState='ready';person.animations=[...actions.keys()];
  const controlledBones=[...armBones,...legBones],baseRotations=controlledBones.map(b=>b.quaternion.clone());
  const worldAxis=new T.Vector3(),localAxis=new T.Vector3(),parentRotation=new T.Quaternion(),turn=new T.Quaternion(),parentPosition=new T.Vector3(),parentScale=new T.Vector3(),bodyInverse=new T.Matrix4();
  function rotateJoint(bone,angle){
   if(!angle)return;
   bone.parent.matrixWorld.decompose(parentPosition,parentRotation,parentScale);
   localAxis.copy(worldAxis).applyQuaternion(parentRotation.invert());
   bone.quaternion.premultiply(turn.setFromAxisAngle(localAxis,angle));
   bone.updateWorldMatrix(false,true);
  }
  person.playAnimation=name=>{
   const next=actions.get(name);if(!next)return false;
   current?.stop();current=next;next.reset().play();return true;
  };
  boots.forEach(installRigidSkinBounds);
  person.updateCharacter=dt=>{
   const controlled=nozzle.visible||[...arms,...legs].some(p=>Math.abs(p.rotation.x)>.001);
   if(controlled&&current!==actions.get('Idle'))person.playAnimation('Idle');
   // Restore the prior animation pose: constant tracks need not be rewritten by the mixer.
   controlledBones.forEach((b,i)=>b.quaternion.copy(baseRotations[i]));
   mixer.update(Math.min(Math.max(dt,0),.25));
   controlledBones.forEach((b,i)=>baseRotations[i].copy(b.quaternion));
   syncWorld();
   worldAxis.set(1,0,0).transformDirection(body.matrixWorld);
   armBones.forEach((b,i)=>rotateJoint(b,nozzle.visible?1.15:arms[i].rotation.x*.8));
   legBones.forEach((b,i)=>rotateJoint(b,legs[i].rotation.x*.55));
   if(nozzle.visible){nozzle.position.setFromMatrixPosition(hand.matrixWorld).applyMatrix4(bodyInverse.copy(body.matrixWorld).invert());
    nozzle.position.z-=.05;nozzle.rotation.set(Math.PI/2,0,0);nozzle.updateMatrixWorld(true);}

   for(const skeleton of skeletons)skeleton.update();
   for(const boot of boots)boot.computeBoundingBox();
  };
  person.updateCharacter(0);
  return person;
 }).catch(error=>{
  person.modelState='fallback';person.modelError=error;
  console.warn('中隊長模型載入失敗，保留原有角色。',error);
  return person;
 });
 return person;
}
