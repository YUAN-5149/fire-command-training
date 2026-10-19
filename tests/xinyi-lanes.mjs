// 信義逐車道路面資料（scripts/build-lanes.mjs 由 osm2streets 產生）：完整、座標在範圍內、
// 每個多邊形至少三點，箭頭已稀疏化（只在路口前）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {project} from '../dist/xinyi-street-world.js';
const d=JSON.parse(fs.readFileSync(new URL('../dist/assets/lanes-xinyi.json',import.meta.url)));
const [x0,z1]=project(d.bbox[0],d.bbox[1]),[x1,z0]=project(d.bbox[2],d.bbox[3]),m=40;
function check(list,name){
 assert.ok(Array.isArray(list)&&list.length>0,name+' empty');
 for(const r of list){assert.ok(r.length>=6&&r.length%2===0,name+' ring');
  for(let i=0;i<r.length;i+=2){assert.ok(Number.isFinite(r[i])&&Number.isFinite(r[i+1]));assert.ok(r[i]>=x0-m&&r[i]<=x1+m&&r[i+1]>=z0-m&&r[i+1]<=z1+m,name+' out of bbox');}}
 return list.length;
}
const n={};for(const k of ['Driving','Sidewalk'])n[k]=check(d.lanes[k],k);
n.intersections=check(d.intersections,'intersections');
for(const k of ['center','separator','arrow','stop'])n[k]=check(d.markings[k],k);
assert.ok(n.Driving>800&&n.Sidewalk>300&&n.intersections>500,'network too small: '+JSON.stringify(n));
assert.ok(n.arrow<n.Driving*3,'arrows should be thinned to junction approaches');
assert.match(d.generator,/osm2streets/);assert.match(d.license,/ODbL/);
console.log('lanes ok',JSON.stringify(n));
