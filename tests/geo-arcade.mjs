import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildXinyiDetail} from '../dist/geo-xinyi-detail.js';
import {arcadeStep,arcadeCamera} from '../dist/geo-arcade.js';
import {entranceCandidate} from '../dist/geo-entrance-location.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/district-xinyi.json',import.meta.url)));
const b=data.buildings.find(b=>b.id===357399),c=entranceCandidate(data.buildings),wall=c.wall;
const detail=buildXinyiDetail([b],{arcade:true});
let front=0,inside=0;
for(const faces of Object.values(detail.groups))for(let i=0;i<faces.length;i+=3){
 const pts=faces.slice(i,i+3).map(v=>detail.position.slice(v*3,v*3+3));
 const avg=pts.reduce((a,p)=>a.map((x,j)=>x+p[j]/3),[0,0,0]);
 const east=(avg[0]-wall.a[0])*100850,north=(avg[1]-wall.a[1])*110574;
 const d=east*wall.n[0]+north*wall.n[1];
 const u=(east*(wall.b[0]-wall.a[0])*100850+north*(wall.b[1]-wall.a[1])*110574)/wall.w;
 if(u>(wall.w-16.2)/2+.01&&u<(wall.w+16.2)/2-.01&&avg[2]>wall.a[2]+.1&&avg[2]<wall.a[2]+8.3){
  if(d>=0&&d<.2)front++;
  if(d< -2.4&&d> -2.6)inside++;
 }
}
assert.equal(front,0,'No façade triangles block the trial opening');assert.ok(inside>0,'Recessed inner wall exists');
assert.deepEqual(arcadeStep({u:0,d:0},-100,-100),{u:-7.75,d:-2.15});
assert.deepEqual(arcadeStep({u:0,d:0},100,100),{u:7.75,d:3});
assert.equal(arcadeCamera(c,{u:0,d:-.6}).position.z,wall.a[2]+1.65);
const other=data.buildings.find(b=>b.id!==357399);assert.deepEqual(buildXinyiDetail([other]),buildXinyiDetail([other],{arcade:true}));
console.log('Arcade: open front, recessed wall, movement boundaries, eye height and unchanged neighbors passed.');
