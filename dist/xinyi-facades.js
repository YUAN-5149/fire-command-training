// 信義街景漫遊：逐棟建物立面（assets/building-styles-xinyi.json，scripts/build-building-styles.py 產生）。
// 每面牆只用一個四邊形，窗格、樓板線、陽台、鐵窗、一樓店面與招牌由著色器依外觀分類逐像素畫出，
// 冷氣、水塔、頂樓加蓋、直立招牌用 InstancedMesh。外觀分類依 OSM 與量體推定，窗戶不是實際救援開口。
// 純函式（buildFacadeBatch、facadeProps）不依賴 three.js，可於 Node 測試。

export const STYLE={OLD:0,MID:1,TOWER:2,OFFICE:3,PUBLIC:4,TEMPLE:5,CANOPY:6,ROOF:7};
const LON_M=111320*Math.cos(25.0338*Math.PI/180),LAT_M=110574;
const ROOF={0:'#7d8a80',1:'#7f8582',2:'#7a7e80',3:'#6f7477',4:'#8a8676',5:'#8c4a32',6:'#8e938f'};
const rgb=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16),255];
function hash(n){n=Math.sin(n*127.1+311.7)*43758.5453;return n-Math.floor(n);}

// 預設外觀：沒有 style 資料的量體依高度推定（與產生腳本的備援規則相同）。
export function styleOf(styles,b){
 const s=styles?.[b.id];if(s)return {style:s[0],levels:s[1],shop:s[2],colour:s[3]};
 const h=Math.max(...b.walls.map(w=>w.h));const style=h<3.5?6:h<=21?0:h<=48?1:2;
 return {style,levels:Math.max(1,Math.round(h/(style===0?3:3.4))),shop:0,colour:['#d8cfbf','#d9d3c7','#d5d1c8','#9a9d98'][style===6?3:style]};
}

// 經緯度頂點（與 buildDistrictBatch 相同格式，交給 toLocal 轉本地公尺）＋每頂點立面屬性：
//   fuv (u 沿牆公尺, v 離牆腳公尺)、fac (style+shop*10, 樓高, 亂數種子, 0)、fac2 (牆寬, 牆高)
export function buildFacadeBatch(buildings,styles){
 const position=[],color=[],fuv=[],fac=[],fac2=[],index=[];
 for(const b of buildings){
  const s=styleOf(styles,b),seed=hash(b.id),top=Math.max(...b.walls.map(w=>w.h));
  const floorH=s.style===STYLE.CANOPY||s.style===STYLE.TEMPLE?top+1:Math.max(2.8,Math.min(5,top/Math.max(1,s.levels))),code=s.style+(s.shop?10:0),wall=rgb(s.colour),roof=rgb(ROOF[s.style]);
  for(let i=0;i<b.roofs.length;i+=3){const st=position.length/3;
   for(const p of b.roofs.slice(i,i+3)){position.push(p[0],p[1],p[2]+.045);color.push(...roof);fuv.push(0,0);fac.push(STYLE.ROOF,3,seed,0);fac2.push(0,0);}
   index.push(st,st+1,st+2);}
  for(const {a,b:e,w,h,n} of b.walls){if(w<.05||h<.05)continue;const st=position.length/3,d=.035;
   const ox=n[0]*d/LON_M,oy=n[1]*d/LAT_M;
   for(const [x,y,z,u,v] of [[a[0],a[1],a[2],0,0],[e[0],e[1],e[2],w,0],[e[0],e[1],e[2]+h,w,h],[a[0],a[1],a[2]+h,0,h]]){
    position.push(x+ox,y+oy,z);color.push(...wall);fuv.push(u,v);fac.push(code,floorH,seed,0);fac2.push(w,h);}
   index.push(st,st+1,st+2,st,st+2,st+3);}
 }
 return {position,color,fuv,fac,fac2,index};
}

// 立面小物件（本地公尺，x 東、z 南、y 高）：每類回傳 [{x,y,z,ry,sx,sy,sz,c}]。
//   facesStreet(x,z) 判斷牆外是否為道路（招牌只掛臨街面）；project 為經緯度轉本地。
export function facadeProps(buildings,styles,{project,facesStreet=()=>true,max=30000}){
 const ac=[],tank=[],shed=[],sign=[],grille=[];
 const SIGN=['#d7262b','#f2c230','#f5f5f0','#2563b8','#1f8a4c','#e86a1c','#c2185b'];
 for(const b of buildings){
  const s=styleOf(styles,b),seed=hash(b.id),residential=s.style<=STYLE.TOWER;
  const top=Math.max(...b.walls.map(w=>w.h)),floorH=Math.max(2.8,Math.min(5,top/Math.max(1,s.levels)));
  for(const [k,{a,b:e,w,h,n}] of b.walls.entries()){
   if(w<3||h<5)continue;
   const [ax,az]=project(a[0],a[1]),[bx,bz]=project(e[0],e[1]),nx=n[0],nz=-n[1],ry=Math.atan2(nx,nz),tx=(bx-ax)/w,tz=(bz-az)/w;
   const at=(u,out)=>[ax+tx*u+nx*out,az+tz*u+nz*out];
   const street=s.shop?facesStreet(...at(w/2,5)):false;
   const bay=s.style===STYLE.OLD?3:3.4,bays=Math.floor(w/bay),floors=Math.floor((h-.9)/floorH);
   if(residential)for(let f=1;f<floors;f++)for(let i=0;i<bays;i++){
    const r=hash(b.id*31+k*7+f*13+i);
    if(r<.22&&ac.length<max){const [x,z]=at((i+.5)*bay+(r<.11?.9:-.9),.33);ac.push({x,y:a[2]+f*floorH+floorH*.18,z,ry,sx:.8,sy:.55,sz:.42,c:r<.06?'#c9c7bf':'#e4e2da'});}
    // 老公寓鐵窗：凸出牆面的格柵箱
    if(s.style===STYLE.OLD&&r>.35&&grille.length<max){const [x,z]=at((i+.5)*bay,.22);grille.push({x,y:a[2]+f*floorH+floorH*.58,z,ry,sx:bay*.66,sy:floorH*.56,sz:.44,c:hash(b.id+i)<.4?'#7a5f4a':'#a3a69e'});}
   }
   if(s.shop&&street&&s.style<=STYLE.OFFICE)for(let i=0;i<Math.max(1,Math.floor(w/7));i++){
    const r=hash(b.id*17+k*5+i),[x,z]=at((i+.5)*w/Math.max(1,Math.floor(w/7)),.95);
    if(sign.length<max)sign.push({x,y:a[2]+floorH*(1.15+r*.6)+1.4,z,ry,sx:.16,sy:2.4+r*1.6,sz:.82,c:SIGN[Math.floor(r*SIGN.length)]});
   }
  }
  // 屋頂：水塔（不鏽鋼）與老公寓頂樓加蓋（鐵皮），放在面積最大的屋頂三角形
  if(residential&&b.roofs.length>=3){
   let best=null,area=0;for(let i=0;i<b.roofs.length;i+=3){const [p,q,r]=b.roofs.slice(i,i+3).map(v=>[...project(v[0],v[1]),v[2]]);const A=Math.abs((q[0]-p[0])*(r[1]-p[1])-(r[0]-p[0])*(q[1]-p[1]))/2;if(A>area){area=A;best=[p,q,r];}}
   if(best&&area>12){const cx=(best[0][0]+best[1][0]+best[2][0])/3,cz=(best[0][1]+best[1][1]+best[2][1])/3,y=Math.max(best[0][2],best[1][2],best[2][2]);
    const n=1+Math.floor(seed*Math.min(3,area/40));for(let i=0;i<n;i++)tank.push({x:cx+(i-(n-1)/2)*1.7,y:y+.05,z:cz,ry:0,sx:.75,sy:1.4,sz:.75,c:'#c8ccd0'});
    if(s.style===STYLE.OLD&&seed>.35&&area>30){const side=Math.min(Math.sqrt(area)*.55,7);shed.push({x:cx,y:y+.05,z:cz+1.6,ry:seed*Math.PI,sx:side,sy:2.6,sz:side*.7,c:seed>.7?'#4f7fa8':'#9aa2a4'});}
   }
  }
 }
 return {ac,tank,shed,sign,grille};
}

// ---- three.js
const VERT=`attribute vec2 fuv;attribute vec4 fac;attribute vec2 fac2;varying vec2 vF;varying vec4 vFac;varying vec2 vFac2;`;
const FRAG=`varying vec2 vF;varying vec4 vFac;varying vec2 vFac2;
float fh1(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float box(float x,float a,float b){return step(a,x)*step(x,b);}`;
// 依外觀分類畫出立面；glassM＝玻璃（夜間可亮），signM＝招牌（自發光），litM＝此窗亮燈
const PATTERN=`
float glassM=0.,litM=0.,signM=0.;vec3 signC=vec3(0.);
{float code=vFac.x,st=mod(code,10.),shop=step(9.5,code),fh=vFac.y,seed=vFac.z,W=vFac2.x,H=vFac2.y,u=vF.x,v=vF.y;
 if(st<6.5&&H>0.){
  vec3 base=diffuseColor.rgb;
  float fl=floor(v/fh),fy=fract(v/fh),nFl=floor((H-.9)/fh),parapet=step(H-.9,v);
  // 磁磚縫與樓板線
  if(st<2.5){float t=max(step(.94,fract(u/.62)),step(.9,fract(v/.31)));base*=1.-.05*t;}
  base*=1.-.12*step(fy,.05)*(1.-parapet);
  float bay=st<.5?3.:st<1.5?3.4:st<2.5?3.:st<3.5?1.5:3.6;
  float bi=floor(u/bay),bx=fract(u/bay),inside=step(.5,u)*step(u,W-.5)*(1.-parapet)*step(fl,nFl-1.);
  float rnd=fh1(vec2(bi,fl)+seed*91.);
  vec3 glassC=mix(vec3(.13,.17,.2),vec3(.33,.42,.48),fh1(vec2(bi*.37,fl*.71)+seed));
  if(st<4.5&&W>1.5){
   float win=0.,ground=step(fl,.5);
   if(st<.5){win=box(bx,.17,.83)*box(fy,.3,.86);}
   else if(st<1.5){win=box(bx,.12,.88)*box(fy,.28,.88);if(rnd<.45&&fy<.3&&bx>.06&&bx<.94)base=mix(base,vec3(.55,.57,.56),.8);}
   else if(st<2.5){win=box(bx,.1,.9)*box(fy,.2,.9);}
   else if(st<3.5){win=1.-max(step(bx,.06),step(.86,fy));base=mix(base,vec3(.42,.46,.48),.5);}
   else{win=box(fract(u/7.2),.06,.96)*box(fy,.36,.82);}
   win*=inside;
   if(ground>.5){
    win=0.;
    if(shop>.5&&W>2.5&&u>.3&&u<W-.3){
     // 騎樓：一樓內退的陰影、店面玻璃、店招帶
     base*=.62;
     float sb=box(fy,.74,.95);float sid=floor(u/max(3.,W/max(1.,floor(W/4.5))));float hue=fh1(vec2(sid,seed*13.));
     signC=hue<.2?vec3(.85,.12,.12):hue<.4?vec3(.95,.76,.15):hue<.55?vec3(.95,.95,.92):hue<.7?vec3(.12,.36,.75):hue<.85?vec3(.1,.55,.3):vec3(.92,.42,.1);
     signM=sb;base=mix(base,signC,sb);
     float sf=box(fy,.06,.7)*box(fract(u/4.5),.04,.96);glassM=sf;litM=sf*step(.25,fh1(vec2(sid,7.)+seed));base=mix(base,vec3(.2,.22,.22),sf*.85);
    }else if(st<1.5&&W>2.5){
     // 住家一樓：鐵捲門
     float door=box(bx,.12,.88)*box(fy,.02,.78);base=mix(base,vec3(.5,.52,.52)*(.9+.1*step(.5,fract(v*6.))),door*.9);
    }
   }
   if(win>.5){
    base=glassC;glassM=1.;litM=step(.58,rnd);
    if(st<.5){float bars=step(.82,fract(u/.12))+step(.9,fract(v/.5));vec3 gc=fh1(vec2(bi,seed))<.4?vec3(.42,.32,.25):vec3(.62,.64,.6);base=mix(base,gc,min(bars,1.)*.85);}
    if(st>.5&&st<2.5)base=mix(base,vec3(.7,.72,.7),step(abs(bx-.5),.012));
   }
  }else if(st>4.5&&st<5.5){base*=1.-.2*step(.9,fract(u/3.));}
  base=mix(base,base*1.08,parapet);
  diffuseColor.rgb=base;
 }
}`;
export function createFacadeMaterial(T){
 const m=new T.MeshStandardMaterial({vertexColors:true,roughness:.86,side:T.DoubleSide});
 m.emissive=new T.Color('#ffcf8a');m.emissiveIntensity=0;
 m.onBeforeCompile=sh=>{
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\n'+VERT).replace('#include <begin_vertex>','#include <begin_vertex>\nvF=fuv;vFac=fac;vFac2=fac2;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\n'+FRAG)
   .replace('#include <color_fragment>','#include <color_fragment>\n'+PATTERN)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.22,glassM);')
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance=totalEmissiveRadiance*glassM*litM*(.28+.3*fh1(vec2(floor(vF.x/1.7),floor(vF.y/3.))+vFac.z))+length(totalEmissiveRadiance)*.32*signM*signC;');
 };
 m.customProgramCacheKey=()=>'xinyi-facade-2';
 return m;
}
export function facadeGeometry(T,batch,toLocal,ground,linearColors){
 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.BufferAttribute(toLocal(batch.position,ground),3));
 g.setAttribute('color',new T.BufferAttribute(linearColors(batch.color),3));
 g.setAttribute('fuv',new T.Float32BufferAttribute(batch.fuv,2));
 g.setAttribute('fac',new T.Float32BufferAttribute(batch.fac,4));
 g.setAttribute('fac2',new T.Float32BufferAttribute(batch.fac2,2));
 g.setIndex(batch.index);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
// 小物件：每類一個 InstancedMesh；招牌夜間自發光（emissiveIntensity 由時段設定）。
export function addFacadeProps(T,scene,props){
 const group=new T.Group();group.name='facade props';
 const box=new T.BoxGeometry(1,1,1);box.translate(0,.5,0);
 const cyl=new T.CylinderGeometry(.5,.5,1,12);cyl.translate(0,.5,0);
 const signMat=new T.MeshStandardMaterial({roughness:.5,emissive:'#ffffff',emissiveIntensity:0});
 // 招牌依各自顏色發光（instanceColor 併入 vColor）
 signMat.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n#if defined(USE_COLOR)||defined(USE_INSTANCING_COLOR)\ntotalEmissiveRadiance*=vColor.rgb;\n#endif');};
 const mats={ac:new T.MeshStandardMaterial({roughness:.6}),tank:new T.MeshStandardMaterial({roughness:.3,metalness:.6}),
  shed:new T.MeshStandardMaterial({roughness:.7,metalness:.3}),sign:signMat,grille:new T.MeshStandardMaterial({roughness:.8,transparent:true,opacity:.82})};
 const m4=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),c=new T.Color(),up=new T.Vector3();
 for(const [kind,list] of Object.entries(props)){
  if(!list.length)continue;
  const im=new T.InstancedMesh(kind==='tank'?cyl:box,mats[kind],list.length);im.name='facade '+kind;
  list.forEach((p,i)=>{e.set(0,p.ry,0);q.setFromEuler(e);m4.compose(up.set(p.x,p.y,p.z),q,new T.Vector3(p.sx,p.sy,p.sz));im.setMatrixAt(i,m4);im.setColorAt(i,c.set(p.c));});
  im.castShadow=kind!=='grille';im.receiveShadow=true;group.add(im);
 }
 scene.add(group);return {group,signMat};
}
