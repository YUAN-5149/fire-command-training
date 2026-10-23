// 把街景漫遊的逐棟立面與街道設施輸出成 Blender 用的 JSON（blender/build_xinyi_district.py 讀取）。
// 與網頁共用同一份邏輯（xinyi-facades.js、xinyi-furniture.js），Blender 端不重寫規則。
//
//   node scripts/export-scene-props.mjs <out.json>
//
// 座標改為 Blender：x 東、y 北、z 上（公尺）。路面在 Blender 為平面，所以每棟建物減去自己的
// 牆腳最低高程（上層退縮量體保留相對高度）；街道設施高度原本即為離地高。
import fs from 'node:fs';
import {project,nearestStreet} from '../dist/xinyi-street-world.js';
import {styleOf,facadeProps,overrideIndex,fillBuildings} from '../dist/xinyi-facades.js';
import {furnitureParts} from '../dist/xinyi-furniture.js';
import {kitPlacements} from '../dist/facade-kits.js';
import {detailWalls} from '../dist/xinyi-shophouse.js';

const read=f=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+f,import.meta.url)));
const district=read('district-xinyi.json'),styles=read('building-styles-xinyi.json').buildings,furniture=read('street-furniture-xinyi.json'),streets=read('streets-xinyi.json');
// 逐街精修：官方缺漏量體依 OSM 外框補建，精修參數一併輸出給 Blender
const overrideData=read('building-overrides-xinyi.json'),overrides=overrideIndex(overrideData);
district.buildings.push(...fillBuildings(overrideData,district));
const r2=v=>Math.round(v*100)/100;
const buildings=[],baseOf=new Map();
for(const b of district.buildings){
 if(!b.walls.length)continue;
 const s=styleOf(styles,b,overrides),base=Math.min(...b.walls.map(w=>Math.min(w.a[2],w.b[2]))),top=Math.max(...b.walls.map(w=>w.h));
 baseOf.set(b.id,base);
 // 第 7 欄：臨街牆（牆中點往外 4 m 處 10 m 內有具名道路），Blender 精細立面只做臨街牆
 const walls=b.walls.map(({a,b:e,h,n,w})=>{const [ax,az]=project(a[0],a[1]),[bx,bz]=project(e[0],e[1]);const mx=(ax+bx)/2+n[0]*4,mz=(az+bz)/2-n[1]*4;return [r2(ax),r2(-az),r2(bx),r2(-bz),r2(a[2]-base),r2(h),w>=3&&nearestStreet(streets.features,mx,mz,10)?1:0];});
 const roofs=[];for(const p of b.roofs){const [x,z]=project(p[0],p[1]);roofs.push(r2(x),r2(-z),r2(p[2]-base));}
 const o=overrides[b.id]?{name:s.name,variant:s.variant||0,bay:s.bay,win:s.win,podium:s.podium,glass:s.glass}:null;
 buildings.push({id:b.id,style:s.style,shop:s.shop,colour:s.colour,levels:s.levels,floorH:r2(Math.max(2.8,Math.min(5,top/Math.max(1,s.levels)))),walls,roofs,override:o,refined:!!overrides[b.id]});
}
// 立面小物件的高度是絕對高程，逐棟減掉該棟牆腳高程；招牌只掛臨街面（與網頁相同的判斷）。
const facesStreet=(x,z)=>!!nearestStreet(streets.features,x,z,9);
const props={};
for(const b of district.buildings){
 if(!b.walls.length)continue;
 const base=baseOf.get(b.id);
 for(const [k,list] of Object.entries(facadeProps([b],styles,{project,facesStreet,overrides})))(props[k]??=[]).push(...list.map(p=>({...p,y:p.y-base})));
}
// 立面構件（facade-kits.js）：與網頁相同的擺放；臺北街屋精細立面已處理的牆略過。
// 每筆 [沿牆 x, 沿牆 y, 外法線 x, 外法線 y, 樓高縮放, x, y, z]（Blender 座標，z 減該棟牆腳高程）
const nearRoad=(x,z)=>!!nearestStreet(streets.features,x,z,10),detailed=new Map();
for(const b of district.buildings){if(!b.walls.length||!overrides[b.id])continue;const s=styleOf(styles,b,overrides);detailed.set(b.id,new Set(detailWalls(b,s.style,true,{project,facesStreet:nearRoad})));}
const kits={};
for(const b of district.buildings){if(!b.walls.length||!overrides[b.id])continue;
 for(const [name,list] of Object.entries(kitPlacements([b],overrides,{project,facesStreet:nearRoad,skipWall:(bb,k)=>detailed.get(bb.id)?.has(k)??false})))
  (kits[name]??=[]).push(...list.map(m=>[r2(m[0]*1000)/1000,r2(-m[2]*1000)/1000,r2(m[8]*1000)/1000,r2(-m[10]*1000)/1000,Math.round(m[5]*1000)/1000,r2(m[12]),r2(-m[14]),r2(m[13]-baseOf.get(b.id))]));}
const parts=furnitureParts(furniture);
const toBlender=list=>list.map(p=>[r2(p.x),r2(-p.z),r2(p.y),Math.round(p.ry*1000)/1000,r2(p.sx),r2(p.sy),r2(p.sz),p.c??null]);
const out={buildings,kits,props:Object.fromEntries(Object.entries(props).map(([k,v])=>[k,toBlender(v)])),
 furniture:Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,toBlender(v)])),
 green:furniture.green.map(r=>r.map((v,i)=>i%2?r2(-v):v))};
fs.writeFileSync(process.argv[2],JSON.stringify(out));
console.log('buildings',buildings.length,'kits',Object.values(kits).reduce((s,v)=>s+v.length,0),'props',Object.fromEntries(Object.entries(out.props).map(([k,v])=>[k,v.length])),'bytes',fs.statSync(process.argv[2]).size);
