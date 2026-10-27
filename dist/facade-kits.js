// 逐街精修建物的立面構件（assets/facade-kits.glb，由 blender/build_facade_kits.py 以 building_tools 產生）：
// 每筆精修資料一個構件（窗框、玻璃分割、窗台、窗楣、陽台），沿臨街牆逐格以實例擺放，與立面著色器的窗格對齊。
//   kitPlacements  純資料：每個構件的實例矩陣（網頁與 Blender 匯出共用）
//   createFacadeKits  three.js：載入 GLB、建 InstancedMesh
import {styleOf} from './xinyi-facades.js';

export const KIT_FH=3.6,RES_BAY=3.4;
// 構件貼在牆面外 4 cm（立面網格本身外推 3.5 cm）
const OUT=.04;

// 精修資料 → 構件名稱；與 build_facade_kits.py 的 kit_entries 相同：有 variant 或住宅大樓（style 1）
export const hasKit=s=>!!s&&(s.variant>0||s.style===1);

// 回傳 {名稱: [16 個數字的欄主序矩陣, ...]}。只放臨街牆（沿外法線 45 m 內靠近道路）、每面最多 maxFloors 層。
// skipWall(b,k)：已由臺北街屋精細立面（xinyi-shophouse.js）處理的牆不重複擺放。
export function kitPlacements(buildings,overrides,{project,facesStreet=()=>true,skipWall=null,maxFloors=24,max=60000}={}){
 const out={};let count=0;
 for(const b of buildings){
  const o=overrides[b.id];if(!o)continue;
  const s=styleOf({},b,overrides);if(!hasKit(s))continue;
  const top=Math.max(...b.walls.map(w=>w.h)),fh=Math.max(2.8,Math.min(5,top/Math.max(1,s.levels))),sy=fh/KIT_FH;
  const variant=s.variant||0,bay=variant?s.bay:RES_BAY,podH=variant?s.podium?.h||0:0;
  const list=out[s.name]??=[];
  for(const [k,{a,b:e,w,h,n}] of b.walls.entries()){
   if(w<bay||h<5||skipWall?.(b,k))continue;
   const [ax,az]=project(a[0],a[1]),[bx,bz]=project(e[0],e[1]),L=Math.hypot(bx-ax,bz-az)||1,tx=(bx-ax)/L,tz=(bz-az)/L,nx=n[0],nz=-n[1];
   // 退縮建物（廣場、綠地後）也算臨街：沿外法線 5～45 m 內任一點靠近道路
   if(![5,15,30,45].some(d=>facesStreet((ax+bx)/2+nx*d,(az+bz)/2+nz*d)))continue;
   // 與著色器相同的格線：精修樣式 u 從 0 起、樓層從底層高起算到頂下 1.6 m；住宅一樓與頂層不開窗、左右各留 0.5 m
   let floors,f0,bays;
   if(variant){floors=Math.floor((h-1.6-podH)/fh);f0=0;bays=Math.floor(w/bay);}
   else{const nFl=Math.floor((h-.9)/fh);floors=nFl-1;f0=1;bays=Math.floor(w/bay);}
   for(let f=f0;f<Math.min(floors,f0+maxFloors);f++)for(let i=0;i<bays;i++){
    const u=(i+.5)*bay;
    if(!variant&&(u-bay*.5<.5||u+bay*.5>w-.5))continue;
    if(count>=max)return out;
    const y=a[2]+(e[2]-a[2])*u/w+podH+f*fh;
    // 欄主序：X 軸＝沿牆、Y 軸＝向上（依樓高縮放）、Z 軸＝外法線
    // 著色器的 u 是 0～w 線性對應牆兩端，位置依比例內插
    const t=u/w;list.push([tx,0,tz,0, 0,sy,0,0, nx,0,nz,0, ax+(bx-ax)*t+nx*OUT,y,az+(bz-az)*t+nz*OUT,1]);count++;
   }
  }
 }
 for(const k of Object.keys(out))if(!out[k].length)delete out[k];
 return out;
}

// three.js：載入構件 GLB，依 kitPlacements 建 InstancedMesh（每個構件、每個材質一個）。
// 牆面方向不一定是右手座標（牆的走向與外法線），構件材質雙面繪製。
export async function createFacadeKits(T,GLTFLoader,placements,url='assets/facade-kits.glb?v=13'){
 const gltf=await new GLTFLoader().loadAsync(url),group=new T.Group();group.name='facade kits';
 const byName=new Map();
 gltf.scene.traverse(o=>{if(o.userData?.kit)byName.set(o.userData.kit,o);});
 const m4=new T.Matrix4();let instances=0;
 for(const [name,list] of Object.entries(placements)){
  const node=byName.get(name);if(!node)continue;
  const meshes=[];node.traverse(o=>{if(o.isMesh)meshes.push(o);});
  // 依 160 m 格子分塊，每塊一個 InstancedMesh，讓視錐剔除生效
  const cells=new Map();for(const e of list){const key=Math.floor(e[12]/160)+','+Math.floor(e[14]/160);(cells.get(key)??cells.set(key,[]).get(key)).push(e);}
  for(const src of meshes){
   const mat=src.material.clone();mat.side=T.DoubleSide;
   for(const [key,part] of cells){
    const im=new T.InstancedMesh(src.geometry,mat,part.length);
    part.forEach((e,i)=>{m4.fromArray(e);im.setMatrixAt(i,m4);});
    im.instanceMatrix.needsUpdate=true;im.computeBoundingSphere();
    im.castShadow=false;im.receiveShadow=true;im.name='kit '+name+' '+key;group.add(im);}
  }
  instances+=list.length;
 }
 group.userData.instances=instances;
 return group;
}
