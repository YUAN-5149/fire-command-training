import {paintStrips} from './xinyi-road-paint.js?v=roads-20261023';
import {project} from './xinyi-street-world.js?v=garage-20261023';
// Crossing paths are mapped positions, not measured paint polygons. Black is a dark road surface,
// white is the training stripe pattern. Explicitly unmarked, bridge and tunnel crossings are excluded.
export function buildZebraSurfaces(features,{groundAt=()=>0,projector=project}={}){
 const layers={mapped:{black:[],white:[],ids:[]},review:{black:[],white:[],ids:[]}};
 const append=(out,rings,lift)=>{for(const r of rings)for(const i of [0,2,1,0,3,2]){const x=r[i*2],z=r[i*2+1];out.push(x,groundAt(x,z)+lift,z);}};
 for(const f of features){
  if(f.kind!=='crossing'||!(f.width>0)||f.tags?.['crossing:markings']==='no'||f.tags?.crossing==='unmarked'||f.tags?.bridge==='yes'||f.tags?.tunnel==='yes')continue;
  const layer=f.tags?.['crossing:markings']==='zebra'?layers.mapped:layers.review;
  let present=false;
  for(const path of f.paths){const local=path.map(p=>projector(p[0],p[1]));const black=paintStrips(local,{width:f.width,step:2});if(!black.length)continue;
   append(layer.black,black,.116);append(layer.white,paintStrips(local,{width:f.width,dash:[.55,.55],step:2}),.12);present=true;
  }if(present)layer.ids.push(f.id);
 }
 for(const layer of Object.values(layers)){layer.black=new Float32Array(layer.black);layer.white=new Float32Array(layer.white);}
 return layers;
}
export function addZebraCrossings({T,scene,features,ground}){
 const data=buildZebraSurfaces(features,{groundAt:(x,z)=>ground.at(x,z)}),root=new T.Group();root.name='Pedestrian zebra crossings';
 const groups={};
 for(const [kind,layer] of Object.entries(data)){
  const group=new T.Group();group.name=kind==='mapped'?'OSM zebra-marked crossings':'Mapped crossing positions; stripe pattern pending';group.userData.ids=layer.ids;
  for(const color of ['black','white']){if(!layer[color].length)continue;const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(layer[color],3));g.computeVertexNormals();g.computeBoundingSphere();
   const m=new T.Mesh(g,new T.MeshStandardMaterial({color:color==='white'?'#faf9f3':'#24272a',roughness:.92,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:color==='white'?-8:-7,polygonOffsetUnits:color==='white'?-8:-7}));m.name='zebra '+color;m.receiveShadow=true;group.add(m);
  }groups[kind]=group;root.add(group);
 }
 scene.add(root);return {root,groups,counts:{mapped:data.mapped.ids.length,review:data.review.ids.length}};
}
