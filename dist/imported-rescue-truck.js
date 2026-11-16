import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {MeshoptDecoder} from './vendor/jsm/libs/meshopt_decoder.module.js';
// 救助器材車「信義71」（Blender 自製，依臺北市消防局官網 9E-621 照片：單排駕駛室、後置曲臂式吊臂、照明燈塔；
// 車頭朝 -X、公尺、輪胎底在 0）。網頁版 rescue-truck.glb 以 gltfpack 量化並 meshopt 壓縮（約 0.85 MB，原檔 8.2 MB）；
// 同一 rig 節點下的零件已合併（約 650 → 30 個網格）。解碼器與排煙車共用，只在載入時下載。
export const RESCUE_GLB='./assets/rescue-truck.glb?v=rescue-20261116';
export async function loadRescueTruck(url=new URL(RESCUE_GLB,import.meta.url).href){
 return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url)).scene;
}

// rig（Blender 原檔軸向換成 glTF：Blender +Y → glTF -Z，Blender +Z → glTF +Y，X 不變）。
//   Stabiliser extend L/R   支撐腳橫樑外伸（L 往 glTF +Z、R 往 -Z），0..0.30 m
//   Stabiliser leg L/R      滑柱下放（glTF -Y），0..0.28 m（腳墊著地）
//   Light mast stage 2/3    燈塔兩節上升（glTF +Y），各 0..1.30 m；Light head pan / tilt 燈頭轉向
//   Crane slew              吊臂迴轉（glTF Y，0 = 收車時內臂朝駕駛側，+90° 朝車尾，180° 朝乘客側）
//   Crane inner boom        內臂（glTF X，負值抬起關節），0..-35°
//   Crane outer boom        外臂（glTF X，正值從上方翻開），0..140°
//   Crane extension         伸縮臂（區域 +Y，沿外臂），0..0.90 m
//   Crane hook hang         吊鉤懸掛點：每次重設為與車身同向，吊鉤永遠垂直
//   Crane hook lower / Hook rope   放索（區域 -Y）與鋼索伸長（區域 Y 縮放）
// 三組油壓缸（Lift / Knuckle / Extension ram barrel／rod）每次重新對準另一端銷（glTF 沒有 Damped Track），
// 捲揚機鋼索 Hoist wire（區域 -Z）對準 Hoist wire end 並伸長。
export const CRANE={beamOut:.30,legDown:.28,mast:1.30,inner:-35*Math.PI/180,outer:140*Math.PI/180,ext:.90,payout:2.0,ropeRest:.14,
 headPan:Math.PI,headTilt:25*Math.PI/180};
const X=new T.Vector3(1,0,0),Y=new T.Vector3(0,1,0),Z=new T.Vector3(0,0,1),NZ=new T.Vector3(0,0,-1),
 _a=new T.Vector3(),_b=new T.Vector3(),_q=new T.Quaternion(),_q2=new T.Quaternion();
const smooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
const PARTS=/^(Vehicle|Stabiliser (extend|leg) [LR]|Light mast stage [23]|Light head (pan|tilt)|Crane (slew|inner boom|outer boom|extension|hook hang|hook lower)|(Lift|Knuckle|Extension) ram (anchor|eye|barrel|rod)|Hook rope|Hoist wire( end)?)$/;
export function rigRescueCrane(model){
 const by={};model.traverse(o=>{const n=o.name.replace(/_/g,' ');if(PARTS.test(n)&&!by[n])by[n]=o;});
 const need=['Vehicle','Stabiliser extend L','Stabiliser leg L','Stabiliser extend R','Stabiliser leg R','Light mast stage 2','Light mast stage 3',
  'Crane slew','Crane inner boom','Crane outer boom','Crane extension','Crane hook hang','Crane hook lower','Hook rope'];
 if(need.some(n=>!by[n]))return null;
 const rest=Object.fromEntries(Object.entries(by).map(([n,o])=>[n,{p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()}]));
 const turn=(n,axis,a)=>by[n]?.quaternion.copy(rest[n].q).multiply(_q.setFromAxisAngle(axis,a));
 const move=(n,x,y,z)=>by[n]?.position.copy(rest[n].p).add(_a.set(x,y,z));
 const slide=(n,x,y,z)=>by[n]?.position.copy(rest[n].p).add(_a.set(x,y,z).applyQuaternion(rest[n].q));
 // 一節零件（位於 parent 座標）：區域 axis 對準另一個節點的位置，回傳兩點距離。
 function aim(part,target,axis){if(!part||!target)return 0;part.parent.updateWorldMatrix(true,false);target.updateWorldMatrix(true,false);
  _b.setFromMatrixPosition(target.matrixWorld);part.parent.worldToLocal(_b);_a.copy(_b).sub(part.position);const d=_a.length();
  if(d>0)part.quaternion.setFromUnitVectors(axis,_a.normalize());return d;}
 const wireRest=(()=>{const w=by['Hoist wire'],e=by['Hoist wire end'];if(!w||!e)return 0;model.updateWorldMatrix(true,true);
  return new T.Vector3().setFromMatrixPosition(w.matrixWorld).distanceTo(new T.Vector3().setFromMatrixPosition(e.matrixWorld));})();
 const rig={u:0,slew:0,payout:0,
  // u：0 收車 → 1 作業。0–15% 橫樑外伸、15–28% 滑柱著地、28–42% 燈塔升起並轉向車尾、42–54% 內臂抬起、
  // 54–72% 外臂翻開、72–84% 迴轉到 slewTarget、84–92% 伸縮臂伸出、92–100% 放索。
  set(u,slewTarget=Math.PI/2){u=Math.max(0,Math.min(1,u));rig.u=u;const k=(a,b)=>smooth((u-a)/(b-a));
   const beam=k(0,.15)*CRANE.beamOut,leg=k(.15,.28)*CRANE.legDown;
   move('Stabiliser extend L',0,0,beam);move('Stabiliser extend R',0,0,-beam);
   move('Stabiliser leg L',0,-leg,0);move('Stabiliser leg R',0,-leg,0);
   move('Light mast stage 2',0,k(.28,.37)*CRANE.mast,0);move('Light mast stage 3',0,k(.31,.40)*CRANE.mast,0);
   turn('Light head pan',Y,k(.36,.42)*CRANE.headPan);turn('Light head tilt',Z,k(.38,.42)*CRANE.headTilt);
   turn('Crane inner boom',X,k(.42,.54)*CRANE.inner);turn('Crane outer boom',X,k(.54,.72)*CRANE.outer);
   rig.slew=slewTarget*k(.72,.84);turn('Crane slew',Y,rig.slew);
   slide('Crane extension',0,k(.84,.92)*CRANE.ext,0);rig.payout=k(.92,1)*CRANE.payout;rig.update();},
  // 每次姿勢改變後：油壓缸對準、吊鉤垂直、鋼索拉直。
  update(){model.updateWorldMatrix(true,true);
   for(const r of ['Lift','Knuckle','Extension']){aim(by[r+' ram barrel'],by[r+' ram eye'],Y);aim(by[r+' ram rod'],by[r+' ram anchor'],Y);}
   const hang=by['Crane hook hang'];hang.parent.updateWorldMatrix(true,false);hang.parent.getWorldQuaternion(_q2).invert();
   hang.quaternion.copy(_q2.multiply(by['Vehicle'].getWorldQuaternion(_q)));
   by['Crane hook lower'].position.copy(rest['Crane hook lower'].p).add(_a.set(0,-rig.payout,0));
   const rope=by['Hook rope'];rope.scale.copy(rest['Hook rope'].s);rope.scale.y*=(CRANE.ropeRest+rig.payout)/CRANE.ropeRest;
   const w=by['Hoist wire'];if(w&&wireRest>0){const d=aim(w,by['Hoist wire end'],NZ);w.scale.copy(rest['Hoist wire'].s);w.scale.z*=d/wireRest;}
   model.updateWorldMatrix(true,true);}};
 rig.update();return rig;
}

// 演練首頁停放：同水庫車慣例，先把 -X 車頭轉到場景 -Z，再由停車朝向轉向；吊臂、支撐腳、燈塔收車。
export function createImportedRescueTruck(scene,template,x,z){
 const root=new T.Group(),visual=template.clone(true),lights=[];
 root.name='救助器材車・信義71';scene.add(root);
 visual.rotation.y=-Math.PI/2;root.add(visual);visual.updateWorldMatrix(true,true);
 const bounds=new T.Box3().setFromObject(visual),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
 visual.position.set(-center.x,-bounds.min.y+.015,-center.z);
 root.position.set(x,-.15,z);
 visual.updateWorldMatrix(true,true);
 visual.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
  if(o.material?.name==='Red beacon lens'){o.material=o.material.clone();o.material.color.set('#bf1016');o.material.emissive.set('#ff1208');o.material.emissiveIntensity=.1;o.material.toneMapped=false;
   o.userData.flashPhase=/beacon R/.test(o.name.replace(/_/g,' '))?Math.PI:0;lights.push(o);}});
 const collider=new T.Mesh(new T.BoxGeometry(2.5,3.4,7.7),new T.MeshBasicMaterial());
 collider.name='救助器材車碰撞範圍';collider.position.y=1.7;collider.visible=false;root.add(collider);
 root.userData.model='rescue-truck';
 return {root,visual,lights,size,crane:rigRescueCrane(visual)};
}
