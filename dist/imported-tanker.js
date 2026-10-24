import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
// 12 噸水庫車「信義61」（Blender 自製模型，車頭朝 -X、公尺、輪胎底在 0）。
export async function loadWaterTanker(){
 return (await new GLTFLoader().loadAsync(new URL('./assets/water-tanker.glb?v=tanker-20261024',import.meta.url).href)).scene;
}
// Same convention as the engine: rotate the -X nose to scene -Z, then the staging heading turns it.
export function createImportedTanker(scene,template,x,z){
 const root=new T.Group(),visual=template.clone(true),lights=[];
 root.name='水庫車・信義61';scene.add(root);
 visual.rotation.y=-Math.PI/2;root.add(visual);visual.updateWorldMatrix(true,true);
 const bounds=new T.Box3().setFromObject(visual),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
 visual.position.set(-center.x,-bounds.min.y+.015,-center.z);
 // Road box: centre -0.1, height 0.07 => surface -0.065 (as the other imported vehicles).
 root.position.set(x,-.15,z);
 visual.updateWorldMatrix(true,true);
 visual.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
  // Each red lens (roof bar segments, grille flashers, rear beacons) is its own mesh: flash left/right alternately.
  if(o.material?.name==='Red beacon lens'){o.material=o.material.clone();o.material.color.set('#bf1016');o.material.emissive.set('#ff1208');o.material.emissiveIntensity=.1;o.material.toneMapped=false;
   const local=root.worldToLocal(new T.Box3().setFromObject(o).getCenter(new T.Vector3()));o.userData.flashPhase=local.x>0?0:Math.PI;lights.push(o);}});
 // Body-sized collider; mirrors and the roof rail are left out as on the engine.
 const collider=new T.Mesh(new T.BoxGeometry(2.5,3.1,9.45),new T.MeshBasicMaterial());
 collider.name='水庫車碰撞範圍';collider.position.y=1.55;collider.visible=false;root.add(collider);
 root.userData.model='water-tanker';
 return {root,visual,lights,size};
}
