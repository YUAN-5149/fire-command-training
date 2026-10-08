// 信義街景漫遊：圖資轉換為本地公尺座標的純函式（不依賴 Three.js，可於 Node 測試）。
// 建物牆面與屋頂：臺北市 2024 LOD1 官方量體；道路：OSM；路燈：臺北市開放資料。
// 地面高程由官方量體牆腳高程內插而得，為示意地形，非實測 DEM。
export const XINYI_ORIGIN={lon:121.5654,lat:25.0338};
const LAT_M=110574,LON_M=111320*Math.cos(XINYI_ORIGIN.lat*Math.PI/180);
export function project(lon,lat,origin=XINYI_ORIGIN){return [(lon-origin.lon)*LON_M,-(lat-origin.lat)*LAT_M];}
export function unproject(x,z,origin=XINYI_ORIGIN){return [origin.lon+x/LON_M,origin.lat-z/LAT_M];}

// 以牆腳高程建立地面高度格網；無資料格以鄰格擴散補值。
export function buildHeightField(buildings,bbox,cell=8){
 const [x0,z1]=project(bbox[0],bbox[1]),[x1,z0]=project(bbox[2],bbox[3]);
 const nx=Math.ceil((x1-x0)/cell)+1,nz=Math.ceil((z1-z0)/cell)+1,sum=new Float64Array(nx*nz),count=new Uint16Array(nx*nz);
 for(const b of buildings){
  let base=Infinity;for(const w of b.walls)base=Math.min(base,w.a[2],w.b[2]);
  for(const w of b.walls)for(const p of [w.a,w.b]){
   if(p[2]>base+0.5)continue;const [x,z]=project(p[0],p[1]),i=Math.round((x-x0)/cell),j=Math.round((z-z0)/cell);
   if(i<0||j<0||i>=nx||j>=nz)continue;sum[j*nx+i]+=p[2];count[j*nx+i]++;
  }
 }
 const h=new Float32Array(nx*nz),fixed=new Uint8Array(nx*nz);let total=0,n=0;
 for(let k=0;k<h.length;k++)if(count[k]){h[k]=sum[k]/count[k];fixed[k]=1;total+=h[k];n++;}
 const mean=n?total/n:0;for(let k=0;k<h.length;k++)if(!fixed[k])h[k]=mean;
 for(let it=0;it<300;it++)for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
  const k=j*nx+i;if(fixed[k])continue;let s=0,c=0;
  if(i>0){s+=h[k-1];c++}if(i<nx-1){s+=h[k+1];c++}if(j>0){s+=h[k-nx];c++}if(j<nz-1){s+=h[k+nx];c++}h[k]=s/c;
 }
 // 輕度平滑，避免相鄰量體牆腳差異造成尖點。
 const out=new Float32Array(h);
 for(let j=1;j<nz-1;j++)for(let i=1;i<nx-1;i++){const k=j*nx+i;out[k]=(h[k]*4+h[k-1]+h[k+1]+h[k-nx]+h[k+nx])/8;}
 return {x0,z0,cell,nx,nz,h:out,at(x,z){
  const fx=Math.min(Math.max((x-x0)/cell,0),nx-1.001),fz=Math.min(Math.max((z-z0)/cell,0),nz-1.001),i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j,k=j*nx+i;
  return out[k]*(1-u)*(1-v)+out[k+1]*u*(1-v)+out[k+nx]*(1-u)*v+out[k+nx+1]*u*v;
 }};
}

// 將 GIS 頁建構函式輸出的經緯度頂點轉為本地公尺座標；relative 表示 z 為離地高（與 GIS 頁 relative-to-ground 相同）。
export function toLocal(position,ground,relative=false){
 const out=new Float32Array(position.length);
 for(let i=0;i<position.length;i+=3){const [x,z]=project(position[i],position[i+1]);out[i]=x;out[i+1]=position[i+2]+(relative?ground.at(x,z):0);out[i+2]=z;}
 return out;
}
// sRGB 0–255 頂點色轉線性浮點（RGBA → RGB）。
export function linearColors(rgba){
 const lin=c=>{c/=255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);},out=new Float32Array(rgba.length/4*3);
 for(let i=0,j=0;i<rgba.length;i+=4,j+=3){out[j]=lin(rgba[i]);out[j+1]=lin(rgba[i+1]);out[j+2]=lin(rgba[i+2]);}
 return out;
}
// 碰撞線段：只收落地牆（牆腳接近地面）且高於 1.5 m 者。
export function buildColliders(buildings,ground,cell=12){
 const segs=[],grid=new Map();
 for(const b of buildings)for(const w of b.walls){
  if(w.h<1.5)continue;const [ax,az]=project(w.a[0],w.a[1]),[bx,bz]=project(w.b[0],w.b[1]);
  if(Math.min(w.a[2],w.b[2])>ground.at((ax+bx)/2,(az+bz)/2)+2.5)continue;
  const id=segs.length;segs.push([ax,az,bx,bz]);
  const i0=Math.floor(Math.min(ax,bx)/cell),i1=Math.floor(Math.max(ax,bx)/cell),j0=Math.floor(Math.min(az,bz)/cell),j1=Math.floor(Math.max(az,bz)/cell);
  for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){const key=i+','+j;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(id);}
 }
 function near(x,z,r){const out=new Set();for(let i=Math.floor((x-r)/cell);i<=Math.floor((x+r)/cell);i++)for(let j=Math.floor((z-r)/cell);j<=Math.floor((z+r)/cell);j++)for(const id of grid.get(i+','+j)??[])out.add(id);return out;}
 // 將半徑 r 的圓推出牆面；回傳修正後位置與是否碰撞。
 function resolve(x,z,r){
  let hit=false;
  for(let pass=0;pass<3;pass++){let moved=false;
   for(const id of near(x,z,r+1)){const [ax,az,bx,bz]=segs[id],dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz;let t=l2?((x-ax)*dx+(z-az)*dz)/l2:0;t=Math.max(0,Math.min(1,t));
    const px=ax+dx*t,pz=az+dz*t,ex=x-px,ez=z-pz,d=Math.hypot(ex,ez);
    if(d<r){hit=moved=true;if(d>1e-6){x=px+ex/d*r;z=pz+ez/d*r;}else{x+=-dz/Math.sqrt(l2)*r;z+=dx/Math.sqrt(l2)*r;}}
   }if(!moved)break;}
  return {x,z,hit};
 }
 return {segs,resolve,count:segs.length};
}

// 與 GIS 頁 geo-streets 基本路面相同：沿 OSM 中心線依原寬度展開，人行道高 0.12 m、其他 0.025 m（離地），
// 配色依是否在信義精修範圍內；每 4 m 取樣貼合示意地面。寬度多為估算值。
export function buildStreetBase(features,ground,inFocus,{step=4}={}){
 const groups={};
 for(const f of features){
  const walk=['sidewalk','walk'].includes(f.kind),raised=f.kind==='sidewalk',height=raised?.12:.025,focused=f.paths.some(path=>path.some(p=>inFocus(p[0],p[1])));
  const color=focused?(walk?'#b9b6ab':f.kind==='cycle'?'#657f79':'#30363a'):(walk?'#aaa99f':f.kind==='cycle'?'#657f79':'#41474b'),key=color+(raised?'|raised':'|flat');
  const g=groups[key]??={color,raised,position:[],index:[]},half=Math.max(f.width||0,.5)/2;
  for(const path of f.paths){
   const pts=[];
   for(let i=0;i<path.length;i++){const p=project(path[i][0],path[i][1]);if(i){const q=pts[pts.length-1],n=Math.max(1,Math.ceil(Math.hypot(p[0]-q[0],p[1]-q[1])/step));for(let s=1;s<n;s++)pts.push([q[0]+(p[0]-q[0])*s/n,q[1]+(p[1]-q[1])*s/n]);}pts.push(p);}
   if(pts.length<2)continue;
   for(let i=0;i<pts.length;i++){
    const a=pts[Math.max(i-1,0)],b=pts[Math.min(i+1,pts.length-1)],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1,nx=-dz/l,nz=dx/l,[x,z]=pts[i],start=g.position.length/3;
    for(const side of [-1,1]){const px=x+nx*half*side,pz=z+nz*half*side;g.position.push(px,ground.at(px,pz)+height,pz);}
    if(i)g.index.push(start-2,start-1,start,start-1,start+1,start);
   }
   // 圓角接頭（join:round）：路段端點補圓盤。
   for(const [x,z] of [pts[0],pts[pts.length-1]]){const c=g.position.length/3,y=ground.at(x,z)+height;g.position.push(x,y,z);for(let k=0;k<=12;k++){const t=k/12*Math.PI*2;const px=x+Math.cos(t)*half,pz=z-Math.sin(t)*half;g.position.push(px,ground.at(px,pz)+height,pz);if(k)g.index.push(c,c+k,c+k+1);}}
  }
 }
 return Object.values(groups);
}

export function nearestStreet(features,x,z,maxDistance=18){
 let best=null,bestD=maxDistance;
 for(const f of features){if(!f.tags.name||f.kind!=='road')continue;for(const path of f.paths)for(let i=1;i<path.length;i++){
  const [ax,az]=project(path[i-1][0],path[i-1][1]),[bx,bz]=project(path[i][0],path[i][1]),dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2)),d=Math.hypot(x-ax-dx*t,z-az-dz*t);
  if(d<bestD){bestD=d;best=f.tags.name;}
 }}
 return best;
}

// 出生點：松智路中段路面（官方量體以外的公共道路）。
export function spawnPoint(features){
 const road=features.find(f=>f.tags.name==='松智路'&&f.kind==='road')??features.find(f=>f.kind==='road');const path=road.paths[0],m=Math.floor(path.length/2);
 const [ax,az]=project(path[Math.max(m-1,0)][0],path[Math.max(m-1,0)][1]),[bx,bz]=project(path[m][0],path[m][1]);
 return {x:(ax+bx)/2,z:(az+bz)/2,heading:Math.atan2(-(bx-ax),-(bz-az)),road:road.tags.name??''};
}
