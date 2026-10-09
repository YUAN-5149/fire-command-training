// 信義街景・消防任務模式（訓練示意）：隨機派遣火警 → 駕駛消防車到場 → 安全位置停車 → 佈水線出水 → 火勢控制。
// 火勢、水量、射程與時間皆為遊戲化示意，非火場物理預測或戰術評分；紀錄只列時間與位置供教官講評。
import * as T from 'three';
import {project} from './xinyi-street-world.js?v=s12';

export const RULES={parkMin:8,parkMax:30,hoseLength:45,reach:22,aimCone:.30,knockdown:.075,growth:.004,arriveRadius:45};

// 起火點：落地、寬 ≥ 6 m、高 ≥ 12 m 且外側 10 m 內有車道道路的牆面；起火樓層 2–5 樓（以 3.4 m 一層估算，示意）。
// colliders：用來確認起火面與街道之間沒有其他量體遮擋（官方量體常有裙樓包覆內側牆面）。
function faceCandidates(buildings,features,{exclude=new Set(),minHeight=12}={}){
 const roads=[];for(const f of features){if(f.kind!=='road'||!(f.width>=5))continue;for(const path of f.paths)for(let i=1;i<path.length;i++){const [ax,az]=project(...path[i-1]),[bx,bz]=project(...path[i]);roads.push([ax,az,bx,bz,f.width/2,f.tags.name??'']);}}
 const near=(x,z)=>{let best=null,bd=Infinity;for(const [ax,az,bx,bz,h,name] of roads){const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2)),d=Math.hypot(x-ax-dx*t,z-az-dz*t)-h;if(d<bd){bd=d;best=name;}}return {d:bd,name:best};};
 const candidates=[];
 for(const b of buildings){if(exclude.has(b.id))continue;let base=Infinity,top=0;for(const w of b.walls){base=Math.min(base,w.a[2],w.b[2]);top=Math.max(top,w.h);}if(top<minHeight)continue;
  for(const w of b.walls){if(w.w<6||Math.max(w.a[2],w.b[2])>base+.4)continue;const [ax,az]=project(w.a[0],w.a[1]),[bx,bz]=project(w.b[0],w.b[1]),mx=(ax+bx)/2,mz=(az+bz)/2;if(Math.hypot(mx,mz)>430)continue;
   const l=Math.hypot(w.n[0],w.n[1])||1,nx=w.n[0]/l,nz=-w.n[1]/l,r=near(mx+nx*10,mz+nz*10);if(r.d>4)continue;
   candidates.push({buildingId:b.id,x:mx,z:mz,nx,nz,base,height:Math.min(top,w.h),wall:[ax,az,bx,bz],street:r.name});}}
 return candidates;
}
const cross=(ax,az,bx,bz,cx,cz,dx,dz)=>{const d=(bx-ax)*(dz-cz)-(bz-az)*(dx-cx);if(Math.abs(d)<1e-9)return false;const u=((cx-ax)*(dz-cz)-(cz-az)*(dx-cx))/d,v=((cx-ax)*(bz-az)-(cz-az)*(bx-ax))/d;return u>0&&u<1&&v>0&&v<1;};
const exposedTo=colliders=>c=>!colliders||!colliders.segs.some(([ax,az,bx,bz])=>cross(c.x+c.nx*.4,c.z+c.nz*.4,c.x+c.nx*10,c.z+c.nz*10,ax,az,bx,bz));

export function pickFireSite(buildings,features,ground,rand=Math.random,{exclude=new Set(),colliders=null,building=null}={}){
 let candidates=faceCandidates(buildings,features,{exclude});if(building!==null)candidates=candidates.filter(c=>c.buildingId===building);if(!candidates.length)return null;
 const exposed=exposedTo(colliders);
 let c=null;for(let i=0;i<80&&!c;i++){const k=candidates[Math.floor(rand()*candidates.length)];if(exposed(k))c=k;}if(!c)return null;
 const floor=2+Math.floor(rand()*Math.min(4,Math.max(1,Math.floor(c.height/3.4)-1)));
 return {...c,floor,y:c.base+(floor-.5)*3.4,ground:ground.at(c.x+c.nx*6,c.z+c.nz*6)};
}

// 受困救援點：同樣取臨路且未被遮擋的落地牆面，受困樓層 3–8 樓（3.4 m 一層估算，示意）。
// building／awayFrom：協同出勤時指定同一棟建物、且與起火面朝向不同的另一面（需從不同面救援）。
// target 為籃架底板目標：窗口樓板高度、離牆 2 m（籃架需與牆保持淨距）。
export function pickRescueSite(buildings,features,ground,rand=Math.random,{exclude=new Set(),colliders=null,building=null,awayFrom=null,tries=80}={}){
 let candidates=faceCandidates(buildings,features,{exclude,minHeight:14});
 if(building!==null)candidates=candidates.filter(c=>c.buildingId===building&&(!awayFrom||c.nx*awayFrom.nx+c.nz*awayFrom.nz<.3));
 const exposed=exposedTo(colliders),pool=candidates.filter(exposed);if(!pool.length)return null;
 const c=pool[Math.floor(rand()*pool.length)%pool.length],maxFloor=Math.max(3,Math.min(8,Math.floor(c.height/3.4)-1));
 const floor=3+Math.floor(rand()*(maxFloor-2)),slab=c.base+(floor-1)*3.4;
 return {...c,floor,y:slab+1.2,slab,ground:ground.at(c.x+c.nx*6,c.z+c.nz*6),target:{x:c.x+c.nx*2,y:slab,z:c.z+c.nz*2}};
}
// 同一棟建物至少有兩個朝向不同的臨路面，才可做「起火面＋另一面受困」的協同出勤。
export function jointCandidates(buildings,features,{exclude=new Set(),colliders=null}={}){
 const exposed=exposedTo(colliders),by=new Map();
 for(const c of faceCandidates(buildings,features,{exclude,minHeight:14}))if(exposed(c)){if(!by.has(c.buildingId))by.set(c.buildingId,[]);by.get(c.buildingId).push(c);}
 return [...by.entries()].filter(([,fs])=>fs.some(a=>fs.some(b=>a.nx*b.nx+a.nz*b.nz<.3))).map(([id])=>id);
}

// 車道方向：臺灣靠右行駛。雙向道依車輛位於中心線哪一側決定行向；單行道依 OSM 方向。
const DRIVE=new Set(['primary','secondary','tertiary','trunk','unclassified','residential','service']);
export function driveRoads(features){
 const out=[];for(const f of features){if(f.kind!=='road'||!DRIVE.has(f.tags.highway)||!(f.width>=5))continue;const ow=['yes','1','-1'].includes(f.tags.oneway)?(f.tags.oneway==='-1'?-1:1):0;
  for(const path of f.paths)for(let i=1;i<path.length;i++){const [ax,az]=project(...path[i-1]),[bx,bz]=project(...path[i]);if(Math.hypot(bx-ax,bz-az)>.5)out.push({ax,az,bx,bz,half:f.width/2,oneway:ow,name:f.tags.name??''});}}
 return out;
}
function nearestRoad(roads,x,z){let best=null,bd=Infinity;for(const r of roads){const dx=r.bx-r.ax,dz=r.bz-r.az,l2=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((x-r.ax)*dx+(z-r.az)*dz)/l2)),d=Math.hypot(x-r.ax-dx*t,z-r.az-dz*t);if(d<bd){bd=d;best={r,t,d};}}return best;}
// 行向：回傳該位置應有的行車方向單位向量；離車道太遠（廣場、騎樓）回傳 null 不判定。
export function laneDirection(roads,x,z,{margin=2}={}){
 const n=nearestRoad(roads,x,z);if(!n||n.d>n.r.half+margin)return null;const {r}=n,l=Math.hypot(r.bx-r.ax,r.bz-r.az),dx=(r.bx-r.ax)/l,dz=(r.bz-r.az)/l;
 if(r.oneway)return {x:dx*r.oneway,z:dz*r.oneway,oneway:true,name:r.name};
 const side=(x-r.ax)*(-dz)+(z-r.az)*dx;return side>=0?{x:dx,z:dz,oneway:false,name:r.name}:{x:-dx,z:-dz,oneway:false,name:r.name};
}
export function facingTraffic(roads,v){const d=laneDirection(roads,v.x,v.z);if(!d)return {ok:true,checked:false};return {ok:-Math.sin(v.heading)*d.x-Math.cos(v.heading)*d.z>Math.cos(Math.PI*50/180),checked:true};}

// 到場停車位置（自動出勤、任務選址用）：沿車道、順向，距離符合範圍且車身不壓建物；依接近 prefer 距離排序。
export function stagingPoses(site,roads,colliders,{range=[RULES.parkMin,RULES.parkMax],half=3.7,prefer=12}={}){
 const out=[];
 for(const r of roads){const len=Math.hypot(r.bx-r.ax,r.bz-r.az),dx=(r.bx-r.ax)/len,dz=(r.bz-r.az)/len;
  for(let s=0;s<=len;s+=2){const cx=r.ax+dx*s,cz=r.az+dz*s;if(Math.hypot(cx-site.x,cz-site.z)>range[1]+r.half+2)continue;
   for(const side of r.oneway?[1,-1]:[1,-1]){const off=r.oneway?side*Math.max(0,r.half-2):side*r.half/2,x=cx-dz*off,z=cz+dx*off;
    const d=laneDirection(roads,x,z);if(!d)continue;const heading=Math.atan2(-d.x,-d.z),v={x,z,heading};
    const e=evaluateParking(v,site,colliders,{range,half});if(e.ok)out.push({x,z,heading,dist:e.dist,street:r.name,score:Math.abs(e.dist-prefer)});}}}
 return out.sort((a,b)=>a.score-b.score);
}

// 停車評估：靜止、位於作業面外側、與牆面距離在範圍內（水箱車 8–30 m、雲梯車 6–16 m，示意值）、車身四角不壓建物。
// roads 有給時另查順向停車；lights 有給時要求警示燈保持開啟。
export function evaluateParking(truck,site,colliders,{speed=0,range=[RULES.parkMin,RULES.parkMax],half=3.7,roads=null,lights=null}={}){
 const dx=truck.x-site.x,dz=truck.z-site.z,front=dx*site.nx+dz*site.nz,dist=Math.hypot(dx,dz);
 const fx=-Math.sin(truck.heading),fz=-Math.cos(truck.heading),rx=Math.cos(truck.heading),rz=-Math.sin(truck.heading);
 const corners=[[half,1.6],[half,-1.6],[-half,1.6],[-half,-1.6]].map(([f,r])=>[truck.x+fx*f+rx*r,truck.z+fz*f+rz*r]);
 const clear=corners.every(([x,z])=>!colliders.resolve(x,z,.3).hit);
 const issues=[];
 if(Math.abs(speed)>.4)issues.push('車輛尚未停妥');
 if(front<0)issues.push('不在作業面這一側');
 if(dist<range[0])issues.push(`距作業面太近（${dist.toFixed(0)} m，需 ≥ ${range[0]} m）`);
 if(dist>range[1])issues.push(`距作業面太遠（${dist.toFixed(0)} m，需 ≤ ${range[1]} m）`);
 if(!clear)issues.push('車身壓到建物或過度貼近');
 if(roads&&!facingTraffic(roads,truck).ok)issues.push('未順向停車（車頭需與該側車道行向一致）');
 if(lights===false)issues.push('警示燈需保持開啟');
 return {ok:!issues.length,issues,dist};
}

// 出水是否命中：人在射程內、朝向與起火點夾角在錐角內、水線長度足夠。
export function sprayHits(player,aimYaw,site,truck){
 const dx=site.x-player.x,dz=site.z-player.z,dist=Math.hypot(dx,dz);
 const want=Math.atan2(-dx,-dz),diff=Math.abs(Math.atan2(Math.sin(want-aimYaw),Math.cos(want-aimYaw)));
 const hose=Math.hypot(player.x-truck.x,player.z-truck.z);
 return {hit:dist<=RULES.reach&&diff<=RULES.aimCone&&hose<=RULES.hoseLength,dist,diff,hose};
}

// ---------- 視覺 ----------
function spriteTexture(inner,outer){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,inner);r.addColorStop(1,outer);g.fillStyle=r;g.fillRect(0,0,64,64);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
export function createFireFX(scene){
 const N=140,S=160,W=220;
 const mk=(n,tex,size,blending,opacity)=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(n*3),3));const p=new T.Points(g,new T.PointsMaterial({map:tex,size,transparent:true,opacity,depthWrite:false,blending,sizeAttenuation:true}));p.frustumCulled=false;scene.add(p);return p;};
 const flames=mk(N,spriteTexture('rgba(255,236,160,1)','rgba(255,90,10,0)'),4,T.AdditiveBlending,.95);
 const smoke=mk(S,spriteTexture('rgba(70,70,74,.85)','rgba(60,60,64,0)'),7,T.NormalBlending,.55);
 const water=mk(W,spriteTexture('rgba(220,240,255,.95)','rgba(180,220,255,0)'),.9,T.NormalBlending,.8);
 const glow=new T.PointLight('#ff7a2a',0,40,1.6);scene.add(glow);
 const hose=new T.Mesh(new T.BufferGeometry(),new T.MeshStandardMaterial({color:'#d8c27a',roughness:.7}));hose.castShadow=true;scene.add(hose);
 const fl=[...Array(N)].map(()=>({t:Math.random(),u:Math.random()-.5,v:Math.random()-.5})),sm=[...Array(S)].map(()=>({t:Math.random(),u:Math.random()-.5,v:Math.random()-.5})),wa=[...Array(W)].map((_,i)=>({t:i/W}));
 let site=null;
 const fx={
  setSite(s){site=s;const show=!!s;flames.visible=smoke.visible=show;glow.visible=show;if(!show){water.visible=false;hose.visible=false;}},
  update(dt,intensity,{spray=null,hoseFrom=null,hoseTo=null}={}){
   if(!site)return;const p=flames.geometry.attributes.position,q=smoke.geometry.attributes.position,k=Math.max(0,intensity);
   const cx=site.x+site.nx*.6,cz=site.z+site.nz*.6,tx=-site.nz,tz=site.nx;// 沿牆方向
   fl.forEach((f,i)=>{f.t+=dt*(1.2+Math.random()*.6);if(f.t>1){f.t=0;f.u=Math.random()-.5;f.v=Math.random()-.5;}const w=4.5*k,h=f.t*6*k;p.setXYZ(i,cx+tx*f.u*w*(1-f.t*.6)+site.nx*f.v*.8,site.y-1+h,cz+tz*f.u*w*(1-f.t*.6)+site.nz*f.v*.8);});
   sm.forEach((s,i)=>{s.t+=dt*.08*(.6+k*.6);if(s.t>1){s.t=0;s.u=Math.random()-.5;s.v=Math.random()-.5;}const h=s.t*45,spread=2+s.t*14;q.setXYZ(i,cx+tx*s.u*spread+site.nx*(1.5+s.t*6),site.y+1+h,cz+tz*s.u*spread+site.nz*(1.5+s.t*6)+s.v*spread*.4);});
   p.needsUpdate=q.needsUpdate=true;flames.material.size=4*Math.max(.3,k);smoke.material.opacity=.2+.45*Math.min(1,k+.2);
   glow.position.set(cx+site.nx*2,site.y+1,cz+site.nz*2);glow.intensity=k*55*(0.85+Math.random()*.3);
   // 水柱：拋物線粒子，自噴嘴往瞄準點。
   water.visible=!!spray;if(spray){const a=water.geometry.attributes.position,[o,dir,range]=[spray.origin,spray.dir,spray.range];
    wa.forEach((w,i)=>{w.t+=dt*1.6;if(w.t>1)w.t-=1;const d=w.t*range,j=(Math.sin(i*12.9)*.18)*w.t;a.setXYZ(i,o.x+dir.x*d+j,o.y+dir.y*d+(range*.12)*Math.sin(Math.PI*w.t)+j*.5,o.z+dir.z*d-j);});a.needsUpdate=true;}
   // 水帶：消防車到人員，貼地管線。
   hose.visible=!!(hoseFrom&&hoseTo);if(hose.visible){const curve=new T.CatmullRomCurve3([hoseFrom,hoseFrom.clone().lerp(hoseTo,.33).setY(hoseTo.y-.95),hoseFrom.clone().lerp(hoseTo,.66).setY(hoseTo.y-.95),hoseTo]);hose.geometry.dispose();hose.geometry=new T.TubeGeometry(curve,24,.045,6,false);}
  },
 };
 fx.points={flames,smoke,water};fx.setSite(null);return fx;
}
