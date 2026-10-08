// 消防車車輪轉動（方案 A：載入時處理，不修改車型檔）。
// 原車型 Wheel_* 節點的原點不在輪軸，且 Wheel_RR 內含所有車輪的胎紋。此處只做幾何重組：
// 將各節點的網格依相連零件拆開，依零件中心分配到最近的輪軸，再以輪軸中心為轉動原點重組。
// 靜止時每個頂點位置與原車型相同（測試驗證），外觀、材質、零件數量不變。
import * as T from 'three';

export function rigWheels(model,{wheelRadius=0.525}={}){
 model.updateMatrixWorld(true);
 const nodes=[];model.traverse(o=>{if(/^Wheel_/.test(o.name))nodes.push(o);});
 if(!nodes.length)return null;
 const parent=nodes[0].parent,inv=new T.Matrix4().copy(parent.matrixWorld).invert(),parts=[];
 for(const node of nodes)node.traverse(m=>{if(m.isMesh)parts.push(m);});
 // 第一輪：取輪胎（大圓柱）零件中心估計各輪軸。
 const pieces=[];
 for(const m of parts){
  const rel=new T.Matrix4().multiplyMatrices(inv,m.matrixWorld),geo=m.geometry,pos=geo.attributes.position,n=pos.count,index=geo.index?geo.index.array:[...Array(n).keys()];
  const world=new Float32Array(n*3),v=new T.Vector3();for(let i=0;i<n;i++){v.fromBufferAttribute(pos,i).applyMatrix4(rel);world.set([v.x,v.y,v.z],i*3);}
  const par=new Int32Array(n).map((_,i)=>i),find=i=>{while(par[i]!==i)i=par[i]=par[par[i]];return i;},weld=new Map();
  for(let i=0;i<n;i++){const k=world[i*3].toFixed(4)+','+world[i*3+1].toFixed(4)+','+world[i*3+2].toFixed(4);if(weld.has(k))par[find(i)]=find(weld.get(k));else weld.set(k,i);}
  for(let t=0;t<index.length;t+=3){par[find(index[t+1])]=find(index[t]);par[find(index[t+2])]=find(index[t]);}
  const comps=new Map();for(let t=0;t<index.length;t+=3){const r=find(index[t]);if(!comps.has(r))comps.set(r,{tris:[],box:new T.Box3()});comps.get(r).tris.push(index[t],index[t+1],index[t+2]);}
  for(const c of comps.values()){for(const i of c.tris)c.box.expandByPoint(v.set(world[i*3],world[i*3+1],world[i*3+2]));pieces.push({mesh:m,rel,world,tris:c.tris,center:c.box.getCenter(new T.Vector3()),size:c.box.getSize(new T.Vector3())});}
 }
 const tyres=pieces.filter(p=>p.size.x>wheelRadius*1.8&&p.size.y>wheelRadius*1.8);
 const axles=[];for(const p of tyres){const side=Math.sign(p.center.z);let a=axles.find(a=>Math.abs(a.x-p.center.x)<.3&&a.side===side);if(!a)axles.push(a={x:p.center.x,y:p.center.y,side,z:p.center.z,n:0});a.z=Math.abs(a.z)>Math.abs(p.center.z)?a.z:p.center.z;}
 if(!axles.length)return null;
 // 第二輪：每個零件分配至最近輪軸；零件外緣距軸心超過輪半徑＋10 cm（含胎紋）者不屬於車輪，保留原位不動。
 const groups=new Map(),stay=new Map();
 for(const p of pieces){let best=null,bd=Infinity;for(const a of axles){if(Math.sign(p.center.z)!==a.side)continue;const d=Math.hypot(p.center.x-a.x,p.center.y-a.y);if(d<bd){bd=d;best=a;}}
  const reach=Math.max(p.size.x,p.size.y)/2+bd;const key=best&&reach<=wheelRadius+.1?best:null;
  const map=key?groups:stay,k=key??p.mesh;if(!map.has(k))map.set(k,new Map());const byMat=map.get(k);if(!byMat.has(p.mesh))byMat.set(p.mesh,[]);byMat.get(p.mesh).push(p);}
 function build(mesh,list,offset){
  const src=mesh.geometry,remap=new Map(),idx=[],out={};for(const name of Object.keys(src.attributes))out[name]=[];
  const nm=new T.Matrix3().getNormalMatrix(list[0].rel),v=new T.Vector3();
  for(const p of list)for(const i of p.tris){if(!remap.has(i)){remap.set(i,remap.size);for(const [name,attr] of Object.entries(src.attributes)){
   if(name==='position'){out[name].push(p.world[i*3]-offset.x,p.world[i*3+1]-offset.y,p.world[i*3+2]-offset.z);}
   else if(name==='normal'){v.fromBufferAttribute(attr,i).applyMatrix3(nm).normalize();out[name].push(v.x,v.y,v.z);}
   else for(let c=0;c<attr.itemSize;c++)out[name].push(attr.array[i*attr.itemSize+c]);}}idx.push(remap.get(i));}
  const g=new T.BufferGeometry();for(const [name,arr] of Object.entries(out)){const a=src.attributes[name];g.setAttribute(name,new T.BufferAttribute(new a.array.constructor(arr),a.itemSize,a.normalized));}
  g.setIndex(idx);g.computeBoundingSphere();const m=new T.Mesh(g,mesh.material);m.castShadow=mesh.castShadow;m.receiveShadow=mesh.receiveShadow;m.name=mesh.name;return m;
 }
 const wheels=[];
 for(const [axle,byMat] of groups){
  const steer=new T.Group(),spin=new T.Group(),center=new T.Vector3(axle.x,axle.y,axle.z);steer.position.copy(center);steer.add(spin);parent.add(steer);
  steer.name=`WheelPivot_${axle.x<0?'F':'R'}${axle.side>0?'L':'R'}`;for(const [mesh,list] of byMat)spin.add(build(mesh,list,center));
  wheels.push({steer,spin,front:axle.x<0,axle});
 }
 for(const [mesh,byMat] of stay)for(const [,list] of byMat){const m=build(mesh,list,new T.Vector3());parent.add(m);}
 for(const m of parts)m.removeFromParent();
 // 車頭朝 -x：前進時繞 +z 軸轉動；前輪左轉時繞 y 軸正向。
 const moving=[...groups.values()].reduce((n,m)=>n+[...m.values()].reduce((k,l)=>k+l.length,0),0),fixed=[...stay.values()].reduce((n,m)=>n+[...m.values()].reduce((k,l)=>k+l.length,0),0);
 return {wheels,radius:wheelRadius,moving,fixed,update(distance,steerAngle=0){for(const w of wheels){w.spin.rotation.z+=distance/wheelRadius;if(w.front)w.steer.rotation.y=steerAngle;}}};
}
