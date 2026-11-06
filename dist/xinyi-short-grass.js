import * as T from 'three';
import {GrassLayer} from './vendor/three-stylized/GrassLayer.js';
import {createRoadGuard} from './xinyi-youbike-placement.js?v=road-audit-20261027';
export const SHORT_GRASS={minHeight:.06,maxHeight:.12,maxBlades:12000,center:[36,-83.2],radius:6.4,status:'existing-model-lawn-field-layout-unverified'};
export function lawnMask(local){const [cx,cz]=SHORT_GRASS.center;if(Math.hypot(local.x-cx,local.z-cz)>SHORT_GRASS.radius)return false;if(local.x<36.5&&Math.abs(local.z-cz)<1.4)return false;return true;}
export function createShortGrass({scene,root,features=[],laneData=null,quality='medium',sun=null}){root.updateMatrixWorld(true);let source=null;root.traverse(o=>{if(o.isMesh&&o.material?.name==='Sports field'&&/^EOC_north_park_paths/.test(o.parent?.name??''))source=o;});if(!source)return null;
 const p=source.geometry.attributes.position,ix=source.geometry.index,points=[],a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),normal=new T.Vector3();for(let i=0;i<(ix?.count??p.count);i+=3){a.fromBufferAttribute(p,ix?ix.getX(i):i).applyMatrix4(source.matrixWorld);b.fromBufferAttribute(p,ix?ix.getX(i+1):i+1).applyMatrix4(source.matrixWorld);c.fromBufferAttribute(p,ix?ix.getX(i+2):i+2).applyMatrix4(source.matrixWorld);normal.crossVectors(b.clone().sub(a),c.clone().sub(a)).normalize();if(normal.y<.9)continue;for(const v of [a,b,c])points.push(v.x,v.y+.002,v.z);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));geometry.computeVertexNormals();const surface=new T.Mesh(geometry,new T.MeshBasicMaterial());surface.name='EOC lawn top sampling surface (not walk collider)';const inverse=root.matrixWorld.clone().invert(),guard=createRoadGuard(features,laneData),local=new T.Vector3();const coverage={sample:({position})=>{local.copy(position).applyMatrix4(inverse);if(!lawnMask(local))return 0;const x=position.x,z=position.z;return guard.overlap([[x-.15,z-.15],[x+.15,z-.15],[x+.15,z+.15],[x-.15,z+.15]])?0:1;}};
 const density={low:25,medium:55,high:80},ranges={low:35,medium:55,high:75};let current=quality in density?quality:'medium',visible=true,lastLight=-Infinity;const layer=new GrassLayer({surface,seed:20261027,density:density[current],coverage,blade:{minWidth:.012,maxWidth:.024,minHeight:.06,maxHeight:.12,segments:2,lean:.02},wind:{strength:.008,lean:.003,speed:.8,turbulence:.12},colors:{bottom:'#38592f',top:'#739450',backlight:'#8aa56a'},brightness:.65,shadow:false,lighting:{backlightStrength:.3}});layer.name='EOC short grass — 6–12cm illustrative';layer.blades.material.vertexShader='#undef USE_SHADOWMAP\n'+layer.blades.material.vertexShader;layer.blades.material.fragmentShader='#undef USE_SHADOWMAP\n'+layer.blades.material.fragmentShader;layer.blades.material.lights=false;scene.add(layer);if(layer.bladeCount>SHORT_GRASS.maxBlades){layer.dispose();geometry.dispose();surface.material.dispose();throw Error('Short grass blade budget exceeded');}const center=new T.Vector3(36,.22,-83.2).applyMatrix4(root.matrixWorld);const shaderMaterial=layer.blades.material;let fallbackMaterial=null,reviewCache=null;const stats={blades:layer.bladeCount,visible:false,quality:current,minHeight:.06,maxHeight:.12,renderMode:'wind-shader'};
 function setQuality(value){if(!(value in density)||value===current)return;current=value;layer.setOptions({density:density[current]});stats.blades=layer.bladeCount;stats.quality=current;if(fallbackMaterial)layer.blades.material=fallbackMaterial;}
 function setVisible(value){visible=!!value;layer.visible=false;stats.visible=false;}
 function update(time,eye){layer.visible=visible&&Math.hypot(eye.x-center.x,eye.z-center.z)<ranges[current];stats.visible=layer.visible;if(!layer.visible)return;layer.update(time);if(sun&&time-lastLight>1){layer.syncDirectionalLight(sun);lastLight=time;}}
 function reviewPose(){if(reviewCache)return reviewCache;const target=new T.Vector3(39,.22,-84).applyMatrix4(root.matrixWorld),eye=new T.Vector3(42,.22,-80.8).applyMatrix4(root.matrixWorld);const ray=new T.Raycaster();for(const p of [target,eye]){ray.set(new T.Vector3(p.x,10000,p.z),new T.Vector3(0,-1,0));const hit=ray.intersectObject(surface,false)[0];p.y=hit?.point.y??new T.Box3().setFromObject(surface).getCenter(new T.Vector3()).y;}target.y+=.04;eye.y+=.85;return reviewCache={eye,target};}
 function useFallback(){if(!fallbackMaterial)fallbackMaterial=new T.MeshStandardMaterial({color:'#739450',roughness:.95,side:T.DoubleSide});layer.blades.material=fallbackMaterial;stats.renderMode='static-fallback';return true;}
 function dispose(){if(fallbackMaterial)shaderMaterial.dispose();scene.remove(layer);layer.dispose();geometry.dispose();surface.material.dispose();}
 return {layer,surface,source,center,stats,coverage,update,setQuality,setVisible,reviewPose,useFallback,dispose};}

export function installGrassShaderFallback(renderer,getGrass,onFallback=()=>{}){const previous=renderer.debug.onShaderError;const handler=(gl,program,vertexShader,fragmentShader)=>{if((gl.getShaderSource(vertexShader)??'').includes('deformGrassBlade')&&getGrass()){getGrass().useFallback();onFallback();console.warn('草葉動態材質無法編譯，已切換靜態短草。');return;}if(previous)previous(gl,program,vertexShader,fragmentShader);else console.error('場景材質編譯失敗',gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertexShader),gl.getShaderInfoLog(fragmentShader));};renderer.debug.onShaderError=handler;return ()=>{if(renderer.debug.onShaderError===handler)renderer.debug.onShaderError=previous;};}

// 逐街精修所見草坪（street-lawns-xinyi.json，scripts/build-lawns.mjs）：照片確認為草坪的 OSM 綠地，長與 EOC 相同的 6–12 cm 短草。
// 草葉貼在既有綠地面（地面高＋0.06 m）上，只作視覺覆蓋，不改步行面或碰撞；道路範圍內不長草。
// 大草坪切成 LAWN.tile 公尺見方的小塊，每塊一個 GrassLayer；玩家接近（距離依畫質）才建立並顯示，由近而遠直到可見草葉預算，
// 遠離後釋放，所以草坪再大也維持同樣密度與同樣的顯示上限。
export const LAWN={minHeight:.06,maxHeight:.12,tile:12,budget:{low:40000,medium:100000,high:160000},lift:.06};
// 把三角形（[x,z]×3）裁進矩形格，回傳裁出的多邊形（Sutherland–Hodgman）
function clipRect(poly,x0,z0,x1,z1){
 const edges=[[p=>p[0]>=x0,(a,b)=>{const t=(x0-a[0])/(b[0]-a[0]);return [x0,a[1]+(b[1]-a[1])*t];}],[p=>p[0]<=x1,(a,b)=>{const t=(x1-a[0])/(b[0]-a[0]);return [x1,a[1]+(b[1]-a[1])*t];}],
  [p=>p[1]>=z0,(a,b)=>{const t=(z0-a[1])/(b[1]-a[1]);return [a[0]+(b[0]-a[0])*t,z0];}],[p=>p[1]<=z1,(a,b)=>{const t=(z1-a[1])/(b[1]-a[1]);return [a[0]+(b[0]-a[0])*t,z1];}]];
 for(const [inside,cut] of edges){if(!poly.length)break;const out=[];for(let i=0;i<poly.length;i++){const a=poly[(i+poly.length-1)%poly.length],b=poly[i];
  if(inside(b)){if(!inside(a))out.push(cut(a,b));out.push(b);}else if(inside(a))out.push(cut(a,b));}poly=out;}
 return poly;
}
export function lawnTiles(polygon,size=LAWN.tile){
 const pts=[];for(let k=0;k<polygon.length;k+=2)pts.push(new T.Vector2(polygon[k],polygon[k+1]));
 const tiles=new Map();
 for(const t of T.ShapeUtils.triangulateShape(pts,[])){
  const tri=t.map(k=>[pts[k].x,pts[k].y]),xs=tri.map(p=>p[0]),zs=tri.map(p=>p[1]);
  for(let i=Math.floor(Math.min(...xs)/size);i<=Math.floor(Math.max(...xs)/size);i++)for(let j=Math.floor(Math.min(...zs)/size);j<=Math.floor(Math.max(...zs)/size);j++){
   const poly=clipRect(tri,i*size,j*size,(i+1)*size,(j+1)*size);if(poly.length<3)continue;
   const key=i+','+j;if(!tiles.has(key))tiles.set(key,{i,j,tris:[],area:0});const tile=tiles.get(key);
   for(let k=1;k<poly.length-1;k++){const a=poly[0],b=poly[k],c=poly[k+1],ar=Math.abs((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))/2;if(ar<1e-4)continue;tile.tris.push(a,b,c);tile.area+=ar;}}
 }
 return [...tiles.values()].filter(t=>t.area>.05).map(t=>({...t,cx:(t.i+.5)*size,cz:(t.j+.5)*size,r:size*Math.SQRT1_2}));
}
export function createLawnGrass({scene,lawns=[],groundAt,features=[],laneData=null,quality='medium',sun=null}){
 if(!lawns.length)return null;
 const density={low:25,medium:55,high:80},ranges={low:30,medium:45,high:60},guard=createRoadGuard(features,laneData);
 let current=quality in density?quality:'medium',visible=true,lastLight=-Infinity;const items=[];
 const coverage={sample:({position:{x,z}})=>guard.overlap([[x-.15,z-.15],[x+.15,z-.15],[x+.15,z+.15],[x-.15,z+.15]])?0:1};
 for(const [i,l] of lawns.entries())for(const tile of lawnTiles(l.polygon))items.push({lawn:l,seed:20261104+i*1000+items.length,...tile,layer:null,geometry:null,surface:null});
 function build(it){
  const pos=[];for(const [x,z] of it.tris)pos.push(x,groundAt(x,z)+LAWN.lift+.002,z);
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));geometry.computeVertexNormals();
  // 裁切後的繞向不一定朝上；草葉取樣需要朝上的法線
  {const a=geometry.attributes.position.array;for(let k=0;k<a.length;k+=9){const ux=a[k+3]-a[k],uz=a[k+5]-a[k+2],vx=a[k+6]-a[k],vz=a[k+8]-a[k+2];if(uz*vx-ux*vz<0)for(let j=0;j<3;j++){const t=a[k+3+j];a[k+3+j]=a[k+6+j];a[k+6+j]=t;}}geometry.computeVertexNormals();}
  const surface=new T.Mesh(geometry,new T.MeshBasicMaterial());surface.name=it.lawn.name+' lawn sampling surface (not walk collider)';
  const layer=new GrassLayer({surface,seed:it.seed,density:density[current],coverage,blade:{minWidth:.018,maxWidth:.034,minHeight:LAWN.minHeight,maxHeight:LAWN.maxHeight,segments:2,lean:.03},wind:{strength:.008,lean:.003,speed:.8,turbulence:.12},colors:{bottom:'#2e4a26',top:'#9ab862',backlight:'#a8c27a'},brightness:.75,shadow:false,lighting:{backlightStrength:.3}});
  layer.name=it.lawn.name+' — short grass 6–12cm illustrative';
  layer.blades.material.vertexShader='#undef USE_SHADOWMAP\n'+layer.blades.material.vertexShader;layer.blades.material.fragmentShader='#undef USE_SHADOWMAP\n'+layer.blades.material.fragmentShader;layer.blades.material.lights=false;
  layer.visible=false;scene.add(layer);Object.assign(it,{layer,geometry,surface});
 }
 function release(it){if(!it.layer)return;scene.remove(it.layer);it.layer.dispose();it.geometry.dispose();it.surface.material.dispose();it.layer=it.geometry=it.surface=null;}
 const stats={lawns:lawns.length,tiles:items.length,get blades(){return items.reduce((s,it)=>s+(it.layer?.visible?it.layer.bladeCount:0),0);},get built(){return items.filter(it=>it.layer).length;},get visible(){return items.filter(it=>it.layer?.visible).length;},quality:current};
 function setQuality(v){if(!(v in density)||v===current)return;current=v;stats.quality=v;for(const it of items)it.layer?.setOptions({density:density[v]});}
 function setVisible(v){visible=!!v;if(!visible)for(const it of items)if(it.layer)it.layer.visible=false;}
 function update(time,eye){
  const range=ranges[current];let left=LAWN.budget[current];
  const near=items.map(it=>[Math.hypot(eye.x-it.cx,eye.z-it.cz)-it.r,it]).sort((a,b)=>a[0]-b[0]);
  for(const [d,it] of near){
   const show=visible&&d<range&&left>=it.area*density[current];
   if(show){left-=it.area*density[current];if(!it.layer)build(it);}
   else if(d>range+30)release(it);
   if(it.layer)it.layer.visible=show;
   if(!show)continue;it.layer.update(time);if(sun&&time-lastLight>1){it.layer.syncDirectionalLight(sun);}
  }
  if(sun&&time-lastLight>1)lastLight=time;
 }
 function dispose(){for(const it of items)release(it);}
 return {items,stats,update,setQuality,setVisible,dispose};
}
