// 精細地標模型（臺北市災害應變中心、臺北市政府消防局）：臺北真實地圖（ArcGIS）與
// 信義街景漫遊（three.js）共用的定位與載入。清單在 assets/landmarks.json，每個地標一個 anchor：
//   lon/lat  模型原點的經緯度；heading 度，負值＝俯視順時針；base 原點高程（EGM96, m）
//   officialIds  被精細模型取代、需隱藏的官方 LOD1 量體
//   footprint {x0,y0,x1,y1,h}、entry {x,y,facing}  模型本地公尺（+x 東、+y 北）
//   collider  街景漫遊是否另加占地碰撞（官方量體缺牆面時需要）
const LIST_URL='assets/landmarks.json?v=1',VERSION='v=4';
let listPromise=null;
export function loadLandmarks(){
 return listPromise??=fetch(LIST_URL).then(r=>{if(!r.ok)throw Error('landmarks '+r.status);return r.json();})
  .then(urls=>Promise.all(urls.map(u=>fetch(u+'?'+VERSION).then(r=>{if(!r.ok)throw Error(u+' '+r.status);return r.json();}))));
}
// 官方量體是否已被某個精細模型取代（含街景漫遊加入的占地碰撞量體）。
export function isLandmarkVolume(landmarks,id){
 if(typeof id==='string'&&id.startsWith('landmark-'))return true;
 return !!landmarks?.some(a=>a.officialIds?.includes(id));
}
// 模型本地座標轉經緯度。
export function localToLonLat(a,x,y){
 const h=a.heading*Math.PI/180,east=x*Math.cos(h)-y*Math.sin(h),north=x*Math.sin(h)+y*Math.cos(h);
 return [a.lon+east/(111320*Math.cos(a.lat*Math.PI/180)),a.lat+north/110574];
}
// 占地四面牆（與 district-*.json 的 walls 同格式），供街景漫遊的碰撞與地面高程使用；不渲染。
export function footprintBuilding(a){
 const f=a.footprint,c=[[f.x0,f.y0],[f.x1,f.y0],[f.x1,f.y1],[f.x0,f.y1]].map(([x,y])=>localToLonLat(a,x,y));
 const walls=c.map((p,i)=>{const q=c[(i+1)%4],w=Math.hypot((q[0]-p[0])*111320*Math.cos(a.lat*Math.PI/180),(q[1]-p[1])*110574);
  const h=a.heading*Math.PI/180,n=[[0,-1],[1,0],[0,1],[-1,0]][i],nx=n[0]*Math.cos(h)-n[1]*Math.sin(h),ny=n[0]*Math.sin(h)+n[1]*Math.cos(h);
  return {a:[p[0],p[1],a.base],b:[q[0],q[1],a.base],w,h:f.h,n:[nx,ny]};});
 return {id:'landmark-'+a.key,walls,roofs:[]};
}

// ---- ArcGIS SceneView：隱藏官方量體、放入精細模型、側欄面板。
export async function addLandmarksToSceneView({view,map,buildings,Graphic,GraphicsLayer,Mesh,Point}){
 const list=await loadLandmarks();
 const panel=document.getElementById('landmarks');if(panel)panel.innerHTML='<h2>精細地標模型</h2><p class="district-note">依官方建物量體定位；周邊為官方 LOD1 量體。外觀細部依街景與 Google 地球 3D 目測，尺寸非實測，不可據此量測救援作業空間。</p>';
 const out=[];
 for(const a of list){
  buildings.excludeObjectIds.addMany(a.officialIds);
  const layer=new GraphicsLayer({title:a.name+'・精細模型',elevationInfo:{mode:'absolute-height'}});map.add(layer);
  const origin=new Point({longitude:a.lon,latitude:a.lat,z:a.base,spatialReference:{wkid:4326}});
  try{
   const mesh=await Mesh.createFromGLTF(origin,a.model+'?'+VERSION,{vertexSpace:'local'});
   mesh.rotate(0,0,-a.heading);   // ArcGIS z 軸旋轉以順時針為正，與 heading 相反
   layer.add(new Graphic({geometry:mesh,symbol:{type:'mesh-3d',symbolLayers:[{type:'fill'}]},attributes:{name:a.name}}));
  }catch(error){console.error(error);buildings.excludeObjectIds.removeMany(a.officialIds);continue;}
  out.push({anchor:a,layer});
  if(!panel)continue;
  const f=a.footprint,[lon,lat]=localToLonLat(a,(f.x0+f.x1)/2,(f.y0+f.y1)/2),box=document.createElement('div');box.className='landmark';
  box.innerHTML=`<h3>${a.name}</h3><button data-go>前往${a.name}</button><label class="street-toggle"><input type="checkbox" checked data-show> 顯示精細模型（取消則顯示官方白模）</label>${a.detailPage?`<a href="${a.detailPage}" target="_blank" rel="noopener">開啟模型檢視</a>`:''}<a href="xinyi-street.html?v=s27&amp;at=${a.key}">在信義街景漫遊中前往</a>`;
  box.querySelector('[data-go]').id=a.key+'Go';
  box.querySelector('[data-go]').onclick=()=>view.goTo({target:[lon,lat],zoom:18.5,tilt:62,heading:25}).catch(()=>{});
  box.querySelector('[data-show]').onchange=e=>{layer.visible=e.target.checked;if(e.target.checked)buildings.excludeObjectIds.addMany(a.officialIds);else buildings.excludeObjectIds.removeMany(a.officialIds);};
  panel.append(box);
 }
 return out;
}

// ---- three.js（信義街景漫遊）：在地面高度放入精細模型。
export async function addLandmarksToThree({T,scene,GLTFLoader,ground,project}){
 const list=await loadLandmarks(),loader=new GLTFLoader();
 return Promise.all(list.map(async a=>{
  const gltf=await loader.loadAsync(a.model+'?'+VERSION),root=gltf.scene,[x,z]=project(a.lon,a.lat);
  root.position.set(x,a.base,z);root.rotation.y=a.heading*Math.PI/180;
  // 模型 z=0 對應 anchor.base；若地面格網在此處差異大，改貼地面。
  const g=ground.at(x,z);if(Math.abs(g-a.base)>1.5)root.position.y=g;
  root.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
  root.name=a.name;scene.add(root);return {anchor:a,root};
 }));
}
