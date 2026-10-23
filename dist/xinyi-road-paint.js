// Sourced curb paths use local metres (east/south). Width, lift and dash cadence are display parameters, not surveys.
export function paintStrips(path,{width=.15,offset=0,dash=null,step=3}={}){
 const rings=[];let distance=0;
 for(let i=1;i<path.length;i++){
  const [ax,az]=path[i-1],[bx,bz]=path[i],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);if(len<1e-6)continue;
  const nx=-dz/len,nz=dx/len;let s=0;
  while(s<len-1e-7){
   const phase=dash?(distance+s)%(dash[0]+dash[1]):0;
   const painted=!dash||phase<dash[0]-1e-7;
   const boundary=dash?(painted?dash[0]:dash[0]+dash[1])-phase:len-s;
   const end=Math.min(len,s+step,s+Math.max(1e-6,boundary));
   if(painted){const p=(d,o)=>[ax+dx*d/len+nx*o,az+dz*d/len+nz*o];rings.push([...p(s,offset-width/2),...p(end,offset-width/2),...p(end,offset+width/2),...p(s,offset+width/2)]);}
   s=end;
  }distance+=len;
 }return rings;
}
// Only explicit mapped divider types; a lane count alone cannot establish yellow-line type.
export function explicitDivider(features,project){
 const result=[];
 for(const f of features){if(f.kind!=='road'||['yes','1','-1'].includes(f.tags?.oneway))continue;
  const type=f.tags?.divider;if(!['double_solid_line','solid_line','dashed_line'].includes(type))continue;
  for(const path of f.paths)for(const offset of type==='double_solid_line'?[-.12,.12]:[0])result.push({kind:'yellow',source:'OSM divider='+type,rings:paintStrips(path.map(p=>project(p[0],p[1])),{offset,width:.12,dash:type==='dashed_line'?[4,6]:null})});
 }return result;
}
export function addRoadPaint({T,scene,data,ground}){
 const root=new T.Group();root.name='Official curb snapshot 2024-07-12';
 const chunks=new Map();
 for(const f of data.features){if(!['red','yellow'].includes(f.kind))continue;
  for(const r of paintStrips(f.path)){
   const key=f.kind+':'+Math.floor(r[0]/400)+':'+Math.floor(r[1]/400);let part=chunks.get(key);if(!part){part={kind:f.kind,position:[]};chunks.set(key,part);}
   for(const k of [0,1,2,0,2,3]){const x=r[k*2],z=r[k*2+1];part.position.push(x,ground.at(x,z)+.145,z);}
  }
 }
 const mats={red:new T.MeshStandardMaterial({color:'#d3272d',roughness:.85,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6}),yellow:new T.MeshStandardMaterial({color:'#f0be21',roughness:.85,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6})};
 for(const {kind,position} of chunks.values()){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(position,3));g.computeVertexNormals();g.computeBoundingSphere();const m=new T.Mesh(g,mats[kind]);m.receiveShadow=true;m.name='official curb '+kind;root.add(m);}
 root.userData.source=data.source;scene.add(root);return root;
}

// Extend the existing display terrain outside the curated core; the clamped interpolation is explicitly not DEM.
export function outerGroundGeometry({bbox,coreBbox,project,ground,step=32}){
 const [x0,z1]=project(bbox[0],bbox[1]),[x1,z0]=project(bbox[2],bbox[3]);
 const [cx0,cz1]=project(coreBbox[0],coreBbox[1]),[cx1,cz0]=project(coreBbox[2],coreBbox[3]);
 const axis=(lo,hi,edges)=>[...new Set([lo,hi,...edges.filter(v=>v>lo&&v<hi),...Array.from({length:Math.ceil((hi-lo)/step)},(_,i)=>Math.min(hi,lo+i*step))])].sort((a,b)=>a-b);
 const xs=axis(x0,x1,[cx0,cx1]),zs=axis(z0,z1,[cz0,cz1]),position=[];
 for(let j=1;j<zs.length;j++)for(let i=1;i<xs.length;i++){
  const a=xs[i-1],b=xs[i],c=zs[j-1],d=zs[j];if((a+b)/2>cx0&&(a+b)/2<cx1&&(c+d)/2>cz0&&(c+d)/2<cz1)continue;
  for(const [x,z] of [[a,c],[a,d],[b,c],[b,c],[a,d],[b,d]])position.push(x,ground.at(x,z)-.02,z);
 }return new Float32Array(position);
}
