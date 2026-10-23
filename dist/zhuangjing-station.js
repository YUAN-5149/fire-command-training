import * as T from 'three';
import {project} from './xinyi-street-world.js?v=garage-20261023';
export const ZHUANGJING_CREW=Object.freeze(['大隊長','隊員','隊員','隊員','隊員','隊員']);
// The building vertices/heights come directly from the existing official LOD1 data.
// Window rhythm and ground frontage remain illustrative until current photos are verified.
export function stationLayout(data,buildings){
 const volumes=data.buildingIds.map(id=>buildings.find(b=>b.id===id));if(volumes.some(b=>!b))throw Error('莊敬分隊量體缺漏');
 const wall=volumes.find(b=>b.id===data.front.buildingId)?.walls[data.front.wallIndex];if(!wall)throw Error('莊敬分隊臨街面缺漏');
 const a=project(wall.a[0],wall.a[1]),b=project(wall.b[0],wall.b[1]),length=Math.hypot(b[0]-a[0],b[1]-a[1]),tx=(b[0]-a[0])/length,tz=(b[1]-a[1])/length,nx=wall.n[0],nz=-wall.n[1],x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
 const point=(along,out)=>({x:x+tx*along+nx*out,z:z+tz*along+nz*out});
 return {volumes,wall,x,z,nx,nz,tx,tz,length,heading:Math.atan2(-nx,-nz),visit:{...point(0,9),heading:Math.atan2(nx,nz)},crew:[point(0,4.8),...[-4.2,-2.1,0,2.1,4.2].map(s=>point(s,2.3))]};
}
export function addZhuangjingStation({scene,data,buildings,ground,colliders,createPerson}){
 const layout=stationLayout(data,buildings),root=new T.Group();root.name='莊敬分隊・官方量體與示意立面';scene.add(root);
 const materials={wall:new T.MeshStandardMaterial({color:'#c9c4b9',roughness:.9,side:T.DoubleSide}),roof:new T.MeshStandardMaterial({color:'#9c9d99',roughness:.9,side:T.DoubleSide}),glass:new T.MeshStandardMaterial({color:'#637b83',roughness:.5,metalness:.1,emissive:'#f5c474',emissiveIntensity:0}),base:new T.MeshStandardMaterial({color:'#636568',roughness:.8})};
 const box=new T.BoxGeometry(1,1,1),windows=[];
 for(const building of layout.volumes){const positions=[];for(const w of building.walls){const a=project(w.a[0],w.a[1]),b=project(w.b[0],w.b[1]),y=Math.min(w.a[2],w.b[2]),top=y+w.h;positions.push(a[0],y,a[1],b[0],y,b[1],b[0],top,b[1],a[0],y,a[1],b[0],top,b[1],a[0],top,a[1]);
   const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),cols=Math.floor(length/2.9),nx=w.n[0],nz=-w.n[1];if(length<2.5)continue;
   for(let floor=1;floor<data.levels;floor++)for(let col=0;col<cols;col++){const t=(col+.5)/cols;windows.push({x:a[0]+dx*t+nx*.04,z:a[1]+dz*t+nz*.04,y:y+4.2+(floor-.5)*(w.h-4.2)/(data.levels-1),width:Math.min(1.8,length/cols-.5),height:1.25,angle:Math.atan2(nx,nz)});}
  }
  const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();const walls=new T.Mesh(geometry,materials.wall);walls.castShadow=walls.receiveShadow=true;root.add(walls);
  const roofs=[];for(const p of building.roofs??[]){const [x,z]=project(p[0],p[1]);roofs.push(x,p[2],z);}if(roofs.length){const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(roofs,3));g.computeVertexNormals();const roof=new T.Mesh(g,materials.roof);roof.castShadow=roof.receiveShadow=true;root.add(roof);}
 }
 const dummy=new T.Object3D(),windowMesh=new T.InstancedMesh(box,materials.glass,windows.length);windows.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.angle,0);dummy.scale.set(p.width,p.height,.045);dummy.updateMatrix();windowMesh.setMatrixAt(i,dummy.matrix);});windowMesh.receiveShadow=true;root.add(windowMesh);
 // A continuous closed ground-storey surface avoids claiming an unverified bay count or doorway.
 const frontage=new T.Mesh(box,materials.base);frontage.position.set(layout.x+layout.nx*.045,Math.min(layout.wall.a[2],layout.wall.b[2])+1.85,layout.z+layout.nz*.045);frontage.rotation.y=Math.atan2(layout.nx,layout.nz);frontage.scale.set(layout.length-.3,3.7,.04);root.add(frontage);
 const signCanvas=document.createElement('canvas');signCanvas.width=1024;signCanvas.height=160;const ctx=signCanvas.getContext('2d');ctx.fillStyle='#881e25';ctx.fillRect(0,0,1024,160);ctx.textAlign='center';ctx.fillStyle='white';ctx.font='bold 62px sans-serif';ctx.fillText('莊敬分隊・大隊待命',512,76);ctx.font='30px sans-serif';ctx.fillText('外牆與車庫面為示意・待現況照片精修',512,132);
 const texture=new T.CanvasTexture(signCanvas);texture.colorSpace=T.SRGBColorSpace;const sign=new T.Mesh(new T.PlaneGeometry(11,1.72),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));sign.position.set(layout.x+layout.nx*.09,Math.min(layout.wall.a[2],layout.wall.b[2])+4.9,layout.z+layout.nz*.09);sign.rotation.y=Math.atan2(layout.nx,layout.nz);sign.name='訓練地點識別牌（非實際招牌）';root.add(sign);
 const staffRoot=new T.Group();staffRoot.name='莊敬分隊待命人員';scene.add(staffRoot);staffRoot.visible=false;const people=[];
 function ensurePeople(){if(people.length)return;ZHUANGJING_CREW.forEach((rank,i)=>{const pose=layout.crew[i],q=colliders.resolve(pose.x,pose.z,.42);if(Math.hypot(q.x-pose.x,q.z-pose.z)>.05)throw Error('莊敬分隊待命點與建物重疊');const g=new T.Group();g.name=rank+'・莊敬待命'+(i+1);g.position.set(q.x,ground.at(q.x,q.z),q.z);g.rotation.y=layout.heading;staffRoot.add(g);people.push({rank,root:g,person:createPerson(g,rank)});});}
 const status='莊敬分隊待命：大隊長 1 名＋隊員 5 名・前進指揮車待加入';
 return {data,layout,root,staffRoot,people,status,visitPoint(){return {...layout.visit};},update(position){const near=Math.hypot(position.x-layout.x,position.z-layout.z)<160;if(near)ensurePeople();staffRoot.visible=near;},circles(){return staffRoot.visible?people.map(p=>[p.root.position.x,p.root.position.z,.4]):[];},marker(){return {x:layout.x,z:layout.z,color:'#b43c45',label:'莊敬分隊・大隊待命'};},setNight(on){materials.glass.emissiveIntensity=on?.28:0;}};
}
