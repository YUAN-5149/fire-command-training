// 臺北街屋精細立面與屋頂鐵皮加蓋（xinyi-shophouse.js）：只做精修老公寓／住宅大樓的臨街牆、
// 幾何完整且在頂點預算內、法線為單位向量、圖集格在 [0,1]、水塔墊高與加蓋一致。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {project,nearestStreet} from '../dist/xinyi-street-world.js';
import {styleOf,overrideIndex,fillBuildings,facadeProps,buildFacadeBatch} from '../dist/xinyi-facades.js';
import {detailWalls,shedHeight,buildStreetFacades,buildRoofSheds,cellH,cellV,SHOPS,chunkGroup} from '../dist/xinyi-shophouse.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+f,import.meta.url)));
const district=read('district-xinyi.json'),styles=read('building-styles-xinyi.json').buildings,streets=read('streets-xinyi.json'),od=read('building-overrides-xinyi.json'),ov=overrideIndex(od);
district.buildings.push(...fillBuildings(od,district));
const nearRoad=(x,z)=>!!nearestStreet(streets.features,x,z,10);
const items=[],sheds=[],skip=new Map();
for(const b of district.buildings){if(!b.walls.length)continue;const s=styleOf(styles,b,ov);
 const top=Math.max(...b.walls.map(w=>w.h)),floorH=Math.max(2.8,Math.min(5,top/Math.max(1,s.levels)));
 const ws=detailWalls(b,s.style,!!ov[b.id],{project,facesStreet:nearRoad});
 if(ws.length){assert(ov[b.id]&&(s.style===0||s.style===1),'only refined old apartments / residential');items.push({b,style:s.style,shop:s.shop,colour:s.colour,floorH,walls:ws});skip.set(b.id,new Set(ws));}
 const h=shedHeight(b,s.style);if(h){assert.equal(s.style,0);assert(h>=2.4&&h<=3);sheds.push({b,h});}}
assert(items.length>=20,'detailed buildings along 松仁路');
assert(sheds.length>500,'most old apartments have rooftop sheds');
assert.equal(shedHeight(sheds[0].b,0),sheds[0].h,'shed height is deterministic');

const F=buildStreetFacades(items,{project}),R=buildRoofSheds(sheds,{project});
const count=g=>Object.values(g).reduce((s,a)=>s+a.position.length/3,0);
const nF=count(F.groups),nR=count(R.groups);
// 依 160 m 分塊做視錐剔除，畫面上同時只畫看得到的幾塊
// 依畫質做距離剔除（低 160 m、中 300 m、高 450 m），畫面上只畫附近幾塊
assert(nF>50000&&nF<2200000,'facade detail within budget: '+nF);
assert(nR>20000&&nR<300000,'roof sheds within budget: '+nR);
for(const k of ['tile','glass','frame','grille','ac','sign','textH','textV','shopglass','shutter'])assert(F.groups[k]?.index.length>0,'has '+k);
for(const g of [...Object.values(F.groups),...Object.values(R.groups)]){
 const n=g.position.length/3;assert.equal(g.normal.length/3,n);assert.equal(g.uv.length/2,n);assert.equal(g.color.length/3,n);
 for(const i of g.index)assert(i>=0&&i<n);
 for(let i=0;i<g.normal.length;i+=3)assert(Math.abs(Math.hypot(g.normal[i],g.normal[i+1],g.normal[i+2])-1)<1e-6);
 for(const v of g.position)assert(Number.isFinite(v));}
for(const g of [F.groups.textH,F.groups.textV])for(const v of g.uv)assert(v>=0&&v<=1,'atlas uv inside [0,1]');
for(let i=0;i<SHOPS.length;i++){const a=cellH(i),b=cellV(i);assert(a.every(v=>v>=0&&v<=1)&&b.every(v=>v>=0&&v<=1));}
assert(SHOPS.length<=32,'horizontal atlas has 32 cells');

// 精細牆不再畫舊立面，也不放舊方塊冷氣／鐵窗／招牌；老公寓水塔墊高到加蓋頂、不再有舊方塊鐵皮屋
const skipWall=(b,k)=>skip.get(b.id)?.has(k)??false;
const targets=items.map(i=>i.b);
const all=buildFacadeBatch(targets,styles,ov),cut=buildFacadeBatch(targets,styles,ov,{skipWall});
assert(cut.position.length<all.position.length,'detailed walls removed from flat facades');
const P=facadeProps(sheds.map(s=>s.b),styles,{project,overrides:ov,shed:shedHeight});
assert.equal(P.shed.length,0,'no box sheds when rooftop sheds are built');
const plain=facadeProps(sheds.map(s=>s.b),styles,{project,overrides:ov});
assert.equal(P.tank.length,plain.tank.length);
for(let i=0;i<P.tank.length;i++)assert(P.tank[i].y>=plain.tank[i].y+2.39,'tank lifted onto shed');
// 分塊：三角形數不變、每塊的索引都在範圍內、頂點只屬於自己的格子
for(const g of [F.groups.tile,R.groups[Object.keys(R.groups)[0]]]){
 const parts=chunkGroup(g);assert(parts.length>1);
 assert.equal(parts.reduce((s,c)=>s+c.index.length,0),g.index.length,'triangles preserved');
 for(const c of parts){const n=c.position.length/3;assert.equal(c.normal.length/3,n);assert.equal(c.uv.length/2,n);for(const i of c.index)assert(i>=0&&i<n);}}
console.log('shophouse walls',F.walls,'verts',nF,'| sheds',R.sheds,'verts',nR);
