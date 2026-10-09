// 信義街景・消防任務模式（訓練示意）：隨機派遣火警 → 駕駛消防車到場 → 安全位置停車 → 佈水線出水 → 火勢控制。
// 火勢、水量、射程與時間皆為遊戲化示意，非火場物理預測或戰術評分；紀錄只列時間與位置供教官講評。
import * as T from 'three';
import {project} from './xinyi-street-world.js?v=s12';

export const RULES={parkMin:8,parkMax:30,hoseLength:45,reach:22,aimCone:.30,knockdown:.075,growth:.004,arriveRadius:45};

// 起火點：落地、寬 ≥ 6 m、高 ≥ 12 m 且外側 10 m 內有車道道路的牆面；起火樓層 2–5 樓（以 3.4 m 一層估算，示意）。
// colliders：用來確認起火面與街道之間沒有其他量體遮擋（官方量體常有裙樓包覆內側牆面）。
export function pickFireSite(buildings,features,ground,rand=Math.random,{exclude=new Set(),colliders=null}={}){
 const roads=[];for(const f of features){if(f.kind!=='road'||!(f.width>=5))continue;for(const path of f.paths)for(let i=1;i<path.length;i++){const [ax,az]=project(...path[i-1]),[bx,bz]=project(...path[i]);roads.push([ax,az,bx,bz,f.width/2,f.tags.name??'']);}}
 const near=(x,z)=>{let best=null,bd=Infinity;for(const [ax,az,bx,bz,h,name] of roads){const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2)),d=Math.hypot(x-ax-dx*t,z-az-dz*t)-h;if(d<bd){bd=d;best=name;}}return {d:bd,name:best};};
 const candidates=[];
 for(const b of buildings){if(exclude.has(b.id))continue;let base=Infinity,top=0;for(const w of b.walls){base=Math.min(base,w.a[2],w.b[2]);top=Math.max(top,w.h);}if(top<12)continue;
  for(const w of b.walls){if(w.w<6||Math.max(w.a[2],w.b[2])>base+.4)continue;const [ax,az]=project(w.a[0],w.a[1]),[bx,bz]=project(w.b[0],w.b[1]),mx=(ax+bx)/2,mz=(az+bz)/2;if(Math.hypot(mx,mz)>430)continue;
   const l=Math.hypot(w.n[0],w.n[1])||1,nx=w.n[0]/l,nz=-w.n[1]/l,r=near(mx+nx*10,mz+nz*10);if(r.d>4)continue;
   candidates.push({buildingId:b.id,x:mx,z:mz,nx,nz,base,height:Math.min(top,w.h),wall:[ax,az,bx,bz],street:r.name});}}
 if(!candidates.length)return null;
 const cross=(ax,az,bx,bz,cx,cz,dx,dz)=>{const d=(bx-ax)*(dz-cz)-(bz-az)*(dx-cx);if(Math.abs(d)<1e-9)return false;const u=((cx-ax)*(dz-cz)-(cz-az)*(dx-cx))/d,v=((cx-ax)*(bz-az)-(cz-az)*(bx-ax))/d;return u>0&&u<1&&v>0&&v<1;};
 const exposed=c=>!colliders||!colliders.segs.some(([ax,az,bx,bz])=>cross(c.x+c.nx*.4,c.z+c.nz*.4,c.x+c.nx*10,c.z+c.nz*10,ax,az,bx,bz));
 let c=null;for(let i=0;i<80&&!c;i++){const k=candidates[Math.floor(rand()*candidates.length)];if(exposed(k))c=k;}if(!c)return null;
 const floor=2+Math.floor(rand()*Math.min(4,Math.max(1,Math.floor(c.height/3.4)-1)));
 return {...c,floor,y:c.base+(floor-.5)*3.4,ground:ground.at(c.x+c.nx*6,c.z+c.nz*6)};
}

// 由 GIS 部署頁指定的搶救建物與第一正面入口產生起火點：取該量體落地、寬 ≥ 4 m 的牆面，
// 有入口時選最靠近入口且面向入口的牆面（第一正面），否則選最靠近車道的牆面。起火樓層為示意。
export function siteFromBuilding(buildings,features,ground,{id=null,point=null,entrance=null,rand=Math.random}={}){
 const inside=(b,x,z)=>{const r=b.roofs??[];for(let i=0;i+2<r.length;i+=3){const [a,c,d]=[r[i],r[i+1],r[i+2]].map(v=>project(v[0],v[1])),s1=(c[0]-a[0])*(z-a[1])-(c[1]-a[1])*(x-a[0]),s2=(d[0]-c[0])*(z-c[1])-(d[1]-c[1])*(x-c[0]),s3=(a[0]-d[0])*(z-d[1])-(a[1]-d[1])*(x-d[0]);if((s1>=0&&s2>=0&&s3>=0)||(s1<=0&&s2<=0&&s3<=0))return true;}return false;};
 let b=id!=null?buildings.find(v=>String(v.id)===String(id)):null;
 if(!b&&point){const [px,pz]=project(point.longitude,point.latitude);b=buildings.find(v=>inside(v,px,pz));}
 if(!b)return null;
 const roads=[];for(const f of features){if(f.kind!=='road')continue;for(const path of f.paths)for(let i=1;i<path.length;i++){const [ax,az]=project(...path[i-1]),[bx,bz]=project(...path[i]);roads.push([ax,az,bx,bz,(f.width||6)/2,f.tags?.name??'']);}}
 const near=(x,z)=>{let best=null,bd=Infinity;for(const [ax,az,bx,bz,h,name] of roads){const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2)),d=Math.hypot(x-ax-dx*t,z-az-dz*t)-h;if(d<bd){bd=d;best=name;}}return {d:bd,name:best};};
 let base=Infinity,top=0;for(const w of b.walls){base=Math.min(base,w.a[2],w.b[2]);top=Math.max(top,w.h);}
 const [ex,ez]=entrance?project(entrance.longitude,entrance.latitude):[null,null];
 let best=null;
 for(const w of b.walls){if(w.w<4||Math.max(w.a[2],w.b[2])>base+.4)continue;const [ax,az]=project(w.a[0],w.a[1]),[bx,bz]=project(w.b[0],w.b[1]),mx=(ax+bx)/2,mz=(az+bz)/2,l=Math.hypot(w.n[0],w.n[1])||1,nx=w.n[0]/l,nz=-w.n[1]/l;
  let score;if(entrance){const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((ex-ax)*dx+(ez-az)*dz)/l2)),d=Math.hypot(ex-ax-dx*t,ez-az-dz*t),facing=(ex-mx)*nx+(ez-mz)*nz;score=d+(facing<0?50:0);}
  else score=near(mx+nx*6,mz+nz*6).d;
  if(!best||score<best.score)best={score,wall:[ax,az,bx,bz],x:mx,z:mz,nx,nz,height:Math.min(top,w.h)};}
 if(!best)return null;
 const floors=Math.max(1,Math.floor(best.height/3.4)),floor=floors>=2?2+Math.floor(rand()*Math.min(4,Math.max(1,floors-1))):1;
 return {buildingId:b.id,x:best.x,z:best.z,nx:best.nx,nz:best.nz,base,height:best.height,wall:best.wall,street:near(best.x+best.nx*6,best.z+best.nz*6).name,floor,y:base+(floor-.5)*3.4,ground:ground.at(best.x+best.nx*6,best.z+best.nz*6),fromGis:true};
}

// 停車評估：靜止、位於起火面外側、與牆面距離 8–30 m（保留作業與救援空間，示意值）、車身四角不壓建物。
export function evaluateParking(truck,site,colliders,{speed=0}={}){
 const dx=truck.x-site.x,dz=truck.z-site.z,front=dx*site.nx+dz*site.nz,dist=Math.hypot(dx,dz);
 const fx=-Math.sin(truck.heading),fz=-Math.cos(truck.heading),rx=Math.cos(truck.heading),rz=-Math.sin(truck.heading);
 const corners=[[3.7,1.6],[3.7,-1.6],[-3.7,1.6],[-3.7,-1.6]].map(([f,r])=>[truck.x+fx*f+rx*r,truck.z+fz*f+rz*r]);
 const clear=corners.every(([x,z])=>!colliders.resolve(x,z,.3).hit);
 const issues=[];
 if(Math.abs(speed)>.4)issues.push('車輛尚未停妥');
 if(front<0)issues.push('不在起火面這一側');
 if(dist<RULES.parkMin)issues.push(`距起火面太近（${dist.toFixed(0)} m，需 ≥ ${RULES.parkMin} m）`);
 if(dist>RULES.parkMax)issues.push(`距起火面太遠（${dist.toFixed(0)} m，需 ≤ ${RULES.parkMax} m）`);
 if(!clear)issues.push('車身壓到建物或過度貼近');
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
 // 雲梯籃架砲塔：大水霧（寬錐角），由噴嘴口射出。
 const F=320,fog=mk(F,spriteTexture('rgba(235,246,255,.85)','rgba(200,230,255,0)'),1.6,T.NormalBlending,.55),fg=[...Array(F)].map((_,i)=>({t:i/F,u:Math.random()*2-1,v:Math.random()*2-1}));
 const glow=new T.PointLight('#ff7a2a',0,40,1.6);scene.add(glow);
 const hose=new T.Mesh(new T.BufferGeometry(),new T.MeshStandardMaterial({color:'#d8c27a',roughness:.7}));hose.castShadow=true;scene.add(hose);
 const fl=[...Array(N)].map(()=>({t:Math.random(),u:Math.random()-.5,v:Math.random()-.5})),sm=[...Array(S)].map(()=>({t:Math.random(),u:Math.random()-.5,v:Math.random()-.5})),wa=[...Array(W)].map((_,i)=>({t:i/W}));
 let site=null;
 const side=new T.Vector3(),up=new T.Vector3();
 function updateFog(dt,s){fog.visible=!!s;if(!s)return;const a=fog.geometry.attributes.position,{origin:o,dir:d,range}=s;side.crossVectors(d,Math.abs(d.y)>.95?new T.Vector3(1,0,0):new T.Vector3(0,1,0)).normalize();up.crossVectors(side,d).normalize();
  fg.forEach((f,i)=>{f.t+=dt*1.3;if(f.t>1){f.t-=1;f.u=Math.random()*2-1;f.v=Math.random()*2-1;}const r=f.t*range,w=.08+f.t*range*.32;a.setXYZ(i,o.x+d.x*r+(side.x*f.u+up.x*f.v)*w,o.y+d.y*r+(side.y*f.u+up.y*f.v)*w-r*r*.012,o.z+d.z*r+(side.z*f.u+up.z*f.v)*w);});a.needsUpdate=true;fog.material.size=.6+range*.05;}
 const fx={
  setSite(s){site=s;const show=!!s;flames.visible=smoke.visible=show;glow.visible=show;if(!show){water.visible=false;hose.visible=false;fog.visible=false;}},
  update(dt,intensity,{spray=null,hoseFrom=null,hoseTo=null,fogSpray=null}={}){
   updateFog(dt,fogSpray);
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
 fx.points={flames,smoke,water,fog};fx.setSite(null);return fx;
}
