// 臺北市災害應變中心在信義街景漫遊的細部（原模型檢視頁 taipei-eoc.js 移入）：
//   drapeSite   場地物件（extras.drape）貼合街景地形：surface＝鋪面逐頂點跟著地面，object＝車輛、樹整個搬到地面
//   enhanceEoc  模型沒有貼圖，以世界座標在 shader 補牆板縫、石材、柏油與鋪面質感，夜間玻璃依格子亂數亮窗，
//               停機坪邊燈夜間閃爍
// 回傳 {setNight(l), update(t)}，l 為 0～1（街景時段的 lights）。
import * as T from 'three';

const NOISE=`varying vec3 vWPos;varying vec3 vWNrm;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn(p);p*=2.03;a*=.5;}return s;}
vec2 wallUV(){vec3 n=abs(vWNrm);return n.x>n.z?vec2(vWPos.z,vWPos.y):vec2(vWPos.x,vWPos.y);}
float grid(vec2 uv,vec2 cell,float w){vec2 f=abs(fract(uv/cell+.5)-.5)*cell;vec2 aa=fwidth(uv)*1.2;
 vec2 g=1.-smoothstep(vec2(w)-aa,vec2(w)+aa,f);return max(g.x,g.y);}`;
// 每種表面調整 diffuseColor 與 roughnessFactor；街景的牆腳不在 y=0，髒污以 vBase（物件底部高程）為準
const DETAIL={
 panel:`bool wall=abs(vWNrm.y)<.5;vec2 uv=wall?wallUV():vWPos.xz;
  float j=wall?grid(uv,vec2(.45,.45),.006):0.;
  float v=h21(floor(uv/vec2(.45,.45)))-.5;
  float streak=wall?fbm(vec2(uv.x*.7,uv.y*.08))-.5:fbm(uv*.4)-.5;
  float grime=wall?(1.-smoothstep(.0,2.2,vWPos.y-uEocBase))*.10:0.;
  col*=1.+v*.03+streak*.06-grime;col*=1.-j*.18;rough=clamp(rough+streak*.15+j*.2,0.,1.);`,
 stone:`vec2 uv=abs(vWNrm.y)<.5?wallUV():vWPos.xz;float j=grid(uv,vec2(1.2,.6),.008);
  float v=h21(floor(uv/vec2(1.2,.6)))-.5;col*=(1.+v*.12+(fbm(uv*6.)-.5)*.12)*(1.-j*.4);rough=clamp(rough+(fbm(uv*9.)-.5)*.2,0.,1.);`,
 asphalt:`vec2 uv=vWPos.xz;float p=fbm(uv*.08);float sp=h21(floor(uv*45.));float cr=fbm(uv*.9);
  col*=.85+p*.35+(sp-.5)*.18;col=mix(col,col*1.35,smoothstep(.62,.7,cr)*.5);rough=clamp(rough-.05+(p-.5)*.15,0.,1.);`,
 paving:`vec2 uv=vWPos.xz;float j=grid(uv,vec2(.6,.6),.01);float v=h21(floor(uv/.6))-.5;
  col*=(1.+v*.16+(fbm(uv*.3)-.5)*.2)*(1.-j*.45);rough=clamp(rough+j*.1,0.,1.);`,
 ground:`vec2 uv=vWPos.xz;col*=.8+fbm(uv*.05)*.45+(h21(floor(uv*20.))-.5)*.08;`,
 tin:`vec2 uv=vWPos.xz;float rib=.5+.5*sin((abs(vWNrm.y)>.5?uv.x:uv.y)*20.);col*=.88+rib*.12+(fbm(uv*.3)-.5)*.3;rough=clamp(rough+(fbm(uv*.7)-.3)*.3,0.,1.);`,
 helipad:`vec2 uv=vWPos.xz;col*=.92+fbm(uv*.25)*.16;rough=clamp(rough+(fbm(uv*1.3)-.5)*.2,0.,1.);`,
 foliage:`col*=.75+fbm(vWPos.xz*.7+vWPos.y)*.5;`
};
export const MATERIAL_DETAIL={
 'EOC facade tile grey':'panel','Mast white':'panel','AC unit white':'panel',
 'EOC pier stone grey':'stone','EOC granite beige':'stone','EOC vent louvre beige':'tin','Utility cabinet grey':'stone',
 'Asphalt':'asphalt','Sidewalk paving':'paving','Plaza paving':'paving','Sports field':'ground',
 'Helipad surface teal':'helipad',
 'Tree foliage':'foliage','Tree foliage light':'foliage','Hedge':'foliage','Shrub foliage':'foliage'
};
// 夜間亮窗：依世界座標格子雜湊，約三成亮燈
export const GLASS={'EOC window glass green':1,'EOC window glass light':1,'EOC curtain glass light green':.7,'EOC curtain glass green':.6};

// 場地物件貼合地形。root 已放好位置；ground.at(x,z) 為街景地面高程。鋪面略抬高，避免和街景路面重疊閃爍。
export function drapeSite(root,ground,{lift=.05}={}){
 root.updateMatrixWorld(true);
 const baseY=root.position.y,v=new T.Vector3(),stats={surface:0,object:0};
 root.traverse(o=>{
  const d=o.userData?.drape;if(!d)return;
  if(d==='object'){o.getWorldPosition(v);o.position.y+=ground.at(v.x,v.z)-baseY;stats.object++;return;}
  if(d!=='surface')return;
  // 鋪面節點本身或其子網格（glTF 多材質會拆成子網格）
  const meshes=[];o.traverse(m=>{if(m.isMesh)meshes.push(m);});
  for(const m of meshes){
   m.geometry=m.geometry.clone();const p=m.geometry.attributes.position,inv=new T.Matrix4().copy(m.matrixWorld).invert(),w=new T.Vector3();
   for(let i=0;i<p.count;i++){
    w.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld);
    w.y+=ground.at(w.x,w.z)-baseY+lift;
    v.copy(w).applyMatrix4(inv);p.setXYZ(i,v.x,v.y,v.z);}
   p.needsUpdate=true;m.geometry.computeBoundingSphere();m.geometry.computeBoundingBox();m.receiveShadow=true;m.castShadow=false;stats.surface++;}
 });
 return stats;
}

export function enhanceEoc(root,{base=root.position.y}={}){
 const lit=[],edge=[],seen=new Set(),uBase={value:base};let sock=null;
 root.traverse(o=>{
  if(/windsock/i.test(o.name))sock=o;
  if(!o.isMesh)return;
  for(const m of [].concat(o.material)){
   if(seen.has(m))continue;seen.add(m);
   if(m.name==='Helipad edge light'){m.emissive=new T.Color('#ff7a1a');m.emissiveIntensity=0;edge.push(m);continue;}
   const kind=MATERIAL_DETAIL[m.name],glass=GLASS[m.name];
   if(m.name==='Fountain water'){m.roughness=.05;m.metalness=.2;}
   if(!kind&&!glass)continue;
   if(glass){m.emissive=new T.Color('#ffcf8a');m.emissiveIntensity=0;m.userData.litMax=1.3*glass;lit.push(m);}
   m.onBeforeCompile=sh=>{
    sh.uniforms.uEocBase=uBase;
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWPos;varying vec3 vWNrm;')
     .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWPos=(modelMatrix*vec4(transformed,1.)).xyz;vWNrm=normalize(mat3(modelMatrix)*objectNormal);');
    let f=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform float uEocBase;\n'+NOISE);
    if(kind)f=f.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n{vec3 col=diffuseColor.rgb;float rough=roughnessFactor;'+DETAIL[kind]+'diffuseColor.rgb=col;roughnessFactor=rough;}');
    if(glass)f=f.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n{vec3 cell=floor(vec3(vWPos.x/1.3,vWPos.y/3.6,vWPos.z/1.3));float r=h21(cell.xz+cell.y*7.31);'
     +'totalEmissiveRadiance*=step(.66,r)*(.6+.4*h21(cell.zx*1.7+cell.y));}');
    sh.fragmentShader=f;
   };
   // three 以 onBeforeCompile 原始碼快取 shader；各種表面要各自編譯
   m.customProgramCacheKey=()=>'eoc-'+(kind||'')+'-'+(glass?'glass':'');
   m.needsUpdate=true;
  }
 });
 let night=0;
 return {
  sock,lit,edge,
  setNight(l){night=l;for(const m of lit)m.emissiveIntensity=l*m.userData.litMax;for(const m of edge)m.emissiveIntensity=l*3;},
  update(t){if(night>0)for(const m of edge)m.emissiveIntensity=night*(4+2*Math.sin(t*4));}
 };
}
