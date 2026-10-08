// Observed paint pattern, OSM centreline placement and dimensions remain unmeasured.
export function buildLaneReview(features){
 const rings=[];
 for(const f of features){if(f.id!==1335559368||f.kind!=='road')continue;
  for(const path of f.paths)for(let i=1;i<path.length;i++){
   const a=path[i-1],b=path[i];if(b[1]<=a[1])continue;
   const t0=Math.max(0,(25.03412-a[1])/(b[1]-a[1])),t1=Math.min(1,(25.035685-a[1])/(b[1]-a[1]));if(t1<=t0)continue;
   const start=a.map((v,k)=>v+(b[k]-v)*t0),end=a.map((v,k)=>v+(b[k]-v)*t1),dx=(end[0]-start[0])*100850,dy=(end[1]-start[1])*110574,len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
   const p=(u,d)=>[start[0]+dx/100850*u+nx*d/100850,start[1]+dy/110574*u+ny*d/110574];
   const count=Math.ceil(len/1);for(let k=0;k<count;k++)for(const d of [-.14,.14]){const r=[p(k/count,d-.05),p(k/count,d+.05),p((k+1)/count,d+.05),p((k+1)/count,d-.05)];r.push([...r[0]]);rings.push(r);}
  }
 }return rings;
}

export function drapeReviewRings(rings,surface){
 if(!surface)return [];
 const faces=Object.values(surface.groups).flat(),v=surface.position;
 function height(p){let z=-Infinity;for(let i=0;i<faces.length;i+=3){const a=faces[i]*3,b=faces[i+1]*3,c=faces[i+2]*3;
  const bx=(v[b]-v[a])*100850,by=(v[b+1]-v[a+1])*110574,cx=(v[c]-v[a])*100850,cy=(v[c+1]-v[a+1])*110574,px=(p[0]-v[a])*100850,py=(p[1]-v[a+1])*110574,det=bx*cy-by*cx;if(Math.abs(det)<1e-9)continue;
  const u=(px*cy-py*cx)/det,w=(bx*py-by*px)/det;if(u>=-1e-7&&w>=-1e-7&&u+w<=1+1e-7)z=Math.max(z,v[a+2]+u*(v[b+2]-v[a+2])+w*(v[c+2]-v[a+2]));
 }return Number.isFinite(z)?z+.006:null;}
 return rings.map(r=>r.map(p=>{const z=height(p);return z===null?null:[...p,z];})).filter(r=>r.every(Boolean));
}

// Junction paint study: observed directions, unmeasured positions and dimensions.
export function buildJunctionReview(features){
 const f=features.find(f=>f.id===1335559368&&f.kind==='road');if(!f||!(f.width>0))return {dashes:[],arrows:[],stop:[]};
 const at=(lat,east)=>{for(const path of f.paths)for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];if(lat>=a[1]&&lat<=b[1]&&b[1]>a[1])return [a[0]+(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+east/100850,lat];}return null;};
 function ring(points){if(points.some(p=>!p))return null;const r=points.map(p=>[...p]);let area=0;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];area+=(a[0]-r[0][0])*(b[1]-r[0][1])-(b[0]-r[0][0])*(a[1]-r[0][1]);}if(area>0)r.reverse();r.push([...r[0]]);return r;}
 const dashes=[],arrows=[],stop=[];
 for(let lat=25.03468;lat+3/110574<25.03554;lat+=6/110574)for(const side of [-1,1]){const e=side*f.width/4;const r=ring([at(lat,e-.05),at(lat+3/110574,e-.05),at(lat+3/110574,e+.05),at(lat,e+.05)]);if(r)dashes.push(r);}
 const lat=25.03565,half=f.width/2;
 const arrow=(east,north,points)=>ring(points.map(([x,y])=>at(lat+north*y/110574,east+x*(north===1?.6:1))));
 const straight=[[-.13,-1.7],[-.13,.55],[-.48,.55],[0,1.75],[.48,.55],[.13,.55],[.13,-1.7]];
 for(const e of [-half/4,-3*half/4]){const r=arrow(e,-1,straight);if(r)arrows.push(r);}
 // Northbound inside lane turns left (west). Individual original polygon parts.
 for(const pts of [[[-.09,-1.7],[.09,-1.7],[.09,.45],[-.09,.45]],[[-.09,.3],[.09,.45],[-.2,.9],[-.3,.72]],[[-.65,.72],[-.2,.72],[-.2,.9],[-.65,.9]],[[-.65,.45],[-1.05,.81],[-.65,1.17]]]){const r=arrow(half/4,1,pts);if(r)arrows.push(r);}
 const stopLat=25.03569,r=ring([at(stopLat,.28),at(stopLat,half-.2),at(stopLat+.25/110574,half-.2),at(stopLat+.25/110574,.28)]);if(r)stop.push(r);
 return {dashes,arrows,stop};
}
export function buildWaitingReview(features){
 const f=features.find(f=>f.id===1335559368&&f.kind==='road');const out={motorcycle:[],grid:[]};if(!f||!(f.width>0))return out;
 const lat0=25.035877,half=f.width/2;
 const at=(x,y)=>{const lat=lat0+y/110574;for(const path of f.paths)for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];if(lat>=a[1]&&lat<=b[1]&&b[1]>a[1])return [a[0]+(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+x/100850,lat];}return null;};
 const stripe=(x0,y0,x1,y1,width)=>{const dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy);if(!len)return null;const nx=-dy/len*width/2,ny=dx/len*width/2;const r=[[x0-nx,y0-ny],[x0+nx,y0+ny],[x1+nx,y1+ny],[x1-nx,y1-ny]].map(([x,y])=>at(x,y));if(r.some(p=>!p))return null;r.push([...r[0]]);return r;};
 // Original review geometry. All dimensions and offset are trial values, not surveyed.
 const segments=(a,b)=>{const count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.5),r=[];for(let i=0;i<count;i++){const p=t=>a.map((v,k)=>v+(b[k]-v)*t);const q=stripe(...p(i/count),...p((i+1)/count),.10);if(q)r.push(q);}return r;};
 const left=half*.53,right=half-.25,bottom=(25.035695-lat0)*110574,top=bottom+3;
 for(const [a,b] of [[[left,bottom],[right,bottom]],[[right,bottom],[right,top]],[[right,top],[left,top]],[[left,top],[left,bottom]]]){out.motorcycle.push(...segments(a,b));}
 // White diagonal grid study, deliberately bounded to the unchanged source road.
 const xmin=-half+.3,xmax=half-.3,ymin=-7.5,ymax=-.5;
 for(const slope of [-1,1])for(let c=-12;c<=12;c+=2.2){const hits=[];for(const x of [xmin,xmax]){const y=slope*x+c;if(y>=ymin&&y<=ymax)hits.push([x,y]);}for(const y of [ymin,ymax]){const x=(y-c)/slope;if(x>xmin&&x<xmax)hits.push([x,y]);}if(hits.length===2){out.grid.push(...segments(hits[0],hits[1]));}}
 return out;
}
