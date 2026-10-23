import {project} from './xinyi-street-world.js?v=garage-20261023';
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function signedArea(poly){let a=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];a+=p[0]*q[1]-q[0]*p[1];}return a/2;}
// Convex image-derived polygons only. Clip the complete paint ribbon, not just its center line.
export function clipPaint(subject,boundary){
 let out=subject;
 for(let i=0;i<boundary.length&&out.length;i++){
  const a=boundary[i],b=boundary[(i+1)%boundary.length],input=out;out=[];
  for(let j=0;j<input.length;j++){
   const p=input[j],q=input[(j+1)%input.length],dp=cross(a,b,p),dq=cross(a,b,q),ip=dp>=-1e-7,iq=dq>=-1e-7;
   if(ip)out.push(p);
   if(ip!==iq){const t=dp/(dp-dq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
  }
 }return out;
}
function ribbon(a,b,width){const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<1e-6)return [];const nx=-dz/len*width/2,nz=dx/len*width/2;return [[a[0]-nx,a[1]-nz],[b[0]-nx,b[1]-nz],[b[0]+nx,b[1]+nz],[a[0]+nx,a[1]+nz]];}
export function yellowBoxRings(polygon,{angles=[45,135],spacing=2,border=.2,line=.1}={}){
 if(!(spacing>=.5&&border>0&&line>0))throw Error('Invalid display paint dimensions');
 let p=polygon.map(v=>[...v]);if(p.length>3&&Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])<1e-6)p.pop();
 if(p.length<3||!p.flat().every(Number.isFinite)||Math.abs(signedArea(p))<.1)return [];
 if(signedArea(p)<0)p.reverse();
 for(let i=0;i<p.length;i++)if(cross(p[i],p[(i+1)%p.length],p[(i+2)%p.length])<-1e-6)throw Error('Non-convex yellow-box boundary');
 const rings=[],keep=r=>{const clipped=clipPaint(r,p);if(clipped.length>=3&&Math.abs(signedArea(clipped))>1e-6)rings.push(clipped);};
 for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<1e-6)continue;const nx=-(b[1]-a[1])/len*border/2,nz=(b[0]-a[0])/len*border/2;keep(ribbon([a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],border));}
 const extent=Math.max(...p.map(q=>Math.hypot(q[0]-p[0][0],q[1]-p[0][1])))*2+4;
 for(const angle of angles){const r=angle*Math.PI/180,dx=Math.cos(r),dz=Math.sin(r),nx=-dz,nz=dx,vals=p.map(q=>q[0]*nx+q[1]*nz),lo=Math.min(...vals),hi=Math.max(...vals),along=p.reduce((s,q)=>s+q[0]*dx+q[1]*dz,0)/p.length;
  for(let c=Math.ceil(lo/spacing)*spacing;c<=hi;c+=spacing)keep(ribbon([nx*c+dx*(along-extent),nz*c+dz*(along-extent)],[nx*c+dx*(along+extent),nz*c+dz*(along+extent)],line));
 }return rings;
}
export function buildYellowBoxGeometry(features,groundAt,projector=project){
 const position=[];let count=0;
 for(const f of features){if(f.review!=='image-reviewed')continue;const p=f.polygon.map(v=>projector(v[0],v[1]));const rings=yellowBoxRings(p,{angles:f.displayAngles??[45,135]});if(!rings.length)continue;count++;
  for(const ring of rings)for(let i=1;i<ring.length-1;i++)for(const k of [0,i+1,i]){const [x,z]=ring[k];position.push(x,groundAt(x,z)+.128,z);}
 }return {position:new Float32Array(position),count};
}
export function addYellowBoxes({T,scene,data,ground}){
 const group=new T.Group();group.name='Yellow box markings: 2025 image interpretation';const built=buildYellowBoxGeometry(data.features,(x,z)=>ground.at(x,z));
 if(built.position.length){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(built.position,3));g.computeVertexNormals();g.computeBoundingSphere();const m=new T.Mesh(g,new T.MeshStandardMaterial({color:'#eabb32',roughness:.9,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-9,polygonOffsetUnits:-9}));m.receiveShadow=true;group.add(m);}
 scene.add(group);return {group,count:built.count};
}
