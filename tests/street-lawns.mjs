// 逐街精修所見草坪（street-lawns-xinyi.json）：只做照片確認為草坪的 OSM 綠地、邊界取自既有綠地、草葉數在預算內，
// 標明草坪分類來源與待核對；網頁短草不改步行面（只是視覺覆蓋）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LAWN,lawnTiles} from '../dist/xinyi-short-grass.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+f,import.meta.url)));
const data=read('street-lawns-xinyi.json'),furniture=read('street-furniture-xinyi.json');
assert(data.lawns.length>0&&data.lawns.length<=12,'only photo-confirmed lawns');
const greens=new Set(furniture.green.map(p=>p.join(',')));
for(const l of data.lawns){
 assert(l.photo&&/待核對/.test(l.status),'photo source and pending-verification status: '+l.name);
 assert(greens.has(l.polygon.join(',')),'lawn boundary is an existing green polygon: '+l.name);
 assert(l.polygon.length>=6&&l.polygon.length%2===0&&l.polygon.every(Number.isFinite));
 assert(l.area>0,'area: '+l.name);
 // 切塊：面積總和等於草坪面積、每塊不超過 tile²，最高畫質下單塊草葉遠低於可見預算
 const tiles=lawnTiles(l.polygon),sum=tiles.reduce((s,t)=>s+t.area,0);
 assert(Math.abs(sum-l.area)/l.area<.01,`tiles cover the lawn: ${l.name} ${sum.toFixed(1)} vs ${l.area}`);
 assert(tiles.every(t=>t.area<=LAWN.tile**2+1e-6&&t.area*80<LAWN.budget.low),'tile size within budget: '+l.name);
}
assert(LAWN.minHeight>=.05&&LAWN.maxHeight<=.12,'short grass (6–12 cm), not tall grass');
assert(LAWN.budget.low<LAWN.budget.medium&&LAWN.budget.medium<LAWN.budget.high&&LAWN.budget.high<=200000,'visible blade budget by quality');
console.log('lawns',data.lawns.length,'area',data.lawns.reduce((s,l)=>s+l.area,0).toFixed(0),'m²');
