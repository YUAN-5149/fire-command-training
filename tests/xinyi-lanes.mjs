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
// 中線為連續雙黃線：成對的細長條（約 0.12 m 寬），首尾相接，沒有虛線間隔
assert.equal(n.center%2,0,'double yellow strips come in pairs');
{const c=d.markings.center;let gaps=0,joins=0;
 for(let i=2;i<c.length;i+=2){const p=c[i-2],q=c[i];if(Math.hypot(q[0]-p[2],q[1]-p[3])<.02)joins++;else gaps++;}
 assert.ok(joins>gaps*2,'centre strips should join end to end (continuous), joins '+joins+' gaps '+gaps);
 for(const r of c.slice(0,500)){const w=Math.hypot(r[6]-r[0],r[7]-r[1]);assert.ok(Math.abs(w-.12)<.03,'strip width ~0.12 m');}}
assert.match(d.generator,/osm2streets/);assert.match(d.license,/ODbL/);
console.log('lanes ok',JSON.stringify(n));
