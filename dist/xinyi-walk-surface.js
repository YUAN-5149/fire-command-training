import * as T from 'three';
// Index only explicit outdoor paving, never buildings/roofs/vehicles. Geometry remains unchanged.
export function createWalkSurface(ground,{cell=8,maxLift=Infinity}={}){
 const cells=new Map(),seen=new WeakSet();let revision=0,triangles=0;const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
 const key=(x,z)=>Math.floor(x/cell)+','+Math.floor(z/cell);
 function addMeshes(meshes){let added=0;for(const mesh of meshes){if(!mesh.isMesh||seen.has(mesh))continue;seen.add(mesh);mesh.updateWorldMatrix(true,false);const p=mesh.geometry.attributes.position,index=mesh.geometry.index,count=index?.count??p.count;
  for(let i=0;i<count;i+=3){a.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld);b.fromBufferAttribute(p,index?index.getX(i+1):i+1).applyMatrix4(mesh.matrixWorld);c.fromBufferAttribute(p,index?index.getX(i+2):i+2).applyMatrix4(mesh.matrixWorld);
   const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,ex=c.x-a.x,ey=c.y-a.y,ez=c.z-a.z,nx=dy*ez-dz*ey,ny=dz*ex-dx*ez,nz=dx*ey-dy*ex;
   if(Math.abs(ny)<1e-8||Math.abs(ny)/Math.hypot(nx,ny,nz)<.7)continue;
   const d=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z),t={ax:a.x,ay:a.y,az:a.z,bx:b.x,by:b.y,bz:b.z,cx:c.x,cy:c.y,cz:c.z,d};
   for(let x=Math.floor(Math.min(a.x,b.x,c.x)/cell);x<=Math.floor(Math.max(a.x,b.x,c.x)/cell);x++)for(let z=Math.floor(Math.min(a.z,b.z,c.z)/cell);z<=Math.floor(Math.max(a.z,b.z,c.z)/cell);z++){const k=x+','+z;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(t);}added++;
  }
 }if(added){triangles+=added;revision++;}return added;}
 function addDraped(root){const meshes=[];root.traverse(o=>{if(o.userData?.drape==='surface')o.traverse(m=>{if(m.isMesh)meshes.push(m);});});return addMeshes(meshes);}
 function at(x,z){const base=ground.at(x,z);let top=base;
  for(const t of cells.get(key(x,z))??[]){const u=((t.bz-t.cz)*(x-t.cx)+(t.cx-t.bx)*(z-t.cz))/t.d,v=((t.cz-t.az)*(x-t.cx)+(t.ax-t.cx)*(z-t.cz))/t.d;
   if(u< -1e-7||v< -1e-7||u+v>1+1e-7)continue;const y=u*t.ay+v*t.by+(1-u-v)*t.cy;if(y<=base+maxLift&&y>top)top=y;
  }return top;
 }
 return {at,addMeshes,addDraped,get revision(){return revision;},get stats(){return {triangles,cells:cells.size};}};
}
// Work from posed boot bounds (rigid skin bounds already cached by the character controller).
// Only used for a visible, outdoor player; does not change other animations or model assets.
export function placeCharacterFeet(root,person,surface,{clearance=.008}={}){
 root.parent?.updateWorldMatrix(true,false);root.updateMatrixWorld(true);const box=new T.Box3();let correction=-Infinity;
 for(const boot of person.boots??[]){if(boot.isSkinnedMesh)boot.computeBoundingBox();else if(!boot.geometry?.boundingBox)boot.geometry?.computeBoundingBox();const bounds=boot.boundingBox??boot.geometry?.boundingBox;if(!bounds)continue;box.copy(bounds).applyMatrix4(boot.matrixWorld);if(!Number.isFinite(box.min.y))continue;
  let top=surface.at((box.min.x+box.max.x)/2,(box.min.z+box.max.z)/2);for(const x of [box.min.x,box.max.x])for(const z of [box.min.z,box.max.z])top=Math.max(top,surface.at(x,z));correction=Math.max(correction,top+clearance-box.min.y);
 }
 if(!Number.isFinite(correction))return 0;const scale=root.parent?.getWorldScale(new T.Vector3()).y??1;root.position.y+=correction/scale;root.updateMatrixWorld(true);return correction;
}
