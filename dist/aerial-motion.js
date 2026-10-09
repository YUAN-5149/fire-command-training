import * as T from 'three';

const smooth = q => { q=T.MathUtils.clamp(q,0,1); return q*q*(3-2*q); };
const wrap = angle => Math.atan2(Math.sin(angle),Math.cos(angle));
const mix = (a,b,q) => a+(b-a)*smooth(q);

// Scene geometry limits, not a manufacturer's operating envelope. Both street
// facades are treated as solid, including the projecting front balconies.
const FRONT_LIMIT=5.15, REAR_LIMIT=20.95, GROUND_LIMIT=-.066;
// Default clearance envelope for the homepage street: per-part bounds against the two facade planes and the road.
export function streetEnvelope(boxes){
 let minZ=Infinity,maxZ=-Infinity,minY=Infinity;
 for(const b of boxes){minZ=Math.min(minZ,b.min.z);maxZ=Math.max(maxZ,b.max.z);minY=Math.min(minY,b.min.y);}
 return {safe:minZ>=FRONT_LIMIT&&maxZ<=REAR_LIMIT&&minY>=GROUND_LIMIT,minZ,maxZ,minY};
}
// All geometry is evaluated in the frame of source.parent (the homepage root is the world origin, so its
// numbers are unchanged); a parked truck elsewhere can move its parent group without re-deriving the rig.
// envelope(boxes) receives each slewing part's bounds in that frame and decides clearance.
export function createAerialMotion(source,{slew,elevation,level,floor,extensions,anchor,envelope=streetEnvelope}) {
 const frame=source.parent,inverse=new T.Matrix4(),relative=new T.Matrix4();
 const syncFrame=()=>{if(frame)inverse.copy(frame.matrixWorld).invert();};
 const toFrame=v=>frame?v.applyMatrix4(inverse):v;
 const frameMatrix=mesh=>frame?relative.multiplyMatrices(inverse,mesh.matrixWorld):mesh.matrixWorld;
 syncFrame();
 const restYaw=slew.rotation.y, restPitch=elevation.rotation.z, restLevel=level.rotation.z;
 const extRest=extensions.map(o=>o.position.x);
 const rams=['','001'].map(suffix=>{
  const rod=source.getObjectByName('Ram_rod_root'+suffix),barrel=source.getObjectByName('Ram_barrel_root'+suffix);
  const length=rod.getWorldPosition(new T.Vector3()).distanceTo(barrel.getWorldPosition(new T.Vector3()));
  return {rod,barrel,length,rodLength:source.getObjectByName('Elevation_ram_rod'+suffix).position.x*2};
 });
 function alignRams(){
  for(const ram of rams){
   const head=ram.rod.getWorldPosition(new T.Vector3()),foot=ram.barrel.getWorldPosition(new T.Vector3()),span=head.distanceTo(foot);
   const rodDir=ram.rod.parent.worldToLocal(foot.clone()).sub(ram.rod.position).normalize();
   const barrelDir=ram.barrel.parent.worldToLocal(head.clone()).sub(ram.barrel.position).normalize();
   ram.rod.quaternion.setFromUnitVectors(new T.Vector3(1,0,0),rodDir);
   ram.barrel.quaternion.setFromUnitVectors(new T.Vector3(1,0,0),barrelDir);
   ram.rod.scale.x=(span-ram.length+ram.rodLength)/ram.rodLength;
  }
 }
 const worldFloor=()=>toFrame(floor.localToWorld(anchor.clone()));
 function place(pose) {
  slew.rotation.y=pose[0]; elevation.rotation.z=pose[1];
  extensions.forEach((o,i)=>o.position.x=extRest[i]-pose[2]);
  level.rotation.z=restLevel-(pose[1]-restPitch);
  source.updateMatrixWorld(true);alignRams();source.updateMatrixWorld(true);syncFrame();
  return worldFloor();
 }
 let pose=[restYaw,restPitch,0];
 const rest=place(pose),origin=toFrame(elevation.getWorldPosition(new T.Vector3()));
 const base=elevation.worldToLocal(level.getWorldPosition(new T.Vector3()));
 const tip=rest.clone().sub(toFrame(level.getWorldPosition(new T.Vector3()))).applyAxisAngle(new T.Vector3(0,1,0),-restYaw);
 const meshes=[];
 slew.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();meshes.push({mesh:o,box:o.geometry.boundingBox.clone()});}});
 // Solid body envelopes exclude designed bearing/cradle contact surfaces.
 const chassis=['Crew_cab_1','Equipment_body_1'].map(name=>{
  const mesh=source.getObjectByName(name);
  if(!mesh)throw new Error('Missing chassis collision envelope: '+name);
  const box=new T.Box3(),part=new T.Box3();mesh.updateWorldMatrix(true,true);
  mesh.traverse(o=>{if(!o.isMesh)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();box.union(part.copy(o.geometry.boundingBox).applyMatrix4(frameMatrix(o)));});
  box.min.y=source.position.y+.2;
  return {name,box};
 });
 const ladderMeshes=[];
 elevation.traverse(mesh=>{if(mesh.isMesh)ladderMeshes.push(mesh);});
 rams.forEach(({barrel})=>barrel.traverse(mesh=>{if(mesh.isMesh)ladderMeshes.push(mesh);}));
 const triangle=new T.Triangle(),bounds=new T.Box3(),partBounds=meshes.map(()=>new T.Box3());
 function chassisCollision(){
  // A diagonal ladder's AABB contains empty space: narrow phase uses its actual
  // triangles, so genuine clearance beside/above the roof is not rejected.
  for(const mesh of ladderMeshes){
   const matrix=frameMatrix(mesh);
   bounds.copy(mesh.geometry.boundingBox).applyMatrix4(matrix);
   for(const body of chassis){
    if(!bounds.intersectsBox(body.box))continue;
    const g=mesh.geometry,vertices=g.attributes.position,index=g.index,count=index?index.count:vertices.count;
    for(let i=0;i<count;i+=3){
     triangle.a.fromBufferAttribute(vertices,index?index.getX(i):i).applyMatrix4(matrix);
     triangle.b.fromBufferAttribute(vertices,index?index.getX(i+1):i+1).applyMatrix4(matrix);
     triangle.c.fromBufferAttribute(vertices,index?index.getX(i+2):i+2).applyMatrix4(matrix);
     if(body.box.intersectsTriangle(triangle))return {part:mesh.name,body:body.name};
    }
   }
  }
  return null;
 }
 function clearance(candidate) {
  const position=place(candidate);
  meshes.forEach(({mesh,box},i)=>partBounds[i].copy(box).applyMatrix4(frameMatrix(mesh)));
  const chassisHit=chassisCollision(),outside=envelope(partBounds);
  return {...outside,safe:!chassisHit&&outside.safe,position,chassisHit};
 }
 function solve(target) {
  const dx=target.x-origin.x,dz=target.z-origin.z,r=Math.hypot(dx,dz);
  const x=-r-tip.x,y=target.y-origin.y-tip.y;
  const squared=x*x+y*y-base.y*base.y;
  if(squared<0)return null;
  const reach=Math.sqrt(squared),extension=(reach+base.x)/extensions.length;
  const pitch=wrap(Math.atan2(y,x)-Math.atan2(base.y,-reach));
  const yaw=pose[0]+wrap(Math.atan2(dz,-dx)-pose[0]);
  if(extension<-.001||extension>6||pitch< -1.45||pitch>.5)return null;
  return [yaw,pitch,Math.max(0,extension)];
 }
 function move(candidate) {
  if(!candidate)return {safe:false,reason:'目標不可達，或路徑無法避開建物，雲梯已停止',position:place(pose)};
  candidate=[pose[0]+wrap(candidate[0]-pose[0]),candidate[1],candidate[2]];
  // Check swept poses too: an endpoint outside the wall does not prove a safe sweep.
  const count=Math.max(1,Math.ceil(Math.max(Math.abs(candidate[0]-pose[0])/.02,Math.abs(candidate[1]-pose[1])/.02,Math.abs(candidate[2]-pose[2])/.04)));
  let checked;
  for(let i=1;i<=count;i++){
   checked=clearance(pose.map((x,j)=>T.MathUtils.lerp(x,candidate[j],i/count)));
   if(!checked.safe){place(pose);return {...checked,position:worldFloor(),reason:checked.chassisHit?'梯架或籃架與車體干涉，已停止動作':'梯架或籃架接近建物／地面，已停止動作'};}
  }
  pose=candidate;return checked;
 }
 function plan(destination) {
  const start=[...pose],end=solve(destination);place(pose);
  if(!end)return null;
  end[0]=start[0]+wrap(end[0]-start[0]);
  if(!clearance(end).safe){place(pose);return null;}
  // Recover a depressed ladder above the deck before retracting. Raise before
  // slewing; extend only after alignment and lower only beyond the body.
  const recovery=start[1]>0?[start[0],0,start[2]]:[start[0],start[1],0];
  let waypoints=[start,recovery,[start[0],-Math.PI/4,0],[end[0],-Math.PI/4,0],[end[0],end[1],0],end];
  if(end[1]>0)waypoints=[start,recovery,[start[0],-Math.PI/4,0],[end[0],-Math.PI/4,0],[end[0],0,0],[end[0],0,end[2]],end];
  for(let k=1;k<waypoints.length;k++)for(let i=0;i<=60;i++){
   const sample=waypoints[k-1].map((v,j)=>T.MathUtils.lerp(v,waypoints[k][j],i/60));
   if(!clearance(sample).safe){place(pose);return null;}
  }
  place(pose);return {waypoints,destination:destination.clone()};
 }
 function at(plan,time,initial=false) {
  if(!plan)return null;
  const times=plan.waypoints.length===7?[0,2,5,9,11,13,17]:initial?[0,0,6,11,15,19]:[0,3,7,10,13,17];
  for(let k=1;k<times.length;k++)if(time<times[k])return plan.waypoints[k-1].map((v,j)=>mix(v,plan.waypoints[k][j],(time-times[k-1])/(times[k]-times[k-1])));
  return [...plan.waypoints.at(-1)];
 }
 return {rest,origin,solve,move,plan,at,get pose(){return [...pose]},clearance:()=>{const result=clearance(pose);return result}};
}
