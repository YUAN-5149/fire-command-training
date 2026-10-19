// 信義街景漫遊：全區街道設施（assets/street-furniture-xinyi.json，scripts/build-street-furniture.py 產生）。
// 市府路燈、OSM 路樹、號誌（桿＋懸臂＋燈箱）、消防栓（地上式紅色、地下式黃色標線）、公車候車亭、草地公園。
// 每類一個 InstancedMesh。桿位、朝向依 OSM 與車道推定，非實測；消防栓實際以消防局水源資料為準。
import {buildLaneGeometry} from './xinyi-lanes.js?v=1';

// 純函式：每類實例 [{x,y,z,ry,sx,sy,sz,c}]（y 為離地高，加上地面高程後使用）。
export function furnitureParts(data){
 const P={pole:[],head:[],trunk:[],crown:[],sigPole:[],sigArm:[],sigBox:[],sigLamp:[],hydrant:[],hydBase:[],hydOutlet:[],hydCap:[],hydMark:[],shelter:[],glass:[],busSign:[]};
 const add=(k,x,y,z,ry,sx,sy,sz,c)=>P[k].push({x,y,z,ry,sx,sy,sz,c});
 for(const [x,z,h] of data.lamps){add('pole',x,0,z,0,.16,h,.16);add('head',x,h,z,0,.5,.2,.3);}
 data.trees.forEach(([x,z],i)=>{const s=.85+((i*7919)%100)/250;add('trunk',x,0,z,0,.28,2.4*s,.28);add('crown',x,2.1*s,z,0,3.4*s,3.8*s,3.4*s,i%3?'#4a6950':'#56744f');});
 data.signals.forEach(([nx,nz,px,pz],i)=>{
  const dx=nx-px,dz=nz-pz,d=Math.hypot(dx,dz)||1,len=Math.min(d,6.5),ry=Math.atan2(dx,dz),ex=px+dx/d*len,ez=pz+dz/d*len;
  add('sigPole',px,0,pz,0,.22,6,.22);
  add('sigArm',px+dx/d*len/2,5.7,pz+dz/d*len/2,ry,.14,.14,len);
  // 橫式燈箱沿懸臂掛在末端，燈面朝來車方向（與懸臂垂直）；三燈其一亮
  add('sigBox',ex,5.2,ez,ry,.3,.36,1.05);
  const on=i%3,cols=['#ff3b30','#ffcc00','#34c759'];
  for(let k=0;k<3;k++){const off=(k-1)*.33;add('sigLamp',ex+dx/d*off,5.27,ez+dz/d*off,ry,.36,.22,.22,k===on?cols[k]:'#2a2d2f');}
 });
 for(const [x,z,under] of data.hydrants){
  if(under)add('hydMark',x,.03,z,0,.9,.02,.9,'#f2c230');
  // 地上式：底座法蘭、紅色栓身、兩側出水口、黃色圓頂蓋（約 0.8 m 高）
  else{add('hydBase',x,0,z,0,.46,.08,.46,'#8e1813');add('hydrant',x,.08,z,0,.3,.6,.3,'#c8211b');add('hydOutlet',x,.4,z,0,.62,.13,.13,'#c8211b');add('hydCap',x,.6,z,0,.32,.26,.32,'#f2c230');}
 }
 for(const [x,z,ang] of data.busStops){
  // 候車亭背對道路：ang 指向道路
  const bx=x-Math.sin(ang)*.8,bz=z-Math.cos(ang)*.8;
  add('shelter',x,2.5,z,ang,4.2,.12,1.8,'#596066');add('glass',bx,.15,bz,ang,4,2.3,.05,'#9fb6c0');
  add('busSign',x+Math.sin(ang)*1.1+Math.cos(ang)*2.4,0,z+Math.cos(ang)*1.1-Math.sin(ang)*2.4,ang,.1,2.8,.1,'#2563b8');
 }
 return P;
}

export function addFurnitureToScene({T,scene,data,ground}){
 const group=new T.Group();group.name='street furniture';
 const cyl=new T.CylinderGeometry(.5,.5,1,10).translate(0,.5,0),box=new T.BoxGeometry(1,1,1).translate(0,.5,0),ball=new T.SphereGeometry(.5,12,9).translate(0,.5,0);
 const std=o=>new T.MeshStandardMaterial(o);
 const glowMat=o=>{const m=std({emissive:'#ffffff',emissiveIntensity:1,...o});m.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n#if defined(USE_COLOR)||defined(USE_INSTANCING_COLOR)\ntotalEmissiveRadiance*=vColor.rgb;\n#endif');};return m;};
 const headMat=std({color:'#d9dedc',emissive:'#ffd9a0',emissiveIntensity:0});
 const SPEC={pole:[cyl,std({color:'#6e7477',roughness:.6})],head:[box,headMat],trunk:[cyl,std({color:'#665544'})],crown:[ball,std({roughness:.9})],
  sigPole:[cyl,std({color:'#8c9597',roughness:.5,metalness:.4})],sigArm:[box,std({color:'#8c9597',roughness:.5,metalness:.4})],sigBox:[box,std({color:'#1d2022',roughness:.6})],
  sigLamp:[box,glowMat({roughness:.4})],hydrant:[cyl,std({roughness:.5})],hydBase:[cyl,std({roughness:.6})],hydOutlet:[cyl.clone().rotateZ(Math.PI/2).translate(.5,0,0),std({roughness:.5})],hydCap:[ball,std({roughness:.45})],hydMark:[box,std({roughness:.8,polygonOffset:true,polygonOffsetFactor:-4})],
  shelter:[box,std({roughness:.6})],glass:[box,std({roughness:.15,transparent:true,opacity:.45})],busSign:[cyl,std({roughness:.5})]};
 const parts=furnitureParts(data);
 const m4=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),c=new T.Color(),v=new T.Vector3(),sc=new T.Vector3();
 for(const [k,list] of Object.entries(parts)){
  if(!list.length)continue;const [geo,mat]=SPEC[k],im=new T.InstancedMesh(geo,mat,list.length);im.name='furniture '+k;
  list.forEach((p,i)=>{e.set(0,p.ry,0);q.setFromEuler(e);m4.compose(v.set(p.x,ground.at(p.x,p.z)+p.y,p.z),q,sc.set(p.sx,p.sy,p.sz));im.setMatrixAt(i,m4);if(p.c)im.setColorAt(i,c.set(p.c));});
  im.castShadow=!['hydMark','glass','sigLamp'].includes(k);im.receiveShadow=true;group.add(im);
 }
 // 草地與公園：貼地多邊形
 if(data.green?.length){
  const triangulate=pts=>T.ShapeUtils.triangulateShape(pts.map(p=>new T.Vector2(p.x,p.y)),[]);
  const pos=buildLaneGeometry(data.green,{triangulate,groundAt:(x,z)=>ground.at(x,z),lift:.06});
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));g.computeVertexNormals();
  const m=new T.Mesh(g,std({color:'#5d7a4a',roughness:1,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));m.name='furniture green';m.receiveShadow=true;group.add(m);
 }
 scene.add(group);
 const glow=[];for(const [x,z,h] of data.lamps)glow.push(x,ground.at(x,z)+h-.1,z);
 return {group,headMat,glow};
}
