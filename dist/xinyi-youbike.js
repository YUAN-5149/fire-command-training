import {createRoadGuard,auditStationLayout,candidateSlots} from './xinyi-youbike-placement.js?v=road-audit-20261027';
import * as T from 'three';
import {frontageSlots,EOC_PHOTO_REVIEW} from './xinyi-eoc-frontage.js?v=photo-20261027';
import {project} from './xinyi-street-world.js';

// Official point anchors and dock totals; row arrangement and parked bicycle occupancy are illustrative, NOT surveyed.
export function stationPlacements(data,features=[],{eocAnchor=null,laneData=null,roadFeatures=features}={}){
 const segments=[];
 for(const f of features){if(f.kind!=='road')continue;for(const path of f.paths??[])for(let i=1;i<path.length;i++){
  const [ax,az]=project(...path[i-1]),[bx,bz]=project(...path[i]);const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz;if(l2>1)segments.push({ax,az,dx,dz,l2});
 }}
 const guard=createRoadGuard(roadFeatures,laneData);return data.stations.map(s=>{const [x,z]=project(s.longitude,s.latitude);let distance=45,heading=0;
  for(const q of segments){const t=Math.max(0,Math.min(1,((x-q.ax)*q.dx+(z-q.az)*q.dz)/q.l2)),d=Math.hypot(x-q.ax-t*q.dx,z-q.az-t*q.dz);if(d<distance){distance=d;heading=-Math.atan2(q.dz,q.dx);}}
  const reviewed=s.id===EOC_PHOTO_REVIEW.stationId&&eocAnchor?{slots:frontageSlots(s.capacity),visualX:project(eocAnchor.lon,eocAnchor.lat)[0],visualZ:project(eocAnchor.lon,eocAnchor.lat)[1],heading:eocAnchor.heading*Math.PI/180,headingStatus:'photo-direction-model-frame',layoutStatus:EOC_PHOTO_REVIEW.status}:null;
  const result={...s,x,z,heading,headingStatus:'estimated-road-tangent',dockCount:s.capacity,bikeCount:Math.round(s.capacity*.65),columns:s.capacity<=20?s.capacity:Math.min(32,Math.ceil(s.capacity/2)),...reviewed};if(reviewed)result.bikeCount=result.slots.filter(p=>p.occupied).length;result.layoutAudit=auditStationLayout(result,guard);result.renderable=!!reviewed&&result.slots.length>0&&s.enabled!==false&&guard.count>0&&result.layoutAudit.clear;result.visualStatus=!reviewed?'pending-layout-review':!guard.count?'road-data-unavailable':!result.layoutAudit.clear?'road-overlap-blocked':s.enabled===false?'station-disabled':'photo-layout-road-clear';return result;
 });
}
function kit(){
 const positions=[],normals=[],colors=[];
 function add(geometry,color,position=[0,0,0],quaternion=new T.Quaternion()){
  const g=(geometry.index?geometry.toNonIndexed():geometry.clone());g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...position),quaternion,new T.Vector3(1,1,1)));const p=g.getAttribute('position'),n=g.getAttribute('normal'),c=new T.Color(color);
  for(let i=0;i<p.count;i++){positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));colors.push(c.r,c.g,c.b);}g.dispose();geometry.dispose();
 }
 function box(size,pos,color){add(new T.BoxGeometry(...size),color,pos);}
 function bar(a,b,r,color){const av=new T.Vector3(...a),bv=new T.Vector3(...b),d=bv.clone().sub(av);add(new T.CylinderGeometry(r,r,d.length(),6),color,av.add(bv).multiplyScalar(.5).toArray(),new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()));}
 function finish(){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeBoundingBox();g.computeBoundingSphere();return g;}
 return {add,box,bar,finish};
}
export function stationGeometry(){
 const dock=kit();dock.box([.24,.08,.35],[0,.04,0],'#545a60');dock.bar([0,.08,0],[0,.82,0],.07,'#e9b50e');dock.box([.21,.24,.17],[0,.85,0],'#f6c72a');dock.box([.14,.1,.01],[0,.9,.091],'#24313b');dock.box([.16,.06,.14],[0,.75,-.11],'#42484e');
 const bike=kit(),white='#ece8d8',yellow='#e6aa13',dark='#263039',silver='#9aa7ab';
 // Bike runs along local Z; wheel axles along X, with basket at front.
 for(const z of [-.62,.62]){
  bike.add(new T.TorusGeometry(.30,.04,5,16),dark,[0,.34,z],new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/2));
  bike.add(new T.TorusGeometry(.255,.014,4,16),silver,[0,.34,z],new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/2));
  for(let i=0;i<8;i++){const t=i*Math.PI/4;bike.bar([0,.34,z],[0,.34+Math.cos(t)*.25,z+Math.sin(t)*.25],.006,silver);}
  bike.bar([-.06,.34,z],[.06,.34,z],.035,dark);
 }
 bike.bar([0,.34,-.62],[0,.38,-.1],.034,white);bike.bar([0,.38,-.1],[0,.80,-.32],.042,white);bike.bar([0,.80,-.32],[0,.34,-.62],.027,white);
 bike.bar([0,.38,-.1],[0,.40,.23],.05,white);bike.bar([0,.40,.23],[0,.88,.53],.044,white);bike.bar([0,.88,.53],[0,.34,.62],.03,silver);
 bike.bar([0,.79,-.32],[0,.94,-.32],.025,dark);bike.box([.23,.075,.30],[0,.97,-.32],dark);
 bike.box([.10,.18,.32],[0,.60,-.50],yellow);bike.bar([0,.86,.53],[0,1.12,.48],.023,silver);bike.bar([-.30,1.12,.48],[.30,1.12,.48],.022,dark);
 bike.bar([-.14,.38,-.1],[.14,.38,-.1],.02,silver);bike.box([.13,.04,.09],[-.18,.38,-.1],dark);bike.box([.13,.04,.09],[.18,.38,-.1],dark);
 bike.box([.38,.035,.30],[0,.86,.78],yellow);
 for(const x of [-.19,.19]){bike.bar([x,.86,.63],[x,1.06,.63],.013,silver);bike.bar([x,.86,.93],[x,1.06,.93],.013,silver);bike.bar([x,1.06,.63],[x,1.06,.93],.013,silver);}
 bike.bar([-.19,1.06,.93],[.19,1.06,.93],.013,silver);bike.bar([-.19,1.06,.63],[.19,1.06,.63],.013,silver);
 bike.box([.07,.055,.04],[0,.79,.96],'#f3f1c6');bike.box([.07,.05,.04],[0,.65,-.79],'#cf3832');
 const beacon=kit();beacon.bar([0,0,0],[0,1.96,0],.045,silver);beacon.box([.6,.58,.08],[0,2.02,0],yellow);
 // A geometric U marker remains legible without a font/texture request.
 for(const z of [-.048,.048]){beacon.bar([-.15,2.20,z],[-.15,1.94,z],.025,dark);beacon.bar([.15,2.20,z],[.15,1.94,z],.025,dark);beacon.bar([-.15,1.94,z],[0,1.87,z],.025,dark);beacon.bar([0,1.87,z],[.15,1.94,z],.025,dark);}
 return {dock:dock.finish(),bike:bike.finish(),beacon:beacon.finish()};
}
export function addYouBikeStations({scene,data,features,ground,eocAnchor=null,laneData=null,roadFeatures=features}){
 const records=stationPlacements(data,features,{eocAnchor,laneData,roadFeatures}),geometries=stationGeometry(),group=new T.Group();group.name='YouBike — reviewed layouts only';scene.add(group);
 const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.8});
 const make=(geometry,n,name)=>{const mesh=new T.InstancedMesh(geometry,material,Math.max(1,n));mesh.count=0;mesh.name=name;mesh.receiveShadow=true;mesh.castShadow=false;mesh.renderOrder=2;group.add(mesh);return mesh;};
 const beacons=make(geometries.beacon,records.length,'YouBike station markers'),docks=make(geometries.dock,records.reduce((n,s)=>n+s.dockCount,0),'Nearby full-capacity docks'),bikes=make(geometries.bike,records.reduce((n,s)=>n+s.bikeCount,0),'Nearby illustrative bicycles');
 const matrix=new T.Matrix4(),quat=new T.Quaternion(),pos=new T.Vector3(),scale=new T.Vector3(1,1,1),up=new T.Vector3(0,1,0);
 // Cache the lower wheel contour once; re-evaluate only when station batches refresh.
 const wheelPoints=[],gp=geometries.bike.attributes.position;for(let i=0;i<gp.count;i++)if(gp.getY(i)<=.341)wheelPoints.push(new T.Vector3().fromBufferAttribute(gp,i));
 const pitchQ=new T.Quaternion(),axisX=new T.Vector3(1,0,0),wheelPoint=new T.Vector3();
 function place(mesh,index,s,lx,lz){const c=Math.cos(s.heading),n=Math.sin(s.heading),x=(s.visualX??s.x)+c*lx+n*lz,z=(s.visualZ??s.z)-n*lx+c*lz;pos.set(x,ground.at(x,z)+.025,z);quat.setFromAxisAngle(up,s.heading);
  if(mesh===bikes){
   // Local Z follows the bicycle. Match front/rear supports before clearing the full tire contour.
   const rear=ground.at(x-n*.62,z-c*.62),front=ground.at(x+n*.62,z+c*.62);
   quat.multiply(pitchQ.setFromAxisAngle(axisX,-Math.atan2(front-rear,1.24)));
   let support=-Infinity;for(const point of wheelPoints){wheelPoint.copy(point).applyQuaternion(quat);support=Math.max(support,ground.at(x+wheelPoint.x,z+wheelPoint.z)-wheelPoint.y);}
   pos.y=support+.008;
  }
  matrix.compose(pos,quat,scale);mesh.setMatrixAt(index,matrix);}
 function refreshMarkers(){let n=0;for(const s of records)if(s.renderable)place(beacons,n++,s,s.slots[0].x-.7,s.slots[0].z);beacons.count=n;beacons.instanceMatrix.needsUpdate=true;beacons.computeBoundingSphere();}
 refreshMarkers();let surfaceRevision=ground.revision;
 let lastX=Infinity,lastZ=Infinity,force=true;const active=new Set();const stats={stations:records.length,reviewed:records.filter(s=>s.renderable).length,pending:records.filter(s=>!s.renderable).length,nearby:0,docks:0,bikes:0,batches:3};
 function update(eye){if(!group.visible)return;if(surfaceRevision!==ground.revision){surfaceRevision=ground.revision;refreshMarkers();force=true;}if(!force&&Math.hypot(eye.x-lastX,eye.z-lastZ)<8)return;force=false;lastX=eye.x;lastZ=eye.z;let dc=0,bc=0;
  for(const s of records){if(!s.renderable){active.delete(s.id);continue;}const near=Math.hypot(s.x-eye.x,s.z-eye.z)<(active.has(s.id)?155:125);if(!near){active.delete(s.id);continue;}active.add(s.id);
   for(const p of candidateSlots(s)){place(docks,dc++,s,p.x,p.z);if(p.occupied)place(bikes,bc++,s,p.x,p.z-.7);}
  }
  docks.count=dc;bikes.count=bc;for(const mesh of [docks,bikes]){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}Object.assign(stats,{nearby:active.size,docks:dc,bikes:bc});
 }
 function setVisible(on){group.visible=!!on;force=true;}
 function nearest(x,z){let best=null,d=Infinity;for(const s of records){const n=Math.hypot(s.x-x,s.z-z);if(n<d){best=s;d=n;}}return best?{...best,distance:d}:null;}
 function markers(x,z){return group.visible?records.filter(s=>Math.hypot(s.x-x,s.z-z)<220).map(s=>({x:s.x,z:s.z,color:'#f3c325',label:'YouBike・'+s.name+(s.renderable?'':'（排列待核對）')})):[];}
 // Replace the old EOC dock sketch only when the matching official station exists.
 function replaceLegacyEoc(root){if(!records.some(s=>s.id==='500112017'))return 0;let count=0;root.traverse(o=>{if(/^(YouBike station|YouBike_station)$/.test(o.name)){o.visible=false;count++;}});return count;}
 return {group,records,stats,beacons,docks,bikes,update,setVisible,nearest,markers,replaceLegacyEoc};
}
