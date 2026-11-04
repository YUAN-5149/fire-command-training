// 逐街精修所見草坪（street-lawns-xinyi.json）：只做照片確認為草坪的 OSM 綠地、邊界取自既有綠地、草葉數在預算內，
// 標明草坪分類來源與待核對；網頁短草不改步行面（只是視覺覆蓋）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LAWN} from '../dist/xinyi-short-grass.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+f,import.meta.url)));
const data=read('street-lawns-xinyi.json'),furniture=read('street-furniture-xinyi.json');
assert(data.lawns.length>0&&data.lawns.length<=12,'only photo-confirmed lawns');
const greens=new Set(furniture.green.map(p=>p.join(',')));
for(const l of data.lawns){
 assert(l.photo&&/待核對/.test(l.status),'photo source and pending-verification status: '+l.name);
 assert(greens.has(l.polygon.join(',')),'lawn boundary is an existing green polygon: '+l.name);
 assert(l.polygon.length>=6&&l.polygon.length%2===0&&l.polygon.every(Number.isFinite));
 assert(l.area>0&&Math.min(80,LAWN.maxBlades/l.area)*l.area<=LAWN.maxBlades,'blade budget: '+l.name);
}
assert(LAWN.minHeight>=.05&&LAWN.maxHeight<=.12,'short grass (6–12 cm), not tall grass');
console.log('lawns',data.lawns.length,'area',data.lawns.reduce((s,l)=>s+l.area,0).toFixed(0),'m²');
