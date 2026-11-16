import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {MeshoptDecoder} from './vendor/jsm/libs/meshopt_decoder.module.js';
// 排煙車「劍潭76」（Blender 自製，依臺北市消防局 76 車與 Fire Wolf 型霧化排煙車照片；車頭朝 -X、公尺、輪胎底在 0）。
// 網頁版 smoke-truck.glb 以 gltfpack 量化並 meshopt 壓縮（約 0.9 MB，原檔 7.9 MB）；同一 rig 節點下的零件已合併，
// 繪製呼叫約 24 個網格。解碼器 meshopt_decoder.module.js（約 29 KB，內含 wasm）只在載入排煙車時下載。
export const SMOKE_GLB='./assets/smoke-truck.glb?v=smoke-20261116';
export async function loadSmokeTruck(url=new URL(SMOKE_GLB,import.meta.url).href){
 return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url)).scene;
}

// 排煙機 rig（Blender 原檔軸向換成 glTF：Blender +Y → glTF -Z，Blender +Z → glTF +Y）。
//   Fan slew        旋轉（glTF Y）
//   Fan boom lift   起臂（Blender 繞 +Y 正轉 = glTF 繞 Z 負轉），0..65°
//   Fan boom extend 伸臂（區域 -X 平移），0..0.55 m
//   Fan tilt        排煙機保持出風口下俯約 20°（Blender -45° = glTF 繞 Z +45°）
//   Fan rotor       葉輪（glTF X）
// 舉升油壓缸兩節（Lift ram barrel / rod）互相對準兩端銷（Lift ram anchor / eye），起臂時伸縮。
export const FAN={lift:65*Math.PI/180,ext:.55,tilt:-45*Math.PI/180,slewMax:170*Math.PI/180,rpm:400}; // rpm 為畫面示意轉速（實機更快，逐幀取樣會閃爍）;
const X=new T.Vector3(1,0,0),Y=new T.Vector3(0,1,0),Z=new T.Vector3(0,0,1),_a=new T.Vector3(),_b=new T.Vector3(),_q=new T.Quaternion();
const smooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
export function rigSmokeFan(model){
 const by={};model.traverse(o=>{const n=o.name.replace(/_/g,' ');if(/^(Fan (slew|boom lift|boom extend|tilt|rotor)|Lift ram (anchor|eye|barrel|rod))$/.test(n))by[n]=o;});
 const need=['Fan slew','Fan boom lift','Fan boom extend','Fan tilt','Fan rotor'];if(need.some(n=>!by[n]))return null;
 const rest=Object.fromEntries(Object.entries(by).map(([n,o])=>[n,{p:o.position.clone(),q:o.quaternion.clone()}]));
 const turn=(o,axis,a)=>o.quaternion.copy(rest[o.name.replace(/_/g,' ')].q).multiply(_q.setFromAxisAngle(axis,a));
 // 油壓缸一節（位於 parent 座標）：區域 +Y 對準另一端銷的位置。
 function aim(part,target){if(!part||!target)return;part.parent.updateWorldMatrix(true,false);target.updateWorldMatrix(true,false);
  _b.setFromMatrixPosition(target.matrixWorld);part.parent.worldToLocal(_b);_a.copy(_b).sub(part.position).normalize();if(_a.lengthSq()>0)part.quaternion.setFromUnitVectors(Y,_a);}
 const rig={deploy:0,slew:0,spin:0,
  // u：0 收納 → 1 展開。前 60% 起臂（同時調平排煙機）、60–80% 伸臂、80–100% 旋轉到 slewTarget。
  set(u,slewTarget=0){u=Math.max(0,Math.min(1,u));rig.deploy=u;const lift=smooth(u/.6),ext=smooth((u-.6)/.2),sl=smooth((u-.8)/.2);
   rig.slew=slewTarget*sl;
   turn(by['Fan slew'],Y,rig.slew);turn(by['Fan boom lift'],Z,-FAN.lift*lift);turn(by['Fan tilt'],Z,-FAN.tilt*lift);
   const e=by['Fan boom extend'];e.position.copy(rest['Fan boom extend'].p).add(_a.set(-FAN.ext*ext,0,0).applyQuaternion(rest['Fan boom extend'].q));
   aim(by['Lift ram barrel'],by['Lift ram eye']);aim(by['Lift ram rod'],by['Lift ram anchor']);},
  // 葉輪轉速 0..1（1 = FAN.rpm，畫面上會模糊成圓盤）
  spinUp(dt,level){rig.spin+=dt*level*FAN.rpm/60*Math.PI*2;turn(by['Fan rotor'],X,rig.spin%(Math.PI*2));}};
 rig.set(0);return rig;
}

// 演練首頁停放：同水庫車慣例，先把 -X 車頭轉到場景 -Z，再由停車朝向轉向；排煙機收納。
export function createImportedSmokeTruck(scene,template,x,z){
 const root=new T.Group(),visual=template.clone(true),lights=[];
 root.name='排煙車・劍潭76';scene.add(root);
 visual.rotation.y=-Math.PI/2;root.add(visual);visual.updateWorldMatrix(true,true);
 const bounds=new T.Box3().setFromObject(visual),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
 visual.position.set(-center.x,-bounds.min.y+.015,-center.z);
 root.position.set(x,-.15,z);
 visual.updateWorldMatrix(true,true);
 visual.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
  if(o.material?.name==='Red beacon lens'){o.material=o.material.clone();o.material.color.set('#bf1016');o.material.emissive.set('#ff1208');o.material.emissiveIntensity=.1;o.material.toneMapped=false;
   const local=root.worldToLocal(new T.Box3().setFromObject(o).getCenter(new T.Vector3()));o.userData.flashPhase=local.x>0?0:Math.PI;lights.push(o);}});
 const collider=new T.Mesh(new T.BoxGeometry(2.45,3.1,7.4),new T.MeshBasicMaterial());
 collider.name='排煙車碰撞範圍';collider.position.y=1.55;collider.visible=false;root.add(collider);
 root.userData.model='smoke-truck';
 return {root,visual,lights,size,fan:rigSmokeFan(visual)};
}
