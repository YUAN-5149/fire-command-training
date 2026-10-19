// 把街景漫遊的逐棟立面與街道設施輸出成 Blender 用的 JSON（blender/build_xinyi_district.py 讀取）。
// 與網頁共用同一份邏輯（xinyi-facades.js、xinyi-furniture.js），Blender 端不重寫規則。
//
//   node scripts/export-scene-props.mjs <out.json>
//
// 座標改為 Blender：x 東、y 北、z 上（公尺）。路面在 Blender 為平面，所以每棟建物減去自己的
// 牆腳最低高程（上層退縮量體保留相對高度）；街道設施高度原本即為離地高。
import fs from 'node:fs';
import {project,nearestStreet} from '../dist/xinyi-street-world.js';
import {styleOf,facadeProps} from '../dist/xinyi-facades.js';
import {furnitureParts} from '../dist/xinyi-furniture.js';

const read=f=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+f,import.meta.url)));
const district=read('district-xinyi.json'),styles=read('building-styles-xinyi.json').buildings,furniture=read('street-furniture-xinyi.json'),streets=read('streets-xinyi.json');
const r2=v=>Math.round(v*100)/100;
const buildings=[],baseOf=new Map();
for(const b of district.buildings){
 if(!b.walls.length)continue;
 const s=styleOf(styles,b),base=Math.min(...b.walls.map(w=>Math.min(w.a[2],w.b[2]))),top=Math.max(...b.walls.map(w=>w.h));
 baseOf.set(b.id,base);
 const walls=b.walls.map(({a,b:e,h})=>{const [ax,az]=project(a[0],a[1]),[bx,bz]=project(e[0],e[1]);return [r2(ax),r2(-az),r2(bx),r2(-bz),r2(a[2]-base),r2(h)];});
 const roofs=[];for(const p of b.roofs){const [x,z]=project(p[0],p[1]);roofs.push(r2(x),r2(-z),r2(p[2]-base));}
 buildings.push({id:b.id,style:s.style,shop:s.shop,colour:s.colour,floorH:r2(Math.max(2.8,Math.min(5,top/Math.max(1,s.levels)))),walls,roofs});
}
// 立面小物件的高度是絕對高程，逐棟減掉該棟牆腳高程；招牌只掛臨街面（與網頁相同的判斷）。
const facesStreet=(x,z)=>!!nearestStreet(streets.features,x,z,9);
const props={};
for(const b of district.buildings){
 if(!b.walls.length)continue;
 const base=baseOf.get(b.id);
 for(const [k,list] of Object.entries(facadeProps([b],styles,{project,facesStreet})))(props[k]??=[]).push(...list.map(p=>({...p,y:p.y-base})));
}
const parts=furnitureParts(furniture);
const toBlender=list=>list.map(p=>[r2(p.x),r2(-p.z),r2(p.y),Math.round(p.ry*1000)/1000,r2(p.sx),r2(p.sy),r2(p.sz),p.c??null]);
const out={buildings,props:Object.fromEntries(Object.entries(props).map(([k,v])=>[k,toBlender(v)])),
 furniture:Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,toBlender(v)])),
 green:furniture.green.map(r=>r.map((v,i)=>i%2?r2(-v):v))};
fs.writeFileSync(process.argv[2],JSON.stringify(out));
console.log('buildings',buildings.length,'props',Object.fromEntries(Object.entries(out.props).map(([k,v])=>[k,v.length])),'bytes',fs.statSync(process.argv[2]).size);
