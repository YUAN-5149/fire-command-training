// 信義街景漫遊：臺北街屋精細立面與屋頂鐵皮加蓋（與 blender/taipei_facade.py 同一套規則）。
//   臨街精細立面：逐街精修過的老公寓（style 0）與住宅大樓（style 1）的臨街牆，改用實際幾何——
//     窗洞內凹、鋁窗框與中梃、窗台、樓板飾帶、女兒牆；老公寓鐵窗（著色器畫直條，鏤空）與冷氣機；
//     住宅陽台；一樓騎樓柱、天花、內退店面（鐵捲門／玻璃）與中文店招；直立招牌雙面直排字。
//   屋頂鐵皮加蓋：依衛星影像，老公寓屋頂約 85% 被鐵皮屋覆蓋，水塔墊高到加蓋頂。
// 為了瀏覽器效能：每個構件是「看得到的五面」方盒（背面省略），鐵窗直條、鐵捲門與浪板波紋、磁磚縫
// 都由著色器畫；店名用 canvas 文字圖集。外觀依街景與衛星影像目測，非實測；窗戶不是實際救援開口。
// 純函式（buildStreetFacades、buildRoofSheds、shedHeight、detailWalls）不依賴 three.js，可於 Node 測試。

export const SHOPS=['機車行','便利商店','藥局','早餐店','牙醫診所','麵店','水電行','髮廊','五金行','眼鏡行',
 '中醫診所','自助餐','飲料店','洗衣店','房屋仲介','鎖店','文具行','麵包店','小吃店','電器行',
 '診所','火鍋','便當','補習班','鐘錶行','茶行','影印','通訊行'];
const SIGN=['#c8231e','#f2c230','#f5f5f0','#1f4fa8','#1f8a4c','#e86a1c','#b0185a','#222222'];
const IRON=['#dcdcd6','#dcdcd6','#d0d3cf','#7a5a44','#6b4b38','#3f5a4a'];
const METAL=['#c9cdd0','#e6e6e2','#b8bcbe','#5f9ea0','#9c4a3c','#7e8a92','#d9d4c0','#4f7fa8'];
const lin=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
export const linHex=h=>[1,3,5].map(i=>lin(parseInt(h.slice(i,i+2),16)/255));
function rng(seed){let s=(typeof seed==='number'?seed:[...String(seed)].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,7))>>>0||1;return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
const pick=(r,a)=>a[Math.floor(r()*a.length)%a.length];

// 老公寓屋頂加蓋高度（無加蓋為 0）；網頁與水塔墊高共用，依建物 id 固定。
export function shedHeight(b,style){if(style!==0)return 0;const r=rng('shed'+b.id);return r()<.85?2.4+r()*.6:0;}

// 精細立面要做哪些牆：精修建物、style 0/1、臨街（牆中點往外 4 m 處 10 m 內有具名道路）、牆寬 ≥3 m。
export function detailWalls(b,style,refined,{project,facesStreet}){
 if(!refined||(style!==0&&style!==1))return [];
 const out=[];
 b.walls.forEach((w,k)=>{if(w.w<3||w.h<4)return;const [ax,az]=project(w.a[0],w.a[1]),[bx,bz]=project(w.b[0],w.b[1]);
  if(facesStreet((ax+bx)/2+w.n[0]*4,(az+bz)/2-w.n[1]*4))out.push(k);});
 return out;
}

// ---- 幾何緩衝：每種材質一組 position/normal/uv/color/index（本地公尺：x 東、y 上、z 南）
class Geo{
 constructor(){this.g={};}
 grp(k){return this.g[k]??={position:[],normal:[],uv:[],color:[],index:[]};}
 face(k,P,N,UV,C){const g=this.grp(k),s=g.position.length/3;
  // 依法線確認逆時針
  const e1=[P[1][0]-P[0][0],P[1][1]-P[0][1],P[1][2]-P[0][2]],e2=[P[2][0]-P[0][0],P[2][1]-P[0][1],P[2][2]-P[0][2]];
  const cr=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]],flip=cr[0]*N[0]+cr[1]*N[1]+cr[2]*N[2]<0;
  for(let i=0;i<P.length;i++){g.position.push(...P[i]);g.normal.push(...N);g.uv.push(...UV[i]);g.color.push(...C);}
  for(let i=1;i<P.length-1;i++)flip?g.index.push(s,s+i+1,s+i):g.index.push(s,s+i,s+i+1);}
}
// 牆面座標：o 牆左下、u 沿牆、n 往外（本地 x、z），p(a,d,z)
function frame(ax,az,bx,bz,base,nx,nz){const W=Math.hypot(bx-ax,bz-az),u=[(bx-ax)/W,(bz-az)/W];
 return {W,u,n:[nx,nz],p:(a,d,z)=>[ax+u[0]*a+nx*d,base+z,az+u[1]*a+nz*d]};}
function box(G,k,F,a0,a1,d0,d1,z0,z1,C=[1,1,1]){
 if(a1-a0<1e-4||d1-d0<1e-4||z1-z0<1e-4)return;
 const n3=[F.n[0],0,F.n[1]],u3=[F.u[0],0,F.u[1]],p=F.p;
 G.face(k,[p(a0,d1,z0),p(a1,d1,z0),p(a1,d1,z1),p(a0,d1,z1)],n3,[[a0,z0],[a1,z0],[a1,z1],[a0,z1]],C);                 // 正面
 G.face(k,[p(a0,d0,z0),p(a0,d1,z0),p(a0,d1,z1),p(a0,d0,z1)],u3.map(v=>-v),[[d0,z0],[d1,z0],[d1,z1],[d0,z1]],C);      // 左
 G.face(k,[p(a1,d0,z0),p(a1,d1,z0),p(a1,d1,z1),p(a1,d0,z1)],u3,[[d0,z0],[d1,z0],[d1,z1],[d0,z1]],C);                 // 右
 G.face(k,[p(a0,d0,z1),p(a1,d0,z1),p(a1,d1,z1),p(a0,d1,z1)],[0,1,0],[[a0,d0],[a1,d0],[a1,d1],[a0,d1]],C);             // 頂
 G.face(k,[p(a0,d0,z0),p(a1,d0,z0),p(a1,d1,z0),p(a0,d1,z0)],[0,-1,0],[[a0,d0],[a1,d0],[a1,d1],[a0,d1]],C);            // 底
}
// 招牌文字：貼在面上的四邊形，cell 為圖集格（橫式 h、直式 v）
function label(G,F,kind,cell,a0,a1,d,z0,z1,side=0){
 const p=F.p;let P,N;
 if(!side){P=[p(a0,d,z0),p(a1,d,z0),p(a1,d,z1),p(a0,d,z1)];N=[F.n[0],0,F.n[1]];}
 else{P=side>0?[p(a0,a1,z0),p(a0,d,z0),p(a0,d,z1),p(a0,a1,z1)]:[p(a0,d,z0),p(a0,a1,z0),p(a0,a1,z1),p(a0,d,z1)];N=[F.u[0]*side,0,F.u[1]*side];}
 const [u0,v0,u1,v1]=cell;G.face(kind,P,N,[[u0,v0],[u1,v0],[u1,v1],[u0,v1]],[1,1,1]);
}
// 圖集格：橫式 4 欄 × 8 列（每格 512×128）、直式 16 欄 × 2 列（每格 128×512）
export function cellH(i){const c=i%4,r=Math.floor(i/4);return [c/4,1-(r+1)/8,(c+1)/4,1-r/8];}
export function cellV(i){const c=i%16,r=Math.floor(i/16);return [c/16,1-(r+1)/2,(c+1)/16,1-r/2];}

// 一面臨街牆：W 牆寬、H 牆高、fh 樓高
function streetWall(G,F,H,fh,style,shop,colour,r){
 const W=F.W,tile=linHex(colour),nb=Math.max(1,Math.round(W/3.3)),bw=W/nb,floors=Math.max(1,Math.floor(H/fh+.01)),pw=Math.min(.4,bw*.14),top=floors*fh;
 for(let f=1;f<floors;f++)box(G,'trim',F,0,W,0,.07,f*fh-.07,f*fh+.07);
 box(G,'tile',F,0,W,-.2,.02,top,top+1,tile);box(G,'trim',F,-.02,W+.02,-.25,.08,top+1,top+1.08);
 if(top<H-.3)box(G,'tile',F,0,W,-.25,0,top,H,tile);
 // 一樓
 if(shop){const AD=3;
  for(let k=0;k<=nb;k++){const x=Math.min(Math.max(k*bw,.3),W-.3);box(G,'tile',F,x-.3,x+.3,-.6,0,0,fh,tile);}
  box(G,'tile',F,0,W,-.6,0,fh-.65,fh,tile);box(G,'ceiling',F,0,W,-AD,-.6,fh-.55,fh-.45);
  box(G,'tile',F,0,W,-AD-.2,-AD,fh-1,fh-.45,tile);box(G,'floor',F,0,W,-AD,0,0,.12);
  for(let k=0;k<nb;k++){const x0=k*bw+.3,x1=(k+1)*bw-.3;
   if(r()<.35)box(G,'shutter',F,x0,x1,-AD-.05,-AD,.12,fh-1,linHex(pick(r,['#9aa0a3','#b8bcbe','#7d8488'])));
   else{box(G,'dark',F,x0,x1,-AD-.3,-AD-.25,.12,fh-1);box(G,'shopglass',F,x0+.08,x1-.08,-AD-.06,-AD-.04,.2,fh-1.08);
    for(const xx of [x0,x1-.06,(x0+x1)/2-.03])box(G,'frame',F,xx,xx+.06,-AD-.06,-AD,.12,fh-1);box(G,'frame',F,x0,x1,-AD-.06,-AD,fh-1.06,fh-1);}
   const sc=pick(r,SIGN),i=Math.floor(r()*SHOPS.length);box(G,'sign',F,x0-.2,x1+.2,0,.22,fh-1.25,fh-.05,linHex(sc));
   const tw=Math.min(x1-x0+.2,SHOPS[i].length*.62+.4),cx=(x0+x1)/2;label(G,F,'textH',cellH(i),cx-tw/2,cx+tw/2,.23,fh-1.1,fh-.2);}
 }else for(let k=0;k<nb;k++){const x=k*bw;
  box(G,'tile',F,x,x+pw,-.25,0,0,fh,tile);box(G,'tile',F,x+bw-pw,x+bw,-.25,0,0,fh,tile);box(G,'tile',F,x+pw,x+bw-pw,-.25,0,2.5,fh,tile);
  box(G,'shutter',F,x+pw,x+bw-pw,-.2,-.15,0,2.5,linHex('#a3a8aa'));}
 // 上層
 for(let f=1;f<floors;f++){const z0=f*fh,sill=.9,head=fh-.45;
  for(let k=0;k<nb;k++){const x=k*bw,ox0=x+pw,ox1=x+bw-pw;
   box(G,'tile',F,x,x+pw,-.25,0,z0,z0+fh,tile);box(G,'tile',F,x+bw-pw,x+bw,-.25,0,z0,z0+fh,tile);box(G,'tile',F,ox0,ox1,-.25,0,z0+head,z0+fh,tile);
   if(style===1&&k%2===1){
    box(G,'trim',F,ox0-.1,ox1+.1,0,1,z0,z0+.15);box(G,'tile',F,ox0-.1,ox1+.1,.9,1,z0+.15,z0+1.05,tile);
    box(G,'tile',F,ox0-.1,ox0,0,.9,z0+.15,z0+1.05,tile);box(G,'tile',F,ox1,ox1+.1,0,.9,z0+.15,z0+1.05,tile);
    box(G,'glass',F,ox0,ox1,-.2,-.18,z0,z0+head);for(const xx of [ox0,(ox0+ox1)/2-.025,ox1-.05])box(G,'frame',F,xx,xx+.05,-.2,-.14,z0,z0+head);
    continue;}
   box(G,'tile',F,ox0,ox1,-.25,0,z0,z0+sill,tile);box(G,'trim',F,ox0-.06,ox1+.06,0,.09,z0+sill-.06,z0+sill);
   box(G,r()<.35?'glassLit':'glass',F,ox0,ox1,-.2,-.18,z0+sill,z0+head);   // 約三成窗夜間亮燈
   for(const [a0,a1,b0,b1] of [[ox0,ox0+.05,sill,head],[ox1-.05,ox1,sill,head],[(ox0+ox1)/2-.025,(ox0+ox1)/2+.025,sill,head],[ox0,ox1,sill,sill+.05],[ox0,ox1,head-.05,head]])
    box(G,'frame',F,a0,a1,-.2,-.13,z0+b0,z0+b1);
   if(style===0&&r()<.68){const ic=linHex(pick(r,IRON)),d1=.42+r()*.12,zb=z0+sill-.12,zt=z0+head+.12;
    box(G,'grille',F,ox0-.08,ox1+.08,d1-.02,d1,zb,zt,ic);                          // 正面直條（著色器鏤空）
    box(G,'grille',F,ox0-.08,ox0-.06,0,d1,zb,zt,ic);box(G,'grille',F,ox1+.06,ox1+.08,0,d1,zb,zt,ic);
    for(const zz of [zb,zt-.03])box(G,'iron',F,ox0-.08,ox1+.08,d1-.03,d1+.005,zz,zz+.03,ic);
    box(G,'roofmetal',F,ox0-.2,ox1+.2,0,d1+.18,zt+.05,zt+.09,linHex(pick(r,METAL)));}
   if(r()<.38){const ac=(ox0+ox1)/2+(r()-.5)*(ox1-ox0-.9),za=z0+sill-.75;
    box(G,'ac',F,ac-.4,ac+.4,.04,.32,za,za+.52);box(G,'acgrille',F,ac-.36,ac+.16,.32,.335,za+.06,za+.46);}
  }}
 // 直立招牌
 if(shop&&floors>1)for(let k=1;k<nb;k++){if(r()>.55)continue;const x=k*bw,L=Math.min(H-fh-.8,2.2+r()*2.2);if(L<1.5)continue;
  const z0=fh+.4,sc=pick(r,SIGN),i=Math.floor(r()*SHOPS.length);
  box(G,'frame',F,x-.1,x+.1,.2,1,z0-.05,z0+L+.05);box(G,'sign',F,x-.085,x+.085,.23,.97,z0,z0+L,linHex(sc));
  const n=SHOPS[i].length,th=Math.min(L-.2,n*.55),zc=z0+L/2;
  label(G,F,'textV',cellV(i),x+.1,.3,.9,zc-th/2,zc+th/2,1);label(G,F,'textV',cellV(i),x-.1,.3,.9,zc-th/2,zc+th/2,-1);}
}

// 純函式：所有精細立面幾何。items: [{b, style, shop, colour, floorH, walls:[k...]}]，project 經緯度轉本地
export function buildStreetFacades(items,{project}){
 const G=new Geo();let walls=0;
 for(const it of items){const b=it.b,r=rng('facade'+b.id);
  let cx=0,cz=0;for(const w of b.walls){const [x,z]=project(w.a[0],w.a[1]);cx+=x;cz+=z;}cx/=b.walls.length;cz/=b.walls.length;
  for(const k of it.walls){const w=b.walls[k],[ax,az]=project(w.a[0],w.a[1]),[bx,bz]=project(w.b[0],w.b[1]);
   let nx=w.n[0],nz=-w.n[1];if(((ax+bx)/2-cx)*nx+((az+bz)/2-cz)*nz<0){nx=-nx;nz=-nz;}
   streetWall(G,frame(ax,az,bx,bz,w.a[2],nx,nz),w.h,it.floorH,it.style,it.shop,it.colour,r);walls++;}}
 return {groups:G.g,walls};
}

// 純函式：老公寓屋頂鐵皮加蓋（最高屋頂三角形往中心內縮 6%，擠出加蓋高度）
export function buildRoofSheds(items,{project}){
 const G=new Geo();let n=0;
 for(const {b,h} of items){if(!h||b.roofs.length<3)continue;const r=rng('roof'+b.id);
  const P=b.roofs.map(p=>{const [x,z]=project(p[0],p[1]);return [x,p[2],z];}),zt=Math.max(...P.map(p=>p[1]));
  const tris=[];for(let i=0;i+2<P.length;i+=3){const t=P.slice(i,i+3);if(Math.min(...t.map(p=>p[1]))>zt-.5)tris.push(t);}
  if(!tris.length)continue;const all=tris.flat(),cx=all.reduce((s,p)=>s+p[0],0)/all.length,cz=all.reduce((s,p)=>s+p[2],0)/all.length;
  const C=linHex(pick(r,METAL));n++;
  for(const t of tris){const q=t.map(p=>[cx+(p[0]-cx)*.94,cz+(p[2]-cz)*.94]);
   G.face('roofmetal',q.map(([x,z])=>[x,zt+h,z]),[0,1,0],q.map(([x,z])=>[x,z]),C);
   for(let i=0;i<3;i++){const [x0,z0]=q[i],[x1,z1]=q[(i+1)%3],L=Math.hypot(x1-x0,z1-z0);if(L<.05)continue;
    let nx=(z1-z0)/L,nz=-(x1-x0)/L;if(((x0+x1)/2-cx)*nx+((z0+z1)/2-cz)*nz<0){nx=-nx;nz=-nz;}
    G.face('roofmetal',[[x0,zt+.02,z0],[x1,zt+.02,z1],[x1,zt+h,z1],[x0,zt+h,z0]],[nx,0,nz],[[0,0],[L,0],[L,h],[0,h]],C);}}}
 return {groups:G.g,sheds:n};
}

// ---- three.js
const lift=(T,m,fn)=>{m.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vM;').replace('#include <uv_vertex>','#include <uv_vertex>\nvM=uv;');
 sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vM;\nfloat sh1(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}').replace('#include <color_fragment>','#include <color_fragment>\n'+fn);};m.customProgramCacheKey=()=>'tp-'+m.name;return m;};
export function createShophouseMaterials(T){
 const S=o=>new T.MeshStandardMaterial(o),M={};
 // 二丁掛磁磚：24×6.5 cm、灰縫、每塊磚深淺、大範圍污漬；遠處以 fwidth 淡出紋路，避免疊紋
 M.tile=lift(T,S({name:'tile',vertexColors:true,roughness:.8}),`{float row=floor(vM.y/.065);vec2 q=vec2((vM.x+mod(row,2.)*.12)/.24,vM.y/.065);vec2 f=fract(q);
  float mortar=max(step(f.x,.03),step(f.y,.1))*clamp(1.-length(fwidth(q))*1.6,0.,1.);diffuseColor.rgb*=mix(.96+.08*sh1(floor(q)),.84,mortar);
  diffuseColor.rgb*=.93+.07*smoothstep(-.6,.8,sin(vM.x*.9+vM.y*.35)*sin(vM.y*.6-vM.x*.2));}`);
 M.trim=S({name:'trim',color:'#c9c5bc',roughness:.7});
 // 網頁沒有環境反射貼圖，玻璃用偏亮的藍灰並帶一點天空反光
 M.glass=S({name:'glass',color:'#4d6474',roughness:.25,metalness:0,emissive:'#7f97a8',emissiveIntensity:.12});
 M.glassLit=S({name:'glassLit',color:'#4d6474',roughness:.25,metalness:0,emissive:'#ffd9a0',emissiveIntensity:.12});
 M.frame=S({name:'frame',color:'#b9bcbd',roughness:.35,metalness:.7});
 M.iron=S({name:'iron',vertexColors:true,roughness:.55,metalness:.4});
 // 鐵窗：直條每 13 cm、橫桿每 55 cm，其餘鏤空
 M.grille=lift(T,S({name:'grille',vertexColors:true,roughness:.55,metalness:.4,side:T.DoubleSide}),`{float bar=step(fract(vM.x/.13),.13),rail=step(fract(vM.y/.55),.05);if(max(bar,rail)<.5)discard;}`);
 M.ac=S({name:'ac',color:'#e8e6df',roughness:.45});
 M.acgrille=lift(T,S({name:'acgrille',color:'#3a3d3f',roughness:.6}),`{diffuseColor.rgb*=.6+.4*step(.5,fract(vM.y/.03));}`);
 M.shutter=lift(T,S({name:'shutter',vertexColors:true,roughness:.45,metalness:.5}),`{float fade=clamp(1.-fwidth(vM.y/.055)*1.5,0.,1.);diffuseColor.rgb*=1.-fade*.22*(1.-smoothstep(0.,1.,abs(sin(vM.y*3.14159/.055))));}`);
 M.roofmetal=lift(T,S({name:'roofmetal',vertexColors:true,roughness:.5,metalness:.45}),`{float fade=clamp(1.-fwidth(vM.x/.19)*1.5,0.,1.);diffuseColor.rgb*=1.-fade*.2*(1.-abs(sin(vM.x*3.14159/.19)));}`);
 M.shopglass=S({name:'shopglass',color:'#5b6a70',roughness:.1,metalness:.1,emissive:'#ffe2b0',emissiveIntensity:.25});
 M.ceiling=S({name:'ceiling',color:'#a9a7a0',roughness:.9});
 M.floor=S({name:'floor',color:'#8b857a',roughness:.8});
 M.sign=S({name:'sign',vertexColors:true,roughness:.4,emissive:'#ffffff',emissiveIntensity:0});
 M.sign.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance*=vColor.rgb;');};M.sign.customProgramCacheKey=()=>'tp-sign';
 M.dark=S({name:'dark',color:'#2b2c2d',roughness:.9});
 return M;
}
// 店名文字圖集：白字黑邊，任何底色都看得清楚
export function signAtlases(T){
 const make=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');draw(g);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;};
 const font='bold %spx "Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif';
 const style=(g,s)=>{g.font=font.replace('%s',s);g.textAlign='center';g.textBaseline='middle';g.lineWidth=s*.12;g.strokeStyle='rgba(0,0,0,.75)';g.fillStyle='#ffffff';};
 const H=make(2048,1024,g=>{SHOPS.forEach((t,i)=>{const [u0,v0,u1,v1]=cellH(i),x=(u0+u1)/2*2048,y=(1-(v0+v1)/2)*1024,s=Math.min(96,460/t.length);style(g,s);g.strokeText(t,x,y);g.fillText(t,x,y);});});
 const V=make(2048,1024,g=>{SHOPS.forEach((t,i)=>{const [u0,v0,u1,v1]=cellV(i),x=(u0+u1)/2*2048,yc=(1-(v0+v1)/2)*1024,s=Math.min(100,460/t.length);style(g,s);
  [...t].forEach((ch,j)=>{const y=yc+(j-(t.length-1)/2)*s*1.05;g.strokeText(ch,x,y);g.fillText(ch,x,y);});});});
 return {H,V};
}
export function addShophouses({T,scene,facades,roofs}){
 const group=new T.Group(),M=createShophouseMaterials(T),atl=signAtlases(T);group.name='shophouse detail';
 M.textH=new T.MeshBasicMaterial({map:atl.H,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
 M.textV=new T.MeshBasicMaterial({map:atl.V,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,side:T.DoubleSide});
 let verts=0;
 for(const [name,src] of [['street facades',facades.groups],['roof sheds',roofs.groups]])for(const [k,a] of Object.entries(src)){
  if(!a.index.length)continue;const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(a.position,3));g.setAttribute('normal',new T.Float32BufferAttribute(a.normal,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(a.uv,2));g.setAttribute('color',new T.Float32BufferAttribute(a.color,3));g.setIndex(a.index);g.computeBoundingSphere();
  const m=new T.Mesh(g,M[k]);m.name=name+' '+k;m.castShadow=!k.startsWith('text');m.receiveShadow=true;group.add(m);verts+=a.position.length/3;}
 scene.add(group);
 // 夜間：店面玻璃與招牌發光
 const setNight=l=>{M.shopglass.emissiveIntensity=.25+l*1.4;M.sign.emissiveIntensity=l*.55;M.glassLit.emissiveIntensity=.12+l*1.1;M.glassLit.emissive.set(l>.3?'#ffd9a0':'#7f97a8');};
 return {group,verts,setNight};
}
