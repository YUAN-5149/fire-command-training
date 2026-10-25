import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
// 臺北市消防局 Outlander 勤務車（Blender 自製模型，依實車照片；車頭朝 -X、公尺、輪胎底在 0）。
export async function loadSurveyCar(){
 return (await new GLTFLoader().loadAsync(new URL('./assets/survey-car.glb?v=survey-20261025',import.meta.url).href)).scene;
}
// 同水庫車：先把 -X 車頭轉到場景 -Z，再由停車朝向轉向。
export function createImportedSurveyCar(scene,template,x,z){
 const root=new T.Group(),visual=template.clone(true),lights=[];
 root.name='消防局勤務車';scene.add(root);
 visual.rotation.y=-Math.PI/2;root.add(visual);visual.updateWorldMatrix(true,true);
 const bounds=new T.Box3().setFromObject(visual),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
 visual.position.set(-center.x,-bounds.min.y+.015,-center.z);
 // 路面 -0.065（同其他匯入車輛）。
 root.position.set(x,-.15,z);
 visual.updateWorldMatrix(true,true);
 visual.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
  // 車頂警示燈與格柵紅燈：每片燈罩左右交替閃爍。
  if(o.material?.name==='Red beacon lens'){o.material=o.material.clone();o.material.color.set('#bf1016');o.material.emissive.set('#ff1208');o.material.emissiveIntensity=.1;o.material.toneMapped=false;
   const local=root.worldToLocal(new T.Box3().setFromObject(o).getCenter(new T.Vector3()));o.userData.flashPhase=local.x>0?0:Math.PI;lights.push(o);}});
 // 車身碰撞盒（不含後視鏡與車頂警示燈）。
 const collider=new T.Mesh(new T.BoxGeometry(1.85,1.75,4.7),new T.MeshBasicMaterial());
 collider.name='勤務車碰撞範圍';collider.position.y=.875;collider.visible=false;root.add(collider);
 root.userData.model='survey-car';
 return {root,visual,lights,size};
}
