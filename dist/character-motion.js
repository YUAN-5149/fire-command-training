import * as T from 'three';
const rigidGeometry=new WeakMap();
// Existing boots have 40,000 vertices each, all rigidly weighted to one bone.
// Transform the shared rest bounds rather than skinning every vertex on the CPU each frame.
export function installRigidSkinBounds(mesh){
 if(!mesh.isSkinnedMesh)return false;const g=mesh.geometry;let bone=rigidGeometry.get(g);
 if(bone===undefined){bone=-1;const ix=g.attributes.skinIndex,w=g.attributes.skinWeight;
  if(ix&&w&&!g.morphAttributes.position?.length){let valid=true;for(let i=0;i<w.count&&valid;i++){let index=-1;for(let j=0;j<4;j++){const weight=w.getComponent(i,j);if(weight===0)continue;if(Math.abs(weight-1)>1e-6||index!==-1){valid=false;break;}index=ix.getComponent(i,j);}if(index<0||(bone>=0&&bone!==index))valid=false;else bone=index;}if(!valid)bone=-1;}
  rigidGeometry.set(g,bone);
 }
 if(bone<0||!mesh.skeleton.bones[bone])return false;
 if(!g.boundingBox)g.computeBoundingBox();const rest=g.boundingBox.clone(),matrix=new T.Matrix4();
 mesh.computeBoundingBox=function(){this.boundingBox??=new T.Box3();matrix.multiplyMatrices(this.bindMatrixInverse,this.skeleton.bones[bone].matrixWorld).multiply(this.skeleton.boneInverses[bone]).multiply(this.bindMatrix);this.boundingBox.copy(rest).applyMatrix4(matrix);};
 mesh.computeBoundingBox();return true;
}
export function characterVisible(body){for(let o=body;o;o=o.parent){if(!o.visible)return false;if(o.isScene)return true;}return false;}
export function createWalkMotion(){let phase=0,blend=0,speed=0;return {update(dt,distance=0){dt=Math.max(0,Math.min(dt,.1));const moving=distance>1e-5;blend+=((moving?Math.min(1,distance/Math.max(dt,.001)/1.5):0)-blend)*(-Math.expm1(-dt*12));if(moving)speed=distance/Math.max(dt,.001);phase+=(moving?distance:speed*dt*blend)*3.5;return {swing:Math.sin(phase*1.4)*.6*blend,bob:Math.sin(phase)**2*.02*blend,blend};},reset(){phase=blend=speed=0;}};}
export const smoothHeading=(from,to,dt)=>from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*(-Math.expm1(-Math.max(0,dt)*12));
