import * as T from 'three';
export function addRooftop(parent,height,variant=0,main=false){
const root=new T.Group();root.position.y=height;parent.add(root);const colors=['#527c89','#8c4d40','#709082','#949b95','#3e666d','#a46348'];
const concrete=new T.MeshStandardMaterial({color:'#9d9e90',roughness:.95}),steel=new T.MeshStandardMaterial({color:'#adb8b5',metalness:.7,roughness:.38});
function box(w,h,d,x,y,z,material){const o=new T.Mesh(new T.BoxGeometry(w,h,d),material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;root.add(o);return o}
// Four-sided parapets and continuous slab underneath every addition.
box(11.65,.16,7.7,0,.02,0,concrete);for(const x of [-5.65,5.65])box(.16,.45,7.6,x,.29,0,concrete);for(const z of [-3.7,3.7])box(11.4,.45,.16,0,.29,z,concrete);
function shed(x,z,w,d,base,color,slope){const paint=new T.MeshStandardMaterial({color,metalness:.4,roughness:.67,side:T.DoubleSide});const wall=new T.MeshStandardMaterial({color:'#a2aaa2',roughness:.85});const low=base,high=base+slope;box(w,low-.12,d,x,(low+.12)/2,z,wall);
// Solid wedge closes the gap under the sloping metal roof.
const wedge=new T.BufferGeometry();const a=[x-w/2,low,z-d/2],b=[x+w/2,low,z-d/2],c=[x-w/2,high,z+d/2],e=[x+w/2,high,z+d/2],f=[x-w/2,low,z+d/2],g=[x+w/2,low,z+d/2];const tri=[...a,...f,...c,...b,...e,...g,...c,...f,...g,...c,...g,...e];wedge.setAttribute('position',new T.Float32BufferAttribute(tri,3));wedge.computeVertexNormals();const wm=new T.Mesh(wedge,new T.MeshStandardMaterial({color:'#9ca79e',side:T.DoubleSide,roughness:.85}));wm.castShadow=true;root.add(wm);
const width=w+.35,depth=d+.35,segments=160,vertices=[],indices=[];for(let i=0;i<=segments;i++){const u=i/segments,rx=x-width/2+u*width,rib=Math.cos(u*Math.PI*2*24)*.028;for(const j of [0,1])vertices.push(rx,low+j*slope+.045+rib,z-depth/2+j*depth)}for(let i=0;i<segments;i++){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2)}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();const sheet=new T.Mesh(geo,paint);sheet.castShadow=true;sheet.receiveShadow=true;root.add(sheet);
for(const zz of [-depth/2,depth/2])box(width,.075,.065,x,low+(zz>0?slope:0)+.045,z+zz,steel);for(const xx of [-w/2+.5,w/2-.5]){box(.58,.36,.035,x+xx,.9,z+d/2+.025,new T.MeshStandardMaterial({color:'#526661',roughness:.4}));}box(.09,.08,depth+.2,x+w/2+.22,low+slope/2,z,steel).rotation.x=-Math.atan2(slope,depth);
}
const v=((variant%6)+6)%6;shed(-2.65,.1,4.9,5.6,1.3+(v%3)*.17,colors[v],.28+(v%2)*.12);shed(2.4,1.75,4.4,3.1,1.05+(v%2)*.35,colors[(v+2)%6],.22);
// Exposed service strip, rooftop access and equipment retained between additions.
box(1.8,1.6,1.8,3,.88,-2.5,concrete);box(1.95,.12,1.95,3,1.75,-2.5,concrete);
if(!main){const tank=new T.Mesh(new T.CylinderGeometry(.65,.65,1.15,18),steel);tank.position.set(.2,.76,-2.65);tank.castShadow=true;root.add(tank);for(const y of [.3,1.14]){const band=new T.Mesh(new T.TorusGeometry(.65,.022,6,24),steel);band.rotation.x=Math.PI/2;band.position.set(.2,y,-2.65);root.add(band)}}
return root;
}
