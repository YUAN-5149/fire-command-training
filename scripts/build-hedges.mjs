// 逐街精修所見綠籬（依 PROJECT-MEMORY.md「街道植栽」規則）：只做街景照片確認有綠籬的臨街面，不滿街撒點。
//
//   node scripts/build-hedges.mjs     → dist/assets/street-hedges-xinyi.json
//
// 位置為概略：沿該建物臨街牆（牆中點外推 6 m 後更接近指定道路、離路 70 m 內者）外推 offset 公尺排一列灌木，
// 兩端各退 1 m、牆中央留 4 m 缺口（入口實際位置未核對）、株距約 1.1 m 左右交錯；
// 距 OSM 行道樹 1.6 m 內不放（保留樹穴），距道路中心線不足「半路寬＋1.5 m」不放（不占車道）。
// 邊界、缺口、株數與品種皆待核對；輸出的 status 與 note 會說明。
import fs from 'node:fs';
import {project} from '../dist/xinyi-street-world.js';
import {overrideIndex} from '../dist/xinyi-facades.js';

const read=f=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+f,import.meta.url)));
const district=read('district-xinyi.json'),streets=read('streets-xinyi.json'),furniture=read('street-furniture-xinyi.json');
const ov=read('building-overrides-xinyi.json'),byName=new Map(ov.streets.flatMap(s=>s.buildings).map(b=>[b.name,b]));

// 街景確認有綠籬的臨街面（精修資料名稱、臨接道路、外推距離、照片出處）
const SEEN=[
 {name:'信義之星',street:'松智路',offset:1.2,photo:'Google 街景 2025，松智路31巷口西望：臨街石柱鐵柵圍牆內一列綠籬'},
 {name:'松智路住宅大樓',street:'松智路',offset:1.2,photo:'Google 街景 2025，松智路14號一帶東望：圍牆與綠籬、門燈'},
 {name:'松智路紅褐石材住宅大樓',street:'松智路',offset:1.0,photo:'Google 街景 2025，松智路50號西望：基座前花台與灌木'},
 {name:'微風南山',street:'松智路',offset:1.0,photo:'Google 街景 2025，松智路8號東望：玻璃店面前綠籬'},
 {name:'松勤街76號一帶住宅',street:'松勤街',offset:1.0,photo:'Google 街景 2025，松勤街76號南望：圍牆前綠籬與行道樹'},
 {name:'國際貿易大樓（世貿國貿大樓）',street:'基隆路一段',offset:1.5,photo:'Google 街景 2025，基隆路一段333號東北望：人行道旁長條綠籬'},
 {name:'信義之星',street:'松平路',offset:1.2,photo:'Google 街景 2025-01，松平路54號北望：石柱鐵柵圍牆內綠籬與花架'},
 {name:'松平路西段南側住宅',street:'松平路',offset:1.0,photo:'Google 街景 2025-01，松平路54號南望：低矮圍籬內連續綠籬'},
 {name:'松平路87號住宅',street:'松平路',offset:1.8,photo:'Google 街景 2025-01，松平路87號北望：鐵花圍籬前一排盆栽灌木（盆栽，非地植）'},
];
// 共用灌木模型高約 0.45 m；照片中綠籬約 0.8 m（目測示意，未量測），放大 1.8 倍且株距 1.1 m 成連續一列
const STEP=1.1,END=1,GAP=4,TREE_CLEAR=1.6,SCALE=1.8;

const roads=streets.features.filter(f=>f.kind==='road'&&f.tags.name);
const segsOf=name=>roads.filter(f=>f.tags.name===name).flatMap(f=>f.paths.flatMap(p=>p.slice(1).map((q,i)=>[project(p[i][0],p[i][1]),project(q[0],q[1]),f.width||8])));
const distTo=(segs,x,z)=>{let best=[1e9,8];for(const [[ax,az],[bx,bz],w] of segs){const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(x-ax-dx*t,z-az-dz*t);if(d<best[0])best=[d,w];}return best;};
const trees=(furniture.trees||[]).map(([x,z])=>[x,z]);
const idx=new Map(district.buildings.map(b=>[b.id,b]));

const hedges=[];
for(const s of SEEN){
 const e=byName.get(s.name);if(!e)throw Error('override not found: '+s.name);
 const segs=segsOf(s.street);if(!segs.length)throw Error('road not found: '+s.street);
 const points=[];let walls=0;
 // 只取最外側臨街面：朝向指定道路（外推 6 m 更靠近）、離路 70 m 內，且與最靠近道路的臨街牆相差 6 m 內（排除內凹或後排牆）
 const cand=[];
 for(const id of e.ids){const b=idx.get(id);if(!b)continue;
  for(const w of b.walls){if(w.w<6||w.h<3)continue;
   const [ax,az]=project(w.a[0],w.a[1]),[bx,bz]=project(w.b[0],w.b[1]);
   const nx=w.n[0],nz=-w.n[1],[d6]=distTo(segs,(ax+bx)/2+nx*6,(az+bz)/2+nz*6),[d0]=distTo(segs,(ax+bx)/2,(az+bz)/2);
   if(d0<=70&&d6<=d0-3)cand.push({w,ax,az,bx,bz,nx,nz,d0});}}
 const near=Math.min(...cand.map(c=>c.d0));
 for(const {ax,az,bx,bz,nx,nz,d0} of cand){
   if(d0>near+6)continue;
   const L=Math.hypot(bx-ax,bz-az),tx=(bx-ax)/L,tz=(bz-az)/L;
   walls++;
   for(let u=END,k=0;u<=L-END;u+=STEP,k++){
    if(Math.abs(u-L/2)<GAP/2)continue;      // 入口缺口（位置未核對，先留牆中央）
    const lat=(k%2?.25:-.25),x=ax+tx*u+nx*(s.offset+lat),z=az+tz*u+nz*(s.offset+lat);
    const [dr,rw]=distTo(segs,x,z);if(dr<rw/2+1.5)continue;
    if(trees.some(([px,pz])=>Math.hypot(px-x,pz-z)<TREE_CLEAR))continue;
    points.push([+x.toFixed(2),+z.toFixed(2),+(Math.atan2(tx,tz)+k*1.7).toFixed(2)]);
   }}
 hedges.push({name:s.name,street:s.street,photo:s.photo,walls,scale:SCALE,status:`概略：沿臨街牆外推 ${s.offset} m、高約 0.8 m（示意）；邊界、入口缺口、高度、株距與品種待核對`,points});
}
const out={place:'xinyi',source:'Google 街景目測（各列 photo）；灌木模型為 dist/assets/plants-ez-v3 共用低矮葉叢',
 note:'僅照片確認有綠籬的臨街面；位置概略、未量測。沿用地坪高度，不推測台階或坡度。座標為街景本地公尺（x 東、z 南）。',hedges};
fs.writeFileSync(new URL('../dist/assets/street-hedges-xinyi.json',import.meta.url),JSON.stringify(out,null,1));
for(const h of hedges)console.log(h.name,h.street,'walls',h.walls,'shrubs',h.points.length);
