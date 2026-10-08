import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
export async function loadFireEngine(){
 return (await new GLTFLoader().loadAsync(new URL('./assets/fire-engine.glb',import.meta.url).href)).scene;
}
// The supplied model faces -X. Scene vehicles face -Z before their staging rotation.
export function createImportedEngine(scene,template,x,z){
 const root=new T.Group(),visual=template.clone(true),lights=[];
 root.name='水箱消防車・自製模型';scene.add(root);
 visual.rotation.y=-Math.PI/2;root.add(visual);visual.updateWorldMatrix(true,true);
 const bounds=new T.Box3().setFromObject(visual),center=bounds.getCenter(new T.Vector3());
 visual.position.set(-center.x,-bounds.min.y+.015,-center.z);
 root.position.set(x,-.15,z);
 const lamps=[];
 visual.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;if(['Red beacon lens','Tail lamp lens'].includes(o.material.name))lamps.push(o);});
 // Separate each lens material into left/right triangles without altering the supplied body.
 for(const lamp of lamps){
  const g=lamp.geometry,pos=g.attributes.position,indices=g.index;
  const sides=[[],[]];for(let i=0;i<(indices?indices.count:pos.count);i+=3){const tri=[0,1,2].map(n=>indices?indices.getX(i+n):i+n);const side=tri.reduce((s,n)=>s+pos.getZ(n),0)>0?0:1;sides[side].push(...tri);}
  for(let side=0;side<2;side++){if(!sides[side].length)continue;const geo=g.clone();geo.setIndex(sides[side]);geo.clearGroups();const mesh=new T.Mesh(geo,lamp.material.clone());mesh.position.copy(lamp.position);mesh.quaternion.copy(lamp.quaternion);mesh.scale.copy(lamp.scale);mesh.material.emissive.set('#ff1208');mesh.material.emissiveIntensity=.15;mesh.userData.flashPhase=side*Math.PI;lamp.parent.add(mesh);lights.push(mesh);}
  lamp.visible=false;
 }
 // A body-sized collider excludes mirrors and the merged decorative meshes.
 const collider=new T.Mesh(new T.BoxGeometry(2.4,3.25,7.44),new T.MeshBasicMaterial());
 collider.name='水箱消防車碰撞範圍';collider.position.y=1.64;collider.visible=false;root.add(collider);
 return {root,visual,lights};
}
