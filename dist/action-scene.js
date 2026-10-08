import {updateInteriorSearch,retreatRoute} from './interior-search.js';
import {surfaceHeight,stairPath} from './walk-surfaces.js';
import {staging} from './staging.js';
import * as T from 'three';
export function createActionScene(scene){
const mat=c=>new T.MeshStandardMaterial({color:c,roughness:.65}),yellow=mat('#c5a253'),stripe=mat('#e4ed95'),black=mat('#202a30'),steel=mat('#9bafb7'),navy=mat('#172b46'),red=mat('#de303b'),helmet=mat('#e9e6d7'),glove=mat('#a59370');
function mesh(g,geo,m,x,y,z){const o=new T.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;g.add(o);return o}
function limb(g,x,y,length,fabric,bands=0){
 const p=new T.Group();p.position.set(x,y,0);g.add(p);
 mesh(p,new T.CapsuleGeometry(.105,length-.2,4,10),fabric,0,-length/2,0);
 mesh(p,new T.CylinderGeometry(.114,.114,.09,12),stripe,0,-length*.78,0);
 mesh(p,new T.CylinderGeometry(.116,.116,.035,12),steel,0,-length*.78,0);
 for(let n=0;n<bands;n++){const band=mesh(p,new T.CylinderGeometry(.117,.117,.055,12),red,0,-.12-n*.085,0);band.userData.rankBand=true;}
 return p;
}
function person(parent,rank,x=0,z=0){
 const fabric=rank==='中隊長'?yellow:navy,bands=rank==='分隊長'?2:rank==='小隊長'?1:0;
 const body=new T.Group();body.name=rank;body.userData.rank=rank;body.position.set(x,0,z);parent.add(body);
 mesh(body,new T.CapsuleGeometry(.23,.37,4,12),fabric,0,1.05,0);
 mesh(body,new T.CylinderGeometry(.25,.25,.095,12),stripe,0,.91,0);
 mesh(body,new T.CylinderGeometry(.252,.252,.033,12),steel,0,.91,0);
 for(const side of [-1,1]){
  mesh(body,new T.BoxGeometry(.055,.23,.018),stripe,side*.135,1.22,-.225);
  mesh(body,new T.BoxGeometry(.025,.23,.021),steel,side*.135,1.22,-.227);
  mesh(body,new T.BoxGeometry(.13,.13,.045),fabric,side*.13,1.03,-.237);
  mesh(body,new T.BoxGeometry(.055,.35,.055),black,side*.19,1.2,.16);
 }
 mesh(body,new T.BoxGeometry(.018,.43,.026),black,0,1.15,-.238);
 mesh(body,new T.SphereGeometry(.17,12,8),black,0,1.56,0);
 mesh(body,new T.SphereGeometry(.24,12,8,0,Math.PI*2,0,Math.PI/2),rank==='中隊長'?stripe:helmet,0,1.62,0);
 mesh(body,new T.CylinderGeometry(.29,.29,.045,12),rank==='中隊長'?stripe:helmet,0,1.62,0);
 mesh(body,new T.BoxGeometry(.24,.16,.08),steel,0,1.53,-.15);
 mesh(body,new T.SphereGeometry(.07,10,8),black,0,1.44,-.205);
 mesh(body,new T.CapsuleGeometry(.13,.4,4,10),steel,0,1.11,.27);
 mesh(body,new T.BoxGeometry(.38,.065,.4),black,0,1.13,.09);
 const legs=[limb(body,-.14,.78,.64,fabric),limb(body,.14,.78,.64,fabric)];
 const boots=legs.map(p=>mesh(p,new T.BoxGeometry(.2,.18,.32),black,0,-.64,-.06));
 const arms=[limb(body,-.32,1.34,.57,fabric,bands),limb(body,.32,1.34,.57,fabric,bands)];
 arms.forEach(p=>mesh(p,new T.SphereGeometry(.105,10,8),glove,0,-.57,0));
 const nozzle=mesh(arms[1],new T.CylinderGeometry(.055,.075,.32,8),steel,0,-.62,0);nozzle.visible=false;
 const beam=new T.Mesh(new T.ConeGeometry(.65,4,16,1,true),new T.MeshBasicMaterial({color:'#fff6bd',transparent:true,opacity:.07,depthWrite:false,side:T.DoubleSide}));
 beam.rotation.x=Math.PI/2;beam.position.set(.32,1,-2.2);body.add(beam);beam.visible=false;
 return {body,arms,legs,boots,nozzle,beam,rank};
}
// Command staff stands separately; operational vehicle staffing remains 4 / 4 / 4 / 2.
const commandRoot=new T.Group();commandRoot.position.set(-17,.175,5.6);scene.add(commandRoot);
const commander=person(commandRoot,'中隊長');commandRoot.rotation.y=-.5;
commandRoot.updateMatrixWorld(true);
commander.body.position.y+=surfaceHeight(-17,5.6,.175)-Math.min(...commander.boots.map(b=>new T.Box3().setFromObject(b).min.y));
const actors=Array.from({length:4},(_,i)=>{const root=new T.Group();root.position.set(...staging[i].crew);scene.add(root);const people=[];
 for(let j=0;j<(i===3?2:4);j++)people.push(person(root,j===0&&i===0?'分隊長':j===0&&i<3?'小隊長':'隊員',j%2*.8-.4,-Math.floor(j/2)*.9));
const ring=mesh(root,new T.TorusGeometry(1.1,.04,8,32),new T.MeshBasicMaterial({color:'#ffb567'}),0,.03,0);ring.rotation.x=-Math.PI/2;const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(new Float32Array(120*3),3));const water=new T.Points(geo,new T.PointsMaterial({color:'#b8eaff',size:.11,transparent:true,opacity:.8,depthWrite:false}));scene.add(water);const hose=new T.Mesh(new T.BufferGeometry(),mat('#e5cf94'));scene.add(hose);return {root,people,water,hose,ring,lastDue:0,route:[],elapsed:0};});
const targets={front:[-3,.3,7],rear:[0,.3,-7],entry:[0,.3,4.8],floor:[0,6.71,2],water:[-13,.3,7],medical:[16,.3,5.8]};
const roleExamples=['隊員','小隊長','分隊長'].map(rank=>actors.flatMap(a=>a.people).find(p=>p.rank===rank));roleExamples.push(commander);
return {actors,commander,roleExamples,createPerson:person,update(dt,t,units,running,selected,onSearch){actors.forEach((a,i)=>{const u=units[i];if(u.searchFloor!==undefined){const event=updateInteriorSearch(a,u,dt,t,running);if(event)onSearch?.(i,event);return}const moving=u.status==='移動中';if(u.due&&u.due!==a.lastDue){a.lastDue=u.due;a.elapsed=0;const p=targets[u.location],end=new T.Vector3(p[0]+(i-1.5)*.5,p[1],p[2]);a.route=a.search?retreatRoute(a):[a.root.position.clone()];const wasSearching=!!a.search;a.search=null;a.people.forEach((p,j)=>p.body.position.set(j%2*.8-.4,0,-Math.floor(j/2)*.9));if(!wasSearching&&a.root.position.y>1)a.route.push(...[...stairPath].reverse().map(p=>new T.Vector3(...p)));if(u.location==='rear')a.route.push(new T.Vector3(7,.3,6),new T.Vector3(7,.3,-6));if(u.location==='floor')a.route.push(new T.Vector3(0,.175,5.5),...stairPath.map(p=>new T.Vector3(...p)));a.route.push(end)}a.ring.visible=i===selected;
if(running&&moving&&a.route.length){a.elapsed=Math.min(12,a.elapsed+dt);const lens=a.route.slice(1).map((v,k)=>v.distanceTo(a.route[k]));let d=lens.reduce((x,y)=>x+y,0)*a.elapsed/12;for(let k=0;k<lens.length;k++){if(d<=lens[k]||k===lens.length-1){const direction=a.route[k+1].clone().sub(a.route[k]);a.root.rotation.y=Math.atan2(-direction.x,-direction.z);a.root.position.lerpVectors(a.route[k],a.route[k+1],Math.min(1,d/(lens[k]||1)));break}d-=lens[k]}}
const active=!moving&&u.task!=='未指派';if(active){if(a.route.length)a.root.position.copy(a.route.at(-1));a.root.rotation.y=u.location==='rear'?Math.PI:0}
a.people.forEach((p,j)=>{const stride=moving?Math.sin(t*8+j*.7)*.55:0;p.legs[0].rotation.x=stride;p.legs[1].rotation.x=-stride;p.arms[0].rotation.x=-stride*.8;p.arms[1].rotation.x=stride*.8;p.body.position.y=moving?Math.abs(Math.sin(t*8))*.035:0;p.body.rotation.set(0,0,0);p.nozzle.visible=false;p.beam.visible=false;if(active&&u.task==='滅火'){p.arms.forEach(v=>v.rotation.x=1.25);p.body.rotation.x=.1;p.nozzle.visible=j===0}if(active&&u.task==='搜索'){p.body.rotation.set(.35,Math.sin(t*1.2+j)*.3,0);p.arms[1].rotation.x=1.4;p.beam.visible=true}if(active&&u.task==='救護'){p.body.position.y=-.3;p.body.rotation.x=.4;p.legs.forEach(v=>v.rotation.x=-.7);p.arms.forEach(v=>v.rotation.x=.9+Math.sin(t*3)*.1)}if(active&&u.task==='供水'){p.body.rotation.x=.22;p.arms.forEach(v=>v.rotation.x=.8+Math.sin(t*2)*.12)}});
a.root.updateMatrixWorld(true);a.people.forEach(p=>{const world=p.body.getWorldPosition(new T.Vector3());let ground=surfaceHeight(world.x,world.z,a.root.position.y);if(moving&&a.root.position.y>.5&&Math.abs(a.root.position.x+3.7)<.4)ground=.31+Math.max(0,Math.min(16,Math.floor((3.175-world.z)/.35)+1))*.2;else if(moving&&a.root.position.y>3.4&&Math.abs(a.root.position.x+2.1)<.4)ground=3.51+Math.max(0,Math.min(16,Math.floor((world.z+2.425)/.35)+1))*.2;const bottoms=p.boots.map(b=>new T.Box3().setFromObject(b).min.y);p.body.position.y+=ground-Math.min(...bottoms);p.body.updateMatrixWorld(true)});a.ring.position.y=surfaceHeight(a.root.position.x,a.root.position.z,a.root.position.y)-a.root.position.y+.025;
a.water.visible=active&&u.task==='滅火'&&u.status==='執行中'&&['front','floor'].includes(u.location);a.hose.visible=u.task==='滅火'||u.task==='供水';if(a.water.visible){const pos=a.water.geometry.attributes.position;for(let n=0;n<120;n++){const q=(t*.65+n/120)%1;pos.setXYZ(n,a.root.position.x+(1.4-a.root.position.x)*q+Math.sin(n*2)*q*.13,a.root.position.y+1.2+(8-a.root.position.y-1.2)*q+Math.sin(q*Math.PI)*2.1,a.root.position.z+(4.5-a.root.position.z)*q+Math.cos(n)*q*.13)}pos.needsUpdate=true;a.water.geometry.computeBoundingSphere()}
if(a.hose.visible){const start=new T.Vector3(...staging[i].hose),end=a.root.position.clone();end.y+=.06;const mid=start.clone().lerp(end,.5);mid.x-=1.2;mid.y=Math.max(.15,end.y*.35);if(!a.hose.userData.end||a.hose.userData.end.distanceTo(end)>.1){a.hose.geometry.dispose();a.hose.geometry=new T.TubeGeometry(new T.CatmullRomCurve3([start,mid,end]),20,.045,6,false);a.hose.userData.end=end}}
});}};
}
