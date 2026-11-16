// 信義街景第 1 階段：路面質感與機車停等區（示意）。
// 1) 柏油車道與人行道鋪磚的程序貼圖，以世界座標當 UV，不改幾何、高程或步行面。
// 2) 依 osm2streets 停止線（每車道一段）合併成路口進口，兩車道以上加繪機車停等區：
//    原停止線當機車停止線，往上游 MOTO_BOX.depth 公尺畫汽車停止線、兩側框線與「機車停等區」字樣。
// 尺寸依臺灣常見配置示意，未逐處現勘；開關在設定面板。純函式可於 Node 測試。

export const MOTO_BOX={depth:3,minWidth:5.5,line:.15,carStop:.4,lift:.047,textDepth:1.6,textMaxWidth:6};
export const SURFACE={asphalt:{scale:6,kinds:['Driving','Shoulder','intersection','Bus','Construction']},paving:{scale:1.2,kinds:['Sidewalk','Footway','corner']}};

const pts=r=>{const p=[];for(let i=0;i<r.length;i+=2)p.push([r[i],r[i+1]]);return p;};
export function pointInRing(x,z,r){let inside=false;for(let i=0,n=r.length/2,j=n-1;i<n;j=i++){const xi=r[2*i],zi=r[2*i+1],xj=r[2*j],zj=r[2*j+1];
 if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)inside=!inside;}return inside;}

// 一段停止線（細長四邊形）→ 中線兩端點。
export function stopAxis(r){const p=pts(r);let best=-1,k=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length],d=Math.hypot(q[0]-p[i][0],q[1]-p[i][1]);if(d>best){best=d;k=i;}}
 const a=p[k],b=p[(k+1)%p.length],c=p[(k+2)%p.length],d=p[(k+3)%p.length];
 // 長邊 a→b 與對邊 c→d（方向相反）；端點取兩短邊中點。
 return {a:[(a[0]+d[0])/2,(a[1]+d[1])/2],b:[(b[0]+c[0])/2,(b[1]+c[1])/2],len:best};}

// 共線且首尾相接的停止線合併為同一路口進口。
export function groupStopLines(rings,{gap=.8,lateral=.5}={}){
 const ax=rings.map(stopAxis).filter(s=>s.len>.5),parent=ax.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
 const dir=s=>{const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],l=Math.hypot(dx,dz);return [dx/l,dz/l];};
 for(let i=0;i<ax.length;i++)for(let j=i+1;j<ax.length;j++){const u=dir(ax[i]),v=dir(ax[j]);if(Math.abs(u[0]*v[1]-u[1]*v[0])>.1)continue;
  const ends=[[ax[i].a,ax[j].a],[ax[i].a,ax[j].b],[ax[i].b,ax[j].a],[ax[i].b,ax[j].b]];if(!ends.some(([p,q])=>Math.hypot(p[0]-q[0],p[1]-q[1])<gap))continue;
  const off=Math.abs((ax[j].a[0]-ax[i].a[0])*-u[1]+(ax[j].a[1]-ax[i].a[1])*u[0]);if(off>lateral)continue;parent[find(i)]=find(j);}
 const groups=new Map();ax.forEach((s,i)=>{const k=find(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(s);});
 return [...groups.values()].map(list=>{const u=dir(list[0]),all=list.flatMap(s=>[s.a,s.b]),t=all.map(p=>p[0]*u[0]+p[1]*u[1]),o=all[0][0]*-u[1]+all[0][1]*u[0];
  const lo=Math.min(...t),hi=Math.max(...t),at=s=>[u[0]*s-u[1]*o,u[1]*s+u[0]*o];return {a:at(lo),b:at(hi),width:hi-lo,lanes:list.length,dir:u};});
}

// 上游方向：以線中點兩側各 probe 公尺、距最近路口多邊形較遠的一側為上游（osm2streets 停止線多在車道中段，兩側都是車道）。
// 兩側距離差不到 1 m 時無法判斷，回傳 null。
export function ringDistance(x,z,r){if(pointInRing(x,z,r))return 0;let best=Infinity;for(let i=0,n=r.length/2,j=n-1;i<n;j=i++){const ax=r[2*j],az=r[2*j+1],bx=r[2*i],bz=r[2*i+1],dx=bx-ax,dz=bz-az,l=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l));best=Math.min(best,Math.hypot(x-ax-dx*t,z-az-dz*t));}return best;}
export function upstreamNormal(g,intersections,probe=3,reach=40){const n=[-g.dir[1],g.dir[0]],m=[(g.a[0]+g.b[0])/2,(g.a[1]+g.b[1])/2];
 const near=intersections.filter(r=>{for(let i=0;i<r.length;i+=2)if(Math.abs(r[i]-m[0])<reach&&Math.abs(r[i+1]-m[1])<reach)return true;return false;});
 if(!near.length)return null;const dist=k=>Math.min(...near.map(r=>ringDistance(m[0]+n[0]*k,m[1]+n[1]*k,r)));
 const plus=dist(probe),minus=dist(-probe);if(Math.abs(plus-minus)<1)return null;return plus>minus?n:[-n[0],-n[1]];}

// 細長矩形 [x0,z0,...]：p→q 中線、寬 w。
export function strip(p,q,w){const dx=q[0]-p[0],dz=q[1]-p[1],l=Math.hypot(dx,dz)||1,nx=-dz/l*w/2,nz=dx/l*w/2;
 return [p[0]+nx,p[1]+nz,q[0]+nx,q[1]+nz,q[0]-nx,q[1]-nz,p[0]-nx,p[1]-nz];}

// 機車停等區：回傳框線環與字樣位置。只處理兩車道以上、上游方向可判斷且整框落在車道內的進口。
// crossings：行人穿越道環（[x0,z0,...]）。OSM 穿越道常位於 osm2streets 停止線上游，
// 此時把機車停止線移到穿越道上游 gap 公尺，停等區再往上游，避免畫在斑馬線上。
export function motoBoxes(data,opt={}){const o={gap:.5,...MOTO_BOX,...opt},laneRings=[...(data.lanes.Driving??[]),...(data.lanes.Bus??[])],crossings=opt.crossings??[];
 const lines=[],texts=[],boxes=[];let skipped=0,shifted=0;
 for(const g of groupStopLines(data.markings.stop??[])){
  if(g.width<o.minWidth||g.lanes<2){skipped++;continue;}
  const n=upstreamNormal(g,data.intersections??[]);if(!n){skipped++;continue;}
  const at=(p,d)=>[p[0]+n[0]*d,p[1]+n[1]*d],u=g.dir;
  const near=crossings.filter(r=>{for(let i=0;i<r.length;i+=2)if(Math.hypot(r[i]-g.a[0],r[i+1]-g.a[1])<g.width+o.depth+20)return true;return false;});
  // 停等區（start→start+depth）與穿越道重疊時，把 start 移到該穿越道上游邊。
  let start=0;
  for(let iter=0;iter<4;iter++){let hit=null;
   for(const r of near){const inBox=[];for(let i=0;i<r.length;i+=2){const dx=r[i]-g.a[0],dz=r[i+1]-g.a[1],along=dx*u[0]+dz*u[1],up=dx*n[0]+dz*n[1];inBox.push({along,up});}
    const across=inBox.some(q=>q.along>-.5&&q.along<g.width+.5)||(Math.min(...inBox.map(q=>q.along))<0&&Math.max(...inBox.map(q=>q.along))>g.width);
    const lo=Math.min(...inBox.map(q=>q.up)),hi=Math.max(...inBox.map(q=>q.up));
    if(across&&hi>start-.05&&lo<start+o.depth+o.carStop)hit=Math.max(hit??-Infinity,hi);}
   if(hit===null)break;start=hit+o.gap;}
  if(start>o.depth*3){skipped++;continue;}
  const a1=at(g.a,start),b1=at(g.b,start),a2=at(g.a,start+o.depth),b2=at(g.b,start+o.depth);
  const inside=[.15,.5,.85].every(f=>{const x=a1[0]+(b1[0]-a1[0])*f+n[0]*o.depth*.6,z=a1[1]+(b1[1]-a1[1])*f+n[1]*o.depth*.6;return laneRings.some(r=>pointInRing(x,z,r));});
  if(!inside){skipped++;continue;}
  const back=start+o.depth+o.carStop/2;
  lines.push(strip(at(g.a,back),at(g.b,back),o.carStop));
  lines.push(strip(a1,a2,o.line),strip(b1,b2,o.line));
  if(start>0){lines.push(strip(at(g.a,start+o.carStop/2),at(g.b,start+o.carStop/2),o.carStop));shifted++;}
  const c=[(a1[0]+b1[0])/2+n[0]*o.depth/2,(a1[1]+b1[1])/2+n[1]*o.depth/2],w=Math.min(g.width*.75,o.textMaxWidth);
  // 字頭朝下游（路口），由上游駕駛方向閱讀。
  texts.push({x:c[0],z:c[1],w,h:o.textDepth,heading:Math.atan2(n[0],n[1])});
  boxes.push({a:a1,b:b1,n,width:g.width,lanes:g.lanes,shift:start});
 }
 return {lines,texts,boxes,skipped,shifted};}

// 世界座標 UV（公尺／scale），不需原幾何有 uv。
export function worldUV(position,scale){const uv=new Float32Array(position.length/3*2);for(let i=0,j=0;i<position.length;i+=3,j+=2){uv[j]=position[i]/scale;uv[j+1]=position[i+2]/scale;}return uv;}

// ---------- 瀏覽器：程序貼圖 ----------
function rng(seed){let s=seed>>>0;return ()=>((s=(s*1664525+1013904223)>>>0)/4294967296);}
function asphaltCanvas(size=512){const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d'),r=rng(7);
 g.fillStyle='rgb(222,222,222)';g.fillRect(0,0,size,size);
 const img=g.getImageData(0,0,size,size),d=img.data;for(let i=0;i<d.length;i+=4){const v=200+r()*40+(r()<.03?25:0)-(r()<.02?40:0);d[i]=d[i+1]=d[i+2]=v;}g.putImageData(img,0,0);
 for(let k=0;k<5;k++){g.fillStyle=`rgba(40,40,44,${.06+r()*.06})`;const x=r()*size,y=r()*size,w=40+r()*120,h=30+r()*90;g.fillRect(x,y,w,h);if(x+w>size)g.fillRect(x-size,y,w,h);if(y+h>size)g.fillRect(x,y-size,w,h);}
 g.strokeStyle='rgba(30,30,32,.35)';g.lineWidth=1;for(let k=0;k<6;k++){let x=r()*size,y=r()*size;g.beginPath();g.moveTo(x,y);for(let s=0;s<8;s++){x+=(r()-.5)*40;y+=(r()-.5)*40;g.lineTo(x,y);}g.stroke();}
 return c;}
function pavingCanvas(size=512){const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d'),r=rng(11),n=4,t=size/n;
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){const v=212+r()*30;g.fillStyle=`rgb(${v},${v-3},${v-8})`;g.fillRect(i*t,j*t,t,t);
  for(let k=0;k<60;k++){const s=r()*25-12;g.fillStyle=`rgba(${s>0?255:0},${s>0?255:0},${s>0?255:0},${Math.abs(s)/120})`;g.fillRect(i*t+r()*t,j*t+r()*t,2,2);}}
 g.strokeStyle='rgba(70,66,60,.55)';g.lineWidth=3;for(let i=0;i<=n;i++){g.beginPath();g.moveTo(i*t,0);g.lineTo(i*t,size);g.stroke();g.beginPath();g.moveTo(0,i*t);g.lineTo(size,i*t);g.stroke();}
 return c;}
function textCanvas(){const c=document.createElement('canvas');c.width=1024;c.height=256;const g=c.getContext('2d');g.clearRect(0,0,1024,256);
 g.fillStyle='#eeeeea';g.font='bold 210px "Noto Sans TC","Microsoft JhengHei",sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('機車停等區',512,136,1000);return c;}

// laneMesh：addLanesToScene 回傳的群組。回傳 {setTextures, group, counts}。
export function addRoadSurface({T,scene,laneMesh,data,ground,crossings=[]}){
 const maps={};const tex=(make,aniso=8)=>{const t=new T.CanvasTexture(make());t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=T.SRGBColorSpace;t.anisotropy=aniso;return t;};
 maps.asphalt=tex(asphaltCanvas);maps.paving=tex(pavingCanvas);
 const targets=[];
 for(const m of laneMesh?.children??[]){const kind=m.name.replace(/^lanes /,'');
  for(const [key,s] of Object.entries(SURFACE))if(s.kinds.includes(kind)){m.geometry.setAttribute('uv',new T.BufferAttribute(worldUV(m.geometry.attributes.position.array,s.scale),2));
   targets.push({m,map:maps[key],color:m.material.color.clone()});}}
 function setTextures(on){for(const t of targets){t.m.material.map=on?t.map:null;
  // 貼圖本身偏亮，開啟時略提亮底色以維持原平均色調。
  t.m.material.color.copy(t.color);if(on)t.m.material.color.multiplyScalar(1.12);t.m.material.needsUpdate=true;}}
 const group=new T.Group();group.name='Xinyi motorcycle waiting boxes (illustrative)';
 const mb=motoBoxes(data,{crossings});const lift=MOTO_BOX.lift,y=(x,z)=>ground.at(x,z)+lift;
 const pos=[];for(const r of mb.lines){const p=pts(r);for(const k of [0,1,2,0,2,3])pos.push(p[k][0],y(p[k][0],p[k][1]),p[k][1]);}
 if(pos.length){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.computeVertexNormals();
  const m=new T.Mesh(g,new T.MeshStandardMaterial({color:'#eeeeea',roughness:.6,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-5,polygonOffsetUnits:-5}));m.name='moto box lines';m.receiveShadow=true;group.add(m);}
 if(mb.texts.length){const tp=[],tu=[];for(const t of mb.texts){const f=[-Math.sin(t.heading),-Math.cos(t.heading)],rt=[Math.cos(t.heading),-Math.sin(t.heading)];
   const corner=(s,u)=>{const x=t.x+rt[0]*s*t.w/2+f[0]*u*t.h/2,z=t.z+rt[1]*s*t.w/2+f[1]*u*t.h/2;return [x,y(x,z)+.001,z];};
   const q=[corner(-1,-1),corner(1,-1),corner(1,1),corner(-1,1)],uv=[[0,0],[1,0],[1,1],[0,1]];for(const k of [0,1,2,0,2,3]){tp.push(...q[k]);tu.push(...uv[k]);}}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(tp,3));g.setAttribute('uv',new T.Float32BufferAttribute(tu,2));g.computeVertexNormals();
  const t=new T.CanvasTexture(textCanvas());t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;
  const m=new T.Mesh(g,new T.MeshStandardMaterial({map:t,transparent:true,alphaTest:.3,roughness:.6,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6,depthWrite:false}));m.name='moto box text';group.add(m);}
 scene.add(group);
 return {setTextures,group,counts:{boxes:mb.boxes.length,skipped:mb.skipped,shifted:mb.shifted,surfaces:targets.length},boxes:mb.boxes};
}
