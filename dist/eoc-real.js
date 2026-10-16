// 臺北市災害應變中心：臺北真實地圖（ArcGIS）與信義街景漫遊（three.js）共用的定位與載入。
// 定位資料在 assets/eoc-anchor.json：模型原點＝主體西南角，以官方 LOD1 2024 量體擬合；
// heading 為度，負值＝俯視順時針。officialIds 為被精細模型取代、需隱藏的官方量體。
const ANCHOR_URL='assets/eoc-anchor.json?v=2';
let anchorPromise=null;
export function loadEocAnchor(){return anchorPromise??=fetch(ANCHOR_URL).then(r=>{if(!r.ok)throw Error('eoc-anchor '+r.status);return r.json();});}
export const isEocVolume=(anchor,id)=>!!anchor?.officialIds?.includes(id);

// 模型本地座標（公尺，+x 東、+y 北，原點西南角）轉經緯度。
export function eocLocalToLonLat(anchor,x,y){
 const h=anchor.heading*Math.PI/180,east=x*Math.cos(h)-y*Math.sin(h),north=x*Math.sin(h)+y*Math.cos(h);
 return [anchor.lon+east/(111320*Math.cos(anchor.lat*Math.PI/180)),anchor.lat+north/110574];
}

// ---- ArcGIS SceneView：隱藏官方量體、放入精細模型、側欄面板。
export async function addEocToSceneView({view,map,buildings,Graphic,GraphicsLayer,Mesh,Point}){
 const a=await loadEocAnchor();
 buildings.excludeObjectIds.addMany(a.officialIds);
 const layer=new GraphicsLayer({title:a.name+'・精細模型',elevationInfo:{mode:'absolute-height'}});map.add(layer);
 const origin=new Point({longitude:a.lon,latitude:a.lat,z:a.base,spatialReference:{wkid:4326}});
 const mesh=await Mesh.createFromGLTF(origin,a.model+'?v=2',{vertexSpace:'local'});
 // ArcGIS 的 z 軸旋轉以順時針為正，與 anchor.heading（逆時針為正）相反。
 mesh.rotate(0,0,-a.heading);
 layer.add(new Graphic({geometry:mesh,symbol:{type:'mesh-3d',symbolLayers:[{type:'fill'}]},attributes:{name:a.name}}));
 const panel=document.getElementById('eocModel');
 if(panel){
  panel.innerHTML=`<h2>${a.name}</h2><p>精細模型依官方建物量體定位（莊敬路391巷11弄2號）；周邊為官方 LOD1 量體。</p><button id="eocGo">前往災害應變中心</button><label class="street-toggle"><input type="checkbox" id="eocVisible" checked> 顯示精細模型（取消則顯示官方白模）</label><a href="${a.detailPage}" target="_blank" rel="noopener">開啟模型檢視（停機坪、車道、夜間）</a><a href="xinyi-street.html?v=s26&amp;at=eoc">在信義街景漫遊中前往</a><p class="district-note">外觀細部依街景與 Google 地球 3D 目測，尺寸非實測；不可據此量測救援作業空間。</p>`;
  const [lon,lat]=eocLocalToLonLat(a,a.footprint.w/2,a.footprint.d/2);
  document.getElementById('eocGo').onclick=()=>view.goTo({target:[lon,lat],zoom:18.5,tilt:62,heading:25}).catch(()=>{});
  document.getElementById('eocVisible').onchange=e=>{layer.visible=e.target.checked;if(e.target.checked)buildings.excludeObjectIds.addMany(a.officialIds);else buildings.excludeObjectIds.removeMany(a.officialIds);};
 }
 return {anchor:a,layer};
}

// ---- three.js（信義街景漫遊）：在地面高度放入精細模型。
export async function addEocToThree({T,scene,GLTFLoader,ground,project}){
 const a=await loadEocAnchor();
 const gltf=await new GLTFLoader().loadAsync(a.model+'?v=2');
 const root=gltf.scene,[x,z]=project(a.lon,a.lat);
 root.position.set(x,ground.at(x,z),z);root.rotation.y=a.heading*Math.PI/180;
 root.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;}});
 root.name=a.name;scene.add(root);
 return {anchor:a,root};
}
