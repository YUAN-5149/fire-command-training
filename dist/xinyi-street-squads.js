// 信義街景・分隊（訓練示意）：3 個分隊，每分隊 2 部水箱車、4–5 人（分隊長、小隊長、隊員）。
// 派遣後自動出勤，沿駕駛路網行駛到火場附近，於右側車道順向停車、人員下車待命；中隊長以分隊指揮面板下達任務
// （待命、外部射水、供水、室內進攻、室內搜索、撤離）。駐地位置、出勤時間、車速、水量與停車點皆為示意，
// 不是實際消防分隊位置或派遣規定；自動駕駛只沿路網中心線前進並在前方有車或人時停等，未做完整避障。
import * as T from 'three';

export const SQUAD={count:3,vehicles:2,turnout:30,speed:11,water:2000,flow:6,knock:.05,stagingMin:12,stagingMax:70,spacing:11,laneOffset:2.2,homeMin:320,homeMax:700};
// 分隊人員（制服依 MASTER SPEC：隊員深藍；小隊長一圈紅帶；分隊長兩圈紅帶）。size 4 時不含分隊長。
export function squadCrew(size=5){return size>=5?['分隊長','小隊長','隊員','隊員','隊員']:['小隊長','隊員','隊員','隊員'];}
export const SQUAD_NAMES=['第一分隊','第二分隊','第三分隊'];

// 路網邊（去重）。graph：{nodes:[{x,z}], adj:[[ [v,w], … ], …]}
export function graphEdges(graph){const out=[];graph.adj.forEach((list,u)=>{for(const [v] of list)if(u<v)out.push([graph.nodes[u],graph.nodes[v]]);});return out;}
// 候選停車點：沿路網中心線取樣，往行車方向右側偏移（臺灣靠右，順向），車身三個圓不壓建物。
// 回傳依「離起火面距離偏好 15–40 m、位於起火面這一側」排序後，彼此間距 ≥ spacing 的 n 個停車點。
export function stagingPoses(site,graph,free,n,{min=SQUAD.stagingMin,max=SQUAD.stagingMax,spacing=SQUAD.spacing,existing=[],offset=SQUAD.laneOffset}={}){
 const cands=[];
 for(const [a,b] of graphEdges(graph)){const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<4)continue;
  for(let s=2;s<=len-2;s+=3){const cx=a.x+dx*s/len,cz=a.z+dz*s/len,d=Math.hypot(cx-site.x,cz-site.z);if(d<min-4||d>max+4)continue;
   for(const dir of [1,-1]){const h=Math.atan2(-dx*dir,-dz*dir),rx=Math.cos(h),rz=-Math.sin(h),x=cx+rx*offset,z=cz+rz*offset,dist=Math.hypot(x-site.x,z-site.z),front=(x-site.x)*site.nx+(z-site.z)*site.nz;
    if(dist<min||dist>max||front<-4)continue;const fx=-Math.sin(h),fz=-Math.cos(h);if(![-2.4,0,2.4].every(o=>free(x+fx*o,z+fz*o,1.5)))continue;
    cands.push({x,z,heading:h,dist,score:Math.abs(dist-25)+(front<0?20:0)});}}}
 cands.sort((p,q)=>p.score-q.score);const out=[],taken=[...existing];
 for(const c of cands){if(taken.some(t=>Math.hypot(t.x-c.x,t.z-c.z)<spacing))continue;out.push(c);taken.push(c);if(out.length>=n)break;}
 return out;
}
// 分隊駐地（示意）：離火場 homeMin–homeMax、方向盡量分散的路網節點。
export function homePositions(site,graph,n,{min=SQUAD.homeMin,max=SQUAD.homeMax}={}){
 const nodes=graph.nodes.map((p,i)=>({...p,i,d:Math.hypot(p.x-site.x,p.z-site.z),a:Math.atan2(p.z-site.z,p.x-site.x)})).filter(p=>p.d>=min&&p.d<=max&&graph.adj[p.i].length);
 const out=[];for(let k=0;k<n;k++){const want=-Math.PI+(k+.5)*2*Math.PI/n;let best=null;for(const p of nodes){if(out.some(o=>Math.hypot(o.x-p.x,o.z-p.z)<120))continue;const da=Math.abs(Math.atan2(Math.sin(p.a-want),Math.cos(p.a-want)));const sc=da*200+Math.abs(p.d-(min+max)/2)*.2;if(!best||sc<best.sc)best={...p,sc};}if(best)out.push({x:best.x,z:best.z});}
 return out;
}
// 折線往行進方向右側平移（車道），端點保留。
export function offsetRight(points,off=SQUAD.laneOffset){if(points.length<2)return points.map(p=>[...p]);return points.map((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;if(i===0||i===points.length-1)return [...p];return [p[0]-dz/l*off,p[1]+dx/l*off];});}
// 折線取樣（2D）：回傳 {x,z,heading,done}
export function along(points,s){let rest=Math.max(0,s);for(let i=1;i<points.length;i++){const [ax,az]=points[i-1],[bx,bz]=points[i],l=Math.hypot(bx-ax,bz-az);if(rest<=l){const k=l?rest/l:1;return {x:ax+(bx-ax)*k,z:az+(bz-az)*k,heading:Math.atan2(-(bx-ax),-(bz-az)),done:false};}rest-=l;}
 const [ax,az]=points.at(-2)??points[0],[bx,bz]=points.at(-1);return {x:bx,z:bz,heading:Math.atan2(-(bx-ax),-(bz-az)),done:true};}
export const polyLength=points=>points.slice(1).reduce((a,p,i)=>a+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
// 室內任務樓層：進攻取仍在燃燒、尚無分隊進攻的樓層（起火層優先）；搜索取尚無人搜索的樓層（起火層上一層優先，其次起火層、再下層）。
export function pickFloor(task,{fireFloor,floors,burning={},assigned=[]}){
 const taken=new Set(assigned.filter(a=>a.task===task).map(a=>a.floor));
 if(task==='attack'){const order=[fireFloor,fireFloor+1,fireFloor-1].filter(f=>floors.includes(f)&&burning[f]>0&&!taken.has(f));return order[0]??null;}
 const order=[fireFloor+1,fireFloor,...floors.filter(f=>f<fireFloor).reverse()].filter(f=>floors.includes(f)&&!taken.has(f));return order[0]??null;
}

// ---------- 3D 與行為 ----------
export function createSquads({scene,template,createPerson,ground,colliders,graph,life,beaconMatch=/beacon|warning|LED strip|red.*lens|emergency.*lens|red.*flasher/i}){
 const squads=[];let size=5;
 const mkVehicle=(sq,k)=>{const root=new T.Group(),model=template.clone(true);model.rotation.y=-Math.PI/2;root.add(model);const beacons=[];
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(beaconMatch.test(o.material?.name||'')){o.material=o.material.clone();o.material.color?.set('#c61f16');o.material.emissive?.set('#ff180a');beacons.push(o.material);}}});
  const tag=label(`${sq.name} ${k+1} 號車`,sq.color);tag.position.y=4.3;root.add(tag);scene.add(root);root.visible=false;
  return {sq,k,root,beacons,x:0,z:0,heading:0,v:0,path:null,s:0,len:0,state:'home',water:SQUAD.water,siren:false};};
 const COLORS=['#58a6ff','#3fb950','#e3b341'];
 function build(n=SQUAD.count){for(const sq of squads){for(const v of sq.vehicles)scene.remove(v.root);for(const p of sq.people)scene.remove(p.g);scene.remove(sq.water3d);scene.remove(sq.hose);}squads.length=0;
  for(let i=0;i<n;i++){const sq={i,name:SQUAD_NAMES[i]??`第${i+1}分隊`,color:COLORS[i%3],vehicles:[],people:[],task:'home',floor:null,log:[],arrived:null,dispatched:null};
   sq.vehicles=[0,1].map(k=>mkVehicle(sq,k));sq.people=squadCrew(size).map((rank,j)=>{const g=new T.Group();scene.add(g);g.visible=false;const p=createPerson(g,rank);p.body.traverse(o=>{if(o.isMesh)o.castShadow=true;});return {g,p,rank,j,x:0,z:0,heading:0,walk:0,goal:null,inside:false};});
   const wg=new T.BufferGeometry();wg.setAttribute('position',new T.BufferAttribute(new Float32Array(90*3),3));sq.water3d=new T.Points(wg,new T.PointsMaterial({color:'#cfe9ff',size:.45,transparent:true,opacity:.8,depthWrite:false}));sq.water3d.frustumCulled=false;sq.water3d.visible=false;scene.add(sq.water3d);sq.wl=[...Array(90)].map((_,i)=>({t:i/90}));
   sq.hose=new T.Mesh(new T.BufferGeometry(),new T.MeshStandardMaterial({color:'#d8c27a',roughness:.7}));sq.hose.visible=false;scene.add(sq.hose);
   squads.push(sq);}
  return squads;}
 function label(text,color){const c=document.createElement('canvas'),g=c.getContext('2d');g.font='bold 30px sans-serif';const w=Math.ceil(g.measureText(text).width)+28;c.width=w;c.height=48;g.fillStyle='rgba(10,16,22,.78)';g.beginPath();g.roundRect(0,0,w,48,10);g.fill();g.fillStyle=color;g.font='bold 30px sans-serif';g.textBaseline='middle';g.fillText(text,14,25);
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;const s=new T.Sprite(new T.SpriteMaterial({map:t,depthTest:false,transparent:true}));s.scale.set(w/48*.9,.9,1);s.renderOrder=6;return s;}
 const free=(x,z,r)=>!colliders.resolve(x,z,r).hit;
 function place(v,x,z,h){v.x=x;v.z=z;v.heading=h;const fx=-Math.sin(h),fz=-Math.cos(h),yf=ground.at(x+fx*2.3,z+fz*2.3),yr=ground.at(x-fx*2.1,z-fz*2.1);v.root.position.set(x,(yf+yr)/2,z);v.root.rotation.set(Math.atan2(yf-yr,4.4),h,0,'YXZ');}
 // 派遣：各分隊駐地（第一分隊 1 號車由中隊長駕駛，不在此處理）→ 路線 → 停車點。
 function dispatch(site,{playerTruck=null,now=0}={}){
  const homes=homePositions(site,graph,squads.length),poses=stagingPoses(site,graph,free,squads.length*2,{existing:playerTruck?[{x:playerTruck.x,z:playerTruck.z}]:[]});
  squads.forEach((sq,i)=>{sq.task='enroute';sq.dispatched=now;sq.arrived=null;sq.floor=null;sq.log=[{t:now,text:'派遣出勤'}];
   sq.vehicles.forEach((v,k)=>{const pose=poses[i*2+k]??poses.at(-1);v.pose=pose;v.water=SQUAD.water;v.root.visible=true;v.siren=true;
    let start;if(i===0&&playerTruck){const f=[-Math.sin(playerTruck.heading),-Math.cos(playerTruck.heading)];start={x:playerTruck.x-f[0]*(9+k*0),z:playerTruck.z-f[1]*9,heading:playerTruck.heading};v.followPlayer=k===1;}
    else{const h=homes[i]??{x:site.x+300,z:site.z};start={x:h.x+(k?-6:0),z:h.z,heading:0};}
    place(v,start.x,start.z,start.heading);v.delay=i===0?0:SQUAD.turnout+k*4;v.state=i===0&&k===0?'player':'wait';v.path=null;if(v.state==='player')v.root.visible=false;});
   for(const p of sq.people){p.g.visible=false;p.inside=false;p.goal=null;}sq.hose.visible=false;sq.water3d.visible=false;});
  return poses;}
 function route(v){if(!v.pose)return;const r=findRouteSafe(v.x,v.z,v.pose.x,v.pose.z);if(!r){v.path=[[v.x,v.z],[v.pose.x,v.pose.z]];}else v.path=offsetRight(r.points);v.path.push([v.pose.x,v.pose.z]);v.s=0;v.len=polyLength(v.path);v.state='driving';}
 let findRouteSafe=()=>null;
 function arrive(sq,v,now){place(v,v.pose.x,v.pose.z,v.pose.heading);v.state='parked';v.v=0;
  if(sq.vehicles.every(x=>x.state==='parked'||x.state==='player')&&!sq.arrived){sq.arrived=now;sq.task='standby';sq.log.push({t:now,text:'抵達現場、人員下車待命'});
   sq.people.forEach((p,j)=>{const base=sq.i===0?sq.vehicles[1]:sq.vehicles[j<3?0:1],r=[Math.cos(base.heading),-Math.sin(base.heading)],f=[-Math.sin(base.heading),-Math.cos(base.heading)];const q=colliders.resolve(base.x-r[0]*2.4+f[0]*(j%3-1)*1.4,base.z-r[1]*2.4+f[1]*(j%3-1)*1.4,.4);p.x=q.x;p.z=q.z;p.heading=base.heading;p.g.visible=true;p.home={x:p.x,z:p.z};});return true;}
  return false;}
 // 人員步行：直線前往目標並以建物碰撞修正（示意）。
 // 卡在建物轉角超過 3 秒未前進時，直接走向目標（示意，避免卡死）。
 function walk(p,goal,dt,speed=1.6){const dx=goal.x-p.x,dz=goal.z-p.z,l=Math.hypot(dx,dz);if(l<.3){p.stuck=0;return true;}const k=Math.min(l,speed*dt),nx=p.x+dx/l*k,nz=p.z+dz/l*k,q=(p.stuck??0)>3?{x:nx,z:nz}:colliders.resolve(nx,nz,.35);
  const moved=Math.hypot(q.x-p.x,q.z-p.z);p.stuck=moved<k*.3?(p.stuck??0)+dt:Math.max(0,(p.stuck??0)-dt);p.x=q.x;p.z=q.z;p.heading=Math.atan2(-dx,-dz);p.walk+=dt*speed*3;return false;}
 function drawPerson(p,moving,pose){p.g.position.set(p.x,ground.at(p.x,p.z),p.z);p.p.body.rotation.y=p.heading;const sw=moving?Math.sin(p.walk)*.45:0;p.p.legs[0].rotation.x=sw;p.p.legs[1].rotation.x=-sw;p.p.arms.forEach(a=>a.rotation.x=pose==='spray'?-1.3:-sw*.8);p.p.nozzle.visible=pose==='spray';}
 const tube=(mesh,pts)=>{if(pts.length<2){mesh.visible=false;return;}mesh.geometry.dispose();mesh.geometry=new T.TubeGeometry(new T.CatmullRomCurve3(pts),Math.max(8,pts.length*6),.05,6,false);mesh.visible=true;};
 const att=sq=>attackers(sq),attackers=sq=>sq.people.slice(sq.people.length>=5?1:0,sq.people.length>=5?3:2),runner=sq=>sq.people.at(-1);
 // 下達任務。ctx：{site, entry, hydrants, now, floors:{…}, enterIndoor(sq,task,floor), recallIndoor(sq), note(sq,text)}
 function order(sq,task,ctx){if(!sq.arrived){ctx.note?.(sq,`${sq.name}尚未抵達現場`);return false;}
  if(sq.task==='attack'||sq.task==='search'){if(task===sq.task)return false;ctx.recallIndoor?.(sq);}
  for(const p of sq.people){p.goal=null;if(!p.inside)p.g.visible=true;}sq.supply=null;sq.hose.visible=false;sq.hose2?.visible&&(sq.hose2.visible=false);sq.water3d.visible=false;sq.floor=null;
  if(task==='attack'||task==='search'){const f=ctx.pickFloor(task,sq);if(f==null){ctx.note?.(sq,task==='attack'?'目前沒有需要室內進攻的樓層（或已有分隊進攻）':'所有樓層已有分隊搜索');return false;}sq.floor=f;for(const p of attackers(sq))p.goal={x:ctx.entry.x,z:ctx.entry.z};}
  else if(task==='ext'){sq.extV=[...sq.vehicles].filter(v=>v.state!=='player').sort((a,b)=>Math.hypot(a.x-ctx.site.x,a.z-ctx.site.z)-Math.hypot(b.x-ctx.site.x,b.z-ctx.site.z))[0];const tx=-ctx.site.nz,tz=ctx.site.nx,o=(sq.i-1)*3.2,gx=ctx.site.x+ctx.site.nx*12+tx*o,gz=ctx.site.z+ctx.site.nz*12+tz*o;attackers(sq).forEach((p,j)=>{const q=colliders.resolve(gx+tx*j*1.1,gz+tz*j*1.1,.4);p.goal={x:q.x,z:q.z};});}
  else if(task==='supply'){// 取離消防栓最近的分隊車與離該車最近的人員。
   let best=null;for(const v of sq.vehicles){if(v.state==='player')continue;for(const h of ctx.hydrants){const d=Math.hypot(h.x-v.x,h.z-v.z);if(!best||d<best.d)best={v,h,d};}}
   if(!best||best.d>80){ctx.note?.(sq,'80 m 內沒有示意消防栓，無法供水');return false;}const {v,h}=best,r=[...sq.people].filter(p=>!att(sq).includes(p)||true).sort((a,b)=>Math.hypot(a.x-v.x,a.z-v.z)-Math.hypot(b.x-v.x,b.z-v.z))[0];sq.supply={h,v,connected:false,runner:r};r.goal=[{x:v.x,z:v.z},{x:h.x+1,z:h.z}];}
  else if(task==='standby'||task==='withdraw')for(const p of sq.people)p.goal=p.home?{...p.home}:null;
  sq.task=task;sq.log.push({t:ctx.now,text:{standby:'待命',ext:'外部射水',supply:'消防栓供水',attack:`室內進攻（${sq.floor} 樓）`,search:`室內搜索（${sq.floor} 樓）`,withdraw:'撤離至車旁'}[task]});return true;}
 function returnFromIndoor(sq,entry){for(const p of attackers(sq)){p.inside=false;p.x=entry.x;p.z=entry.z;p.g.visible=true;p.goal=p.home?{...p.home}:null;}sq.task='standby';sq.floor=null;}
 // 每幀：行駛、人員移動與任務效果。ctx 另含 blockers()、target(x,z)、knock(fire,amount,sq)、relay(sq,on)、playerDeparted
 function update(dt,ctx){
  for(const sq of squads){
   for(const v of sq.vehicles){if(v.state==='player'||v.state==='home')continue;
    for(const m of v.beacons){const on=v.siren&&Math.sin(ctx.t*14+(v.k%2)*Math.PI)>0;m.emissiveIntensity=v.siren?(on?6:.2):1;}
    if(v.state==='wait'){if(v.followPlayer?ctx.playerDeparted:(v.delay-=dt)<=0)route(v);continue;}
    if(v.state!=='driving')continue;
    const fx=-Math.sin(v.heading),fz=-Math.cos(v.heading),rx=Math.cos(v.heading),rz=-Math.sin(v.heading);let blocked=false;
    for(const [bx,bz,br] of ctx.blockers(v)){const dx=bx-v.x,dz=bz-v.z,ahead=dx*fx+dz*fz,lat=Math.abs(dx*rx+dz*rz);if(ahead>0&&ahead<9+br&&lat<1.6+br){blocked=true;break;}}
    v.wait=blocked?(v.wait??0)+dt:0;if(v.wait>6)blocked=false;// 停等過久（示意）：視為讓道完成繼續前進
    const target=blocked?0:(v.len-v.s<25?4:SQUAD.speed);v.v+=Math.max(-8*dt,Math.min(3*dt,target-v.v));v.s+=v.v*dt;
    const q=along(v.path,v.s);const dh=Math.atan2(Math.sin(q.heading-v.heading),Math.cos(q.heading-v.heading));place(v,q.x,q.z,v.heading+dh*Math.min(1,dt*6));
    if(q.done&&arrive(sq,v,ctx.now)){ctx.onArrive?.(sq);}}
   // 人員
   const att=attackers(sq);let spraying=false;
   for(const p of sq.people){if(p.inside||!p.g.visible)continue;let moving=false;
    if(p.goal){const g=Array.isArray(p.goal)?p.goal[0]:p.goal;moving=!walk(p,g,dt,2.4);if(!moving&&Array.isArray(p.goal)&&p.goal.length>1){p.goal.shift();moving=true;}else if(!moving){if((sq.task==='attack'||sq.task==='search')&&att.includes(p)&&Math.hypot(p.x-ctx.entry.x,p.z-ctx.entry.z)<.5){p.inside=true;p.g.visible=false;if(att.every(a=>a.inside))ctx.enterIndoor?.(sq,sq.task,sq.floor);}p.goal=null;}}
    let pose=null;if(sq.task==='ext'&&att.includes(p)&&!p.goal){const tg=ctx.target(p.x,p.z);if(tg){p.heading=Math.atan2(-(tg.x-p.x),-(tg.z-p.z));if(tg.dist<=22){pose='spray';spraying=tg;}}}
    drawPerson(p,moving,pose);}
   // 外部射水：水來自分隊水箱車（示意 2,000 L、6 L/s）；有消防栓供水時補水。
   const v0=sq.extV??sq.vehicles[sq.i===0?1:0];
   if(sq.task==='ext'){const a=att[0],tp=new T.Vector3(v0.x,ground.at(v0.x,v0.z)+.6,v0.z);tube(sq.hose,[tp,...att.filter(p=>!p.goal).map(p=>new T.Vector3(p.x,ground.at(p.x,p.z)+.2,p.z))]);
    if(spraying&&v0.water>0){v0.water=Math.max(0,v0.water-SQUAD.flow*dt);ctx.knock(spraying.fire,SQUAD.knock*dt,sq);const o=new T.Vector3(a.x,ground.at(a.x,a.z)+1.2,a.z),e=new T.Vector3(spraying.x,spraying.y,spraying.z),pos=sq.water3d.geometry.attributes.position;
     sq.wl.forEach((w,i)=>{w.t+=dt*1.5;if(w.t>1)w.t-=1;const p=o.clone().lerp(e,w.t);p.y+=Math.sin(Math.PI*w.t)*o.distanceTo(e)*.08;pos.setXYZ(i,p.x,p.y,p.z);});pos.needsUpdate=true;sq.water3d.visible=true;}
    else{sq.water3d.visible=false;if(spraying&&v0.water<=0&&!sq.dryNoted){sq.dryNoted=true;ctx.note?.(sq,`${sq.name}水箱已空：下達「供水」接消防栓`);}}}
   else{sq.water3d.visible=false;if(sq.task!=='supply')sq.hose.visible=false;}
   if(sq.task==='supply'&&sq.supply){const r=sq.supply.runner??runner(sq);if(!r.goal&&!sq.supply.connected){sq.supply.connected=true;sq.log.push({t:ctx.now,text:'已接上消防栓'});ctx.note?.(sq,`${sq.name}已接上消防栓供水`);}
    if(sq.supply.connected){for(const v of sq.vehicles)v.water=Math.min(SQUAD.water,v.water+30*dt);sq.dryNoted=false;const h=sq.supply.h,pts=[new T.Vector3(h.x,ground.at(h.x,h.z)+.3,h.z),new T.Vector3(sq.supply.v.x,ground.at(sq.supply.v.x,sq.supply.v.z)+.6,sq.supply.v.z)];
     const relay=ctx.relay(sq);if(relay)pts.push(new T.Vector3(relay.x,ground.at(relay.x,relay.z)+.6,relay.z));tube(sq.hose,pts);}}}
 }
 const circles=()=>squads.flatMap(sq=>sq.vehicles.filter(v=>v.root.visible&&v.state!=='player'&&v.state!=='home').flatMap(v=>{const f=[-Math.sin(v.heading),-Math.cos(v.heading)];return [-2.4,0,2.4].map(o=>[v.x+f[0]*o,v.z+f[1]*o,1.45]);}));
 const people=()=>squads.flatMap(sq=>sq.people.filter(p=>p.g.visible).map(p=>[p.x,p.z,.4]));
 function hide(){for(const sq of squads){for(const v of sq.vehicles){v.root.visible=false;v.state='home';}for(const p of sq.people){p.g.visible=false;p.inside=false;p.goal=null;}sq.hose.visible=false;sq.water3d.visible=false;sq.task='home';sq.arrived=null;}}
 return {squads,build,dispatch,route,arrive,place,label,order,update,returnFromIndoor,circles,people,hide,attackers,setSize(n){size=n;},get size(){return size;},setRouter(fn){findRouteSafe=fn;},free};
}
