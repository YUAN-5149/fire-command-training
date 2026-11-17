import assert from 'node:assert/strict';import fs from 'node:fs';
import {classifyWalls,faceCode,faceSpec,buildFacadeBatch,facadeProps,styleOf,STYLE} from '../dist/xinyi-facades.js';
import {project,nearestStreet} from '../dist/xinyi-street-world.js';

// 合成：本地公尺直接當座標（project 恆等），兩棟連棟公寓 A、B（各 10×12 m、高 15 m），北側（z<0）臨街。
const id=(x,z)=>[x,z];const wall=(a,b,n,h=15)=>({a:[...a,0],b:[...b,0],w:Math.hypot(b[0]-a[0],b[1]-a[1]),h,n});
// 牆法線 n 為 [東, 北]（本地 z 南，nz=−n[1]）。
const box=(id,x0,x1,z0,z1,h=15)=>({id,roofs:[],walls:[wall([x0,z0],[x1,z0],[0,1],h),wall([x1,z0],[x1,z1],[1,0],h),wall([x1,z1],[x0,z1],[0,-1],h),wall([x0,z1],[x0,z0],[-1,0],h)]});
const A=box(1,0,10,0,12),B=box(2,10,20,0,12),C=box(3,20,30,0,12,3);   // C 為低矮雨遮量體（3 m）
const street=(x,z)=>z<-2;
const faceOf=classifyWalls([A,B,C],{project:id,facesStreet:street});
assert.equal(faceOf(A,0),'front');assert.equal(faceOf(A,2),'rear');assert.equal(faceOf(A,3),'side');
assert.equal(faceOf(A,1),'side','party wall with B');assert.equal(faceOf(B,3),'side','party wall with A');
// B 東側緊鄰低矮量體 C：不算被遮住，依方向判為側牆（露出的山牆）。
assert.equal(faceOf(B,1),'side');
// 沒有臨街牆：最長牆方向當正面軸。
const D=box(4,100,120,100,108),fD=classifyWalls([D],{project:id,facesStreet:()=>false});assert.equal(fD(D,0),'rear');assert.equal(fD(D,2),'rear');assert.equal(fD(D,1),'side');

// 型式代碼依 faceSpec：老公寓側牆少窗、背面鐵窗；住宅大樓側牆一般窗格、背面一般窗。
const old=faceSpec(null,STYLE.OLD),mid=faceSpec(null,STYLE.MID);
assert.equal(faceCode('front',old),0);assert.equal(faceCode('side',old),1);assert.equal(faceCode('rear',old),3);
assert.equal(faceCode('side',mid),0);assert.equal(faceCode('rear',mid),0);
assert.equal(faceCode('side',faceSpec({faces:{side:{windows:'none',evidence:'A'}}},STYLE.OLD)),2);

// 實際資料：分類數量、批次屬性與小物件。
const read=f=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+f,import.meta.url)));
const district=read('district-xinyi.json'),styles=read('building-styles-xinyi.json').buildings,streets=read('streets-xinyi.json');
const t0=performance.now(),real=classifyWalls(district.buildings,{project,facesStreet:(x,z)=>!!nearestStreet(streets.features,x,z,9)}),ms=performance.now()-t0;
assert.ok(ms<5000,'classification '+ms.toFixed(0)+' ms');
const c={front:0,side:0,rear:0};for(const b of district.buildings)b.walls.forEach((_,k)=>c[real(b,k)]++);
assert.ok(c.front>1000&&c.side>5000&&c.rear>1000,JSON.stringify(c));
const batch=buildFacadeBatch(district.buildings,styles,null,{faceOf:real}),n=batch.position.length/3;assert.equal(batch.fac5.length/2,n);
const codes=new Set();for(let i=0;i<batch.fac5.length;i+=2){codes.add(batch.fac5[i]);assert.ok(batch.fac5[i+1]>=0&&batch.fac5[i+1]<=3);}
assert.deepEqual([...codes].sort(),[0,1,3]);
// 不傳 faceOf 時與舊版相同（全部 0）。
assert.ok(buildFacadeBatch(district.buildings.slice(0,50),styles).fac5.filter((_,i)=>i%2===0).every(v=>v===0));
const before=facadeProps(district.buildings,styles,{project}),after=facadeProps(district.buildings,styles,{project,faceOf:real});
// 側牆不再掛鐵窗：鐵窗總數下降；後陽台盆栽出現；招牌、水塔不變；各類仍在上限內。
assert.ok(after.grille.length<before.grille.length);assert.ok(after.plant.length>200);
assert.equal(after.sign.length,before.sign.length);assert.equal(after.tank.length,before.tank.length);
for(const k of Object.keys(after))assert.ok(after[k].length<=30000,k);
console.log('xinyi-facade-faces: ok',JSON.stringify(c),'grille',before.grille.length,'→',after.grille.length,'plant',after.plant.length);
